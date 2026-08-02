# AI 台灣個股智慧選股 V13.2

本版修正手機圖片過大與 AI 回應逾時。

## 更新
- 選圖後在手機瀏覽器自動縮放，長邊最高 1800px。
- 統一轉成 JPEG 84% 品質，大幅降低上傳容量。
- 預覽顯示壓縮前後容量與尺寸。
- 前端等待上限延長至 285 秒。
- OpenAI 後端等待上限延長至 260 秒。
- Render Gunicorn timeout 調整為 300 秒。
- 顯示「壓縮、上傳、AI 辨識、整理報告」進度。

## Render 設定
必須設定 `OPENAI_API_KEY`。可選設定 `OPENAI_VISION_MODEL`。重新部署後建議使用無痕模式測試，避免舊版快取。

注意：Render 免費方案可能休眠，第一次開啟需等待服務喚醒。多張高複雜度圖表仍可能較慢，建議先用 1～2 張測試。


## V13.3 修正
- 修正 V13 圖片預覽 CSS 被錯誤寫成字面 `\n`，造成手機預覽以原始寬高撐出版面。
- 手機預覽固定為容器寬度，使用 `object-fit: contain`，只顯示縮圖；實際送出的檔案仍是壓縮後版本。
- 未設定 `OPENAI_API_KEY` 時停用分析按鈕並顯示明確提示。

## Render 必要設定
在 Render 服務的 Environment 新增：
`OPENAI_API_KEY=你的 API key`

可選：
`OPENAI_VISION_MODEL=gpt-4.1-mini`

儲存後必須重新部署。ChatGPT Plus 不等同 OpenAI API 額度。
