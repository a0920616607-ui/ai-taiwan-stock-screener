# AI 台灣個股智慧選股 V6.5｜單股查詢修正版

## 本次修正
- 修正 2334 等正常上市股票顯示「找不到此上市股票代號」。
- 單股分析不再要求股票必須先存在於同步清單。
- 不需要先按「同步股票名單」即可直接分析。
- 歷史行情會依序嘗試：
  - `.TW`：上市
  - `.TWO`：上櫃
- 支援任意 4 碼上市／上櫃股票代號。
- 分析成功後顯示市場別（TWSE／TPEx）。
- 保留日線、週線、月線。
- 保留 AI總分、技術、法人、主力三合一評分。
- 保留加入自選股與分類功能。

## 部署
1. 將 ZIP 解壓後全部檔案上傳到原 GitHub Repository。
2. Commit changes。
3. Render Blueprint → Manual Sync。
4. Approve：`ai-taiwan-stock-screener-v6-5`
