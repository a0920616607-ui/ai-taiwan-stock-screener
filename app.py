from flask import Flask, jsonify, send_from_directory
from datetime import datetime
import csv, io, re, requests, os

app = Flask(__name__, static_folder='.', static_url_path='')

TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"

def number(value):
    try:
        return float(str(value).replace(",", "").replace("--", "").strip())
    except Exception:
        return None

@app.get("/")
def home():
    return send_from_directory(".", "index.html")

@app.get("/api/health")
def health():
    return jsonify(ok=True, service="AI 台灣個股智慧選股 V5")

@app.get("/api/twse/daily")
def twse_daily():
    try:
        response = requests.get(TWSE_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        data = response.json()
        today = datetime.now().strftime("%Y-%m-%d")
        output = []
        for row in data:
            code = str(row.get("Code") or row.get("證券代號") or "").strip()
            if not re.fullmatch(r"\d{4}", code):
                continue
            close = number(row.get("ClosingPrice") or row.get("收盤價"))
            if close is None:
                continue
            output.append({
                "date": today,
                "code": code,
                "name": str(row.get("Name") or row.get("證券名稱") or "").strip(),
                "open": number(row.get("OpeningPrice") or row.get("開盤價")) or close,
                "high": number(row.get("HighestPrice") or row.get("最高價")) or close,
                "low": number(row.get("LowestPrice") or row.get("最低價")) or close,
                "close": close,
                "volume": number(row.get("TradeVolume") or row.get("成交股數")) or 0,
                "market": "TWSE"
            })
        return jsonify(output)
    except Exception as exc:
        return jsonify(error=str(exc)), 502

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
