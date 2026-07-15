# AI 台灣個股智慧選股 V8.1｜EMA100 策略版

## 新增 EMA100
- 計算 EMA100
- 判斷股價是否站上 EMA100
- 判斷 EMA100 是否上彎
- 判斷 MACD 是否黃金交叉
- 組合策略：股價站上 EMA100＋EMA100 上彎＋MACD 黃金交叉

## 技術分數
- 股價站上 EMA100：+15
- EMA100 上彎：+10
- MACD 黃金交叉：+15
- 三項同時成立：額外 +10

## 技術條件選擇
新增：
- 股價站上 EMA100
- EMA100 上彎
- EMA100＋MACD 黃金交叉

## 顯示
- 單股分析顯示 EMA100 與策略是否成立
- 個股內頁顯示 EMA100 與策略狀態
- 掃描列表符合策略時顯示「EMA100策略」標籤

## 部署
Render Service Name 固定：
`ai-taiwan-stock-screener-v7`

覆蓋 GitHub 後 Commit，使用原本 Render 服務部署即可。
