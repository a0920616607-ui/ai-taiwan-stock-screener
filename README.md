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


## V8.0 上櫃與頁籤修正
- 上櫃或股票名單 API 若回傳 Render 錯誤頁，不再直接解析成 JSON。
- 前端會顯示正常中文錯誤，不再出現 Unexpected token '<'。
- `/api/universe` 與 `/api/scan` 保證回傳 JSON。
- 法人分析與主力分析改為直接 onclick 切換，避免 Android Chrome 點擊失效。
- 頁籤與內容面板使用明確 display 切換。
- 快取版本更新至 803。


## V8.0 同步與頁籤最終修正
- 修正 `rows is not defined`：同步股票名單正確從 API 回傳資料建立 rows。
- 上櫃／同步 API 若回傳 HTML 錯誤頁，前端改顯示中文提示。
- 後端 API 例外統一回傳 JSON。
- 法人分析與主力分析改用實際內頁容器 `detailOverlay`。
- 三個頁籤改成直接 onclick，不再依賴容易失效的事件委派。
- 快取版本更新至 804。


## V8.0 上櫃與內頁真正修正
- 修正頁籤代碼不一致：HTML 實際使用 tech / inst / main，程式先前誤用 technical / institutional / mainforce。
- 法人分析、主力分析改用正確 key，並加入直接 onclick 與事件委派雙重處理。
- 上櫃股票清單加入三種官方端點來源與舊版 JSON fallback。
- 上櫃行情即使暫時沒有收盤價，也保留股票代號與名稱，掃描時再取得歷史行情。
- 同步完成後會顯示「上市幾檔／上櫃幾檔」，可直接確認上櫃是否抓到。
- 快取版本更新為 805。


## V8.0 上櫃與內頁完整修正版

這次直接從使用者目前的完整原始 ZIP 修正，非疊加猜測補丁。

### 真正根因
1. `app.js` 原本放在 `detailOverlay` HTML 前面載入。
2. JavaScript 執行到 `#closeDetail` 時，按鈕尚未建立，因此整份程式中斷。
3. 所以法人分析、主力分析的切換函式根本沒有執行完成。
4. 市場選單原本只在前端篩選結果，掃描請求沒有把 TPEx 傳到後端。

### 本次修正
- 將 app.js 移到整個頁面最底部、detailOverlay 之後。
- 法人／主力頁籤使用直接 onclick，並保留全域切換函式。
- 掃描請求傳送市場 TWSE／TPEx。
- 後端先依市場過濾，再進行 20 檔分頁掃描。
- 切換市場會清除舊結果，避免上市結果殘留。
- JavaScript 快取版本更新為 810。
