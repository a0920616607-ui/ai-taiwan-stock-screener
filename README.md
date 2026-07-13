# AI 台灣個股智慧選股 V4 修正版

## 修正內容
- 改用 Render 官方常見的 Flask + Gunicorn 部署方式
- 服務名稱改為 `ai-taiwan-stock-screener-v4`，避免與舊 Blueprint 服務衝突
- 補齊 `app.py`、`requirements.txt`、`render.yaml`
- 健康檢查路徑：`/api/health`
- 官方行情來源：臺灣證券交易所 OpenAPI
- 手機版介面與 CSV 歷史資料匯入

## 重要
請把 GitHub 舊檔案全部刪除或覆蓋成此版本，根目錄必須直接看到：
`app.py`、`render.yaml`、`requirements.txt`、`index.html`、`app.js`、`styles.css`

不要把整個資料夾再包在第二層資料夾裡。
