
from flask import Flask, jsonify, request, send_from_directory
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, os, re, math

app = Flask(__name__, static_folder=".", static_url_path="")

TWSE_DAILY = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
UA = {"User-Agent": "Mozilla/5.0 (compatible; TaiwanStockAI/6.0)"}

def num(v):
    try:
        return float(str(v).replace(",", "").replace("--", "").strip())
    except Exception:
        return None

def twse_universe():
    r = requests.get(TWSE_DAILY, headers=UA, timeout=30)
    r.raise_for_status()
    rows = r.json()
    out = []
    for x in rows:
        code = str(x.get("Code") or x.get("證券代號") or "").strip()
        if not re.fullmatch(r"\d{4}", code):
            continue
        close = num(x.get("ClosingPrice") or x.get("收盤價"))
        if close is None:
            continue
        out.append({
            "code": code,
            "name": str(x.get("Name") or x.get("證券名稱") or code).strip(),
            "close": close,
            "market": "TWSE"
        })
    return out

def yahoo_chart(code, period="day"):
    # Automatic historical source. TWSE symbols use .TW.
    symbol = f"{code}.TW"
    interval = "1d"
    range_ = "5y"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    r = requests.get(url, params={"interval": interval, "range": range_}, headers=UA, timeout=25)
    r.raise_for_status()
    result = r.json()["chart"]["result"][0]
    ts = result.get("timestamp") or []
    q = result["indicators"]["quote"][0]
    rows = []
    for i, t in enumerate(ts):
        try:
            o,h,l,c,v = q["open"][i],q["high"][i],q["low"][i],q["close"][i],q["volume"][i]
            if c is None: continue
            rows.append({"date": datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d"),
                         "open":o or c,"high":h or c,"low":l or c,"close":c,"volume":v or 0})
        except Exception:
            pass
    if period == "day":
        return rows
    return resample(rows, period)

def resample(rows, period):
    groups = {}
    for r in rows:
        d = datetime.strptime(r["date"], "%Y-%m-%d")
        if period == "week":
            y,w,_ = d.isocalendar()
            key = f"{y}-W{w:02d}"
        else:
            key = f"{d.year}-{d.month:02d}"
        groups.setdefault(key, []).append(r)
    out=[]
    for _, a in sorted(groups.items()):
        a.sort(key=lambda x:x["date"])
        out.append({"date":a[-1]["date"],"open":a[0]["open"],
                    "high":max(x["high"] for x in a),"low":min(x["low"] for x in a),
                    "close":a[-1]["close"],"volume":sum(x["volume"] for x in a)})
    return out

def ema(a,n):
    if not a: return []
    k=2/(n+1); p=a[0]; out=[]
    for i,v in enumerate(a):
        p=v if i==0 else v*k+p*(1-k); out.append(p)
    return out

def rsi(a,n=14):
    out=[None]*len(a); g=l=0
    for i in range(1,len(a)):
        ch=a[i]-a[i-1]
        if i<=n: g+=max(ch,0); l+=max(-ch,0)
        if i==n:
            g/=n; l/=n; out[i]=100 if l==0 else 100-100/(1+g/l)
        elif i>n:
            g=(g*(n-1)+max(ch,0))/n; l=(l*(n-1)+max(-ch,0))/n
            out[i]=100 if l==0 else 100-100/(1+g/l)
    return out

def kd(rows,n=9):
    K=[None]*len(rows); D=[None]*len(rows); k=d=50
    for i in range(n-1,len(rows)):
        w=rows[i-n+1:i+1]
        hh=max(x["high"] for x in w); ll=min(x["low"] for x in w)
        rsv=50 if hh==ll else (rows[i]["close"]-ll)/(hh-ll)*100
        k=(2*k+rsv)/3; d=(2*d+k)/3; K[i]=k; D[i]=d
    return K,D

def sma(a,n):
    return None if len(a)<n else sum(a[-n:])/n

def analyze(code,name,period):
    rows=yahoo_chart(code,period)
    if len(rows)<30:
        return None
    c=[x["close"] for x in rows]; v=[x["volume"] for x in rows]
    R=rsi(c); K,D=kd(rows)
    e12=ema(c,12); e26=ema(c,26); dif=[x-y for x,y in zip(e12,e26)]; sig=ema(dif,9)
    hist=[(x-y)*2 for x,y in zip(dif,sig)]
    i=len(rows)-1; p=i-1
    ma5=sma(c,5); ma10=sma(c,10); ma20=sma(c,20); vol6=sma(v,6) or 1
    kcross=K[i] is not None and D[i] is not None and K[p] is not None and D[p] is not None and K[i]>D[i] and K[p]<=D[p]
    score=0
    if kcross: score+=18
    if D[i] is not None and D[i]<=35: score+=10
    if R[i] is not None and R[p] is not None and R[i]>R[p]: score+=10
    if R[i] is not None and R[i]>=45: score+=7
    if hist[i]>0: score+=15
    elif hist[i]>hist[p]: score+=9
    if c[i]>ma5: score+=10
    if c[i]>ma10: score+=7
    if c[i]>ma20: score+=7
    vr=v[i]/vol6
    if vr>=1.05: score+=8
    score=min(100,round(score))
    return {"code":code,"name":name,"period":period,"date":rows[-1]["date"],"close":round(c[i],2),
            "score":score,"K":round(K[i],1) if K[i] is not None else None,
            "D":round(D[i],1) if D[i] is not None else None,
            "RSI":round(R[i],1) if R[i] is not None else None,
            "MACD":round(hist[i],2),"volumeRatio":round(vr,2),
            "status":"強勢候選" if score>=80 else "轉強觀察" if score>=65 else "初步成形",
            "entry":"回測短期均線量縮止跌後分批" if c[i]>=ma5 else "先等重新站回短期均線"}

@app.get("/")
def home():
    return send_from_directory(".", "index.html")

@app.get("/api/health")
def health():
    return jsonify(ok=True, version="V6", time=datetime.now().isoformat())

@app.get("/api/universe")
def universe():
    try:
        return jsonify(twse_universe())
    except Exception as e:
        return jsonify(error=str(e)), 502

@app.get("/api/stock/<code>")
def stock(code):
    period=request.args.get("period","day")
    name=request.args.get("name",code)
    try:
        x=analyze(code,name,period)
        return jsonify(x or {"error":"資料不足"})
    except Exception as e:
        return jsonify(error=str(e)), 502

@app.post("/api/scan")
def scan():
    body=request.get_json(silent=True) or {}
    period=body.get("period","day")
    offset=max(0,int(body.get("offset",0)))
    limit=min(60,max(1,int(body.get("limit",20))))
    try:
        uni=twse_universe()
        batch=uni[offset:offset+limit]
        results=[]
        with ThreadPoolExecutor(max_workers=6) as ex:
            futs={ex.submit(analyze,x["code"],x["name"],period):x for x in batch}
            for f in as_completed(futs):
                try:
                    y=f.result()
                    if y: results.append(y)
                except Exception:
                    pass
        results.sort(key=lambda x:x["score"], reverse=True)
        return jsonify({"period":period,"offset":offset,"limit":limit,"total":len(uni),
                        "nextOffset":offset+len(batch),"date":datetime.now().strftime("%Y-%m-%d"),
                        "results":results})
    except Exception as e:
        return jsonify(error=str(e)), 502

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT","10000")))
