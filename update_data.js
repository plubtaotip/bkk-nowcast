process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');

const BKK_STATIONS = [
  "02t","03t","05t","12t","50t","52t","53t","54t","59t","61t",
  "bkp101t","bkp102t","bkp103t","bkp104t","bkp105t","bkp56t","bkp57t","bkp58t","bkp59t","bkp60t",
  "bkp61t","bkp62t","bkp63t","bkp64t","bkp65t","bkp66t","bkp67t","bkp69t","bkp70t","bkp71t",
  "bkp72t","bkp73t","bkp74t","bkp75t","bkp76t","bkp77t","bkp78t","bkp79t","bkp80t","bkp81t",
  "bkp82t","bkp83t","bkp84t","bkp85t","bkp86t","bkp87t","bkp88t","bkp89t","bkp90t","bkp91t",
  "bkp92t","bkp93t","bkp94t","bkp95t","bkp96t","bkp97t","bkp98t","bkp99t","o10"
];

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function fetchStationHistory(stationID, startDateStr, endDateStr) {
  const url = `http://air4thai.com/forweb/getHistoryData.php?stationID=${stationID}&param=PM25&type=hr&sdate=${startDateStr}&edate=${endDateStr}`;
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (res.ok) {
      const data = await res.json();
      return data?.res?.stations?.[0]?.data || data?.stations?.[0]?.data || null;
    }
  } catch (e) {}
  return null;
}

async function update8HoursBatch() {
  try {
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      if (rawData.trim() !== '') {
        try { history = JSON.parse(rawData); } catch (e) { history = []; }
      }
    }

    let historyMap = {};
    history.forEach(row => {
      historyMap[`${row.date}|${row.timeRange}`] = row;
    });

    // เวลาปัจจุบันของไทย (UTC+7)
    const utcNow = new Date();
    const bkkTime = new Date(utcNow.getTime() + (7 * 60 * 60 * 1000));
    const endDateStr = bkkTime.toISOString().split('T')[0];
    const startDateStr = new Date(bkkTime.getTime() - (24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    console.log(`🚀 กำลังดึงข้อมูลย้อนหลัง 8 ชม. (${startDateStr} ถึง ${endDateStr})...`);

    // แบ่งดึงทีละ 10 สถานี ป้องกันเซิร์ฟเวอร์ Air4Thai ตัดการเชื่อมต่อ
    const results = [];
    const batchSize = 10;
    for (let i = 0; i < BKK_STATIONS.length; i += batchSize) {
      const batch = BKK_STATIONS.slice(i, i + batchSize);
      const batchRes = await Promise.all(
        batch.map(async (stn) => ({
          stn,
          stnData: await fetchStationHistory(stn, startDateStr, endDateStr)
        }))
      );
      results.push(...batchRes);
      await delay(300);
    }

    let updatedCount = 0;
    let activeStations = 0;

    results.forEach(({ stn, stnData }) => {
      if (stnData && Array.isArray(stnData) && stnData.length > 0) {
        activeStations++;
        // ดึงเฉพาะ 8 ชั่วโมงล่าสุด
        const recentData = stnData.slice(-8);

        recentData.forEach(item => {
          const pm25 = item.PM25;
          const dtStr = item.DATETIMEDATA;

          if (dtStr && pm25 && pm25 !== "-" && !isNaN(parseFloat(pm25))) {
            const [datePart, timePart] = dtStr.split(' ');
            const hour = parseInt(timePart.split(':')[0], 10);
            const prevHour = hour === 0 ? 23 : hour - 1;

            let targetDate = datePart;
            if (hour === 0) {
              const dtObj = new Date(dtStr.replace(' ', 'T') + '+07:00');
              targetDate = new Date(dtObj.getTime() - 86400000).toISOString().split('T')[0];
            }

            // กันข้อมูลอนาคตเกินเวลาปัจจุบัน
            const rowTimeCheck = new Date(`${targetDate}T${String(prevHour).padStart(2, '0')}:00:00+07:00`);
            if (rowTimeCheck > bkkTime) return;

            const timeRange = `${String(prevHour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:00`;
            const key = `${targetDate}|${timeRange}`;

            if (!historyMap[key]) {
              let row = { date: targetDate, timeRange: timeRange };
              BKK_STATIONS.forEach(s => row[s] = "-");
              historyMap[key] = row;
            }

            // เติมค่าใหม่เฉพาะช่องที่เป็น "-" หรือยังไม่มีข้อมูล
            const currentVal = historyMap[key][stn];
            if (currentVal === "-" || currentVal === undefined || currentVal === null) {
              historyMap[key][stn] = parseFloat(pm25);
              updatedCount++;
            }
          }
        });
      }
    });

    console.log(`📡 เชื่อมต่อสำเร็จ ${activeStations}/${BKK_STATIONS.length} สถานี | อัปเดตเพิ่ม ${updatedCount} จุด`);

    let historyList = Object.values(historyMap);
    historyList.sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.timeRange.split(' - ')[0]}:00+07:00`).getTime();
      const timeB = new Date(`${b.date}T${b.timeRange.split(' - ')[0]}:00+07:00`).getTime();
      return timeA - timeB;
    });

    historyList = historyList.filter(row => {
      const rowTime = new Date(`${row.date}T${row.timeRange.split(' - ')[0]}:00+07:00`);
      return rowTime <= bkkTime;
    });

    if (historyList.length > 200) {
      historyList = historyList.slice(historyList.length - 200);
    }

    fs.writeFileSync('history.json', JSON.stringify(historyList, null, 2));
    console.log("✅ บันทึกไฟล์ history.json เรียบร้อย!");

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1);
  }
}

update8HoursBatch();
