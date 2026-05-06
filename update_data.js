// ไฟล์: update_data.js
const fs = require('fs');

// ลิสต์รายชื่อสถานี กทม. ทั้งหมด
const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

const delay = ms => new Promise(res => setTimeout(res, ms));

// 🕵️‍♂️ ฟังก์ชันมุดหลังบ้านแบบ "ยิงตรง" ไม่ผ่าน Proxy
async function fetchRawHistory(stationID, startDateStr, endDateStr) {
    const targetUrl = `http://air4thai.com/forweb/getHistoryData.php?stationID=${stationID}&param=PM25&type=hr&sdate=${startDateStr}&edate=${endDateStr}`;
    
    try {
        // 1. ลองยิงตรงๆ เข้า API รัฐ (Node.js ทำได้ ไม่ติด CORS) เร็วและเสถียรสุด 100%
        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        
        if (res.ok) {
            const data = await res.json();
            return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
        }
    } catch (e) {
        // 2. แผนสำรอง: ถ้าสมมติ GitHub โดนบล็อค ค่อยมุดผ่าน Proxy
        const encodedUrl = encodeURIComponent(targetUrl);
        try {
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

    const bkkTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
    const yyyy = bkkTime.getFullYear();
    const mm = String(bkkTime.getMonth()+1).padStart(2,'0');
    const dd = String(bkkTime.getDate()).padStart(2,'0');
    const endDateStr = `${yyyy}-${mm}-${dd}`; 

    // ---- ตั้งค่าย้อนหลัง 8 ชั่วโมง ----
    const pastTime = new Date(bkkTime.getTime() - (5 * 24 * 60 * 60 * 1000));
    
    const s_yyyy = pastTime.getFullYear();
    const s_mm = String(pastTime.getMonth()+1).padStart(2,'0');
    const s_dd = String(pastTime.getDate()).padStart(2,'0');
    const startDateStr = `${s_yyyy}-${s_mm}-${s_dd}`; 

    console.log(`🚀 กำลังดูดข้อมูลดิบย้อนหลัง 8 ชั่วโมง (${startDateStr} ถึง ${endDateStr})...`);
    
    // ** เปลี่ยนมาดึงข้อมูลทีละสถานีเรียงตัว (Sequential) ป้องกันการโดนเตะทิ้ง **
    for (const stn of BKK_STATIONS) {
         console.log(`ดึงข้อมูล: ${stn}...`);
         const stnData = await fetchRawHistory(stn, startDateStr, endDateStr);
         
         if (stnData && Array.isArray(stnData)) {
             stnData.forEach(pastHr => {
                 if (pastHr.PM25 && pastHr.PM25 !== "-") {
                     const pTimeStr = pastHr.DATETIMEDATA; 
                     const pHour = parseInt(pTimeStr.split(' ')[1].split(':')[0], 10);
                     const pPrevHour = pHour === 0 ? 23 : pHour - 1;
                     const pTimeRange = `${String(pPrevHour).padStart(2, '0')}:00 - ${String(pHour).padStart(2, '0')}:00`;
                     const pDateStr = pTimeStr.split(' ')[0];
                     
                     let targetRow = history.find(r => r.date === pDateStr && r.timeRange === pTimeRange);
                     if (!targetRow) {
                         targetRow = { date: pDateStr, timeRange: pTimeRange };
                         BKK_STATIONS.forEach(s => targetRow[s] = "-"); 
                         history.push(targetRow);
                     }
                     
                     targetRow[stn] = parseFloat(pastHr.PM25);
                 }
             });
         } else {
             console.log(`⚠️ ไม่พบข้อมูลของ ${stn}`);
         }
         
         await delay(300); // พัก 0.3 วินาที ระหว่างสถานี (รับรองว่าเซิร์ฟเวอร์รัฐไม่บล็อคแน่นอน)
    }

    // เรียงลำดับเวลา
    history.sort((a, b) => {
        const hourA = a.timeRange.split(' - ')[0]; 
        const hourB = b.timeRange.split(' - ')[0];
        const timeA = new Date(`${a.date}T${hourA}:00+07:00`).getTime();
        const timeB = new Date(`${b.date}T${hourB}:00+07:00`).getTime();
        return timeA - timeB;
    });

    // ลิมิตไว้ 150 แถว
    if (history.length > 150) {
      history = history.slice(history.length - 150); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log(`✅ อัปเดตข้อมูลสำเร็จ! (รวมประวัติทั้งหมด ${history.length} ชั่วโมง)`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดรุนแรง:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
