// ไฟล์: update_data.js
const fs = require('fs');

async function fetchAndSave() {
  try {
    const timestamp = Date.now();
    const targetUrl = `http://air4thai.pcd.go.th/services/getNewAQI_JSON.php?_t=${timestamp}`;
    const encodedUrl = encodeURIComponent(targetUrl);
    
    const proxyList = [
      { url: `https://api.allorigins.win/get?disableCache=true&url=${encodedUrl}`, type: 'allorigins' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${targetUrl}`, type: 'raw' },
      { url: `https://corsproxy.io/?${encodedUrl}`, type: 'raw' }
    ];

    let newData = null;

    for (const proxy of proxyList) {
      try {
        console.log(`กำลังดึงข้อมูลผ่าน: ${proxy.url}`);
        const response = await fetch(proxy.url);
        if (!response.ok) continue;

        if (proxy.type === 'allorigins') {
          const wrapper = await response.json();
          newData = JSON.parse(wrapper.contents);
        } else {
          newData = await response.json();
        }
        if (newData && newData.stations) break; 
      } catch (err) {
        console.log(`Proxy ${proxy.url} มีปัญหา...`);
      }
    }

    if (!newData || !newData.stations) {
      throw new Error('ไม่สามารถดึงข้อมูลได้ในรอบนี้');
    }

    // 1. คัดกรองเฉพาะสถานีใน กทม.
    const bkkStations = newData.stations.filter(s => s.areaTH && s.areaTH.includes('กรุงเทพ'));
    if (bkkStations.length === 0) throw new Error('ไม่พบข้อมูล กทม.');

    // 2. โหลดประวัติเดิม
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    // 3. หาเวลาที่ใหม่ที่สุดเพื่อสร้างแถวปัจจุบัน (Latest Row)
    let latestDateTime = "";
    let repDate = "";
    let repTime = "";
    bkkStations.forEach(s => {
      if (s.AQILast && s.AQILast.date && s.AQILast.time) {
        const currentDT = s.AQILast.date + " " + s.AQILast.time;
        if (currentDT > latestDateTime) {
          latestDateTime = currentDT;
          repDate = s.AQILast.date;
          repTime = s.AQILast.time;
        }
      }
    });

    const hour = parseInt(repTime.split(':')[0], 10);
    const prevHour = hour === 0 ? 23 : hour - 1;
    const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:00`;

    // 4. สร้างแถวของชั่วโมงปัจจุบัน (ถ้ายังไม่มี)
    let latestRow = history.find(r => r.date === repDate && r.timeRange === timeRange);
    if (!latestRow) {
      latestRow = { date: repDate, timeRange: timeRange };
      bkkStations.forEach(s => latestRow[s.stationID] = "-"); // ใส่ "-" รอไว้ก่อน
      history.push(latestRow);
      console.log(`สร้างแถวใหม่: วันที่ ${repDate} | ${timeRange}`);
    } else {
      console.log(`✅ แถวของเวลานี้ถูกสร้างไว้แล้ว จะอัปเดตข้อมูลที่ตกหล่นให้...`);
    }

    // ═════════════════════════════════════════════════════
    // 🚚 TRUE BACKFILLING: นำข้อมูลไปส่งให้ตรงกับช่องเวลาจริงๆ
    // ═════════════════════════════════════════════════════
    bkkStations.forEach(s => {
      if (s.AQILast && s.AQILast.date && s.AQILast.time && s.AQILast.PM25 && s.AQILast.PM25.value !== undefined) {
        // แปลงเวลาของข้อมูลก้อนนี้ ว่าควรไปอยู่แถวไหน
        const sHour = parseInt(s.AQILast.time.split(':')[0], 10);
        const sPrevHour = sHour === 0 ? 23 : sHour - 1;
        const sTimeRange = `${String(sPrevHour).padStart(2, '0')}:00 - ${String(sHour).padStart(2, '0')}:00`;
        const sDate = s.AQILast.date;
        const sVal = parseFloat(s.AQILast.PM25.value);

        if (!isNaN(sVal)) {
          // วิ่งไปหาแถวในอดีต (หรือปัจจุบัน) ที่ตรงกับข้อมูลนี้ แล้วยัดตัวเลขใส่ลงไป!
          let targetRow = history.find(r => r.date === sDate && r.timeRange === sTimeRange);
          if (targetRow) {
            targetRow[s.stationID] = sVal;
          }
        }
      }
    });

    // ═════════════════════════════════════════════════════
    // 🛠️ SWEEPING DATA HEALING: สแกนซ่อมรอยโหว่ทั้งไฟล์อัตโนมัติ
    // ═════════════════════════════════════════════════════
    let healedCount = 0;
    bkkStations.forEach(s => {
      const key = s.stationID;
      let lastValidIdx = -1; // จำตำแหน่งล่าสุดที่มีตัวเลข

      for (let i = 0; i < history.length; i++) {
        const val = history[i][key];
        // ถ้าเจอตัวเลข
        if (val !== "-" && val !== null && val !== undefined) {
          // และก่อนหน้านี้เคยเจอตัวเลขมาแล้ว (แปลว่ามีช่องว่างอยู่ตรงกลาง)
          if (lastValidIdx !== -1) {
            const gapCount = i - lastValidIdx - 1; // นับว่าแหว่งไปกี่ช่อง
            
            // ถ้าแหว่ง 1-6 ชั่วโมง ให้คำนวณและเติมเต็มรอยโหว่
            if (gapCount > 0 && gapCount <= 6) {
              const startVal = history[lastValidIdx][key];
              const endVal = history[i][key];
              const step = (endVal - startVal) / (gapCount + 1);

              for (let j = 1; j <= gapCount; j++) {
                history[lastValidIdx + j][key] = parseFloat((startVal + (step * j)).toFixed(1));
              }
              healedCount++;
            }
          }
          lastValidIdx = i; // อัปเดตตำแหน่งที่มีตัวเลขล่าสุด
        }
      }
    });
    if(healedCount > 0) console.log(`✨ [Data Healing] ซ่อมแซมรอยโหว่ให้สถานีที่เน็ตหลุดสำเร็จ ${healedCount} จุด!`);

    // 5. เก็บประวัติไว้ 72 ชั่วโมง
    if (history.length > 72) {
      history.shift(); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log('บันทึกข้อมูลและเคลียร์ประวัติตกหล่นเรียบร้อย!');

  } catch (error) {
    console.error('เกิดข้อผิดพลาดรุนแรง:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
