# AI 台灣個股智慧選股 V13

## V13 新增：AI 圖片分析

- 手機瀏覽器可直接拍照或從相簿選圖。
- 一次最多 4 張圖片，可做日線、60 分、15 分等多週期交叉分析。
- 分析趨勢、支撐壓力、EMA/MA、MACD、KD、RSI、布林帶、成交量及艾略特波浪主／備選方案。
- 圖片刻度不清時，提示無法可靠辨識，不虛構精確價位。
- API Key 只存放在 Render 後端環境變數，不會傳給手機瀏覽器。

## Render 部署設定

1. 將本專案部署到 Render。
2. 在 Render 專案的 **Environment** 新增：
   - `OPENAI_API_KEY`：你的 OpenAI API Key
   - `OPENAI_VISION_MODEL`：可選，預設 `gpt-4.1-mini`
3. 儲存後重新部署。
4. 手機開啟原本雲端網址，點選「圖片分析」。

## 注意

- ChatGPT Plus 與 OpenAI API 額度是分開計費。
- AI 圖片分析屬研究輔助，可能誤判圖表刻度、指標或波浪位階。
- 不要把 API Key 寫進 `app.js` 或 `index.html`。

## V12 原功能保留

AI 智慧模式、嚴格篩選、上市／上櫃全市場掃描、排行榜、單股分析、自選股及類股排行均保留。
