// ไฟล์: update_data.js (ฉบับปรับปรุง)
const fs = require('fs');

const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchRawHistory(stationID, startDateStr, endDateStr) {
    // ใช้ API ทางเลือกหรือ Air4Thai ที่ปลอดภัยขึ้น
    const targetUrl = `http://air4thai.com/forweb/getHistoryData.php?stationID=${stationID}&param=PM25&type=hr&sdate=${startDateStr}&edate=${endDateStr}`;
    
    try {
        const res = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (res.ok) {
            const data = await res.json();
            return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
        }
    } catch (e) {
        // หากดึงตรงไม่ผ่าน ให้ใช้ Proxy สำรอง
        try {
            const encodedUrl = encodeURIComponent(targetUrl);
            const pRes = await fetch(`https://api.allorigins.win/get?disableCache=true&url=${encodedUrl}`);
            if (pRes.ok) {
                const wrapper = await pRes.json();
                const data = JSON.parse(wrapper.contents);
                return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
            }
        } catch (err2) {}
    }
    return null;
}

async function fetchAndSave() {
  try {
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    
    const yyyy = bkkTime.getUTCFullYear();
    const mm = String(bkkTime.getUTCMonth()+1).padStart(2,'0');
    const dd = String(bkkTime.getUTCDate()).padStart(2,'0');
    const endDateStr = `${yyyy}-${mm}-${dd}`; 

    const pastTime = new Date(bkkTime.getTime() - (8 * 60 * 60 * 1000));
    const s_yyyy = pastTime.getUTCFullYear();
    const s_mm = String(pastTime.getUTCMonth()+1).padStart(2,'0');
    const s_dd = String(pastTime.getUTCDate()).padStart(2,'0');
    const startDateStr = `${s_yyyy}-${s_mm}-${s_dd}`; 

    const currentHour = bkkTime.getUTCHours();
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;
    const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(currentHour).padStart(2, '0')}:00`;
    
    let targetDateStr = endDateStr;
    if (currentHour === 0) {
        const yDay = new Date(bkkTime.getTime() - (24 * 60 * 60 * 1000));
        targetDateStr = `${yDay.getUTCFullYear()}-${String(yDay.getUTCMonth()+1).padStart(2,'0')}-${String(yDay.getUTCDate()).padStart(2,'0')}`;
    }

    let latestRow = history.find(r => r.date === targetDateStr && r.timeRange === timeRange);
    if (!latestRow) {
        latestRow = { date: targetDateStr, timeRange: timeRange };
        BKK_STATIONS.forEach(s => latestRow[s] = "-"); 
        history.push(latestRow);
    }

    for (const stn of BKK_STATIONS) {
         const stnData = await fetchRawHistory(stn, startDateStr, endDateStr);
         if (stnData && Array.isArray(stnData)) {
             stnData.forEach(pastHr => {
                 if (pastHr.PM25 && pastHr.PM25 !== "-") {
                     const pTimeStr = pastHr.DATETIMEDATA; 
                     const dataTime = new Date(pTimeStr.replace(' ', 'T') + '+07:00');
                     if (dataTime.getTime() > utcNow.getTime()) return;

                     const pHour = parseInt(pTimeStr.split(' ')[1].split(':')[0], 10);
                     const pPrevHour = pHour === 0 ? 23 : pHour - 1;
                     const pTimeRange = `${String(pPrevHour).padStart(2, '0')}:00 - ${String(pHour).padStart(2, '0')}:00`;
                     let pDateStr = pTimeStr.split(' ')[0];
                     
                     if (pHour === 0) {
                         const tempDate = new Date(dataTime.getTime() - (24 * 60 * 60 * 1000));
                         pDateStr = `${tempDate.getUTCFullYear()}-${String(tempDate.getUTCMonth()+1).padStart(2,'0')}-${String(tempDate.getUTCDate()).padStart(2,'0')}`;
                     }
                     
                     let targetRow = history.find(r => r.date === pDateStr && r.timeRange === pTimeRange);
                     if (!targetRow) {
                         targetRow = { date: pDateStr, timeRange: pTimeRange };
                         BKK_STATIONS.forEach(s => targetRow[s] = "-"); 
                         history.push(targetRow);
                     }
                     targetRow[stn] = parseFloat(pastHr.PM25);
                 }
             });
         }
         await delay(200); 
    }

    // กรองเอาเฉพาะแถวที่ไม่ใช่ '-' ทั้งหมด หรือจำกัดประวัติไม่ให้ไฟล์ใหญ่เกินไป
    if (history.length > 200) {
      history = history.slice(history.length - 200); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log("✅ อัปเดตข้อมูลสำเร็จ");
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
