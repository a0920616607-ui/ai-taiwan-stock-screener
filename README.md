# AI 台灣個股智慧選股 V7.2｜修正版

本版修正：
1. 上櫃掃描改為指定市場分批掃描，股票名單加入快取，降低 Render timeout。
2. 前端遇到 Render HTML 錯誤頁時顯示可理解訊息，不再出現 Unexpected token `<`。
3. X 關閉加入 inline onclick、click 與 touch 多重保護。
4. 掃描結果改成參考圖的六欄排列：代號名稱、收盤、燈號、AI、法人主力、量能。
5. 上市／上櫃切換會重新從第 1 頁掃描。
6. 固定 Render 服務名稱 `ai-taiwan-stock-screener-v7`，直接覆蓋原服務，不新增服務。

部署：覆蓋 GitHub 檔案並 Commit，Render 會自動部署；或 Manual Deploy → Deploy latest commit。
