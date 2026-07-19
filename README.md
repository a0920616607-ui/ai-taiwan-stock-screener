# AI 台灣個股智慧選股 V10.5

真正修正：
- 首頁、標題、manifest 與 health API 全部更新為 V10.5。
- 上市＋上櫃由伺服器分別取得兩個市場，每頁固定平衡組合，不再沿用單一市場批次。
- TWSE 三大法人 API 同時支援 root fields/data 與 tables[0].fields/data 格式。
- 法人快取改用 V10.5 新檔，避免舊版「待更新」污染。
- 本機股票名單快取改為 v105 key。
