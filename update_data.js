// ไฟล์: update_data.js
const fs = require('fs');

async function fetchAndSave() {
  try {
    const targetUrl = 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php';
    const encodedUrl = encodeURIComponent(targetUrl);
    
    // ใช้ Proxy 3 ช่องทางเหมือนหน้าเว็บ เพื่อป้องกันการเชื่อมต่อล้มเหลว
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

    // 2. อ่านไฟล์ประวัติเดิม (ถ้ามีและไม่ว่างเปล่า)
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      // ป้องกัน Error หาก history.json ในระบบว่างเปล่า
      if (rawData.trim() !== '') {
        history = JSON.parse(rawData);
      }
    }

    // 3. แนบข้อมูลใหม่
    history.push({
      timestamp: new Date().toISOString(),
      data: newData
    });

    // 4. ตัดข้อมูลเก่าทิ้ง เก็บไว้ 72 ชั่วโมง
    if (history.length > 72) {
      history.shift(); 
    }

    // 5. บันทึกไฟล์
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log('บันทึกข้อมูลคุณภาพอากาศสำเร็จ!');

  } catch (error) {
    console.error('เกิดข้อผิดพลาดรุนแรง:', error.message);
    // บังคับให้ระบบแจ้ง Error เพื่อหยุดหุ่นยนต์ไม่ให้เซฟไฟล์เปล่า
    process.exit(1); 
  }
}

fetchAndSave();
