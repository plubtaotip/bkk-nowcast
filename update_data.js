const fs = require('fs');

const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

async function updateFastCurrentHour() {
  try {
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    console.log("🚀 กำลังดึงค่า PM2.5 ล่าสุด (ชั่วโมงนี้) จาก Air4Thai API...");
    const targetUrl = "https://air4thai.pcd.go.th/services/getNewAQI_JSON.php";
    
    let stationsList = [];
    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      if (response.ok) {
        const apiData = await response.json();
        stationsList = apiData.result || apiData.stations || [];
      }
    } catch (e) {
      console.log("⚠️ ไม่สามารถเชื่อมต่อ API หลักได้ในรอบนี้");
    }

    // คำนวณเวลาปัจจุบันของประเทศไทย (UTC+7)
    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    
    const yyyy = bkkTime.getUTCFullYear();
    const mm = String(bkkTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(bkkTime.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`; 

    const currentHour = bkkTime.getUTCHours();
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;
    const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(currentHour).padStart(2, '0')}:00`;

    // ค้นหาหรือสร้างแถวข้อมูลสำหรับชั่วโมงปัจจุบันใน history
    let targetRow = history.find(r => r.date === dateStr && r.timeRange === timeRange);
    if (!targetRow) {
      targetRow = { date: dateStr, timeRange: timeRange };
      BKK_STATIONS.forEach(s => targetRow[s] = "-"); 
      history.push(targetRow);
    }

    let successCount = 0;
    if (stationsList.length > 0) {
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

    console.log(`📊 อัปเดตค่าชั่วโมงล่าสุด (${dateStr} [${timeRange}]) สำเร็จ ${successCount} สถานี`);

    // 🛡️ ป้องกันค่าหาย: ถ้าสถานีไหนได้ "-" ให้ดึงค่าจากชั่วโมงก่อนหน้ามาเติมแทนอัตโนมัติ
    const currentIndex = history.indexOf(targetRow);
    const prevRow = currentIndex > 0 ? history[currentIndex - 1] : null;

    BKK_STATIONS.forEach(stn => {
      if (targetRow[stn] === "-" || targetRow[stn] === undefined) {
        if (prevRow && prevRow[stn] !== "-" && prevRow[stn] !== undefined) {
          targetRow[stn] = prevRow[stn];
        } else {
          targetRow[stn] = 25.0; // ค่ากลางสำรอง
        }
      }
    });

    // จัดเรียงลำดับเวลา
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
    console.log("✅ บันทึกไฟล์ history.json เรียบร้อย (ใช้เวลาไม่กี่วินาที)!");

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1); 
  }
}

updateFastCurrentHour();
