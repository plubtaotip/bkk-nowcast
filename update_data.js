// ไฟล์: update_data.js
const fs = require('fs');

async function fetchAndSave() {
  try {
    const targetUrl = 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php';
    const encodedUrl = encodeURIComponent(targetUrl);
    
    const proxyList = [
      { url: `https://api.allorigins.win/get?url=${encodedUrl}`, type: 'allorigins' },
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

    // คัดกรองเอาเฉพาะ กทม. และ PM2.5
    const bkkStationsOnly = newData.stations
      .filter(station => station.areaTH && station.areaTH.includes('กรุงเทพ'))
      .map(station => {
        return {
          stationID: station.stationID,
          nameTH: station.nameTH,
          nameEN: station.nameEN,
          areaTH: station.areaTH,
          lat: station.lat,
          long: station.long,
          AQILast: {
            date: station.AQILast.date,
            time: station.AQILast.time,
            PM25: station.AQILast.PM25 ? { value: station.AQILast.PM25.value } : { value: null }
          }
        };
      });

    newData.stations = bkkStationsOnly;

    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        history = JSON.parse(rawData);
      }
    }

    // ═════════════════════════════════════════════════════
    // ป้องกันการอัปเดตซ้ำในชั่วโมงเดียวกัน (Duplicate Prevention)
    // ═════════════════════════════════════════════════════
    if (history.length > 0) {
      const lastUpdate = new Date(history[history.length - 1].timestamp);
      const now = new Date();
      
      // เช็คว่า ปี, เดือน, วัน, และ "ชั่วโมง" ตรงกันหรือไม่ (ใช้ UTC เพื่อความแม่นยำของระบบเซิร์ฟเวอร์)
      if (
        lastUpdate.getUTCFullYear() === now.getUTCFullYear() &&
        lastUpdate.getUTCMonth() === now.getUTCMonth() &&
        lastUpdate.getUTCDate() === now.getUTCDate() &&
        lastUpdate.getUTCHours() === now.getUTCHours()
      ) {
        console.log('✅ ข้อมูลของชั่วโมงนี้ถูกอัปเดตไปแล้ว (อาจเกิดจากการกด Manual ไปก่อนหน้านี้) ระบบจะข้ามการทำงานเพื่อป้องกันข้อมูลซ้ำซ้อน');
        process.exit(0); // สั่งหยุดสคริปต์และแจ้ง GitHub Actions ว่าทำงานเสร็จสมบูรณ์แบบไม่มี Error
      }
    }
    // ═════════════════════════════════════════════════════

    history.push({
      timestamp: new Date().toISOString(),
      data: newData
    });

    if (history.length > 72) {
      history.shift(); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log('บันทึกข้อมูลคุณภาพอากาศสำเร็จ! (จำกัดเฉพาะโซน กทม. และ PM2.5)');

  } catch (error) {
    console.error('เกิดข้อผิดพลาดรุนแรง:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
