# 🌫️ BKK NowCast Monitor

**Development of BKK NowCast System for PM2.5 Air Quality Warning in Bangkok**  
*Environmental Engineering Senior Project — Chulalongkorn University*

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-00eaaf?style=for-the-badge&logo=github)](https://plubtaotip.github.io/bkk-nowcast/)
![Data Pipeline](https://img.shields.io/badge/Data_Pipeline-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)

---

## 📖 Overview

**BKK NowCast Monitor** is a real-time air quality analytics and early-warning web application designed specifically for Bangkok, Thailand. Traditional 24-hour moving averages often lag behind sudden spikes in fine particulate matter ($\text{PM}_{2.5}$), delaying public health advisories. 

To address this, this project adapts the US-EPA NowCast algorithm with customized parameters calibrated for Bangkok's urban pollution dynamics and Thailand's Pollution Control Department (PCD) air quality standards ($37.5\ \mu\text{g/m}^3$).

---

## ✨ Key Features

* **⚡ Tuned NowCast Algorithm ($N=8, w_{\min}=0.4$):**  
  Utilizes an **8-hour lookback window** and a **minimum weight factor of $0.4$** to respond rapidly to acute $\text{PM}_{2.5}$ episodes while maintaining strong correlation with true 24-hour moving averages.
* **🗺️ Interactive Spatial Zone Mapping (6 Bangkok Zones):**  
  Visualizes real-time $\text{PM}_{2.5}$ levels across **59 monitoring stations** grouped into 6 administrative zones (Central, South, North, East, Thon Buri North, and Thon Buri South) using Convex Hull boundary polygons.
* **📊 Statistical & Performance Analytics Dashboard:**  
  * **Accuracy Metrics:** Live calculation of **RMSE** (Root Mean Square Error) and **MAE** (Mean Absolute Error) comparing NowCast against 24-hour averages.
  * **Volatility Reduction (Area-Based Approach):** Compares Standard Deviation (SD) between individual stations and area-based zone averages to demonstrate false-alarm reduction.
  * **Time-Series & AQI Proportions:** Interactive Chart.js visualizations tracking hourly Raw vs. NowCast vs. 24-hr moving average trends alongside PCD standard distribution donut charts.
* **🤖 Automated Hourly Data Pipeline:**  
  Powered by **GitHub Actions** (`update_data.js`), fetching hourly observations from the Air4Thai API in batches, filling missing data gaps, preventing future-timestamp anomalies, and maintaining a continuous rolling window in `history.json`.

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** HTML5, CSS3 (Responsive Dark Glassmorphism UI), Vanilla JavaScript (ES6+)
* **Mapping & Visualization:** [Leaflet.js](https://leafletjs.com/) (Interactive Map & Convex Hull Polygons), [Chart.js](https://www.chartjs.org/) (Time-Series, Donut & Volatility Charts)
* **Backend / Automation:** Node.js (`update_data.js`), GitHub Actions (Cron-scheduled workflows)
* **Data Source:** Air4Thai API — Pollution Control Department (PCD), Thailand

```text
├── .github/workflows/   # Automated hourly GitHub Actions runner
├── index.html           # Main responsive web application (Home, Map, Dashboard)
├── update_data.js       # Node.js batch fetcher & rolling history updater
├── history.json         # Continuous hourly PM2.5 dataset (59 BKK stations)
└── README.md            # Project documentation
