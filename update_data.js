// ไฟล์: update_data.js
const fs = require('fs');

// ลิสต์รายชื่อสถานี กทม. ทั้งหมด (เป้าหมายในการดึงข้อมูลดิบ)
const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

// ฟังก์ชันหน่วงเวลา ป้องกันการโดนบล็อคจากเซิร์ฟเวอร์
const delay = ms => new Promise(res => setTimeout(res, ms));

// 🕵️‍♂️ ฟังก์ชันมุดหลังบ้าน ไปดึง API ลับของหน้าเว็บ Air4Thai
async function fetchRawHistory(stationID, dateStr) {
    const targetUrl = `http://air4thai.com/forweb/getHistoryData.php?stationID=${stationID}&param=PM25&type=hr&sdate=${dateStr}&edate=${dateStr}`;
    const encodedUrl = encodeURIComponent(targetUrl);
    
    // ใช้ Proxy เพื่อพรางตัวและหลบ CORS
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
        
        // เจาะโครงสร้าง JSON หา Array ที่เก็บตารางข้อมูลดิบ
        return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
      } catch (err) {
        continue;
      }
    }
    return null;
}

async function fetchAndSave() {
  try {
    // 1. โหลดประวัติเดิมจากไฟล์
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    // 2. ตั้งเวลาปัจจุบัน (Asia/Bangkok)
    const bkkTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
    const yyyy = bkkTime.getFullYear();
    const mm = String(bkkTime.getMonth()+1).padStart(2,'0');
    const dd = String(bkkTime.getDate()).padStart(2,'0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const currentHour = bkkTime.getHours();
    
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;
    const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(currentHour).padStart(2, '0')}:00`;

    // 3. สร้างแถวเวลาของชั่วโมงปัจจุบันรอไว้
    let latestRow = history.find(r => r.date === dateStr && r.timeRange === timeRange);
    if (!latestRow) {
      latestRow = { date: dateStr, timeRange: timeRange };
      BKK_STATIONS.forEach(s => latestRow[s] = "-");
      history.push(latestRow);
      console.log(`สร้างแถวใหม่: วันที่ ${dateStr} | ${timeRange}`);
    }

    console.log(`🚀 กำลังดูดข้อมูลดิบ (Raw Hourly) จาก API ลับของ Air4Thai...`);
    
    // 4. ทยอยดึงข้อมูลทีละ 5 สถานี (Chunking) เพื่อความเสถียร
    const chunkSize = 5;
    for (let i = 0; i < BKK_STATIONS.length; i += chunkSize) {
      const chunk = BKK_STATIONS.slice(i, i + chunkSize);
      console.log(`กำลังดึงข้อมูลสถานี: ${chunk.join(', ')}`);
      
      const promises = chunk.map(async (stn) => {
         const stnData = await fetchRawHistory(stn, dateStr);
         
         if (stnData && Array.isArray(stnData)) {
             // สแกนข้อมูลของวันนี้ทุกชั่วโมง แล้วนำไปเติมย้อนหลังให้ตรงช่องเป๊ะๆ (True Backfilling)
             stnData.forEach(pastHr => {
                 if (pastHr.PM25 && pastHr.PM25 !== "-") {
                     // DATETIMEDATA จะมาในรูปแบบ "2026-05-06 14:00:00"
                     const pTimeStr = pastHr.DATETIMEDATA; 
                     const pHour = parseInt(pTimeStr.split(' ')[1].split(':')[0], 10);
                     const pPrevHour = pHour === 0 ? 23 : pHour - 1;
                     const pTimeRange = `${String(pPrevHour).padStart(2, '0')}:00 - ${String(pHour).padStart(2, '0')}:00`;
                     const pDateStr = pTimeStr.split(' ')[0];
                     
                     let targetRow = history.find(r => r.date === pDateStr && r.timeRange === pTimeRange);
                     if (targetRow) {
                         targetRow[stn] = parseFloat(pastHr.PM25);
                     }
                 }
             });
         }
      });
      
      await Promise.all(promises); // รอให้ครบ 5 สถานี
      await delay(1000); // พักหายใจ 1 วินาที ป้องกันโดนแบน
    }

    // ═════════════════════════════════════════════════════
    // 🛠️ SWEEPING DATA HEALING: ซ่อมรอยโหว่ (เหมือนเดิม)
    // ═════════════════════════════════════════════════════
    let healedCount = 0;
    BKK_STATIONS.forEach(key => {
      let lastValidIdx = -1;
      for (let i = 0; i < history.length; i++) {
        const val = history[i][key];
        if (val !== "-" && val !== null && val !== undefined) {
          if (lastValidIdx !== -1) {
            const gapCount = i - lastValidIdx - 1;
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
          lastValidIdx = i;
        }
      }
    });
    if(healedCount > 0) console.log(`✨ [Data Healing] ซ่อมรอยโหว่สำเร็จ ${healedCount} จุด!`);

    // 5. ตัดหางปล่อยวัด เก็บประวัติไว้แค่ 72 ชั่วโมง เพื่อให้หน้าเว็บโหลดไว
    if (history.length > 72) {
      history = history.slice(history.length - 72); 
    }

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log('✅ บันทึกข้อมูล Raw Hourly เสร็จสมบูรณ์!');

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดรุนแรง:', error.message);
    process.exit(1); 
  }
}

fetchAndSave();
