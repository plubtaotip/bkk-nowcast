const fs = require('fs');

async function fetchAndSave() {
  try {
    const response = await fetch('https://api.allorigins.win/raw?url=http%3A%2F%2Fair4thai.pcd.go.th%2Fservices%2FgetNewAQI_JSON.php');
    const newData = await response.json();

   
    let history = [];
    if (fs.existsSync('history.json')) {
      const rawData = fs.readFileSync('history.json', 'utf8');
      history = JSON.parse(rawData);
    }

   
    history.push({
      timestamp: new Date().toISOString(),
      data: newData
    });

    
    if (history.length > 72) {
      history.shift(); 
    }

  
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    console.log('บันทึกข้อมูลคุณภาพอากาศเรียบร้อยแล้ว!');

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', error);
  }
}

fetchAndSave();
