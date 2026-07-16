# AI 台灣個股智慧選股 V8.3.1｜中文輸入與 JSON 修正版

## 修正
- 單股分析與自選股輸入框改為文字搜尋鍵盤，可正常使用中文輸入法。
- 移除 `inputmode="numeric"` 與 4 碼限制。
- 支援中文輸入法組字期間，不會提前觸發搜尋。
- 單股分析改用安全 JSON 解析，不再出現：
  `Failed to execute 'json' on 'Response': Unexpected end of JSON input`
- API 空白回應會顯示中文錯誤訊息。
- API 例外統一回傳 JSON。
