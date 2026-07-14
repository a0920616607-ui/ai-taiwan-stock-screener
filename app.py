
from flask import Flask, jsonify, request, send_from_directory
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, os, re, time

app = Flask(__name__, static_folder=".", static_url_path="")

TWSE_DAILY = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TWSE_INST = "https://openapi.twse.com.tw/v1/fund/T86"
TPEX_DAILY = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
UA = {"User-Agent": "Mozilla/5.0 (compatible; TaiwanStockAI/7.2)"}
_UNIVERSE_CACHE = {"time": 0.0, "data": []}
_UNIVERSE_TTL = 900

def num(v):
    try:
        return float(str(v).replace(",", "").replace("--", "").strip())
    except Exception:
        return None

def pick(row, names):
    for name in names:
        if name in row and str(row[name]).strip() != "":
            return row[name]
    return None

def twse_universe():
    r = requests.get(TWSE_DAILY, headers=UA, timeout=30)
    r.raise_for_status()
    rows = r.json()
    out = []
    for x in rows:
        code = str(pick(x, ["Code", "證券代號"]) or "").strip()
        if not re.fullmatch(r"\d{4}", code):
            continue
        close = num(pick(x, ["ClosingPrice", "收盤價"]))
        if close is None:
            continue
        out.append({
            "code": code,
            "name": str(pick(x, ["Name", "證券名稱"]) or code).strip(),
            "close": close,
            "market": "TWSE"
        })
    return out


def tpex_universe():
    """上櫃股票清單。若櫃買 OpenAPI 暫時失敗，回傳空清單，不影響上市資料。"""
    try:
        r = requests.get(TPEX_DAILY, headers=UA, timeout=30)
        r.raise_for_status()
        rows = r.json()
    except Exception:
        return []

    out = []
    for x in rows:
        code = str(pick(x, [
            "SecuritiesCompanyCode", "證券代號", "Code", "股票代號"
        ]) or "").strip()
        if not re.fullmatch(r"\d{4}", code):
            continue

        close = num(pick(x, [
            "Close", "收盤價", "ClosingPrice", "ClosePrice"
        ]))
        if close is None:
            continue

        name = str(pick(x, [
            "CompanyName", "證券名稱", "Name", "股票名稱"
        ]) or code).strip()

        out.append({
            "code": code,
            "name": name,
            "close": close,
            "market": "TPEx"
        })
    return out

def all_universe(force=False):
    now = time.time()
    if not force and _UNIVERSE_CACHE["data"] and now - _UNIVERSE_CACHE["time"] < _UNIVERSE_TTL:
        return _UNIVERSE_CACHE["data"]

    merged = {}
    # 上市失敗時保留既有快取，不讓 API 回傳 HTML 錯誤頁。
    try:
        twse = twse_universe()
    except Exception:
        twse = []
    try:
        tpex = tpex_universe()
    except Exception:
        tpex = []

    for item in twse + tpex:
        merged[item["code"]] = item

    data = sorted(merged.values(), key=lambda x: x["code"])
    if data:
        _UNIVERSE_CACHE["time"] = now
        _UNIVERSE_CACHE["data"] = data
        return data
    if _UNIVERSE_CACHE["data"]:
        return _UNIVERSE_CACHE["data"]
    raise RuntimeError("上市／上櫃股票名單暫時無法取得")

def institutional_map():
    try:
        r = requests.get(TWSE_INST, headers=UA, timeout=30)
        r.raise_for_status()
        rows = r.json()
    except Exception:
        return {}

    out = {}
    for x in rows:
        code = str(pick(x, ["證券代號", "Code"]) or "").strip()
        if not re.fullmatch(r"\d{4}", code):
            continue
        foreign = num(pick(x, [
            "外陸資買賣超股數(不含外資自營商)",
            "外資及陸資買賣超股數",
            "外資買賣超股數"
        ])) or 0
        trust = num(pick(x, ["投信買賣超股數"])) or 0
        dealer = num(pick(x, [
            "自營商買賣超股數",
            "自營商買賣超股數(自行買賣)",
            "自營商買賣超股數(避險)"
        ])) or 0
        total = num(pick(x, ["三大法人買賣超股數"]))
        if total is None:
            total = foreign + trust + dealer
        out[code] = {
            "foreignNet": round(foreign),
            "trustNet": round(trust),
            "dealerNet": round(dealer),
            "institutionalNet": round(total)
        }
    return out


def yahoo_chart(code, period="day"):
    last_error = None

    # .TW = 上市；.TWO = 上櫃
    for suffix in [".TW", ".TWO"]:
        symbol = f"{code}{suffix}"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

        try:
            r = requests.get(
                url,
                params={"interval": "1d", "range": "5y", "events": "history"},
                headers=UA,
                timeout=25
            )
            r.raise_for_status()
            payload = r.json()
            chart = payload.get("chart", {})

            if chart.get("error"):
                last_error = chart["error"].get("description") or "歷史行情來源錯誤"
                continue

            result = (chart.get("result") or [None])[0]
            if not result:
                last_error = "找不到歷史行情"
                continue

            ts = result.get("timestamp") or []
            quote = ((result.get("indicators") or {}).get("quote") or [None])[0]
            meta = result.get("meta") or {}

            if not quote or not ts:
                last_error = "歷史行情欄位不完整"
                continue

            rows = []
            for i, t in enumerate(ts):
                try:
                    c = quote["close"][i]
                    if c is None:
                        continue
                    o = quote["open"][i] if quote["open"][i] is not None else c
                    h = quote["high"][i] if quote["high"][i] is not None else c
                    l = quote["low"][i] if quote["low"][i] is not None else c
                    v = quote["volume"][i] if quote["volume"][i] is not None else 0
                    rows.append({
                        "date": datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d"),
                        "open": float(o),
                        "high": float(h),
                        "low": float(l),
                        "close": float(c),
                        "volume": float(v)
                    })
                except Exception:
                    continue

            if not rows:
                last_error = "沒有可用歷史行情"
                continue

            if period != "day":
                rows = resample(rows, period)

            return rows, {
                "symbol": symbol,
                "exchange": "TWSE" if suffix == ".TW" else "TPEx",
                "name": meta.get("longName") or meta.get("shortName") or code
            }

        except Exception as exc:
            last_error = str(exc)

    raise RuntimeError(last_error or "找不到此股票代號")

def resample(rows, period):
    groups = {}
    for r in rows:
        d = datetime.strptime(r["date"], "%Y-%m-%d")
        if period == "week":
            y, w, _ = d.isocalendar()
            key = f"{y}-W{w:02d}"
        else:
            key = f"{d.year}-{d.month:02d}"
        groups.setdefault(key, []).append(r)

    out = []
    for key in sorted(groups):
        a = sorted(groups[key], key=lambda x: x["date"])
        out.append({
            "date": a[-1]["date"],
            "open": a[0]["open"],
            "high": max(x["high"] for x in a),
            "low": min(x["low"] for x in a),
            "close": a[-1]["close"],
            "volume": sum(x["volume"] for x in a)
        })
    return out

def ema(a, n):
    if not a:
        return []
    k = 2 / (n + 1)
    p = a[0]
    out = []
    for i, v in enumerate(a):
        p = v if i == 0 else v * k + p * (1 - k)
        out.append(p)
    return out

def rsi(a, n=14):
    out = [None] * len(a)
    gain = loss = 0.0
    for i in range(1, len(a)):
        ch = a[i] - a[i - 1]
        if i <= n:
            gain += max(ch, 0)
            loss += max(-ch, 0)
        if i == n:
            gain /= n
            loss /= n
            out[i] = 100 if loss == 0 else 100 - 100 / (1 + gain / loss)
        elif i > n:
            gain = (gain * (n - 1) + max(ch, 0)) / n
            loss = (loss * (n - 1) + max(-ch, 0)) / n
            out[i] = 100 if loss == 0 else 100 - 100 / (1 + gain / loss)
    return out

def kd(rows, n=9):
    K = [None] * len(rows)
    D = [None] * len(rows)
    k = d = 50.0
    for i in range(n - 1, len(rows)):
        w = rows[i - n + 1:i + 1]
        hh = max(x["high"] for x in w)
        ll = min(x["low"] for x in w)
        rsv = 50 if hh == ll else (rows[i]["close"] - ll) / (hh - ll) * 100
        k = (2 * k + rsv) / 3
        d = (2 * d + k) / 3
        K[i], D[i] = k, d
    return K, D

def sma(a, n):
    return None if len(a) < n else sum(a[-n:]) / n


def analyze(code, name, period, inst):
    rows, source_meta = yahoo_chart(code, period)
    if len(rows) < 30:
        raise RuntimeError(f"{period} 資料不足：{len(rows)} 筆")

    c = [x["close"] for x in rows]
    v = [x["volume"] for x in rows]
    R = rsi(c)
    K, D = kd(rows)
    e12, e26 = ema(c, 12), ema(c, 26)
    dif = [x - y for x, y in zip(e12, e26)]
    sig = ema(dif, 9)
    hist = [(x - y) * 2 for x, y in zip(dif, sig)]

    i, p = len(rows) - 1, len(rows) - 2
    ma5, ma10, ma20 = sma(c, 5), sma(c, 10), sma(c, 20)
    vol6 = sma(v, 6) or 1
    vr = v[i] / vol6 if vol6 else 0
    price_change = ((c[i] / c[p]) - 1) * 100 if c[p] else 0

    kcross = (
        K[i] is not None and D[i] is not None and
        K[p] is not None and D[p] is not None and
        K[i] > D[i] and K[p] <= D[p]
    )

    # 1) 技術分析分數 0~100
    technical_score = 0
    technical_reasons = []

    if kcross:
        technical_score += 20
        technical_reasons.append("KD 黃金交叉 +20")
    if D[i] is not None and D[i] <= 35:
        technical_score += 10
        technical_reasons.append("KD 低檔 +10")
    if R[i] is not None and R[p] is not None and R[i] > R[p]:
        technical_score += 10
        technical_reasons.append("RSI 向上 +10")
    if R[i] is not None and R[i] >= 50:
        technical_score += 10
        technical_reasons.append("RSI 站上 50 +10")
    elif R[i] is not None and R[i] >= 45:
        technical_score += 6
        technical_reasons.append("RSI 站上 45 +6")
    if hist[i] > 0:
        technical_score += 18
        technical_reasons.append("MACD 柱翻正 +18")
    elif hist[i] > hist[p]:
        technical_score += 10
        technical_reasons.append("MACD 改善 +10")
    if ma5 and c[i] > ma5:
        technical_score += 10
        technical_reasons.append("站上短期均線 +10")
    if ma10 and c[i] > ma10:
        technical_score += 7
        technical_reasons.append("站上中期均線 +7")
    if ma20 and c[i] > ma20:
        technical_score += 7
        technical_reasons.append("站上長期均線 +7")
    if vr >= 1.5:
        technical_score += 8
        technical_reasons.append("量能明顯放大 +8")
    elif vr >= 1.05:
        technical_score += 5
        technical_reasons.append("量能溫和放大 +5")

    technical_score = max(0, min(100, round(technical_score)))

    # 2) 法人分數 0~100
    inst_data = inst.get(code, {
        "foreignNet": 0, "trustNet": 0, "dealerNet": 0, "institutionalNet": 0
    })
    foreign_net = inst_data["foreignNet"]
    trust_net = inst_data["trustNet"]
    dealer_net = inst_data["dealerNet"]
    institutional_net = inst_data["institutionalNet"]

    institutional_score = 50
    institutional_reasons = []

    if institutional_net > 0:
        institutional_score += 18
        institutional_reasons.append("三大法人合計買超 +18")
    elif institutional_net < 0:
        institutional_score -= 18
        institutional_reasons.append("三大法人合計賣超 -18")

    if foreign_net > 0:
        institutional_score += 12
        institutional_reasons.append("外資買超 +12")
    elif foreign_net < 0:
        institutional_score -= 10
        institutional_reasons.append("外資賣超 -10")

    if trust_net > 0:
        institutional_score += 12
        institutional_reasons.append("投信買超 +12")
    elif trust_net < 0:
        institutional_score -= 8
        institutional_reasons.append("投信賣超 -8")

    if dealer_net > 0:
        institutional_score += 8
        institutional_reasons.append("自營商買超 +8")
    elif dealer_net < 0:
        institutional_score -= 6
        institutional_reasons.append("自營商賣超 -6")

    institutional_score = max(0, min(100, round(institutional_score)))

    # 3) 主力代理分數 0~100
    # 無官方統一「主力」欄位，使用法人方向、量比、漲跌與 MACD 建立代理模型。
    main_force_score = 50
    main_force_reasons = []

    if institutional_net > 0:
        main_force_score += 20
        main_force_reasons.append("法人方向偏多 +20")
    elif institutional_net < 0:
        main_force_score -= 20
        main_force_reasons.append("法人方向偏空 -20")

    if vr >= 1.5:
        main_force_score += 15
        main_force_reasons.append("量比 ≥ 1.5 +15")
    elif vr >= 1.05:
        main_force_score += 8
        main_force_reasons.append("量比放大 +8")

    if price_change > 1:
        main_force_score += 10
        main_force_reasons.append("價格動能偏多 +10")
    elif price_change < -1:
        main_force_score -= 10
        main_force_reasons.append("價格動能偏空 -10")

    if hist[i] > 0:
        main_force_score += 5
        main_force_reasons.append("MACD 動能正向 +5")
    elif hist[i] < hist[p]:
        main_force_score -= 5
        main_force_reasons.append("MACD 動能轉弱 -5")

    main_force_score = max(0, min(100, round(main_force_score)))

    main_force_status = (
        "主力偏多" if main_force_score >= 70
        else "主力偏空" if main_force_score <= 35
        else "主力中性"
    )

    # 三合一 AI 總分：技術 50% + 法人 30% + 主力 20%
    ai_score = round(
        technical_score * 0.50 +
        institutional_score * 0.30 +
        main_force_score * 0.20
    )
    ai_score = max(0, min(100, ai_score))

    status = (
        "強勢候選" if ai_score >= 90
        else "積極觀察" if ai_score >= 80
        else "轉強觀察" if ai_score >= 70
        else "等待確認" if ai_score >= 60
        else "暫不列入"
    )

    return {
        "code": code,
        "name": source_meta.get("name") if not name or name == code else name,
        "market": source_meta.get("exchange"),
        "symbol": source_meta.get("symbol"),
        "period": period,
        "date": rows[-1]["date"],
        "close": round(c[i], 2),
        "score": ai_score,
        "aiScore": ai_score,
        "technicalScore": technical_score,
        "institutionalScore": institutional_score,
        "mainForceScore": main_force_score,
        "K": round(K[i], 1) if K[i] is not None else None,
        "D": round(D[i], 1) if D[i] is not None else None,
        "RSI": round(R[i], 1) if R[i] is not None else None,
        "MACD": round(hist[i], 2),
        "volumeRatio": round(vr, 2),
        "status": status,
        "entry": "回測短期均線量縮止跌後分批" if ma5 and c[i] >= ma5 else "先等重新站回短期均線",
        "technicalReasons": technical_reasons,
        "institutionalReasons": institutional_reasons,
        "mainForceReasons": main_force_reasons,
        **inst_data,
        "mainForceStatus": main_force_status
    }

@app.get("/")
def home():
    return send_from_directory(".", "index.html")

@app.get("/api/health")
def health():
    return jsonify(ok=True, version="V7.2", time=datetime.now().isoformat())

@app.get("/api/universe")
def universe():
    try:
        return jsonify(all_universe(force=request.args.get("force") == "1"))
    except Exception as e:
        return jsonify(error=str(e)), 502

@app.post("/api/scan")
def scan():
    body = request.get_json(silent=True) or {}
    period = body.get("period", "day")
    offset = max(0, int(body.get("offset", 0)))
    limit = min(20, max(1, int(body.get("limit", 12))))
    market = str(body.get("market", "all"))

    try:
        uni = all_universe()
        if market in {"TWSE", "TPEx"}:
            uni = [x for x in uni if x.get("market") == market]
        inst = institutional_map()
        batch = uni[offset:offset + limit]
        results, errors = [], []

        with ThreadPoolExecutor(max_workers=3) as ex:
            futs = {ex.submit(analyze, x["code"], x["name"], period, inst): x for x in batch}
            for f in as_completed(futs):
                stock_info = futs[f]
                try:
                    results.append(f.result())
                except Exception as exc:
                    errors.append({
                        "code": stock_info["code"],
                        "name": stock_info["name"],
                        "error": str(exc)
                    })

        results.sort(key=lambda x: x["score"], reverse=True)
        return jsonify({
            "ok": True,
            "period": period,
            "market": market,
            "offset": offset,
            "limit": limit,
            "total": len(uni),
            "processed": len(batch),
            "successCount": len(results),
            "errorCount": len(errors),
            "nextOffset": offset + len(batch),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "results": results,
            "errors": errors[:10]
        })
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 502

@app.get("/api/stock/<code>")
def stock_detail(code):
    code = str(code).strip()
    period = request.args.get("period", "day")

    if period not in {"day", "week", "month"}:
        period = "day"

    if not re.fullmatch(r"\d{4}", code):
        return jsonify(ok=False, error="股票代號需為 4 碼"), 400

    try:
        stock_name = code
        try:
            uni = all_universe()
            stock_info = next((x for x in uni if x["code"] == code), None)
            if stock_info:
                stock_name = stock_info["name"]
        except Exception:
            pass

        inst = institutional_map()
        result = analyze(code, stock_name, period, inst)
        return jsonify(ok=True, result=result)

    except Exception as e:
        return jsonify(ok=False, error=f"找不到可分析資料：{e}"), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
