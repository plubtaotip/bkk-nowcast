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

async function fetchStationHistory(stationID, startDateStr, endDateStr) {
  const targetUrl = `http://air4thai.com/forweb/getHistoryData.php?stationID=${stationID}&param=PM25&type=hr&sdate=${startDateStr}&edate=${endDateStr}`;
  
  try {
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
    // ถ้าดึงตรงไม่ได้ ลองวิ่งผ่าน Proxy สำรอง
    try {
      const proxyUrl = `https://api.allorigins.win/get?disableCache=true&url=${encodeURIComponent(targetUrl)}`;
      const pRes = await fetch(proxyUrl);
      if (pRes.ok) {
        const wrapper = await pRes.json();
        const data = JSON.parse(wrapper.contents);
        return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
      }
    } catch (err2) {}
  }
  return null;
}

async function updateHourlyData() {
  try {
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    // คำนวณช่วงเวลาปัจจุบันและย้อนหลัง 2 วัน เพื่อดึงประวัติรายชั่วโมงที่ครบถ้วน
    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    
    const yyyy = bkkTime.getUTCFullYear();
    const mm = String(bkkTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(bkkTime.getUTCDate()).padStart(2, '0');
    const endDateStr = `${yyyy}-${mm}-${dd}`; 

    const pastTime = new Date(bkkTime.getTime() - (2 * 24 * 60 * 60 * 1000));
    const s_yyyy = pastTime.getUTCFullYear();
    const s_mm = String(pastTime.getUTCMonth() + 1).padStart(2, '0');
    const s_dd = String(pastTime.getUTCDate()).padStart(2, '0');
    const startDateStr = `${s_yyyy}-${s_mm}-${s_dd}`; 

    console.log(`🚀 กำลังดึงข้อมูลประวัติรายชั่วโมงจริง (${startDateStr} ถึง ${endDateStr})...`);

    let updatedCount = 0;

    // วนลูปดึงข้อมูลรายสถานี ทีละตัวพร้อมหน่วงเวลา (กันโดนบล็อก IP)
    for (const stn of BKK_STATIONS) {
      const stnData = await fetchStationHistory(stn, startDateStr, endDateStr);
      
      if (stnData && Array.isArray(stnData)) {
        stnData.forEach(pastHr => {
          if (pastHr.PM25 && pastHr.PM25 !== "-") {
            const pTimeStr = pastHr.DATETIMEDATA; // รูปแบบ "YYYY-MM-DD HH:00:00"
            if (!pTimeStr) return;

            const [datePart, timePart] = pTimeStr.split(' ');
            if (!datePart || !timePart) return;

            const pHour = parseInt(timePart.split(':')[0], 10);
            const pPrevHour = pHour === 0 ? 23 : pHour - 1;
            const pTimeRange = `${String(pPrevHour).padStart(2, '0')}:00 - ${String(pHour).padStart(2, '0')}:00`;
            
            let pDateStr = datePart;
            if (pHour === 0) {
              const dataTime = new Date(pTimeStr.replace(' ', 'T') + '+07:00');
              const tempDate = new Date(dataTime.getTime() - (24 * 60 * 60 * 1000));
              pDateStr = `${tempDate.getUTCFullYear()}-${String(tempDate.getUTCMonth()+1).padStart(2,'0')}-${String(tempDate.getUTCDate()).padStart(2,'0')}`;
            }

            // ค้นหาแถวของวันและเวลานั้นใน history
            let targetRow = history.find(r => r.date === pDateStr && r.timeRange === pTimeRange);
            if (!targetRow) {
              targetRow = { date: pDateStr, timeRange: pTimeRange };
              BKK_STATIONS.forEach(s => targetRow[s] = "-"); 
              history.push(targetRow);
            }

            // บันทึกค่า PM2.5 รายชั่วโมงจริง
            targetRow[stn] = parseFloat(pastHr.PM25);
            updatedCount++;
          }
        });
      }
      
      // หน่วงเวลา 1.5 วินาทีต่อสถานี เพื่อความปลอดภัยไม่ให้เซิร์ฟเวอร์ราชการตัดการเชื่อมต่อ
      await delay(1500); 
    }

    console.log(`📊 อัปเดตข้อมูลรายชั่วโมงสำเร็จทั้งหมด ${updatedCount} จุดข้อมูล`);

    // จัดเรียงลำดับเวลาใหม่ให้ถูกต้อง
    history.sort((a, b) => {
      const hourA = a.timeRange.split(' - ')[0]; 
      const hourB = b.timeRange.split(' - ')[0];
      return new Date(`${a.date}T${hourA}:00+07:00`) - new Date(`${b.date}T${hourB}:00+07:00`);
    });

    // จำกัดขนาดประวัติไม่ให้เกิน 200 ชั่วโมง
    if (history.length > 200) {
      history = history.slice(history.length - 200); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log("✅ บันทึกไฟล์ history.json เรียบร้อยแล้ว!");

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1); 
  }
}

updateHourlyData();
