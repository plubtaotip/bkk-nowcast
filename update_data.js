// ไฟล์: update_data.js
const fs = require('fs');

// ลิสต์รายชื่อสถานี กทม. ทั้งหมด
const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

// ฟังก์ชันหน่วงเวลา
const delay = ms => new Promise(res => setTimeout(res, ms));

// 🕵️‍♂️ ฟังก์ชันมุดหลังบ้าน (ดึงข้อมูลช่วงวันที่กำหนด)
async function fetchRawHistory(stationID, startDateStr, endDateStr) {
    const targetUrl = `http://air4thai.com/forweb/getHistoryData.php?stationID=${stationID}&param=PM25&type=hr&sdate=${startDateStr}&edate=${endDateStr}`;
    const encodedUrl = encodeURIComponent(targetUrl);
    
    // ใช้ Proxy พรางตัว
    const proxyList = [
      { url: `https://api.allorigins.win/get?disableCache=true&url=${encodedUrl}`, type: 'allorigins' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${targetUrl}`, type: 'raw' }
    ];

    for (const proxy of proxyList) {
      try {
        const response = await fetch(proxy.url);
        if (!response.ok) continue;
        
        let data = null;
        if (proxy.type === 'allorigins') {
          const wrapper = await response.json();
          data = JSON.parse(wrapper.contents);
        } else {
          data = await response.json();
        }
        
        return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
      } catch (err) {
        continue;
      }
    }
    return null;
}

async function fetchAndSave() {
  try {
    // 1. โหลดประวัติเดิมที่เก็บไว้ (ที่มีข้อมูล 5 วันแล้ว)
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    // 2. คำนวณเวลา: วันนี้ (endDate) และ ย้อนหลัง 8 ชั่วโมง (startDate)
    const bkkTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
    
    // วันนี้
    const yyyy = bkkTime.getFullYear();
    const mm = String(bkkTime.getMonth()+1).padStart(2,'0');
    const dd = String(bkkTime.getDate()).padStart(2,'0');
    const endDateStr = `${yyyy}-${mm}-${dd}`; 

    // ย้อนหลัง 8 ชั่วโมง
    const pastTime = new Date(bkkTime.getTime() - (8 * 60 * 60 * 1000));
    const s_yyyy = pastTime.getFullYear();
    const s_mm = String(pastTime.getMonth()+1).padStart(2,'0');
    const s_dd = String(pastTime.getDate()).padStart(2,'0');
    const startDateStr = `${s_yyyy}-${s_mm}-${s_dd}`; 

    console.log(`🚀 กำลังดูดข้อมูลดิบย้อนหลัง 8 ชั่วโมง (ครอบคลุม ${startDateStr} ถึง ${endDateStr})...`);
    
    // 3. ทยอยดึงข้อมูลทีละ 5 สถานี
    const chunkSize = 5;
    for (let i = 0; i < BKK_STATIONS.length; i += chunkSize) {
      const chunk = BKK_STATIONS.slice(i, i + chunkSize);
      console.log(`กำลังดึงข้อมูลกลุ่มสถานี: ${chunk.join(', ')}`);
      
      const promises = chunk.map(async (stn) => {
         const stnData = await fetchRawHistory(stn, startDateStr, endDateStr);
         
         if (stnData && Array.isArray(stnData)) {
             stnData.forEach(pastHr => {
                 if (pastHr.PM25 && pastHr.PM25 !== "-") {
                     // DATETIMEDATA มาในรูปแบบ "2026-05-06 14:00:00"
                     const pTimeStr = pastHr.DATETIMEDATA; 
                     const pHour = parseInt(pTimeStr.split(' ')[1].split(':')[0], 10);
                     const pPrevHour = pHour === 0 ? 23 : pHour - 1;
                     const pTimeRange = `${String(pPrevHour).padStart(2, '0')}:00 - ${String(pHour).padStart(2, '0')}:00`;
                     const pDateStr = pTimeStr.split(' ')[0];
                     
                     // ค้นหาแถวเวลา ถ้าไม่มีให้สร้างใหม่
                     let targetRow = history.find(r => r.date === pDateStr && r.timeRange === pTimeRange);
                     if (!targetRow) {
                         targetRow = { date: pDateStr, timeRange: pTimeRange };
                         BKK_STATIONS.forEach(s => targetRow[s] = "-"); // ตั้งค่าเริ่มต้นเป็น "-"
                         history.push(targetRow);
                     }
                     
                     // เติม/อัปเดตข้อมูล
                     targetRow[stn] = parseFloat(pastHr.PM25);
                 }
             });
         }
      });
      
      await Promise.all(promises);
      await delay(1000); // พัก 1 วิ ก็พอเพราะปริมาณข้อมูลลดลงแล้ว
    }

    // 4. เรียงลำดับข้อมูลตามวัน-เวลา (Sort Chronologically)
    history.sort((a, b) => {
        const hourA = a.timeRange.split(' - ')[0]; // หยิบชั่วโมงเริ่มมา
        const hourB = b.timeRange.split(' - ')[0];
        const timeA = new Date(`${a.date}T${hourA}:00+07:00`).getTime();
        const timeB = new Date(`${b.date}T${hourB}:00+07:00`).getTime();
        return timeA - timeB;
    });

    // 5. ตัดข้อมูลเก่าทิ้ง เก็บไว้สูงสุด 150 แถว (ครอบคลุมประมาณ 6 วัน) ไม่ให้ประวัติ 5 วันแรกหายไป
    if (history.length > 150) {
      history = history.slice(history.length - 150); 
    }

    // เขียนทับไฟล์ history.json
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log(`✅ สำเร็จ! อัปเดตข้อมูล 8 ชั่วโมงล่าสุดเรียบร้อย (มีข้อมูลรวม ${history.length} ชั่วโมง)`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดรุนแรง:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
