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
        console.log(`Proxy ${proxy.url} มีปัญหา ข้ามไปใช้อันถัดไป...`);
      }
    }

    if (!newData || !newData.stations) {
      throw new Error('Proxy ล่มทั้งหมด ไม่สามารถดึงข้อมูลได้ในรอบนี้');
    }

    // 1. คัดกรองเฉพาะสถานีใน กทม.
    const bkkStations = newData.stations.filter(s => s.areaTH && s.areaTH.includes('กรุงเทพ'));
    
    if (bkkStations.length === 0) {
      throw new Error('ไม่พบข้อมูลสถานีใน กทม.');
    }

    // 2. ค้นหาวันที่และเวลาที่ "อัปเดตใหม่ที่สุด" ในกลุ่ม กทม. 
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

    // 3. สร้างข้อมูล 1 แถว สำหรับรอบชั่วโมงนี้
    const newRecord = {
      date: repDate,
      timeRange: timeRange
    };

    // 4. นำรหัสสถานีมาทำเป็นคอลัมน์
    bkkStations.forEach(s => {
      if (
        s.AQILast && 
        s.AQILast.date === repDate &&
        s.AQILast.time === repTime && 
        s.AQILast.PM25 && 
        s.AQILast.PM25.value !== undefined && 
        !isNaN(parseFloat(s.AQILast.PM25.value))
      ) {
        newRecord[s.stationID] = parseFloat(s.AQILast.PM25.value);
      } else {
        newRecord[s.stationID] = "-"; 
      }
    });

    // 5. โหลดข้อมูลประวัติเดิม
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } 
        catch (e) { history = []; }
      }
    }

    // 6. ป้องกันอัปเดตซ้ำในชั่วโมงเดียวกัน
    if (history.length > 0) {
      const lastRecord = history[history.length - 1];
      if (lastRecord.date === newRecord.date && lastRecord.timeRange === newRecord.timeRange) {
        console.log('✅ ข้อมูลช่วงเวลานี้ถูกอัปเดตไปแล้ว ข้ามการทำงาน');
        process.exit(0);
      }
    }

    // 7. เพิ่มข้อมูลใหม่เข้าสู่ Array
    history.push(newRecord);

    // ═════════════════════════════════════════════════════
    // 🛠️ DATA HEALING: ระบบซ่อมแซมข้อมูลย้อนหลังอัตโนมัติ 🛠️
    // ═════════════════════════════════════════════════════
    bkkStations.forEach(s => {
      const key = s.stationID;
      const lastIdx = history.length - 1;

      // ตรวจสอบว่า "ชั่วโมงปัจจุบัน" สถานีนี้มีข้อมูลตัวเลขหรือไม่ (ไม่ใช่ "-")
      if (history[lastIdx][key] !== "-" && history[lastIdx][key] !== null && history[lastIdx][key] !== undefined) {
        let gapCount = 0;
        let prevValidIdx = -1;

        // ย้อนกลับไปหาอดีต ว่ามีรอยโหว่ "-" ติดต่อกันกี่ชั่วโมง
        for (let i = lastIdx - 1; i >= 0; i--) {
          if (history[i][key] === "-" || history[i][key] === null) {
            gapCount++;
          } else {
            prevValidIdx = i; // เจอตัวเลขของชั่วโมงก่อนที่เน็ตจะหลุดแล้ว!
            break;
          }
        }

        // ถ้าระบบพบว่ามีข้อมูลแหว่งไป 1-6 ชั่วโมง ให้ทำการซ่อมแซม
        // (ถ้าแหว่งเกิน 6 ชม. ถือว่าเครื่องน่าจะปิดซ่อมจริง จะปล่อยให้แหว่งไว้เหมือนเดิม)
        if (gapCount > 0 && gapCount <= 6 && prevValidIdx !== -1) {
          const startVal = history[prevValidIdx][key]; // ค่าฝุ่นก่อนเน็ตหลุด
          const endVal = history[lastIdx][key];        // ค่าฝุ่นตอนเน็ตกลับมา
          const step = (endVal - startVal) / (gapCount + 1); // คำนวณหาค่าเฉลี่ยที่จะใช้เติมแต่ละชั่วโมง

          // ทำการเขียนข้อมูลเติมลงไปในช่องโหว่ (Backfill)
          for (let i = 1; i <= gapCount; i++) {
            history[prevValidIdx + i][key] = parseFloat((startVal + (step * i)).toFixed(1));
          }
          console.log(`✨ [Data Healing] ซ่อมแซมรอยโหว่ให้สถานี ${key} จำนวน ${gapCount} ชั่วโมง สำเร็จ!`);
        }
      }
    });
    // ═════════════════════════════════════════════════════

    // 8. เก็บประวัติไว้แค่ 72 ชั่วโมง ลบอันเก่าสุดทิ้ง
    if (history.length > 72) {
      history.shift(); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log(`บันทึกข้อมูลสำเร็จ! (วันที่ ${newRecord.date} | ช่วงเวลา ${newRecord.timeRange})`);

  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
