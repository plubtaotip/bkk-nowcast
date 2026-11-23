const fs = require('fs');

const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

async function fetchAndSave() {
  try {
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    // 🔍 เช็คว่าถ้าประวัติยังมีน้อยกว่า 8 ชั่วโมง (รันครั้งแรก) ให้ดึงข้อมูลย้อนหลัง OpenAQ มาเป็น Seed
    if (history.length < 8) {
      console.log("🌱 ตรวจพบข้อมูลตั้งต้นไม่พอสำหรับคำนวณ NowCast กำลังดึงข้อมูลย้อนหลัง 24 ชม. จาก OpenAQ...");
      
      const openaqUrl = "https://api.openaq.org/v2/measurements?country=TH&city=Bangkok&parameter=pm25&limit=1000&sort=desc";
      const openaqRes = await fetch(openaqUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (openaqRes.ok) {
        const openaqData = await openaqRes.json();
        const results = openaqData.results || [];
        
        results.forEach(item => {
          if (!item.date || !item.value) return;
          const utcDate = new Date(item.date.utc);
          const bkkTime = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
          
          const yyyy = bkkTime.getUTCFullYear();
          const mm = String(bkkTime.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(bkkTime.getUTCDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          
          const hour = bkkTime.getUTCHours();
          const prevHour = hour === 0 ? 23 : hour - 1;
          const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:00`;

          // แมตช์พิกัดอย่างง่ายหรือใช้ค่ากลางเข้าประวัติ
          let targetRow = history.find(r => r.date === dateStr && r.timeRange === timeRange);
          if (!targetRow) {
            targetRow = { date: dateStr, timeRange: timeRange };
            BKK_STATIONS.forEach(s => targetRow[s] = "-");
            history.push(targetRow);
          }
          // เติมค่าตัวอย่างให้สถานีหลักๆ เพื่อให้ระบบพร้อมคำนวณ
          targetRow["02t"] = parseFloat(item.value.toFixed(1)); 
        });
        console.log("✅ เติมข้อมูลตั้งต้น (Seed Data) สำเร็จ!");
      }
    }

    // ⏱️ การดึงข้อมูลรายชั่วโมงปกติ (Hourly Polling)
    console.log("🚀 กำลังดึงข้อมูลภาพรวมล่าสุดจาก Air4Thai API...");
    const targetUrl = "https://air4thai.pcd.go.th/services/getNewAQI_JSON.php";
    
    const response = await fetch(targetUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 
        'Accept': 'application/json' 
      }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const apiData = await response.json();
    const stationsList = apiData.result || apiData.stations || [];

    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    const yyyy = bkkTime.getUTCFullYear();
    const mm = String(bkkTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(bkkTime.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`; 

    const currentHour = bkkTime.getUTCHours();
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;
    const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(currentHour).padStart(2, '0')}:00`;

    let targetRow = history.find(r => r.date === dateStr && r.timeRange === timeRange);
    if (!targetRow) {
      targetRow = { date: dateStr, timeRange: timeRange };
      BKK_STATIONS.forEach(s => targetRow[s] = "-"); 
      history.push(targetRow);
    }

    stationsList.forEach(stn => {
      const stnID = stn.stationID;
      if (BKK_STATIONS.includes(stnID)) {
        const pm25Val = stn.PM25?.值 || stn.PM25?.val || stn.AQILast?.PM25 || stn.PM25;
        if (pm25Val && pm25Val !== "-" && !isNaN(parseFloat(pm25Val))) {
          targetRow[stnID] = parseFloat(pm25Val);
        }
      }
    });

    // จัดเรียงและจำกัดขนาดประวัติ
    history.sort((a, b) => {
      const hourA = a.timeRange.split(' - ')[0]; 
      const hourB = b.timeRange.split(' - ')[0];
      return new Date(`${a.date}T${hourA}:00+07:00`) - new Date(`${b.date}T${hourB}:00+07:00`);
    });

    if (history.length > 200) {
      history = history.slice(history.length - 200); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log("✅ อัปเดตไฟล์ history.json เรียบร้อยแล้ว");

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
