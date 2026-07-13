# AI 台灣個股智慧選股 V5 正式版

## V5 新增
- 三種選股模式：低檔剛交叉、底部突破、回測進場
- AI 找相似股票：可輸入 1303 南亞，計算全市場技術型態相似度
- 自選股儲存
- 股票詳細資料視窗
- 選股結果匯出 CSV
- 手機優先介面
- Render 部署服務名稱改為 `ai-taiwan-stock-screener-v5`

## GitHub 更新方式
不需要刪除 Repository。
直接把此 ZIP 解壓後的全部檔案上傳到同一個 Repository，選擇覆蓋同名檔案並 Commit。

根目錄必須直接看到：
- app.py
- app.js
- index.html
- styles.css
- render.yaml
- requirements.txt
- manifest.webmanifest

## Render
回 Render 的 Blueprint 按 Manual Sync。
新服務名稱會是 `ai-taiwan-stock-screener-v5`。
確認後 Deploy Blueprint。

## 目前限制
- 官方同步端點目前為上市個股當日行情。
- 月 KD、RSI、MACD 仍需至少約 24 個月歷史 CSV。
- 上櫃、法人籌碼、營收與 EPS 尚未納入此版本。
