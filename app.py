
from flask import Flask, jsonify, request, send_from_directory
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, os, re, json, math

app = Flask(__name__, static_folder=".", static_url_path="")

@app.after_request
def add_no_cache_headers(response):
    # 避免 Render 部署新版後，手機仍載入舊版 app.js / API 結果。
    if request.path.endswith((".js", ".css", ".html")) or request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


TWSE_DAILY = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TWSE_INST = "https://www.twse.com.tw/rwd/zh/fund/T86"
TPEX_DAILY = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
TPEX_DAILY_FALLBACKS = [
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
    "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes",
    "https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php",
]
TPEX_INST = "https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading"
UA = {"User-Agent": "Mozilla/5.0 (compatible; TaiwanStockAI/10.8)"}
INST_CACHE_FILE = os.path.join(os.path.dirname(__file__), "institutional_last_good_v108.json")

import time

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

def _calc_change_pct(close, change):
    try:
        close = float(close)
        change = float(change)
        previous = close - change
        if previous == 0:
            return 0.0
        return round(change / previous * 100, 2)
    except Exception:
        return 0.0

def classify_sector(name):
    """類股快速分類。官方資料若沒有產業欄位時，依名稱關鍵字分類。"""
    n = str(name or "")
    rules = [
        ("ETF／指數", ("元大", "富邦", "國泰", "群益", "中信", "復華", "統一台灣", "野村", "兆豐", "永豐", "新光標普")),
        ("水泥工業", ("水泥", "亞泥", "台泥", "嘉泥", "環泥")),
        ("食品工業", ("食品", "味全", "味王", "卜蜂", "大成", "統一", "佳格", "聯華食")),
        ("塑膠工業", ("塑膠", "台塑", "南亞", "台聚", "亞聚", "華夏", "聯成")),
        ("紡織纖維", ("紡織", "纖維", "儒鴻", "聚陽", "遠東新", "力麗", "宏遠")),
        ("電機機械", ("電機", "機械", "工具機", "亞德客", "上銀", "東元", "大同")),
        ("電器電纜", ("電纜", "電器", "華新", "大亞", "億泰", "宏泰")),
        ("化學工業", ("化學", "化工", "長興", "永光", "三晃", "和益")),
        ("生技醫療", ("生技", "醫療", "藥", "製藥", "保瑞", "藥華藥", "美時")),
        ("玻璃陶瓷", ("玻璃", "陶瓷", "冠軍", "中釉")),
        ("造紙工業", ("紙", "正隆", "永豐餘", "榮成")),
        ("鋼鐵工業", ("鋼", "鐵", "中鋼", "東和鋼鐵", "大成鋼", "豐興")),
        ("橡膠工業", ("橡膠", "輪胎", "正新", "建大", "南港")),
        ("汽車工業", ("汽車", "車電", "裕隆", "和泰車", "中華車", "三陽工業")),
        ("半導體業", ("積電", "聯電", "半導體", "世界", "力積電", "聯發科", "瑞昱", "矽力", "旺宏", "華邦電")),
        ("電腦週邊", ("電腦", "資訊", "華碩", "宏碁", "廣達", "仁寶", "緯創", "英業達", "技嘉", "微星")),
        ("光電業", ("光電", "面板", "友達", "群創", "元太", "晶電", "富采")),
        ("通信網路", ("通信", "網路", "中華電", "台灣大", "遠傳", "智邦", "啟碁")),
        ("電子組件", ("電子", "連接器", "被動元件", "國巨", "華新科", "台達電", "鴻海", "臻鼎", "欣興")),
        ("航運業", ("航運", "航空", "長榮", "陽明", "萬海", "華航", "長榮航")),
        ("金融保險", ("金控", "銀行", "金融", "保險", "證券", "票券")),
        ("建材營造", ("建設", "營造", "工", "興富發", "華固", "遠雄", "冠德")),
        ("觀光餐旅", ("飯店", "餐旅", "餐飲", "王品", "瓦城", "晶華")),
        ("貿易百貨", ("百貨", "超商", "全家", "統一超", "遠百", "特力")),
    ]
    for sector, keywords in rules:
        if any(k in n for k in keywords):
            return sector
    return "其他"



# V8.4.3：外部股票名單來源失敗時，沿用最近一次成功資料。
_UNIVERSE_CACHE = {
    "TWSE": {"rows": [], "updated_at": 0},
    "TPEx": {"rows": [], "updated_at": 0},
}
_UNIVERSE_CACHE_SECONDS = 300

def _cache_get(market):
    item = _UNIVERSE_CACHE.get(market) or {}
    rows = item.get("rows") or []
    updated_at = float(item.get("updated_at") or 0)
    if rows and (time.time() - updated_at) <= _UNIVERSE_CACHE_SECONDS:
        return rows
    return []

def _cache_last(market):
    return (_UNIVERSE_CACHE.get(market) or {}).get("rows") or []

def _cache_set(market, rows):
    if rows:
        _UNIVERSE_CACHE[market] = {"rows": rows, "updated_at": time.time()}
        _save_disk_universe(market, rows)
    return rows

_UNIVERSE_DISK_CACHE = "/tmp/taiwan_stock_universe_cache.json"

def _load_disk_universe():
    try:
        with open(_UNIVERSE_DISK_CACHE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _save_disk_universe(market, rows):
    if not rows:
        return
    try:
        data = _load_disk_universe()
        data[market] = {
            "rows": rows,
            "updated_at": time.time(),
        }
        with open(_UNIVERSE_DISK_CACHE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass

def _disk_last(market):
    try:
        return ((_load_disk_universe().get(market) or {}).get("rows") or [])
    except Exception:
        return []




def twse_universe():
    cached = _cache_get("TWSE")
    if cached:
        return cached
    try:
        r = requests.get(TWSE_DAILY, headers=UA, timeout=24)
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
            name = str(pick(x, ["Name", "證券名稱"]) or code).strip()
            change = num(pick(x, ["Change", "漲跌價差", "ChangeAmount"])) or 0
            out.append({
                "code": code,
                "name": name,
                "close": close,
                "change": change,
                "changePct": _calc_change_pct(close, change),
                "industry": str(pick(x, ["Industry", "產業別", "IndustryName"]) or classify_sector(name)),
                "market": "TWSE"
            })
        if out:
            return _cache_set("TWSE", out)
    except Exception:
        pass
    return _cache_last("TWSE")


def _extract_tpex_rows(payload):
    """Normalize TPEx OpenAPI and legacy JSON structures into a row list."""
    if isinstance(payload, list):
        return payload

    if not isinstance(payload, dict):
        return []

    for key in ("data", "aaData", "rows", "result"):
        rows = payload.get(key)
        if isinstance(rows, list):
            return rows

    tables = payload.get("tables")
    if isinstance(tables, list):
        for table in tables:
            if not isinstance(table, dict):
                continue
            fields = table.get("fields") or table.get("columns") or []
            rows = table.get("data") or table.get("rows") or []
            if rows and isinstance(rows[0], list) and fields:
                names = [
                    f.get("title") if isinstance(f, dict) else str(f)
                    for f in fields
                ]
                return [dict(zip(names, row)) for row in rows]
            if isinstance(rows, list):
                return rows
    return []

def _parse_tpex_row(x):
    if isinstance(x, list):
        # Legacy daily quote order usually starts with code, name, close.
        if len(x) < 3:
            return None
        code = str(x[0]).strip()
        name = str(x[1]).strip()
        close = num(x[2])
        change = num(x[3]) if len(x) > 3 else 0
    elif isinstance(x, dict):
        code = str(pick(x, [
            "SecuritiesCompanyCode", "SecuritiesCode", "證券代號", "Code",
            "股票代號", "代號", "StockCode", "SecurityCode"
        ]) or "").strip()

        name = str(pick(x, [
            "CompanyName", "SecuritiesCompanyName", "證券名稱", "Name",
            "股票名稱", "名稱", "StockName", "SecurityName"
        ]) or code).strip()

        close = num(pick(x, [
            "Close", "收盤價", "ClosingPrice", "ClosePrice",
            "ClosePriceToday", "最後成交價", "LatestPrice", "TradePrice"
        ]))
        change = num(pick(x, [
            "Change", "漲跌", "漲跌價差", "ChangeAmount",
            "ChangeValue", "PriceChange", "ChangePrice", "UpDown"
        ])) or 0
    else:
        return None

    if not re.fullmatch(r"\d{4}", code):
        return None
    if close is None:
        # 名單仍可保留；掃描時會由 Yahoo chart 取得價格。
        close = 0

    name = name or code
    return {
        "code": code,
        "name": name,
        "close": close,
        "change": change or 0,
        "changePct": _calc_change_pct(close, change or 0),
        "industry": classify_sector(name),
        "market": "TPEx"
    }

def tpex_universe():
    """上櫃股票清單：多來源、重試、記憶體／磁碟快取。"""
    cached = _cache_get("TPEx")
    if cached:
        return cached

    today = _today_taipei()
    roc_date = _to_roc_date(today)

    attempts = [
        (TPEX_DAILY, None),
        ("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", {
            "l": "zh-tw",
            "d": roc_date,
            "s": "0,asc,0",
        }),
        ("https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes", {
            "date": today.strftime("%Y/%m/%d"),
            "id": "",
            "response": "json",
        }),
        ("https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php", {
            "d": roc_date,
            "l": "zh-tw",
            "se": "EW",
        }),
    ]

    partial = []
    for url, params in attempts:
        for retry in range(3):
            try:
                r = requests.get(
                    url,
                    params=params,
                    headers={
                        **UA,
                        "Accept": "application/json,text/plain,*/*",
                        "Referer": "https://www.tpex.org.tw/",
                    },
                    timeout=28,
                )
                r.raise_for_status()
                payload = r.json()
                rows = _extract_tpex_rows(payload)

                out = []
                seen = set()
                for row in rows:
                    item = _parse_tpex_row(row)
                    if not item:
                        continue
                    code = str(item.get("code", ""))
                    if code in seen:
                        continue
                    seen.add(code)
                    out.append(item)

                if len(out) > len(partial):
                    partial = out

                # 上櫃完整名單通常超過 700 檔；取得 500 檔以上即可視為可用。
                if len(out) >= 500:
                    return _cache_set("TPEx", out)

                if out:
                    break
            except Exception:
                if retry < 2:
                    time.sleep(1.2 * (retry + 1))
                continue

    # 來源暫時失敗時，優先沿用最近一次成功資料。
    previous = _cache_last("TPEx") or _disk_last("TPEx")
    if previous:
        return previous

    if partial:
        return _cache_set("TPEx", partial)

    return []

def all_universe():
    twse = twse_universe() or _cache_last("TWSE")
    tpex = tpex_universe() or _cache_last("TPEx") or _disk_last("TPEx")

    # 各市場先依股票代號排序，再交錯排列。
    # 避免「上市＋上櫃」模式分頁時，第一頁只出現上櫃股票。
    twse_rows = sorted(
        {str(item.get("code", "")): item for item in list(twse)}.values(),
        key=lambda x: x.get("code", "")
    )
    tpex_rows = sorted(
        {str(item.get("code", "")): item for item in list(tpex)}.values(),
        key=lambda x: x.get("code", "")
    )

    mixed = []
    for i in range(max(len(twse_rows), len(tpex_rows))):
        if i < len(twse_rows):
            mixed.append(twse_rows[i])
        if i < len(tpex_rows):
            mixed.append(tpex_rows[i])
    return mixed


_INST_CACHE = {"key": None, "data": {}, "meta": {}}

def _load_last_good_institutional():
    try:
        with open(INST_CACHE_FILE, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        data = payload.get("data") if isinstance(payload, dict) else {}
        meta = payload.get("meta") if isinstance(payload, dict) else {}
        return (data if isinstance(data, dict) else {}), (meta if isinstance(meta, dict) else {})
    except Exception:
        return {}, {}

def _save_last_good_institutional(data, meta):
    if not data:
        return
    try:
        with open(INST_CACHE_FILE, "w", encoding="utf-8") as fh:
            json.dump({"savedAt": _today_taipei().isoformat(), "data": data, "meta": meta}, fh, ensure_ascii=False)
    except Exception:
        pass

def _clean_key(value):
    return re.sub(r"[\s（）()／/、，,_\-]", "", str(value or "")).lower()

def _find_value(row, include_terms, exclude_terms=()):
    """Find a value by normalized key fragments; useful across changing official field names."""
    for key, value in row.items():
        nk = _clean_key(key)
        if all(_clean_key(term) in nk for term in include_terms) and not any(
            _clean_key(term) in nk for term in exclude_terms
        ):
            return value
    return None

def _find_value_any(row, aliases, exclude_terms=()):
    """Match any complete alias against normalized official column names."""
    normalized = [tuple(_clean_key(t) for t in alias) for alias in aliases]
    for key, value in row.items():
        nk = _clean_key(key)
        if any(all(term in nk for term in alias) for alias in normalized) and not any(
            _clean_key(term) in nk for term in exclude_terms
        ):
            if str(value).strip() != "":
                return value
    return None

def _component_from_aliases(row, net_aliases, buy_aliases=(), sell_aliases=(), exclude_terms=()):
    direct = _find_value_any(row, net_aliases, exclude_terms)
    if direct is not None:
        return direct
    buy = _find_value_any(row, buy_aliases, exclude_terms) if buy_aliases else None
    sell = _find_value_any(row, sell_aliases, exclude_terms) if sell_aliases else None
    b, s = num(buy), num(sell)
    return b - s if b is not None and s is not None else None

def _today_taipei():
    return datetime.utcnow() + timedelta(hours=8)

def _to_roc_date(date_obj):
    return f"{date_obj.year - 1911:03d}{date_obj.month:02d}{date_obj.day:02d}"

def _component_from_row(row, net_terms, buy_terms, sell_terms, exclude_terms=()):
    """Read a net value directly; otherwise derive it from official buy minus sell columns."""
    direct = _find_value(row, net_terms, exclude_terms)
    if direct is not None:
        return direct
    buy = _find_value(row, buy_terms, exclude_terms)
    sell = _find_value(row, sell_terms, exclude_terms)
    buy_num, sell_num = num(buy), num(sell)
    if buy_num is not None and sell_num is not None:
        return buy_num - sell_num
    return None


def _upgrade_cached_inst_record(record):
    """Make V10/V10.1 cache records readable by V10.3 without hiding real values."""
    if not isinstance(record, dict):
        return record
    upgraded = dict(record)
    for field, flag in (
        ("foreignNet", "foreignAvailable"),
        ("trustNet", "trustAvailable"),
        ("dealerNet", "dealerAvailable"),
    ):
        if flag not in upgraded:
            value = num(upgraded.get(field))
            # Legacy versions wrote zero for missing components. A zero is accepted only
            # when the record is internally consistent; otherwise it remains unavailable.
            upgraded[flag] = value is not None
    total = num(upgraded.get("institutionalNet"))
    components = [num(upgraded.get(k)) for k in ("foreignNet", "trustNet", "dealerNet")]
    if total is not None and all(v is not None for v in components):
        if abs(total - sum(components)) > 1:
            # Common legacy-cache pattern: only total was real while components were fake 0.
            if all(v == 0 for v in components):
                upgraded["foreignAvailable"] = False
                upgraded["trustAvailable"] = False
                upgraded["dealerAvailable"] = False
            upgraded["institutionalConsistent"] = False
        else:
            upgraded["institutionalConsistent"] = True
    upgraded["institutionalAvailable"] = total is not None or any(
        upgraded.get(k) for k in ("foreignAvailable", "trustAvailable", "dealerAvailable")
    )
    return upgraded


def _normalize_inst_record(code, foreign, trust, dealer, total, market, data_date, source):
    """Normalize one institutional record without turning missing fields into fake zeroes.

    Official feeds occasionally omit or rename the foreign-investor column while still
    providing the total, investment-trust, and dealer totals. In that case foreign net
    is reconstructed as total - trust - dealer and clearly marked as calculated.
    """
    foreign_num = num(foreign)
    trust_num = num(trust)
    dealer_num = num(dealer)
    total_num = num(total)

    calculated_fields = []

    # A missing component must remain missing unless it can be derived exactly.
    if foreign_num is None and total_num is not None and trust_num is not None and dealer_num is not None:
        foreign_num = total_num - trust_num - dealer_num
        calculated_fields.append("foreignNet")

    # The official total can safely be reconstructed only when all three components exist.
    if total_num is None and foreign_num is not None and trust_num is not None and dealer_num is not None:
        total_num = foreign_num + trust_num + dealer_num
        calculated_fields.append("institutionalNet")

    available = total_num is not None or any(v is not None for v in (foreign_num, trust_num, dealer_num))
    all_components_available = all(v is not None for v in (foreign_num, trust_num, dealer_num))
    consistent = None
    if total_num is not None and all_components_available:
        consistent = abs(total_num - (foreign_num + trust_num + dealer_num)) <= 1

    source_label = source
    if calculated_fields:
        source_label = f"{source}／系統補算"

    return {
        "foreignNet": round(foreign_num) if foreign_num is not None else None,
        "trustNet": round(trust_num) if trust_num is not None else None,
        "dealerNet": round(dealer_num) if dealer_num is not None else None,
        "institutionalNet": round(total_num) if total_num is not None else None,
        "foreignAvailable": foreign_num is not None,
        "trustAvailable": trust_num is not None,
        "dealerAvailable": dealer_num is not None,
        "institutionalAvailable": available,
        "institutionalComplete": total_num is not None and all_components_available,
        "institutionalConsistent": consistent,
        "institutionalCalculatedFields": calculated_fields,
        "institutionalDataStatus": "補算資料" if calculated_fields else ("官方資料" if available else "待更新"),
        "institutionalDate": data_date or "",
        "institutionalSource": source_label,
        "institutionalMarket": market,
    }

def _fetch_twse_institutional():
    """Official TWSE T86. Walk backward to the latest trading day and cache whole-market data."""
    now = _today_taipei()
    for days_back in range(0, 12):
        day = now - timedelta(days=days_back)
        date_str = day.strftime("%Y%m%d")
        try:
            r = requests.get(
                TWSE_INST,
                params={
                    "response": "json",
                    "date": date_str,
                    "selectType": "ALLBUT0999",
                },
                headers=UA,
                timeout=30,
            )
            r.raise_for_status()
            payload = r.json()
            # TWSE rwd API may return several tables. Select the detailed stock table,
            # not the first non-empty summary table.
            table = {}
            if isinstance(payload, dict):
                tables = payload.get("tables") or []
                if isinstance(tables, list):
                    candidates = [t for t in tables if isinstance(t, dict) and t.get("data")]
                    def table_score(t):
                        joined = "|".join(str(x.get("title") if isinstance(x, dict) else x) for x in (t.get("fields") or []))
                        return sum(token in joined for token in ("證券代號", "外陸資", "投信", "自營商", "三大法人"))
                    table = max(candidates, key=table_score, default={})
            root_fields = payload.get("fields") if isinstance(payload, dict) else None
            root_data = payload.get("data") if isinstance(payload, dict) else None
            # Use root only when it is also a detailed stock table.
            root_joined = "|".join(str(x.get("title") if isinstance(x, dict) else x) for x in (root_fields or []))
            if root_data and "證券代號" in root_joined:
                fields, data = root_fields or [], root_data or []
            else:
                fields, data = table.get("fields") or [], table.get("data") or []
            fields = [f.get("title") if isinstance(f, dict) else str(f) for f in fields]
            stat = str((payload.get("stat") if isinstance(payload, dict) else "") or table.get("stat") or "")
            if not data or ("很抱歉" in stat):
                continue

            rows = [dict(zip(fields, values)) for values in data]
            out = {}
            for row in rows:
                code = str(_find_value(row, ["證券代號"]) or "").strip()
                if not re.fullmatch(r"\d{4}", code):
                    continue

                foreign = _component_from_aliases(
                    row,
                    [("外陸資", "買賣超"), ("外資及陸資", "買賣超"), ("外資", "買賣超")],
                    [("外陸資", "買進"), ("外資及陸資", "買進"), ("外資", "買進")],
                    [("外陸資", "賣出"), ("外資及陸資", "賣出"), ("外資", "賣出")],
                    ["外資自營商"],
                )
                trust = _component_from_aliases(
                    row, [("投信", "買賣超")], [("投信", "買進")], [("投信", "賣出")]
                )
                dealer_self = _component_from_aliases(
                    row,
                    [("自營商", "自行買賣", "買賣超")],
                    [("自營商", "自行買賣", "買進")],
                    [("自營商", "自行買賣", "賣出")],
                )
                dealer_hedge = _component_from_aliases(
                    row,
                    [("自營商", "避險", "買賣超")],
                    [("自營商", "避險", "買進")],
                    [("自營商", "避險", "賣出")],
                )
                dealer_direct = _find_value_any(row, [("自營商", "買賣超")], ["自行買賣", "避險"])
                dealer = ((num(dealer_self) or 0) + (num(dealer_hedge) or 0)) \
                    if dealer_self is not None or dealer_hedge is not None else dealer_direct
                total = _find_value_any(row, [("三大法人", "買賣超"), ("三大法人合計", "買賣超")])
                out[code] = _normalize_inst_record(
                    code, foreign, trust, dealer, total,
                    "TWSE", date_str, "TWSE T86"
                )
            if out:
                return out, {"twseDate": date_str, "twseCount": len(out)}
        except Exception:
            continue
    return {}, {"twseDate": "", "twseCount": 0}

def _fetch_tpex_institutional():
    """Official TPEx OpenAPI daily institutional trading detail."""
    try:
        r = requests.get(TPEX_INST, headers=UA, timeout=30)
        r.raise_for_status()
        rows = r.json()
    except Exception:
        return {}, {"tpexDate": "", "tpexCount": 0}

    out = {}
    latest_date = ""
    for row in rows if isinstance(rows, list) else []:
        code = str(
            pick(row, [
                "SecuritiesCompanyCode", "證券代號", "Code", "股票代號"
            ])
            or _find_value(row, ["證券", "代號"])
            or ""
        ).strip()
        if not re.fullmatch(r"\d{4}", code):
            continue

        foreign = (
            pick(row, [
                "ForeignInvestorsNetBuySell",
                "ForeignInvestorsNetBuySellVolume",
                "外資及陸資買賣超股數",
                "外資及陸資買賣超",
                "外資買賣超股數",
            ])
            or _find_value(row, ["外資", "買賣超"])
            or _find_value(row, ["外陸資", "買賣超"])
        )
        trust = (
            pick(row, [
                "InvestmentTrustNetBuySell",
                "InvestmentTrustNetBuySellVolume",
                "投信買賣超股數",
                "投信買賣超",
            ])
            or _find_value(row, ["投信", "買賣超"])
        )

        dealer_self = (
            pick(row, [
                "DealerSelfNetBuySell",
                "DealerSelfNetBuySellVolume",
                "自營商自行買賣買賣超股數",
            ])
            or _find_value(row, ["自營商", "自行買賣", "買賣超"])
        )
        dealer_hedge = (
            pick(row, [
                "DealerHedgeNetBuySell",
                "DealerHedgeNetBuySellVolume",
                "自營商避險買賣超股數",
            ])
            or _find_value(row, ["自營商", "避險", "買賣超"])
        )
        dealer_total = (
            pick(row, [
                "DealerNetBuySell",
                "DealerNetBuySellVolume",
                "自營商買賣超股數",
                "自營商買賣超",
            ])
            or _find_value(row, ["自營商", "買賣超"], ["自行買賣", "避險"])
        )
        dealer = (
            (num(dealer_self) or 0) + (num(dealer_hedge) or 0)
            if dealer_self is not None or dealer_hedge is not None
            else dealer_total
        )

        total = (
            pick(row, [
                "ThreeInstitutionalInvestorsNetBuySell",
                "ThreeInstitutionalInvestorsNetBuySellVolume",
                "三大法人買賣超股數",
                "三大法人買賣超",
            ])
            or _find_value(row, ["三大法人", "買賣超"])
        )
        data_date = str(
            pick(row, ["Date", "資料日期", "日期", "TradeDate"])
            or _find_value(row, ["日期"])
            or ""
        ).strip()
        latest_date = data_date or latest_date

        out[code] = _normalize_inst_record(
            code, foreign, trust, dealer, total,
            "TPEx", data_date, "TPEx OpenAPI"
        )

    return out, {"tpexDate": latest_date, "tpexCount": len(out)}

def institutional_map(force=False):
    """Return TWSE + TPEx data, falling back independently by market."""
    now = _today_taipei()
    cache_key = now.strftime("%Y%m%d-%H")
    if not force and _INST_CACHE["key"] == cache_key and _INST_CACHE["data"]:
        return _INST_CACHE["data"]

    saved_data, saved_meta = _load_last_good_institutional()
    saved_data = {code: _upgrade_cached_inst_record(rec) for code, rec in saved_data.items()}

    twse, twse_meta = _fetch_twse_institutional()
    tpex, tpex_meta = _fetch_tpex_institutional()

    fallback_markets = []
    if not twse:
        twse = {c: r for c, r in saved_data.items() if r.get("institutionalMarket") == "TWSE"}
        if twse:
            fallback_markets.append("上市")
            twse_meta = {
                "twseDate": saved_meta.get("twseDate", ""),
                "twseCount": len(twse),
            }
    if not tpex:
        tpex = {c: r for c, r in saved_data.items() if r.get("institutionalMarket") == "TPEx"}
        if tpex:
            fallback_markets.append("上櫃")
            tpex_meta = {
                "tpexDate": saved_meta.get("tpexDate", ""),
                "tpexCount": len(tpex),
            }

    merged = {**twse, **tpex}
    meta = {
        **twse_meta,
        **tpex_meta,
        "fallback": bool(fallback_markets),
        "fallbackMarkets": fallback_markets,
        "fallbackReason": ("、".join(fallback_markets) + "沿用最近交易日") if fallback_markets else "",
    }

    # Save a merged snapshot only when at least one market has usable data. This preserves
    # the previously good other market instead of replacing it with an empty response.
    if merged:
        _save_last_good_institutional(merged, meta)

    _INST_CACHE["key"] = cache_key
    _INST_CACHE["data"] = merged
    _INST_CACHE["meta"] = meta
    return merged


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

    ema100_series = ema(c, 100)
    ema100_now = ema100_series[i] if len(ema100_series) > i else None
    ema100_prev = ema100_series[p] if len(ema100_series) > p else None
    above_ema100 = bool(ema100_now is not None and c[i] > ema100_now)
    ema100_rising = bool(
        ema100_now is not None and ema100_prev is not None and ema100_now > ema100_prev
    )
    macd_golden_cross = bool(
        dif[i] > sig[i] and dif[p] <= sig[p]
    )
    ema100_macd_strategy = bool(
        above_ema100 and ema100_rising and macd_golden_cross
    )

    # 布林通道 Bollinger Bands (20, 2)
    boll_mid_series = []
    boll_upper_series = []
    boll_lower_series = []
    boll_width_series = []
    for bi in range(len(c)):
        if bi < 19:
            boll_mid_series.append(None); boll_upper_series.append(None); boll_lower_series.append(None); boll_width_series.append(None)
            continue
        window = c[bi-19:bi+1]
        mid = sum(window) / 20
        variance = sum((value-mid)**2 for value in window) / 20
        std = math.sqrt(variance)
        upper = mid + 2*std
        lower = mid - 2*std
        width = ((upper-lower)/mid*100) if mid else None
        boll_mid_series.append(mid); boll_upper_series.append(upper); boll_lower_series.append(lower); boll_width_series.append(width)
    boll_mid = boll_mid_series[i]
    boll_upper = boll_upper_series[i]
    boll_lower = boll_lower_series[i]
    boll_width = boll_width_series[i]
    prev_boll_width = boll_width_series[p]
    boll_expanding = bool(boll_width is not None and prev_boll_width is not None and boll_width > prev_boll_width)

    # V11：記錄昨日帶寬與連續收縮天數。
    boll_contract_days = 0
    for bi in range(i, 19, -1):
        current_width = boll_width_series[bi]
        prior_width = boll_width_series[bi - 1]
        if current_width is None or prior_width is None or current_width >= prior_width:
            break
        boll_contract_days += 1
    boll_position = (
        "突破上軌" if boll_upper is not None and c[i] > boll_upper else
        "上半部" if boll_mid is not None and c[i] >= boll_mid else
        "跌破下軌" if boll_lower is not None and c[i] < boll_lower else
        "下半部"
    )
    # 位階：下軌=-10、中軌=0、上軌=+10；突破時容許延伸至 ±12。
    boll_position_score = None
    if boll_upper is not None and boll_lower is not None and boll_upper > boll_lower:
        boll_position_score = ((c[i] - boll_mid) / ((boll_upper - boll_lower) / 2)) * 10
        boll_position_score = max(-12, min(12, boll_position_score))
    # 月斜：布林中軌(20MA)近 5 根的標準化斜率，換算為百分比，跨股價可比較。
    boll_slope_pct = None
    if i >= 5 and boll_mid_series[i] not in (None, 0) and boll_mid_series[i-5] is not None:
        boll_slope_pct = ((boll_mid_series[i] - boll_mid_series[i-5]) / boll_mid_series[i-5]) * 100
    boll_slope_state = (
        "強多" if boll_slope_pct is not None and boll_slope_pct >= 3 else
        "偏多" if boll_slope_pct is not None and boll_slope_pct > 0 else
        "強空" if boll_slope_pct is not None and boll_slope_pct <= -3 else
        "偏空" if boll_slope_pct is not None and boll_slope_pct < 0 else
        "中性"
    )

    ema_distance_pct = (
        ((c[i] - ema100_now) / ema100_now) * 100
        if ema100_now not in (None, 0) else None
    )

    # EMA100 多空強度，各自 0~5 格。
    bull_strength = 0
    bear_strength = 0
    ema_signal_reasons = []

    if above_ema100:
        bull_strength += 1
        ema_signal_reasons.append("股價位於 EMA100 上方")
    else:
        bear_strength += 1
        ema_signal_reasons.append("股價位於 EMA100 下方")

    if ema100_rising:
        bull_strength += 1
        ema_signal_reasons.append("EMA100 方向上彎")
    else:
        bear_strength += 1
        ema_signal_reasons.append("EMA100 尚未上彎")

    if dif[i] > sig[i]:
        bull_strength += 1
        ema_signal_reasons.append("MACD 位於訊號線上方")
    else:
        bear_strength += 1
        ema_signal_reasons.append("MACD 位於訊號線下方")

    if hist[i] > 0:
        bull_strength += 1
        ema_signal_reasons.append("MACD 柱體為正")
    elif hist[i] < 0:
        bear_strength += 1
        ema_signal_reasons.append("MACD 柱體為負")

    vol6 = sma(v, 6) or 1
    vr = v[i] / vol6 if vol6 else 0
    # V11 主升啟動量增：今日量大於「前 5 日」均量，避免把今日量納入均量稀釋訊號。
    prev5_volume_avg = (sum(v[max(0, i-5):i]) / len(v[max(0, i-5):i])) if v[max(0, i-5):i] else 0
    volume_ratio_prev5 = (v[i] / prev5_volume_avg) if prev5_volume_avg else 0
    volume_increasing = bool(prev5_volume_avg and v[i] > prev5_volume_avg)
    price_change = ((c[i] / c[p]) - 1) * 100 if c[p] else 0

    # V11「主升啟動」固定內含三條件：布林帶寬 <= 8%、量增、MACD(DIF)在零軸上。
    macd_above_zero = bool(dif[i] > 0)
    boll_squeeze_8 = bool(boll_width is not None and boll_width <= 8)
    main_up_start = bool(boll_squeeze_8 and volume_increasing and macd_above_zero)
    main_up_start_ema = bool(main_up_start and above_ema100)

    if vr >= 1.2 and price_change >= 0:
        bull_strength += 1
        ema_signal_reasons.append("上漲並伴隨量能放大")
    elif vr >= 1.2 and price_change < 0:
        bear_strength += 1
        ema_signal_reasons.append("下跌並伴隨量能放大")

    bull_strength = max(0, min(5, bull_strength))
    bear_strength = max(0, min(5, bear_strength))

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

    if above_ema100:
        technical_score += 15
        technical_reasons.append("股價站上 EMA100 +15")
    if ema100_rising:
        technical_score += 10
        technical_reasons.append("EMA100 上彎 +10")
    if macd_golden_cross:
        technical_score += 15
        technical_reasons.append("MACD 黃金交叉 +15")
    if ema100_macd_strategy:
        technical_score += 10
        technical_reasons.append("EMA100 多頭策略成立 +10")
    if ema_distance_pct is not None and 0 <= ema_distance_pct <= 5:
        technical_score += 8
        technical_reasons.append("EMA100 正乖離 5% 內 +8")
    if boll_mid is not None and c[i] >= boll_mid:
        technical_score += 5
        technical_reasons.append("股價位於布林中軌上方 +5")
    if boll_expanding and boll_mid is not None and c[i] >= boll_mid:
        technical_score += 5
        technical_reasons.append("布林帶多方開口 +5")

    if vr >= 1.5:
        technical_score += 8
        technical_reasons.append("量能明顯放大 +8")
    elif vr >= 1.05:
        technical_score += 5
        technical_reasons.append("量能溫和放大 +5")

    technical_score = max(0, min(100, round(technical_score)))

    # 2) 法人分數 0~100
    inst_data = inst.get(code, {
        "foreignNet": None,
        "trustNet": None,
        "dealerNet": None,
        "institutionalNet": None,
        "foreignAvailable": False,
        "trustAvailable": False,
        "dealerAvailable": False,
        "institutionalAvailable": False,
        "institutionalComplete": False,
        "institutionalConsistent": None,
        "institutionalCalculatedFields": [],
        "institutionalDataStatus": "待更新",
        "institutionalDate": "",
        "institutionalSource": "",
        "institutionalMarket": source_meta.get("exchange"),
    })
    foreign_net = inst_data.get("foreignNet")
    trust_net = inst_data.get("trustNet")
    dealer_net = inst_data.get("dealerNet")
    institutional_net = inst_data.get("institutionalNet")

    institutional_score = 50
    institutional_reasons = []
    institutional_available = bool(inst_data.get("institutionalAvailable"))

    if institutional_available:
        if institutional_net is not None and institutional_net > 0:
            institutional_score += 18
            institutional_reasons.append("官方三大法人合計買超 +18")
        elif institutional_net is not None and institutional_net < 0:
            institutional_score -= 18
            institutional_reasons.append("官方三大法人合計賣超 -18")

        if foreign_net is not None and foreign_net > 0:
            institutional_score += 12
            institutional_reasons.append("官方外資買超 +12")
        elif foreign_net is not None and foreign_net < 0:
            institutional_score -= 10
            institutional_reasons.append("官方外資賣超 -10")

        if trust_net is not None and trust_net > 0:
            institutional_score += 12
            institutional_reasons.append("官方投信買超 +12")
        elif trust_net is not None and trust_net < 0:
            institutional_score -= 8
            institutional_reasons.append("官方投信賣超 -8")

        if dealer_net is not None and dealer_net > 0:
            institutional_score += 8
            institutional_reasons.append("官方自營商買超 +8")
        elif dealer_net is not None and dealer_net < 0:
            institutional_score -= 6
            institutional_reasons.append("官方自營商賣超 -6")
    else:
        institutional_reasons.append("官方法人資料尚未發布或暫時無法取得，法人分數維持中性")

    institutional_score = max(0, min(100, round(institutional_score)))

    # 3) 主力代理分數 0~100
    # 無官方統一「主力」欄位，使用法人方向、量比、漲跌與 MACD 建立代理模型。
    main_force_score = 50
    main_force_reasons = []

    if institutional_available:
        if institutional_net is not None and institutional_net > 0:
            main_force_score += 20
            main_force_reasons.append("官方法人方向偏多 +20")
        elif institutional_net is not None and institutional_net < 0:
            main_force_score -= 20
            main_force_reasons.append("官方法人方向偏空 -20")
    else:
        main_force_reasons.append("法人資料未取得，主力代理分數不採法人方向")

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

    # V9.5 AI 總分：提高趨勢與技術權重，法人與主力作確認
    ai_score = round(
        technical_score * 0.55 +
        institutional_score * 0.25 +
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

    # 個股內頁圖形只傳最近 90 根，避免掃描結果過大。
    chart_start = max(0, len(rows) - 90)
    ema_chart = []
    for idx in range(chart_start, len(rows)):
        ema_value = ema100_series[idx] if idx < len(ema100_series) else None
        ema_chart.append({
            "date": rows[idx]["date"],
            "close": round(c[idx], 2),
            "ema100": round(ema_value, 2) if ema_value is not None else None,
            "bollMid": round(boll_mid_series[idx], 2) if boll_mid_series[idx] is not None else None,
            "bollUpper": round(boll_upper_series[idx], 2) if boll_upper_series[idx] is not None else None,
            "bollLower": round(boll_lower_series[idx], 2) if boll_lower_series[idx] is not None else None,
        })

    return {
        "code": code,
        "name": source_meta.get("name") if not name or name == code else name,
        "market": source_meta.get("exchange"),
        "symbol": source_meta.get("symbol"),
        "period": period,
        "date": rows[-1]["date"],
        "close": round(c[i], 2),
        "change": round(c[i] - c[p], 2),
        "changePct": round(price_change, 2),
        "score": ai_score,
        "aiScore": ai_score,
        "technicalScore": technical_score,
        "institutionalScore": institutional_score,
        "mainForceScore": main_force_score,
        "K": round(K[i], 1) if K[i] is not None else None,
        "D": round(D[i], 1) if D[i] is not None else None,
        "RSI": round(R[i], 1) if R[i] is not None else None,
        "MACD": round(hist[i], 2),
        "DIF": round(dif[i], 2),
        "MACDSignal": round(sig[i], 2),
        "MACDGoldenCross": macd_golden_cross,
        "EMA100": round(ema100_now, 2) if ema100_now is not None else None,
        "aboveEMA100": above_ema100,
        "EMA100Rising": ema100_rising,
        "EMA100MACDStrategy": ema100_macd_strategy,
        "EMADistancePct": round(ema_distance_pct, 2) if ema_distance_pct is not None else None,
        "earlyTrend": bool(above_ema100 and ema100_rising and dif[i] > 0 and macd_golden_cross and ema_distance_pct is not None and 0 <= ema_distance_pct <= 5),
        "bollMid": round(boll_mid, 2) if boll_mid is not None else None,
        "bollUpper": round(boll_upper, 2) if boll_upper is not None else None,
        "bollLower": round(boll_lower, 2) if boll_lower is not None else None,
        "bollWidth": round(boll_width, 2) if boll_width is not None else None,
        "prevBollWidth": round(prev_boll_width, 2) if prev_boll_width is not None else None,
        "bollContractDays": boll_contract_days,
        "bollSqueeze8": boll_squeeze_8,
        "bollExpanding": boll_expanding,
        "bollPosition": boll_position,
        "bollPositionScore": round(boll_position_score, 1) if boll_position_score is not None else None,
        "bollSlopePct": round(boll_slope_pct, 2) if boll_slope_pct is not None else None,
        "bollSlopeState": boll_slope_state,
        "priceDataDate": rows[-1]["date"],
        "volumeDataDate": rows[-1]["date"],
        "bullStrength": bull_strength,
        "bearStrength": bear_strength,
        "emaSignalReasons": ema_signal_reasons,
        "emaChart": ema_chart,
        "volumeRatio": round(vr, 2),
        "volumeRatioPrev5": round(volume_ratio_prev5, 2),
        "volumeIncreasing": volume_increasing,
        "MACDAboveZero": macd_above_zero,
        "mainUpStart": main_up_start,
        "mainUpStartEMA": main_up_start_ema,
        "status": status,
        "entry": "回測短期均線量縮止跌後分批" if ma5 and c[i] >= ma5 else "先等重新站回短期均線",
        "technicalReasons": technical_reasons,
        "institutionalReasons": institutional_reasons,
        "mainForceReasons": main_force_reasons,
        **inst_data,
        "mainForceStatus": main_force_status
    }


def api_error(message, status=500, **extra):
    payload = {"ok": False, "error": message, "retryable": status in (408, 425, 429, 500, 502, 503, 504)}
    payload.update(extra)
    return jsonify(payload), status


@app.get("/")
def home():
    return send_from_directory(".", "index.html")


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    if request.path.startswith("/api/"):
        return api_error("伺服器暫時無法完成請求，請稍後再試。", 500, detail=str(exc)[:180])
    raise exc



@app.get("/api/search")
def api_search():
    try:
        q = str(request.args.get("q", "")).strip().lower()
        limit = min(30, max(1, int(request.args.get("limit", 12))))
        rows = all_universe()
        if not q:
            return jsonify({"ok": True, "results": [], "count": 0})
        def rank(item):
            code = str(item.get("code", "")).lower()
            name = str(item.get("name", "")).lower()
            score = 0
            if code == q or name == q: score += 100
            if code.startswith(q): score += 50
            if name.startswith(q): score += 45
            if q in code: score += 25
            if q in name: score += 30
            return score
        matched = [x for x in rows if q in str(x.get("code", "")).lower() or q in str(x.get("name", "")).lower()]
        matched.sort(key=lambda x: (-rank(x), str(x.get("code", ""))))
        return jsonify({"ok": True, "results": matched[:limit], "count": len(matched)})
    except Exception as exc:
        return api_error("搜尋暫時無法完成，請稍後再試。", 503, detail=str(exc)[:160])



@app.get("/api/sectors")
def api_sectors():
    market = str(request.args.get("market", "TWSE"))
    try:
        rows = all_universe()
        if market in ("TWSE", "TPEx"):
            rows = [x for x in rows if x.get("market") == market]

        grouped = {}
        for item in rows:
            sector = str(item.get("industry") or classify_sector(item.get("name")) or "其他")
            grouped.setdefault(sector, []).append(item)

        results = []
        for sector, members in grouped.items():
            valid = [x for x in members if x.get("close") is not None]
            if not valid:
                continue
            pcts = [float(x.get("changePct") or 0) for x in valid]
            up = sum(1 for p in pcts if p > 0)
            down = sum(1 for p in pcts if p < 0)
            flat = len(pcts) - up - down
            results.append({
                "sector": sector,
                "count": len(members),
                "sampleCount": len(valid),
                "changePct": round(sum(pcts) / len(pcts), 2),
                "up": up,
                "down": down,
                "flat": flat,
            })

        results.sort(key=lambda x: x["changePct"], reverse=True)
        return jsonify({
            "ok": True,
            "market": market,
            "results": results,
            "count": len(results),
            "stockCount": len(rows),
            "sourceStatus": "ok" if rows else "temporarily_unavailable",
        })
    except Exception as exc:
        return api_error("類股資料暫時無法取得，請稍後再試。", 503, detail=str(exc)[:180])



@app.get("/api/sector-members")
def api_sector_members():
    market = str(request.args.get("market", "TWSE"))
    sector = str(request.args.get("sector", "")).strip()
    sort_mode = str(request.args.get("sort", "up"))
    try:
        rows = all_universe()
        if market in ("TWSE", "TPEx"):
            rows = [x for x in rows if x.get("market") == market]
        if sector:
            rows = [
                x for x in rows
                if str(x.get("industry") or classify_sector(x.get("name")) or "其他") == sector
            ]

        enriched = []
        for item in rows:
            change = float(item.get("change") or 0)
            pct = float(item.get("changePct") or 0)
            enriched.append({
                "code": item.get("code"),
                "name": item.get("name"),
                "market": item.get("market"),
                "close": item.get("close"),
                "change": round(change, 2),
                "changePct": round(pct, 2),
                "aiScore": item.get("aiScore", item.get("score", 0)) or 0,
                "institutional": item.get("institutional", 0) or 0,
                "mainForce": item.get("mainForce", 0) or 0,
            })

        if sort_mode == "down":
            enriched.sort(key=lambda x: x["changePct"])
        elif sort_mode == "flat":
            enriched.sort(key=lambda x: abs(x["changePct"]))
        else:
            enriched.sort(key=lambda x: x["changePct"], reverse=True)

        return jsonify({"ok": True, "results": enriched[:60], "count": len(enriched)})
    except Exception as exc:
        return api_error("類股成分股資料暫時無法取得。", 503, detail=str(exc)[:180])


@app.get("/api/health")
def health():
    return jsonify(ok=True, version="V10.8", time=datetime.now().isoformat())

@app.get("/api/universe")
def universe():
    try:
        rows = all_universe()
        if rows:
            return jsonify({
                "ok": True,
                "data": rows,
                "count": len(rows),
                "cached": False,
            })

        cached_rows = (_cache_last("TWSE") or _disk_last("TWSE")) + (_cache_last("TPEx") or _disk_last("TPEx"))
        if cached_rows:
            return jsonify({
                "ok": True,
                "data": cached_rows,
                "count": len(cached_rows),
                "cached": True,
                "message": "資料來源暫時失敗，已沿用最近成功資料。",
            })

        return api_error(
            "股票名單來源暫時無法連線，且目前沒有可用快取。",
            503,
            useCache=False,
        )
    except Exception as exc:
        cached_rows = (_cache_last("TWSE") or _disk_last("TWSE")) + (_cache_last("TPEx") or _disk_last("TPEx"))
        if cached_rows:
            return jsonify({
                "ok": True,
                "data": cached_rows,
                "count": len(cached_rows),
                "cached": True,
                "message": "伺服器暫時異常，已沿用最近成功資料。",
            })
        return api_error(
            "股票名單服務暫時無法使用。",
            503,
            useCache=False,
            detail=str(exc)[:160],
        )


@app.get("/api/institutional/status")
def institutional_status():
    data = institutional_map(force=request.args.get("force") == "1")
    meta = dict(_INST_CACHE.get("meta") or {})
    meta.update({
        "ok": True,
        "records": len(data),
        "sample": list(data.items())[:3],
        "message": "法人資料來自 TWSE T86 與 TPEx OpenAPI；假日或官方暫時空白時沿用最近成功交易日，不以 0 冒充。"
    })
    return jsonify(meta)


@app.post("/api/scan")
def scan():
    body = request.get_json(silent=True) or {}
    period = body.get("period", "day")
    market = str(body.get("market", "all"))
    offset = max(0, int(body.get("offset", 0)))
    limit = min(40, max(1, int(body.get("limit", 20))))
    client_stocks = body.get("stocks") if isinstance(body.get("stocks"), list) else []
    client_total = max(0, int(body.get("clientTotal", 0) or 0))

    try:
        # V10.7: mixed mode is built from two independent market lists on the server.
        # This guarantees each page contains both TWSE and TPEx when both sources are available.
        if market == "all":
            twse_rows = sorted(twse_universe() or _cache_last("TWSE") or _disk_last("TWSE"), key=lambda x: str(x.get("code", "")))
            tpex_rows = sorted(tpex_universe() or _cache_last("TPEx") or _disk_last("TPEx"), key=lambda x: str(x.get("code", "")))
            page_index = offset // limit if limit else 0
            # Analyse one full page from EACH market. After analysis, select a balanced
            # top-score page. This prevents technical filters from making mixed mode look
            # like a single-market scan while preserving descending score order.
            per_market = limit
            a = twse_rows[page_index * per_market: page_index * per_market + per_market]
            b = tpex_rows[page_index * per_market: page_index * per_market + per_market]
            batch = a + b
            effective_total = len(twse_rows) + len(tpex_rows)
        else:
            uni = twse_universe() if market == "TWSE" else tpex_universe()
            uni = uni or _cache_last(market) or _disk_last(market)
            # For a single market, the client batch is accepted only as a last fallback.
            if not uni and client_stocks:
                uni = [x for x in client_stocks if str(x.get("market")) == market]
            batch = uni[offset:offset + limit]
            effective_total = len(uni)

        inst = institutional_map()
        results, errors = [], []

        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = {ex.submit(analyze, x["code"], x["name"], period, inst): x for x in batch}
            for f in as_completed(futs):
                stock_info = futs[f]
                try:
                    result = f.result()
                    result["market"] = stock_info.get("market", result.get("market", "TWSE"))
                    results.append(result)
                except Exception as exc:
                    errors.append({
                        "code": stock_info["code"],
                        "name": stock_info["name"],
                        "error": str(exc)
                    })

        results.sort(key=lambda x: x["score"], reverse=True)
        analyzed_counts = {
            "TWSE": sum(1 for x in results if x.get("market") == "TWSE"),
            "TPEx": sum(1 for x in results if x.get("market") == "TPEx"),
        }
        if market == "all":
            quota_twse = (limit + 1) // 2
            quota_tpex = limit // 2
            twse_ok = [x for x in results if x.get("market") == "TWSE"]
            tpex_ok = [x for x in results if x.get("market") == "TPEx"]
            selected_results = twse_ok[:quota_twse] + tpex_ok[:quota_tpex]
            selected_keys = {(x.get("market"), x.get("code")) for x in selected_results}
            for x in results:
                if len(selected_results) >= limit:
                    break
                if (x.get("market"), x.get("code")) not in selected_keys:
                    selected_results.append(x)
                    selected_keys.add((x.get("market"), x.get("code")))
            results = sorted(selected_results, key=lambda x: x["score"], reverse=True)
        else:
            results = results[:limit]
        return jsonify({
            "ok": True,
            "period": period,
            "market": market,
            "marketTotal": effective_total,
            "offset": offset,
            "limit": limit,
            "total": effective_total,
            "processed": len(batch),
            "analyzedMarketCounts": analyzed_counts,
            "sourceMarketCounts": {"TWSE": len(twse_rows) if market == "all" else (len(uni) if market == "TWSE" else 0), "TPEx": len(tpex_rows) if market == "all" else (len(uni) if market == "TPEx" else 0)},
            "successCount": len(results),
            "errorCount": len(errors),
            "nextOffset": offset + len(batch),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "results": results,
            "errors": errors[:10]
        })
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 502

@app.get("/api/institutional/<code>")
def institutional_detail(code):
    code = str(code).strip()
    if not re.fullmatch(r"\d{4}", code):
        return api_error("股票代號需為 4 碼", 400)
    data = institutional_map(force=str(request.args.get("refresh", "0")) == "1")
    rec = data.get(code)
    if not rec:
        return jsonify(ok=True, code=code, result={
            "institutionalAvailable": False, "institutionalDataStatus": "官方無資料或尚未發布",
            "foreignNet": None, "trustNet": None, "dealerNet": None, "institutionalNet": None
        })
    return jsonify(ok=True, code=code, result=rec)

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
