# AI 台灣個股智慧選股 V8.0｜官方法人版

## 本版只優先完成兩件事

### 1. 首頁改回 V6.5 的字體與排列比例
- 字體縮小
- 每列高度縮小
- 燈號左側紅／綠線縮為 2px
- 首頁刪除量能欄；量能仍保留在個股內頁
- 法人／主力欄加寬
- 手機右側不再被量能欄擠出畫面

### 2. 真實法人買賣超
官方來源：
- 上市：TWSE T86（外資、投信、自營商、三大法人）
- 上櫃：TPEx OpenAPI `tpex_3insti_daily_trading`

處理方式：
- 上市 T86 自動往前查找最近交易日
- 自營商「自行買賣＋避險」正確加總
- 上市與上櫃全市場資料一次抓取並快取
- 首頁換算顯示為「張」
- API 暫時沒有資料時顯示「待更新」，不會用 0 假裝是真實數據
- 法人資料未取得時，法人分數維持中性 50，不錯誤加減分
- 主力仍為量價與法人方向的估算分數，不是假裝成真實分點張數

可用以下網址檢查法人是否抓到：
`/api/institutional/status`

## 部署方式
Render Service Name 固定不變：
`ai-taiwan-stock-screener-v7`

1. 解壓縮後上傳全部檔案到原 GitHub Repository。
2. Commit changes。
3. Render 會自動部署；若沒有，進入原 v7 服務：
   Manual Deploy → Deploy latest commit。
4. 不需要建立新的 Render Service，網址維持不變。


## V8.0 連線與內頁修正版
- 修正上一個內頁修正版 `app.js` 結尾缺少括號造成的 JavaScript 語法錯誤。
- 語法錯誤會讓健康檢查程式沒有執行，因此畫面一直停在「連線中」。
- X 關閉改為 onclick、click、touchend、pointerup 多重處理。
- 法人分析與主力分析改用事件委派，提升 Android Chrome 點擊穩定性。
- 前端快取版本更新為 802，避免載入舊 JavaScript。
