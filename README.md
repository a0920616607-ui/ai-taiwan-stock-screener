# AI 台灣個股智慧選股 V6.1｜自選管理修正版

## 本次修正
- 自選股卡片新增明顯的「×」刪除按鈕。
- 自選股卡片新增「刪除此股票」按鈕。
- 點已亮星號可移動分類，或從全部自選股移除。
- 自選分類頁新增：
  - 新增分類
  - 重新命名
  - 刪除分類
- 刪除分類前會顯示確認視窗。
- 至少保留一個分類，避免資料結構損壞。
- 自選股與分類繼續保存在手機瀏覽器 localStorage。

## 更新部署
1. 將 ZIP 解壓後全部檔案上傳至原 GitHub Repository，覆蓋同名檔案。
2. Commit changes。
3. Render Blueprint → Manual Sync。
4. Approve 新服務：
   `ai-taiwan-stock-screener-v6-1`
5. 等待狀態顯示 Live。

舊 V6 可保留，確認 V6.1 正常後再到 Render 停用或刪除舊服務。
