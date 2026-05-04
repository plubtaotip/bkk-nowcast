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

    // 2. ค้นหาวันที่และเวลาที่ "อัปเดตใหม่ที่สุด" ในกลุ่ม กทม. เพื่อใช้เป็นเวลาอ้างอิง
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

    // แปลงเวลาให้เป็นรูปแบบช่วงเวลา (เช่น "09:00 - 10:00")
    const hour = parseInt(repTime.split(':')[0], 10);
    const prevHour = hour === 0 ? 23 : hour - 1;
    const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:00`;

    // 3. สร้างข้อมูล 1 แถว (Flat Object) สำหรับรอบชั่วโมงนี้
    const newRecord = {
      date: repDate,
      timeRange: timeRange
    };

    // 4. นำรหัสสถานีมาทำเป็นคอลัมน์ ตรวจสอบเวลาการอัปเดต และใส่ค่า PM2.5
    bkkStations.forEach(s => {
      // ตรวจสอบว่ามีข้อมูลครบ และ "เวลาของสถานี ตรงกับเวลาล่าสุดหรือไม่"
      if (
        s.AQILast && 
        s.AQILast.date === repDate &&
        s.AQILast.time === repTime && 
        s.AQILast.PM25 && 
        s.AQILast.PM25.value !== undefined && 
        !isNaN(parseFloat(s.AQILast.PM25.value))
      ) {
        // อัปเดตแล้ว: ใส่ตัวเลขตามปกติ
        newRecord[s.stationID] = parseFloat(s.AQILast.PM25.value);
      } else {
        // ไม่อัปเดต (เวลาเก่าค้างอยู่) หรือข้อมูลเสีย: ให้ใส่ "-" แทน
        newRecord[s.stationID] = "-"; 
      }
    });

    // 5. โหลดข้อมูลประวัติเดิม
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try {
          history = JSON.parse(rawData);
          if(history.length > 0 && history[0].timestamp) {
              console.log("พบโครงสร้างไฟล์แบบเก่า ทำการรีเซ็ตประวัติใหม่ทั้งหมด...");
              history = [];
          }
        } catch (e) { history = []; }
      }
    }

    // 6. ป้องกันการอัปเดตซ้ำในชั่วโมงเดียวกัน (Idempotency)
    if (history.length > 0) {
      const lastRecord = history[history.length - 1];
      if (lastRecord.date === newRecord.date && lastRecord.timeRange === newRecord.timeRange) {
        console.log('✅ ข้อมูลของช่วงเวลานี้ถูกอัปเดตไปแล้ว ระบบจะข้ามการทำงานเพื่อป้องกันข้อมูลซ้ำซ้อน');
        process.exit(0);
      }
    }

    // 7. เพิ่มข้อมูลใหม่เข้าสู่ Array
    history.push(newRecord);

    // เก็บประวัติไว้แค่ 72 ชั่วโมง ลบอันเก่าสุดทิ้ง
    if (history.length > 72) {
      history.shift(); 
    }

    // 8. บันทึกลงไฟล์
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log(`บันทึกข้อมูลสำเร็จ! รูปแบบตาราง (วันที่ ${newRecord.date} | ช่วงเวลา ${newRecord.timeRange})`);

  } catch (error) {
    console.error('เกิดข้อผิดพลาดรุนแรง:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
