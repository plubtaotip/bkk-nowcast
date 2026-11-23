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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
    }
  } catch (e) {
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

async function updateWith8HourWindow() {
  try {
    // 1. โหลด history.json เดิม (ถ้ามี) เพื่อรักษาข้อมูลเก่าไว้
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    // 2. คำนวณช่วงเวลาย้อนหลัง 2 วัน เพื่อดึงครอบคลุมหน้าต่าง 8 ชั่วโมงล่าสุด
    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    
    const endDateStr = bkkTime.toISOString().split('T')[0];
    const pastTime = new Date(bkkTime.getTime() - (2 * 24 * 60 * 60 * 1000));
    const startDateStr = pastTime.toISOString().split('T')[0];

    console.log(`🚀 กำลังดึงประวัติรายชั่วโมง 8 ชม. ย้อนหลัง (${startDateStr} ถึง ${endDateStr})...`);

    // แปลง history เดิมเป็น Map เพื่อให้อัปเดตข้อมูลง่ายขึ้น
    let historyMap = {};
    history.forEach(row => {
      const key = `${row.date}|${row.timeRange}`;
      historyMap[key] = row;
    });

    for (const stn of BKK_STATIONS) {
      const stnData = await fetchStationHistory(stn, startDateStr, endDateStr);
      
      if (stnData && Array.isArray(stnData)) {
        stnData.forEach(item => {
          const pm25 = item.PM25;
          const dtStr = item.DATETIMEDATA; // เช่น "2026-11-23 14:00:00"

          if (dtStr) {
            const [datePart, timePart] = dtStr.split(' ');
            const hour = int = parseInt(timePart.split(':')[0], 10);
            const prevHour = hour === 0 ? 23 : hour - 1;
            
            let targetDate = datePart;
            if (hour === 0) {
              const dtObj = new Date(dtStr.replace(' ', 'T') + '+07:00');
              const tempDate = new Date(dtObj.getTime() - (24 * 60 * 60 * 1000));
              targetDate = tempDate.toISOString().split('T')[0];
            }

            const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:00`;
            const key = `${targetDate}|${timeRange}`;

            if (!historyMap[key]) {
              let row = { date: targetDate, timeRange: timeRange };
              BKK_STATIONS.forEach(s => row[s] = "-");
              historyMap[key] = row;
            }

            // บันทึกค่าถ้ามีข้อมูลจริง ถ้าเป็น "-" ให้ปล่อยไว้ก่อน เดี๋ยวไปจัดการเติมเต็มทีหลัง
            if (pm25 && pm25 !== "-") {
              historyMap[key][stn] = parseFloat(pm25);
            }
          }
        });
      }
      await delay(1000);
    }

    let historyList = Object.values(historyMap);

    // 3. จัดเรียงลำดับเวลาตาม Chronological order
    historyList.sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.timeRange.split(' - ')[0]}:00+07:00`).getTime();
      const timeB = new Date(`${b.date}T${b.timeRange.split(' - ')[0]}:00+07:00`).getTime();
      return timeA - timeB;
    });

    // 4. 🛡️ [ระบบแก้ไขกรณีค่ารายชั่วโมงขาดหายหรือแสดงเป็น "-"]
    // วนลูปตรวจสอบ ถ้าสถานีไหนได้ค่า "-" ให้ดึงค่าจากชั่วโมงก่อนหน้ามาเติมแทน เพื่อให้หน้าต่าง 8 ชม. ไม่ขาดตอน
    for (let i = 0; i < historyList.length; i++) {
      const currentRow = historyList[i];
      const prevRow = i > 0 ? historyList[i - 1] : null;

      BKK_STATIONS.forEach(stn => {
        if (currentRow[stn] === "-" || currentRow[stn] === undefined) {
          if (prevRow && prevRow[stn] !== "-" && prevRow[stn] !== undefined) {
            currentRow[stn] = prevRow[stn]; // ใช้ค่าจากชั่วโมงก่อนหน้ามาแปะแก้ขัด
          } else {
            currentRow[stn] = 25.0; // ค่ากลางสำรองถ้าไม่มีประวัติก่อนหน้าเลย
          }
        }
      });
    }

    // จำกัดขนาดประวัติเก็บไว้ 200 ชั่วโมงล่าสุด
    if (historyList.length > 200) {
      historyList = historyList.slice(historyList.length - 200);
    }

    fs.writeFileSync('history.json', JSON.stringify(historyList, null, 2));
    console.log(`✅ อัปเดตไฟล์ history.json สำเร็จ! มีข้อมูลทั้งหมด ${historyList.length} ช่วงเวลา พร้อมจัดการค่าขาดหายเรียบร้อย`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1);
  }
}

updateWith8HourWindow();
