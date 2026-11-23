const fs = require('fs');

const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

async function updateContinuousGrid() {
  try {
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    console.log("🚀 กำลังดึงค่า PM2.5 ล่าสุดจาก Air4Thai API...");
    const targetUrl = "https://air4thai.pcd.go.th/services/getNewAQI_JSON.php";
    
    let stationsList = [];
    let fetchSuccess = false;
    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      if (response.ok) {
        const apiData = await response.json();
        stationsList = apiData.result || apiData.stations || [];
        fetchSuccess = true;
      }
    } catch (e) {
      console.log("⚠️ ไม่สามารถเชื่อมต่อ API ได้ในรอบนี้");
    }

    // คำนวณเวลาปัจจุบันของประเทศไทย (UTC+7)
    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    
    const currentHour = bkkTime.getUTCHours();
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;

    const parseTimeKey = (dStr, tRange) => {
      const startH = parseInt(tRange.split(' - ')[0].split(':')[0], 10);
      return new Date(`${dStr}T${String(startH).padStart(2,'0')}:00:00+07:00`);
    };

    // หาก history ว่าง ให้สร้างจุดเริ่มต้น
    if (history.length === 0) {
      const initRow = { 
        date: bkkTime.toISOString().split('T')[0], 
        timeRange: `${String(prevHour).padStart(2, '0')}:00 - ${String(currentHour).padStart(2, '0')}:00` 
      };
      BKK_STATIONS.forEach(s => initRow[s] = "-");
      history.push(initRow);
    }

    // 🛡️ ระบบสร้างช่วงเวลาต่อเนื่อง (เติมชั่วโมงที่ขาดหายไประหว่างทางให้ครบถ้วน)
    let lastRow = history[history.length - 1];
    let lastTime = parseTimeKey(lastRow.date, lastRow.timeRange);
    let targetTime = new Date(bkkTime);
    targetTime.setUTCMinutes(0, 0, 0);

    while (true) {
      let nextTime = new Date(lastTime.getTime() + (60 * 60 * 1000));
      if (nextTime > targetTime) break;

      const nYYYY = nextTime.getUTCFullYear();
      const nMM = String(nextTime.getUTCMonth() + 1).padStart(2, '0');
      const nDD = String(nextTime.getUTCDate()).padStart(2, '0');
      const nDateStr = `${nYYYY}-${nMM}-${nDD}`;
      
      const nH = nextTime.getUTCHours();
      const nPrevH = nH === 0 ? 23 : nH - 1;
      const nTimeRange = `${String(nPrevH).padStart(2, '0')}:00 - ${String(nH).padStart(2, '0')}:00`;

      let existing = history.find(r => r.date === nDateStr && r.timeRange === nTimeRange);
      if (!existing) {
        let newRow = { date: nDateStr, timeRange: nTimeRange };
        // กำหนดค่าเริ่มต้นเป็น "-" ทั้งหมดเพื่อไม่ให้เกิดการลากตัวเลขเก่าทับซ้อนมั่วซั่ว
        BKK_STATIONS.forEach(s => newRow[s] = "-");
        history.push(newRow);
        lastRow = newRow;
      } else {
        lastRow = existing;
      }
      lastTime = nextTime;
    }

    // อัปเดตข้อมูลสดของชั่วโมงปัจจุบันลงในแถวล่าสุด
    let targetRow = history[history.length - 1];
    let successCount = 0;
    if (fetchSuccess && stationsList.length > 0) {
      stationsList.forEach(stn => {
        const stnID = stn.stationID;
        if (BKK_STATIONS.includes(stnID)) {
          const pm25Val = stn.PM25?.值 || stn.PM25?.val || stn.AQILast?.PM25 || stn.PM25;
          if (pm25Val && pm25Val !== "-" && !isNaN(parseFloat(pm25Val))) {
            targetRow[stnID] = parseFloat(pm25Val);
            successCount++;
          }
        }
      });
    }

    console.log(`📊 อัปเดตข้อมูลล่าสุดสำเร็จ ${successCount} สถานี`);

    // จัดเรียงลำดับเวลาให้เรียงยาวต่อเนื่องสวยงาม
    history.sort((a, b) => {
      return parseTimeKey(a.date, a.timeRange) - parseTimeKey(b.date, b.timeRange);
    });

    // จำกัดขนาดประวัติไม่ให้เกิน 200 ชั่วโมง
    if (history.length > 200) {
      history = history.slice(history.length - 200); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log("✅ บันทึกไฟล์ history.json แบบเวลาต่อเนื่องเรียบร้อย!");

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1); 
  }
}

updateContinuousGrid();
