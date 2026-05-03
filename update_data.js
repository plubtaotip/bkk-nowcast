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

    // ═════════════════════════════════════════════════════
    // DATA FILTERING: คัดกรองเอาเฉพาะ กทม. และ PM2.5
    // ═════════════════════════════════════════════════════
    const bkkStationsOnly = newData.stations
      // 1. กรองเอาเฉพาะสถานีที่มีคำว่า "กรุงเทพ" ในพื้นที่
      .filter(station => station.areaTH && station.areaTH.includes('กรุงเทพ'))
      // 2. แปลงโครงสร้างข้อมูลใหม่ เก็บเฉพาะสิ่งที่จำเป็น
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
            // ดึงมาแค่ PM2.5 (ถ้าสถานีไหนไม่มีข้อมูล PM2.5 ให้เซ็ตเป็น null)
            PM25: station.AQILast.PM25 ? { value: station.AQILast.PM25.value } : { value: null }
          }
        };
      });

    // นำข้อมูลที่ถูกคัดกรองแล้วจนมีขนาดเล็ก นำไปใส่ทับข้อมูลเดิม
    newData.stations = bkkStationsOnly;
    // ═════════════════════════════════════════════════════

    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        history = JSON.parse(rawData);
      }
    }

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
