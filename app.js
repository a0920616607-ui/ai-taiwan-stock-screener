
function formatPriceChange(stock){
 const change=Number(stock?.change ?? 0);
 const pct=Number(stock?.changePct ?? stock?.priceChange ?? 0);
 const cls=change>0?'price-up':change<0?'price-down':'price-flat';
 const symbol=change>0?'▲':change<0?'▼':'－';
 return `<span class="price-change ${cls}">
  <span class="change-line"><span class="change-symbol">${symbol}</span><span class="change-value">${Math.abs(change).toFixed(2)}</span></span>
  <span class="change-percent">${Math.abs(pct).toFixed(2)}%</span>
 </span>`;
}
function sectorCardHtml(row){
 const pct=Number(row.changePct||0);
 const cls=pct>0?'price-up':pct<0?'price-down':'price-flat';
 const symbol=pct>0?'▲':pct<0?'▼':'－';
 return `<article class="sector-card"><h3>${row.sector}（${row.count}）</h3><div class="sector-change ${cls}"><span class="change-symbol">${symbol}</span><strong>${Math.abs(pct).toFixed(2)}%</strong></div><p>上漲 ${row.up}｜下跌 ${row.down}｜平盤 ${row.flat}</p></article>`;
}
async function loadSectors(market){
 const grid=document.getElementById(market==='TWSE'?'twseSectorGrid':'tpexSectorGrid');
 const status=document.getElementById(market==='TWSE'?'twseSectorStatus':'tpexSectorStatus');
 if(!grid||!status)return;
 status.textContent='載入類股資料中…';
 grid.innerHTML='<div class="sector-loading">計算中，請稍候</div>';
 try{
  const data=await fetchJsonSafe(`/api/sectors?market=${encodeURIComponent(market)}`);
  const rows=Array.isArray(data.results)?data.results:[];
  grid.innerHTML=rows.map(sectorCardHtml).join('')||'<div class="sector-loading">目前沒有資料</div>';
  if(rows[0] && !activeSectorByMarket[market])activeSectorByMarket[market]=rows[0].sector;
  setTimeout(()=>loadSectorMembers(market),50);
  if(Number(data.stockCount||0)===0){
   status.textContent='上櫃資料來源暫時未取得，請稍後按重新整理';
  }else{
   status.textContent=`共 ${rows.length} 個類股｜${data.stockCount} 檔股票`;
   const timeEl=document.getElementById(market==='TWSE'?'twseSectorTime':'tpexSectorTime');
   if(timeEl)timeEl.textContent=`資料時間：${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`;
  }
 }catch(e){
  grid.innerHTML='';
  status.textContent=e.message;
 }
}


let stockSearchTimer=null;
async function searchStocks(query){
 const q=String(query||'').trim();
 if(!q)return [];
 const d=await fetchJsonSafe(`/api/search?q=${encodeURIComponent(q)}&limit=12`);
 return Array.isArray(d.results)?d.results:[];
}
function renderStockSuggestions(holder,rows,onSelect){
 if(!holder)return;
 holder.innerHTML=rows.length?rows.map(x=>`
  <button type="button" class="stock-suggestion" data-code="${x.code}">
   <span><b>${x.code}</b> ${x.name}</span>
   <small>${x.market==='TPEx'?'上櫃':'上市'}</small>
  </button>`).join(''):'<div class="suggestion-empty">找不到符合的上市／上櫃股票</div>';
 holder.classList.add('open');
 holder.querySelectorAll('.stock-suggestion').forEach(btn=>{
  btn.onclick=()=>{
   const row=rows.find(x=>x.code===btn.dataset.code);
   if(row)onSelect(row);
   holder.classList.remove('open');
  };
 });
}
function bindStockAutocomplete(inputSelector,holderSelector,onSelect){
 const input=document.querySelector(inputSelector);
 const holder=document.querySelector(holderSelector);
 if(!input||!holder)return;
 let composing=false;
 input.addEventListener('compositionstart',()=>{composing=true;});
 input.addEventListener('compositionend',()=>{
  composing=false;
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 input.addEventListener('keydown',async e=>{
  if(e.key!=='Enter' || composing)return;
  e.preventDefault();
  try{
   const rows=await searchStocks(input.value);
   if(rows[0]){
    input.value=rows[0].code;
    input.dataset.stockName=rows[0].name;
    input.dataset.market=rows[0].market;
    holder.classList.remove('open');
    onSelect?.(rows[0]);
   }
  }catch(_){}
 });
 input.addEventListener('input',()=>{
  if(composing)return;
  clearTimeout(stockSearchTimer);
  const q=input.value.trim();
  if(!q){holder.classList.remove('open');holder.innerHTML='';return;}
  stockSearchTimer=setTimeout(async()=>{
   try{
    const rows=await searchStocks(q);
    renderStockSuggestions(holder,rows,row=>{
     input.value=row.code;
     input.dataset.stockName=row.name;
     input.dataset.market=row.market;
     onSelect?.(row);
    });
   }catch(e){
    holder.innerHTML=`<div class="suggestion-empty">${e.message}</div>`;
    holder.classList.add('open');
   }
  },220);
 });
}
function aiLabelFromScore(score){
 const n=Number(score||0);
 if(n>=90)return '強勢候選';
 if(n>=80)return '積極觀察';
 if(n>=70)return '轉強觀察';
 if(n>=60)return '等待確認';
 return '暫不列入';
}


function selectedMarketUniverse(){
 const market=document.getElementById('marketFilter')?.value||'all';
 if(market==='all')return universe;
 return universe.filter(x=>x.market===market);
}
function updateMarketCounters(scannedCount=null, marketTotal=null){
 const rows=selectedMarketUniverse();
 const total=marketTotal==null ? rows.length : Number(marketTotal||0);
 const scanned=scannedCount==null ? results.length : Number(scannedCount||0);
 const totalEl=document.getElementById('total');
 const scannedEl=document.getElementById('scanned');
 if(totalEl)totalEl.textContent=total.toLocaleString();
 if(scannedEl)scannedEl.textContent=scanned.toLocaleString();
}


window.switchReasonTab=function(key){
  const overlay=document.getElementById('detailOverlay');
  if(!overlay)return false;

  overlay.querySelectorAll('.reason-tab').forEach(btn=>{
    const active=btn.dataset.reason===key;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',active?'true':'false');
  });

  overlay.querySelectorAll('.reason-panel').forEach(panel=>{
    const active=panel.dataset.reasonPanel===key;
    panel.classList.toggle('active',active);
    panel.hidden=!active;
    panel.style.display=active?'block':'none';
  });
  return false;
};


async function fetchJsonSafe(url, options={}){
  const config={...options};
  const retryCount=Number(config.retryCount ?? 3);
  const retryDelays=Array.isArray(config.retryDelays) ? config.retryDelays : [1800,3500,7000];
  const silent=Boolean(config.silent);
  delete config.retryCount;
  delete config.retryDelays;
  delete config.silent;

  let lastError=null;

  for(let attempt=0; attempt<=retryCount; attempt++){
    try{
      const controller=new AbortController();
      const timeoutMs=Number(config.timeoutMs||45000);
      delete config.timeoutMs;
      const timer=setTimeout(()=>controller.abort(),timeoutMs);

      let response;
      try{
        response=await fetch(url,{...config,signal:controller.signal});
      }finally{
        clearTimeout(timer);
      }

      const contentType=(response.headers.get('content-type')||'').toLowerCase();
      const raw=await response.text();

      if(!contentType.includes('application/json')){
        const err=new Error(
          response.status===502 || response.status===503
            ? '雲端伺服器喚醒中'
            : '伺服器暫時回傳非資料頁面'
        );
        err.retryable=true;
        err.status=response.status;
        throw err;
      }

      if(!raw || !raw.trim()){
        const err=new Error('伺服器沒有回傳資料');
        err.retryable=true;
        err.status=response.status;
        throw err;
      }

      let data;
      try{
        data=JSON.parse(raw);
      }catch(_){
        const err=new Error('伺服器資料格式暫時異常');
        err.retryable=true;
        err.status=response.status;
        throw err;
      }

      if(!response.ok || data?.ok===false){
        const err=new Error(data?.error || data?.message || `連線失敗（${response.status}）`);
        err.retryable=[408,425,429,500,502,503,504].includes(response.status);
        err.status=response.status;
        err.data=data;
        throw err;
      }

      return data;
    }catch(error){
      lastError=error?.name==='AbortError'
        ? Object.assign(new Error('伺服器回應逾時'),{retryable:true})
        : error;

      const canRetry=attempt<retryCount && lastError?.retryable!==false;
      if(!canRetry)break;

      const delay=retryDelays[Math.min(attempt,retryDelays.length-1)] || 3000;
      const status=document.getElementById('progressText');
      if(status && !silent){
        status.textContent=`伺服器喚醒中，第 ${attempt+1} 次重試…`;
      }
      await new Promise(resolve=>setTimeout(resolve,delay));
    }
  }

  throw lastError || new Error('暫時無法連線');
}

const $=s=>document.querySelector(s);
let universe=safeLoadUniverse(),results=[],allScannedResults=safeLoadRanking(),period='day',page=0,pageSize=20,pendingCode=null,pendingConfirm=null,singlePeriod='day',singleResult=null;


function rankingDayKey(date=new Date()){
 const y=date.getFullYear();
 const m=String(date.getMonth()+1).padStart(2,'0');
 const d=String(date.getDate()).padStart(2,'0');
 return `${y}-${m}-${d}`;
}

function loadRankingHistory(){
 try{
  const data=JSON.parse(localStorage.getItem('v85-ranking-history')||'{}');
  return data&&typeof data==='object'?data:{};
 }catch(e){return {};}
}

function saveDailyRankingSnapshot(){
 try{
  const history=loadRankingHistory();
  const key=rankingDayKey();
  history[key]=[...allScannedResults]
   .sort((a,b)=>Number(b.aiScore??b.score??0)-Number(a.aiScore??a.score??0))
   .slice(0,100)
   .map(x=>({
    code:x.code,name:x.name,market:x.market,period:x.period||'day',
    close:x.close,change:x.change,changePct:x.changePct,
    aiScore:Number(x.aiScore??x.score??0),
    signal:x.signal,status:x.status,
    savedAt:new Date().toISOString()
   }));
  const keys=Object.keys(history).sort().slice(-30);
  const kept={};
  keys.forEach(k=>kept[k]=history[k]);
  localStorage.setItem('v85-ranking-history',JSON.stringify(kept));
  renderRankingDateOptions();
 }catch(e){}
}

function renderRankingDateOptions(){
 const select=document.getElementById('rankingDate');
 if(!select)return;
 const current=select.value||'latest';
 const keys=Object.keys(loadRankingHistory()).sort().reverse();
 select.innerHTML='<option value="latest">最新資料</option>'+
  keys.map(k=>`<option value="${k}">${k}</option>`).join('');
 select.value=[...select.options].some(o=>o.value===current)?current:'latest';
}

function selectedRankingRows(){
 const date=document.getElementById('rankingDate')?.value||'latest';
 if(date==='latest')return [...allScannedResults];
 return [...(loadRankingHistory()[date]||[])];
}

function rankingPreviousScore(code,dateKey){
 const history=loadRankingHistory();
 const keys=Object.keys(history).sort();
 const idx=dateKey&&dateKey!=='latest'?keys.indexOf(dateKey):keys.length-1;
 const previousKey=keys[idx-1];
 if(!previousKey)return null;
 const row=(history[previousKey]||[]).find(x=>x.code===code);
 return row?Number(row.aiScore??row.score??0):null;
}

function rankingStreak(code,currentScore){
 const history=loadRankingHistory();
 const keys=Object.keys(history).sort().reverse().slice(0,3);
 if(keys.length<3)return false;
 const scores=keys.map(k=>{
  const row=(history[k]||[]).find(x=>x.code===code);
  return row?Number(row.aiScore??row.score??0):null;
 });
 return scores.every(v=>v!==null)&&scores[0]>=scores[1]&&scores[1]>=scores[2]&&scores[0]>scores[2];
}

function safeLoadRanking(){
 try{
  const rows=JSON.parse(localStorage.getItem('v85-ranking')||localStorage.getItem('v844-ranking')||'[]');
  return Array.isArray(rows)?rows:[];
 }catch(e){
  return [];
 }
}

function saveRanking(){
 try{
  localStorage.setItem('v85-ranking',JSON.stringify(allScannedResults.slice(0,300))); saveDailyRankingSnapshot();
 }catch(e){}
}

function mergeRankingRows(rows){
 const merged=new Map();
 for(const item of allScannedResults){
  if(item?.code)merged.set(`${item.code}:${item.period||'day'}`,item);
 }
 for(const item of (Array.isArray(rows)?rows:[])){
  if(item?.code)merged.set(`${item.code}:${item.period||period}`,item);
 }
 allScannedResults=[...merged.values()]
  .sort((a,b)=>Number(b.aiScore??b.score??0)-Number(a.aiScore??a.score??0))
  .slice(0,300);
 saveRanking();
}

function safeLoadUniverse(){
 try{
  const u=JSON.parse(localStorage.getItem('v63-universe')||'[]');
  return Array.isArray(u)?u:[];
 }catch(e){return []}
}
let groups=safeLoadGroups();
let currentGroup=Object.keys(groups)[0]||'觀察';

function safeLoadGroups(){
 try{
  const parsed=JSON.parse(localStorage.getItem('v6-groups')||'{"觀察":[],"波段":[],"長期投資":[]}');
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error();
  for(const key of Object.keys(parsed)){
    if(!Array.isArray(parsed[key])) parsed[key]=[];
  }
  if(!Object.keys(parsed).length) return {"觀察":[]};
  return parsed;
 }catch(e){
  return {"觀察":[],"波段":[],"長期投資":[]};
 }
}
function saveGroups(){
 localStorage.setItem('v6-groups',JSON.stringify(groups));
 renderGroups();renderWatch();renderResults();
}

function setInlineScanMessage(message,type='info'){
 const progressText=document.getElementById('progressText');
 if(progressText)progressText.textContent=message;

 const empty=document.getElementById('empty');
 if(empty && type==='error'){
  empty.style.display='block';
  empty.textContent=message;
 }
}

function hasSavedScanResults(){
 return Array.isArray(results) && results.length>0;
}

async function syncUniverse(){
  $('#progressText').textContent='同步股票名單中…';
  try{
    const d=await fetchJsonSafe('/api/universe',{retryCount:3,retryDelays:[1800,3500,7000],timeoutMs:50000});
    const rows=Array.isArray(d) ? d : (Array.isArray(d.data) ? d.data : []);
    const oldRows=safeLoadUniverse();
    const oldTpex=oldRows.filter(x=>x.market==='TPEx');
    const newTpex=rows.filter(x=>x.market==='TPEx');
    let mergedRows=rows;
    if(newTpex.length===0 && oldTpex.length>0){
      const listed=rows.filter(x=>x.market==='TWSE');
      mergedRows=[...listed,...oldTpex];
    }
    universe=mergedRows;
    localStorage.setItem('v63-universe',JSON.stringify(mergedRows));
    localStorage.setItem('v63-last-sync',new Date().toISOString());
    page=0;
    updateMarketCounters(0);
    const listedCount=universe.filter(x=>x.market==='TWSE').length;
    const otcCount=universe.filter(x=>x.market==='TPEx').length;
    $('#progressText').textContent=`已同步 ${universe.length} 檔（上市 ${listedCount}／上櫃 ${otcCount}）`;
    renderWatch();
    return universe;
  }catch(err){
    if(universe.length){
      $('#progressText').textContent=`同步暫時失敗，沿用已保存 ${universe.length} 檔資料`;
      return universe;
    }
    $('#progressText').textContent='同步失敗，目前沒有可用的快取資料';
    throw err;
  }
}
async function scanPage(){
 if(!universe.length) await syncUniverse();
 const scanButton=$('#smartScanBtn')||$('#scanBtn');
 if(scanButton) scanButton.disabled=true;
 $('#progressText').textContent='AI 掃描中…';
 $('#progress').value=15;
 $('#empty').textContent='正在取得歷史行情、法人與主力代理指標…';
 try{
  const d=await fetchJsonSafe('/api/scan',{
   retryCount:3,
   retryDelays:[1800,3500,7000],
   timeoutMs:60000,
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify((()=>{
    const market=document.getElementById('marketFilter')?.value||'all';
    const selected=selectedMarketUniverse();
    const batch=selected.slice(page*pageSize,(page+1)*pageSize).map(x=>({
      code:x.code,name:x.name,market:x.market
    }));
    return {
      period,
      market,
      offset:page*pageSize,
      limit:pageSize,
      clientTotal:selected.length,
      stocks:batch
    };
   })())
  });

  results=Array.isArray(d.results)?d.results:[];
  mergeRankingRows(results);
  renderRanking();
  $('#progress').value=100;
  $('#scanned').textContent=Math.min((page+1)*pageSize,d.total||0);
  $('#high').textContent=results.filter(x=>x.score>=80).length;
  if($('#match')) if($('#match')) $('#match').textContent=results.filter(x=>x.score>=65).length;
  $('#dataDate').textContent=`資料：${d.date||'—'}`;
  $('#progressText').textContent=`第 ${page+1} 頁完成：成功 ${d.successCount||0}，失敗 ${d.errorCount||0}`;
  $('#pageLabel').textContent=`第 ${page+1} 頁 / ${Math.max(1,Math.ceil((d.total||0)/pageSize))} 頁`;

  if(!results.length){
   const firstError=(d.errors&&d.errors.length)?d.errors[0].error:'本頁沒有可分析資料';
   $('#empty').textContent=`本頁未取得分析結果：${firstError}`;
  }else{
   $('#empty').textContent='本頁沒有符合搜尋條件的股票';
  }
  renderResults();
  renderWatch();
 }catch(e){
  // 連線暫時失敗時保留上次掃描結果，不清空畫面。
  renderResults();
  const cached=hasSavedScanResults() || allScannedResults.length>0;
  const message=cached
    ? `資料來源暫時失敗，已保留上次掃描結果：${e.message}`
    : `掃描暫時失敗：${e.message}`;
  setInlineScanMessage(message,'error');
  $('#progressText').textContent=cached?'已沿用上次掃描資料':'掃描暫時失敗，請稍後再試';
 }finally{
  if(scanButton) scanButton.disabled=false;
 }
}
function inWatch(code){return Object.values(groups).some(a=>a.includes(code))}
function groupOfCode(code){return Object.keys(groups).find(g=>groups[g].includes(code))||null}
function getSignal(x){
 const ai=Number(x.aiScore??x.score??0);
 const tech=Number(x.technicalScore??0);
 const instScore=Number(x.institutionalScore??50);
 const main=Number(x.mainForceScore??50);
 const instNet=Number(x.institutionalNet??0);
 const foreign=Number(x.foreignNet??0);
 const macd=Number(x.MACD??0);
 const k=Number(x.K??0);
 const d=Number(x.D??0);

 // 資料來源尚未提供法人張數時，仍以技術、主力及 AI 分數判斷，
 // 避免所有股票因法人淨額為 0 而全部顯示中性。
 const buyPoints =
   (ai >= 65 ? 2 : ai >= 58 ? 1 : 0) +
   (tech >= 65 ? 2 : tech >= 55 ? 1 : 0) +
   (main >= 60 ? 1 : 0) +
   (instScore >= 60 ? 1 : 0) +
   (macd > 0 ? 1 : 0) +
   (k > d ? 1 : 0) +
   ((instNet > 0 || foreign > 0) ? 1 : 0);

 const sellPoints =
   (ai <= 42 ? 2 : ai <= 50 ? 1 : 0) +
   (tech <= 40 ? 2 : tech <= 50 ? 1 : 0) +
   (main <= 40 ? 1 : 0) +
   (instScore <= 40 ? 1 : 0) +
   (macd < 0 ? 1 : 0) +
   (k < d ? 1 : 0) +
   ((instNet < 0 || foreign < 0) ? 1 : 0);

 if(buyPoints >= 5 && buyPoints > sellPoints){
  return {type:'buy',label:'買入',icon:'↑'};
 }
 if(sellPoints >= 5 && sellPoints > buyPoints){
  return {type:'sell',label:'賣出',icon:'↓'};
 }
 return {type:'neutral',label:'中性',icon:'—'};
}

function getVolumeHint(x){
 const vr=Number(x.volumeRatio??0);
 const signal=getSignal(x);

 if(vr>=1.2 && signal.type==='buy'){
  return {type:'buy',text:'買入量能放大'};
 }
 if(vr>=1.2 && signal.type==='sell'){
  return {type:'sell',text:'賣出量能放大'};
 }
 if(vr>=1.2){
  return {type:'volume',text:'量能放大'};
 }
 return {type:'flat',text:'量能平穩'};
}

function hasReason(x, keyword){
 const reasons=[
  ...(x.technicalReasons||[]),
  ...(x.institutionalReasons||[]),
  ...(x.mainForceReasons||[])
 ].join(' ');
 return reasons.includes(keyword);
}



let scanDirection='bull';
let techMatchMode='any';

function activeConditionGroup(){
 return document.querySelector(`#techMultiMenu [data-direction-group="${scanDirection}"]`);
}

function getVisibleTechInputs(){
 return [...(activeConditionGroup()?.querySelectorAll('input[type="checkbox"]')||[])];
}

function updateDirectionUI(){
 document.querySelectorAll('.direction-btn').forEach(btn=>{
  btn.classList.toggle('active',btn.dataset.direction===scanDirection);
 });
 document.querySelectorAll('[data-direction-group]').forEach(group=>{
  group.classList.toggle('active',group.dataset.directionGroup===scanDirection);
 });
 const triggerText=document.getElementById('techMultiText');
 if(triggerText && getSelectedTechFilters().length===0){
  triggerText.textContent=scanDirection==='bull'?'多方全部條件':'空方全部條件';
 }
 updateTechMultiLabel();
 renderResults();
}

function updateMatchModeUI(){
 document.querySelectorAll('.match-mode-btn').forEach(btn=>{
  btn.classList.toggle('active',btn.dataset.matchMode===techMatchMode);
 });
 const note=document.getElementById('conditionModeNote');
 if(note){
  note.textContent=techMatchMode==='all'
   ?'全部符合：必須同時符合所有已勾選條件。'
   :'任一符合：只要符合其中一項即可列出。';
 }
 renderResults();
}

function setSmartScanState(running,label='智慧選股掃描',detail='同步股票名單＋AI分析＋排行榜更新'){
 const btn=document.getElementById('smartScanBtn');
 if(!btn)return;
 btn.disabled=running;
 btn.classList.toggle('running',running);
 const main=btn.querySelector('b');
 const small=btn.querySelector('small');
 const icon=btn.querySelector('.smart-scan-icon');
 if(main)main.textContent=label;
 if(small)small.textContent=detail;
 if(icon)icon.textContent=running?'●':'▶';
}

async function smartScan(){
 const started=performance.now();
 setSmartScanState(true,'同步股票資料中…','上市與上櫃名單同步');
 try{
  page=0;
  await syncUniverse();
  setSmartScanState(true,'AI 掃描分析中…',`${scanDirection==='bull'?'多方':'空方'}模式｜第 1 頁`);
  await scanPage();
  renderRanking();
  saveDailyRankingSnapshot();
  const seconds=((performance.now()-started)/1000).toFixed(1);
  setSmartScanState(false,'智慧選股掃描',`完成｜耗時 ${seconds} 秒｜已更新排行榜`);
 }catch(err){
  const cached=hasSavedScanResults() || allScannedResults.length>0;
  setSmartScanState(
    false,
    '智慧選股掃描',
    cached?'資料來源暫時失敗，已保留上次結果':'掃描暫時失敗，請稍後再試'
  );
  setInlineScanMessage(
    cached
      ? `資料來源暫時失敗，已保留上次掃描結果：${err.message}`
      : `智慧選股掃描暫時失敗：${err.message}`,
    'error'
  );
 }
}

function getSelectedTechFilters(){
 return getVisibleTechInputs().filter(x=>x.checked).map(x=>x.value);
}

function updateTechMultiLabel(){
 const selected=getSelectedTechFilters();
 const text=document.getElementById('techMultiText');
 const count=document.getElementById('techSelectedCount');
 if(text){
  if(selected.length===0)text.textContent=scanDirection==='bull'?'多方全部條件':'空方全部條件';
  else if(selected.length===1){
   const input=document.querySelector(`#techMultiMenu input[value="${selected[0]}"]`);
   text.textContent=input?.closest('label')?.querySelector('span')?.textContent||'已選 1 個條件';
  }else text.textContent=`已選 ${selected.length} 個條件`;
 }
 if(count)count.textContent=`已選 ${selected.length} 個條件`;
}

function closeTechMultiSelect(){
 const menu=document.getElementById('techMultiMenu');
 const trigger=document.getElementById('techMultiTrigger');
 menu?.classList.remove('open');
 trigger?.setAttribute('aria-expanded','false');
}

function initTechMultiSelect(){
 const trigger=document.getElementById('techMultiTrigger');
 const menu=document.getElementById('techMultiMenu');
 if(!trigger||!menu)return;

 trigger.addEventListener('click',e=>{
  e.stopPropagation();
  const open=menu.classList.toggle('open');
  trigger.setAttribute('aria-expanded',open?'true':'false');
 });

 menu.addEventListener('click',e=>e.stopPropagation());

 menu.querySelectorAll('input[type="checkbox"]').forEach(input=>{
  input.addEventListener('change',()=>{
   updateTechMultiLabel();
   renderResults();
  });
 });

 document.getElementById('techSelectAll')?.addEventListener('click',()=>{
  getVisibleTechInputs().forEach(x=>x.checked=true);
  updateTechMultiLabel();
  renderResults();
 });

 document.getElementById('techClearAll')?.addEventListener('click',()=>{
  menu.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
  updateTechMultiLabel();
  renderResults();
 });

 document.addEventListener('click',closeTechMultiSelect);
 updateTechMultiLabel();
}

function filteredResults(){
 const q=$('#search')?.value.trim()||'';
 const market=$('#marketFilter')?.value||'all';
 const techs=getSelectedTechFilters();
 const sort=$('#sortMode')?.value||'score_desc';

 let a=results.filter(x=>{
  if(q && !x.code.includes(q) && !x.name.includes(q)) return false;
  if(market!=='all' && x.market!==market) return false;

  const signal=getSignal(x);
  const close=Number(x.close||0);
  const ema100=Number(x.EMA100||0);
  const macd=Number(x.MACD||0);
  const macdSignal=Number(x.MACDSignal||0);
  const k=Number(x.K||0);
  const d=Number(x.D||0);
  const rsi=Number(x.RSI||0);
  const change=Number(x.change||0);
  const checks={
   macd_gold:()=>Boolean(x.MACDGoldenCross)||macd>macdSignal||hasReason(x,'MACD 柱翻正')||hasReason(x,'MACD 黃金交叉'),
   kd_gold:()=>k>d||hasReason(x,'KD 黃金交叉'),
   rsi_up:()=>rsi>=50||hasReason(x,'RSI 向上'),
   volume_up:()=>Number(x.volumeRatio)>=1.2&&change>=0,
   ma_bull:()=>Boolean(x.aboveEMA100)||hasReason(x,'站上均線')||hasReason(x,'站上短期均線')||hasReason(x,'站上中期均線'),
   above_ema100:()=>Boolean(x.aboveEMA100)||(ema100>0&&close>ema100),
   ema100_rising:()=>Boolean(x.EMA100Rising),
   ema100_macd:()=>Boolean(x.EMA100MACDStrategy),
   buy:()=>signal.type==='buy',

   macd_bear:()=>macd<macdSignal||macd<0||hasReason(x,'MACD 柱體為負')||hasReason(x,'MACD 動能轉弱'),
   kd_bear:()=>k<d,
   rsi_down:()=>rsi>0&&rsi<50,
   volume_down:()=>Number(x.volumeRatio)>=1.2&&change<0,
   ma_bear:()=>Boolean(ema100>0&&close<ema100)||!Boolean(x.aboveEMA100),
   below_ema100:()=>Boolean(ema100>0&&close<ema100)||!Boolean(x.aboveEMA100),
   ema100_falling:()=>x.EMA100Rising===false,
   ema100_macd_bear:()=>Boolean(ema100>0&&close<ema100&&macd<macdSignal),
   sell:()=>signal.type==='sell'
  };

  if(techs.length){
   const matched=techs.map(key=>Boolean(checks[key]?.()));
   if(techMatchMode==='all' && !matched.every(Boolean)) return false;
   if(techMatchMode==='any' && !matched.some(Boolean)) return false;
  }else{
   if(scanDirection==='bull' && signal.type==='sell') return false;
   if(scanDirection==='bear' && signal.type==='buy') return false;
  }
  return true;
 });

 a.sort((x,y)=>{
  if(sort==='score_asc') return Number(x.aiScore)-Number(y.aiScore);
  if(sort==='code') return String(x.code).localeCompare(String(y.code));
  if(sort==='volume') return Number(y.volumeRatio||0)-Number(x.volumeRatio||0);
  return Number(y.aiScore)-Number(x.aiScore);
 });
 return a;
}

function renderResults(){
 const a=filteredResults();
 const holder=$('#resultRows');

 holder.innerHTML=a.map((x,idx)=>{
  const signal=getSignal(x);
  const hint=getVolumeHint(x);
  const ai=Number(x.aiScore??x.score??0);
  const institutional=Number(x.institutionalNet??0);

  return `<article class="pro-stock-row row-${signal.type}">
    <button class="pro-stock-name" onclick="openStockDetailByCode('${x.code}')" type="button">
      <b>${x.code}</b>
      <span>${x.name}</span>
      <small>${x.market==='TPEx'?'上櫃':'上市'}</small>
      ${x.EMA100MACDStrategy?'<em class="strategy-badge">EMA100策略</em>':''}
    </button>

    <div class="pro-close"><b>${x.close??'-'}</b>${formatPriceChange(x)}</div>

    <div class="pro-signal signal-${signal.type}">
      <span class="pro-signal-icon">${signal.icon}</span>
      <small>${signal.label}</small>
    </div>

    <div class="pro-ai signal-text-${signal.type}">${ai}</div>

    <div class="pro-flow">
      <span>法人 <b class="${institutional>0?'flow-buy':institutional<0?'flow-sell':''}">${formatShares(institutional,Boolean(x.institutionalAvailable))}</b></span>
      <span>主力 <b>${x.mainForceScore??'-'}</b></span>
    </div>
  </article>`;
 }).join('');

 $('#empty').style.display=a.length?'none':'block';
 $('#watchCount').textContent=new Set(Object.values(groups).flat()).size;
}
function formatShares(v, available=true){
 if(!available)return '待更新';
 const n=Number(v||0);
 const lots=n/1000;
 if(Math.abs(lots)>=10000)return `${(lots/10000).toFixed(1)}萬張`;
 if(Math.abs(lots)>=1)return `${lots>0?'+':''}${Math.round(lots).toLocaleString()}張`;
 return `${n>0?'+':''}${Math.round(n).toLocaleString()}股`;
}
function labelPeriod(p){return p==='day'?'日線':p==='week'?'週線':'月線'}

window.chooseGroup=code=>{
 pendingCode=code;
 const current=groupOfCode(code);
 $('#groupDialogTitle').textContent=current?'管理自選股':'選擇自選分類';
 $('#groupDialogHint').textContent=current?`目前位於「${current}」，可移動至其他分類或移除。`:'請選擇要加入的分類。';
 $('#groupChoices').innerHTML=Object.keys(groups).map(g=>
   `<button class="${g===current?'active':''}" onclick="addToGroup('${escapeQuote(g)}')">${g}${g===current?'（目前）':''}</button>`
 ).join('');
 $('#removeAllWatch').style.display=current?'block':'none';
 $('#groupDialog').showModal();
}
function escapeQuote(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
window.addToGroup=g=>{
 Object.keys(groups).forEach(k=>groups[k]=groups[k].filter(x=>x!==pendingCode));
 if(!groups[g].includes(pendingCode)) groups[g].push(pendingCode);
 saveGroups();$('#groupDialog').close();
}
$('#removeAllWatch').onclick=()=>{
 if(!pendingCode)return;
 openConfirm('移除自選股',`確定將 ${pendingCode} 從所有自選分類移除？`,()=>{
  Object.keys(groups).forEach(k=>groups[k]=groups[k].filter(x=>x!==pendingCode));
  saveGroups();$('#groupDialog').close();
 });
}

function renderGroups(){
 if(!groups[currentGroup]) currentGroup=Object.keys(groups)[0];
 $('#groups').innerHTML=Object.keys(groups).map(g=>
  `<button class="group-tab ${g===currentGroup?'active':''}" onclick="setGroup('${escapeQuote(g)}')">
    ${g} <span class="group-count">(${groups[g].length})</span>
  </button>`
 ).join('');
}
window.setGroup=g=>{currentGroup=g;renderGroups();renderWatch()}
function renderWatch(){
 const codes=groups[currentGroup]||[];
 $('#watchCards').innerHTML=codes.length?codes.map(code=>{
  let x=results.find(v=>v.code===code),u=universe.find(v=>v.code===code);
  const name=x?.name||u?.name||code;
  return `<article class="watch-card">
   <button class="remove-stock" title="移除自選股" onclick="removeWatch('${code}')">×</button>
   <button class="watch-stock-open watch-analyze-btn" type="button" data-watch-analyze="${code}" onclick="openWatchStockAnalysis('${code}',this)">
    <h3>${name} ${code}</h3>
    <p>${x?`${labelPeriod(x.period)}｜AI ${x.aiScore??x.score}｜收盤 ${x.close}`:'點擊立即進行完整 AI 分析'}</p><span class="watch-click-status"></span>
   </button>
   <div class="watch-actions">
    <button class="move-stock" onclick="chooseGroup('${code}')">移動分類</button>
    <button class="danger" onclick="removeWatch('${code}')">刪除此股票</button>
   </div>
  </article>`;
 }).join(''):'<p id="empty">此分類尚無股票</p>';
 $('#watchCount').textContent=new Set(Object.values(groups).flat()).size;
}
window.removeWatch=code=>{
 const name=(results.find(v=>v.code===code)||universe.find(v=>v.code===code))?.name||code;
 openConfirm('刪除自選股',`確定從「${currentGroup}」移除 ${name} ${code}？`,()=>{
  groups[currentGroup]=groups[currentGroup].filter(x=>x!==code);
  saveGroups();
 });
}

$('#addGroup').onclick=()=>{
 let g=prompt('輸入新分類名稱，例如：金融股、AI、長期投資');
 g=g&&g.trim();
 if(!g)return;
 if(groups[g]){alert('分類名稱已存在');return}
 groups[g]=[];currentGroup=g;saveGroups();
}
$('#renameGroup').onclick=()=>{
 if(!currentGroup)return;
 let g=prompt('輸入新的分類名稱',currentGroup);
 g=g&&g.trim();
 if(!g||g===currentGroup)return;
 if(groups[g]){alert('分類名稱已存在');return}
 const old=currentGroup;
 groups[g]=groups[old];
 delete groups[old];
 currentGroup=g;saveGroups();
}
$('#deleteGroup').onclick=()=>{
 const names=Object.keys(groups);
 if(names.length<=1){alert('至少要保留一個自選股分類');return}
 const count=(groups[currentGroup]||[]).length;
 openConfirm('刪除分類',`確定刪除「${currentGroup}」？分類內 ${count} 檔股票也會一併移除。`,()=>{
  delete groups[currentGroup];
  currentGroup=Object.keys(groups)[0];
  saveGroups();
 });
}

function openConfirm(title,text,action){
 pendingConfirm=action;
 $('#confirmTitle').textContent=title;
 $('#confirmText').textContent=text;
 $('#confirmDialog').showModal();
}
$('#confirmYes').onclick=()=>{
 const action=pendingConfirm;pendingConfirm=null;
 $('#confirmDialog').close();
 if(action)action();
}
$('#confirmNo').onclick=()=>{pendingConfirm=null;$('#confirmDialog').close()}


async function analyzeSingleStock(code, selectedPeriod=singlePeriod){
 code=String(code||'').trim();
 if(!/^\d{4}$/.test(code)){
  try{
   const rows=await searchStocks(code);
   if(!rows.length){
    alert('找不到符合的股票，請輸入代號或中文名稱');
    return null;
   }
   code=rows[0].code;
   if(document.getElementById('singleCode'))document.getElementById('singleCode').value=code;
  }catch(e){
   alert(e.message);
   return null;
  }
 }
 $('#singleStatus').textContent='分析中…';
 $('#analyzeSingle').disabled=true;
 try{
  const d=await fetchJsonSafe(`/api/stock/${code}?period=${selectedPeriod}`);
  if(d.ok===false) throw Error(d.error||'分析失敗');
  singleResult=d.result;
  renderSingleResult(singleResult);
  $('#singleStatus').textContent=`${singleResult.name} ${singleResult.code}｜${labelPeriod(singleResult.period)}分析完成`;
  return singleResult;
 }catch(e){
  $('#singleResultCard').style.display='none';
  $('#singleStatus').textContent=`分析失敗：${e.message}`;
  alert(`分析失敗：${e.message}`);
  return null;
 }finally{
  $('#analyzeSingle').disabled=false;
 }
}
function renderSingleResult(x){
 $('#singleResultCard').style.display='block';
 $('#singleTitle').textContent=`${x.name} ${x.code}｜${x.market||''}｜${labelPeriod(x.period)}`;
 $('#sAi').textContent=x.aiScore??x.score??'-';
 $('#sTech').textContent=x.technicalScore??'-';
 $('#sInst').textContent=x.institutionalScore??'-';
 $('#sMain').textContent=x.mainForceScore??'-';
 $('#sClose').textContent=x.close??'-';
 $('#sKD').textContent=`${x.K??'-'} / ${x.D??'-'}`;
 $('#sRSI').textContent=x.RSI??'-';
 $('#sMACD').textContent=x.MACD??'-';
 $('#sVR').textContent=x.volumeRatio??'-';
 if($('#singleAiScore')) $('#singleAiScore').textContent=x.aiScore??x.score??'-';
 if($('#singleAiLabel')) $('#singleAiLabel').textContent=aiLabelFromScore(x.aiScore??x.score);
 if($('#singleAiExplanation')){
  const reasons=(x.technicalReasons||[]).slice(0,4);
  $('#singleAiExplanation').textContent=reasons.length?reasons.join('、'):'目前沒有足夠的加分條件';
 }
 if($('#sEMA100')) $('#sEMA100').textContent=x.EMA100??'-';
 if($('#sEMA100Strategy')) $('#sEMA100Strategy').textContent=x.EMA100MACDStrategy?'成立':'未成立';
 const singleSignal=getSignal(x);
 $('#sStatus').innerHTML=`<span class="single-signal signal-${singleSignal.type}">${singleSignal.icon?singleSignal.icon+' ':''}${singleSignal.label}</span>`;
 $('#sTechReasons').innerHTML=(x.technicalReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>無</li>';
 $('#sInstReasons').innerHTML=(x.institutionalReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>無</li>';
 $('#sMainReasons').innerHTML=(x.mainForceReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>無</li>';
}
$('#analyzeSingle').onclick=()=>analyzeSingleStock($('#singleCode').value);
document.querySelectorAll('.single-period').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.single-period').forEach(x=>x.classList.remove('active'));
 b.classList.add('active');
 singlePeriod=b.dataset.singlePeriod;
 if($('#singleCode').value.trim()) analyzeSingleStock($('#singleCode').value);
});
$('#singleAddWatch').onclick=()=>{
 if(!singleResult)return;
 chooseGroup(singleResult.code);
};
$('#manualAnalyzeAdd').onclick=async()=>{
 const code=$('#manualWatchCode').value.trim();
 const result=await analyzeSingleStock(code,singlePeriod);
 if(result){
  document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-p="singlePanel"]').classList.add('active');
  $('#singlePanel').classList.add('active');
  chooseGroup(result.code);
 }
};

document.getElementById('smartScanBtn')?.addEventListener('click',smartScan);
document.querySelectorAll('.direction-btn').forEach(btn=>btn.addEventListener('click',()=>{
 scanDirection=btn.dataset.direction||'bull';
 updateDirectionUI();
}));
document.querySelectorAll('.match-mode-btn').forEach(btn=>btn.addEventListener('click',()=>{
 techMatchMode=btn.dataset.matchMode||'any';
 updateMatchModeUI();
}));
$('#prev').onclick=()=>{if(page>0){page--;scanPage().catch(e=>setInlineScanMessage(e.message,'error'))}};
$('#next').onclick=()=>{
 const market=document.getElementById('marketFilter')?.value||'all';
 const total=selectedMarketUniverse().length;
 if((page+1)*pageSize<total){
  page++;
  scanPage().catch(e=>setInlineScanMessage(e.message,'error'));
 }
};
$('#search').oninput=renderResults;
document.querySelectorAll('.period').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));
 b.classList.add('active');period=b.dataset.period;page=0;results=[];renderResults();
 $('#progressText').textContent=`已切換${labelPeriod(period)}，請開始掃描`;
});
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));
 b.classList.add('active');
 const panel=$('#'+b.dataset.p);
 if(panel)panel.classList.add('active');
 if(b.dataset.p==='twseSectorsPanel')loadSectors('TWSE');
 if(b.dataset.p==='tpexSectorsPanel')loadSectors('TPEx');
});
fetch('/api/health').then(r=>r.json()).then(()=>$('#health').textContent='雲端正常').catch(()=>$('#health').textContent='連線異常');
renderGroups();renderWatch();renderResults();

if(universe.length){
 $('#total').textContent=universe.length;
 const last=localStorage.getItem('v63-last-sync');
 $('#progressText').textContent=`已載入 ${universe.length} 檔股票名單${last?'｜上次同步 '+new Date(last).toLocaleString():''}`;
}




function renderStrengthLamps(selector, strength, type){
 const holder=document.querySelector(selector);
 if(!holder)return;
 const level=Math.max(0,Math.min(5,Number(strength||0)));
 holder.innerHTML=Array.from({length:5},(_,i)=>
  `<span class="strength-lamp ${i<level?'on':''} ${type}"></span>`
 ).join('');
}

function drawEMA100Chart(stock){
 const canvas=document.getElementById('emaSignalChart');
 if(!canvas)return;

 const raw=Array.isArray(stock?.emaChart)?stock.emaChart:[];
 const points=raw.filter(x=>Number.isFinite(Number(x.close)) && Number.isFinite(Number(x.ema100)));
 const wrap=canvas.parentElement;
 const width=Math.max(280,wrap?.clientWidth||320);
 const height=240;
 const ratio=Math.min(window.devicePixelRatio||1,2);

 canvas.width=Math.round(width*ratio);
 canvas.height=Math.round(height*ratio);
 canvas.style.width=`${width}px`;
 canvas.style.height=`${height}px`;

 const ctx=canvas.getContext('2d');
 ctx.setTransform(ratio,0,0,ratio,0,0);
 ctx.clearRect(0,0,width,height);

 if(points.length<2){
  ctx.fillStyle='#9fb0c5';
  ctx.font='14px sans-serif';
  ctx.textAlign='center';
  ctx.fillText('EMA100 圖形資料不足',width/2,height/2);
  return;
 }

 const pad={left:48,right:16,top:20,bottom:32};
 const values=points.flatMap(p=>[Number(p.close),Number(p.ema100)]);
 let min=Math.min(...values),max=Math.max(...values);
 const spread=Math.max(max-min,max*0.02,1);
 min-=spread*0.12;
 max+=spread*0.12;

 const x=i=>pad.left+(i/(points.length-1))*(width-pad.left-pad.right);
 const y=value=>pad.top+(max-value)/(max-min)*(height-pad.top-pad.bottom);

 ctx.strokeStyle='rgba(130,160,190,.18)';
 ctx.lineWidth=1;
 ctx.fillStyle='#8ca2ba';
 ctx.font='11px sans-serif';
 ctx.textAlign='right';

 for(let n=0;n<=4;n++){
  const yy=pad.top+n*(height-pad.top-pad.bottom)/4;
  const val=max-n*(max-min)/4;
  ctx.beginPath();
  ctx.moveTo(pad.left,yy);
  ctx.lineTo(width-pad.right,yy);
  ctx.stroke();
  ctx.fillText(val.toFixed(2),pad.left-7,yy+4);
 }

 const drawLine=(key,stroke,lineWidth)=>{
  ctx.beginPath();
  points.forEach((p,i)=>{
   const px=x(i),py=y(Number(p[key]));
   if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  });
  ctx.strokeStyle=stroke;
  ctx.lineWidth=lineWidth;
  ctx.lineJoin='round';
  ctx.lineCap='round';
  ctx.stroke();
 };

 drawLine('ema100','#ffb84d',2.2);
 drawLine('close','#27c8ff',2.6);

 const last=points[points.length-1];
 const lastX=x(points.length-1);
 const closeY=y(Number(last.close));
 const emaY=y(Number(last.ema100));

 ctx.fillStyle='#27c8ff';
 ctx.beginPath();ctx.arc(lastX,closeY,4.5,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#ffb84d';
 ctx.beginPath();ctx.arc(lastX,emaY,4,0,Math.PI*2);ctx.fill();

 ctx.textAlign='right';
 ctx.font='bold 11px sans-serif';
 ctx.fillStyle='#27c8ff';
 ctx.fillText(`價 ${Number(last.close).toFixed(2)}`,lastX-7,closeY-8);
 ctx.fillStyle='#ffb84d';
 ctx.fillText(`EMA ${Number(last.ema100).toFixed(2)}`,lastX-7,emaY+16);

 const firstDate=String(points[0].date||'');
 const lastDate=String(last.date||'');
 ctx.fillStyle='#8ca2ba';
 ctx.font='10px sans-serif';
 ctx.textAlign='left';
 ctx.fillText(firstDate,pad.left,height-10);
 ctx.textAlign='right';
 ctx.fillText(lastDate,width-pad.right,height-10);
}

function renderEMA100Signal(stock){
 const price=Number(stock?.close);
 const ema=Number(stock?.EMA100);
 const distance=Number(stock?.EMADistancePct);
 const above=Boolean(stock?.aboveEMA100);
 const rising=Boolean(stock?.EMA100Rising);
 const bull=Number(stock?.bullStrength||0);
 const bear=Number(stock?.bearStrength||0);

 const priceEl=document.getElementById('emaCurrentPrice');
 const emaEl=document.getElementById('emaCurrentValue');
 const distanceEl=document.getElementById('emaDistance');
 const directionEl=document.getElementById('emaDirection');
 const badge=document.getElementById('emaPositionBadge');

 if(priceEl)priceEl.textContent=Number.isFinite(price)?price.toFixed(2):'-';
 if(emaEl)emaEl.textContent=Number.isFinite(ema)?ema.toFixed(2):'-';
 if(distanceEl){
  distanceEl.textContent=Number.isFinite(distance)?`${distance>=0?'+':''}${distance.toFixed(2)}%`:'-';
  distanceEl.className=distance>0?'flow-buy':distance<0?'flow-sell':'';
 }
 if(directionEl)directionEl.textContent=rising?'上彎':'走平／下彎';

 if(badge){
  badge.textContent=above?'多方區':'空方區';
  badge.className=`ema-position ${above?'bull':'bear'}`;
 }

 const bullText=document.getElementById('bullStrengthText');
 const bearText=document.getElementById('bearStrengthText');
 if(bullText)bullText.textContent=`${bull}／5`;
 if(bearText)bearText.textContent=`${bear}／5`;
 renderStrengthLamps('#bullStrengthLamps',bull,'bull');
 renderStrengthLamps('#bearStrengthLamps',bear,'bear');

 const reasons=document.getElementById('detailEMAReasons');
 if(reasons){
  reasons.innerHTML=(stock?.emaSignalReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>暫無足夠訊號</li>';
 }

 requestAnimationFrame(()=>drawEMA100Chart(stock));
}


let detailStock=null;

window.openStockDetailByCode=function(code){
 const x=results.find(v=>v.code===code)||allScannedResults.find(v=>v.code===code);
 if(!x)return;

 detailStock=x;
 const signal=getSignal(x);
 const hint=getVolumeHint(x);

 $('#detailTitle').textContent=`${x.code} ${x.name}`;
 $('#detailMarket').textContent=`${x.market||''}｜${labelPeriod(x.period)}｜${x.date||''}`;
 $('#detailAi').textContent=x.aiScore??x.score??'-';
 $('#detailClose').textContent=x.close??'-';
 $('#detailTech').textContent=x.technicalScore??'-';
 $('#detailInst').textContent=x.institutionalScore??'-';
 $('#detailMain').textContent=x.mainForceScore??'-';

 setFlowValue('#detailInstNet',x.institutionalNet);
 setFlowValue('#detailForeign',x.foreignNet);
 setFlowValue('#detailTrust',x.trustNet);
 setFlowValue('#detailDealer',x.dealerNet);

 $('#detailKD').textContent=`${x.K??'-'} / ${x.D??'-'}`;
 $('#detailRSI').textContent=x.RSI??'-';
 $('#detailMACD').textContent=x.MACD??'-';
 $('#detailVR').textContent=x.volumeRatio??'-';
 if($('#detailEMA100')) $('#detailEMA100').textContent=x.EMA100??'-';
 if($('#detailEMA100Strategy')) $('#detailEMA100Strategy').textContent=x.EMA100MACDStrategy?'成立':'未成立';
 renderEMA100Signal(x);

 $('#detailSignal').className=`big-signal signal-${signal.type}`;
 $('#detailSignal').innerHTML=`<span class="signal-circle">${signal.icon}</span><b>${signal.label}</b>`;

 $('#detailVolume').className=`volume-alert hint-${hint.type}`;
 $('#detailVolume').innerHTML=`<span class="volume-bars"><i></i><i></i><i></i></span><strong>${hint.text}</strong>`;

 $('#detailTechReasons').innerHTML=(x.technicalReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>無</li>';
 $('#detailInstReasons').innerHTML=(x.institutionalReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>目前沒有法人加減分資料</li>';
 $('#detailMainReasons').innerHTML=(x.mainForceReasons||[]).map(v=>`<li>${v}</li>`).join('')||'<li>無</li>';

 $('#detailAddWatch').textContent=inWatch(x.code)?'管理自選股':'加入自選股';

 document.querySelectorAll('.reason-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
 document.querySelectorAll('.reason-panel').forEach((p,i)=>p.classList.toggle('active',i===0));

 const overlay=$('#detailOverlay');
 overlay.classList.add('open');
 window.switchReasonTab('tech');
 overlay.setAttribute('aria-hidden','false');
 document.body.classList.add('modal-open');
}

window.closeStockDetail=function(){
 const overlay=$('#detailOverlay');
 overlay.classList.remove('open');
 overlay.setAttribute('aria-hidden','true');
 document.body.classList.remove('modal-open');
}

function setFlowValue(selector,value){
 const el=$(selector);
 const n=Number(value||0);
 el.textContent=formatShares(n);
 el.className=n>0?'flow-buy':n<0?'flow-sell':'';
}

$('#closeDetail').onclick=closeStockDetail;
$('#closeDetail').addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();closeStockDetail();},{passive:false});
$('#closeDetail').addEventListener('pointerup',e=>{e.preventDefault();e.stopPropagation();closeStockDetail();});
$('#detailOverlay').addEventListener('click',e=>{
 if(e.target===$('#detailOverlay')) closeStockDetail();
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape') closeStockDetail();
});
$('#detailAddWatch').addEventListener('click',()=>{
 if(!detailStock)return;
 closeStockDetail();
 chooseGroup(detailStock.code);
});



function renderRanking(){
 const holder=$('#rankingList');
 if(!holder)return;

 const selectedDate=document.getElementById('rankingDate')?.value||'latest';
 const ranked=selectedRankingRows()
  .sort((a,b)=>Number(b.aiScore??b.score??0)-Number(a.aiScore??a.score??0))
  .slice(0,30);

 holder.innerHTML=ranked.length?ranked.map((x,i)=>{
  const signal=getSignal(x);
  const score=Number(x.aiScore??x.score??0);
  const previous=rankingPreviousScore(x.code,selectedDate);
  const delta=previous===null?null:score-previous;
  const isNew=previous===null;
  const hot=rankingStreak(x.code,score);
  const changeText=isNew?'NEW':`${delta>0?'+':''}${delta}`;
  const changeClass=isNew?'rank-new':delta>0?'rank-rise':delta<0?'rank-fall':'rank-flat';
  return `<button class="ranking-row rank-${signal.type}" onclick="openStockDetailByCode('${x.code}')" type="button">
    <strong class="rank-no">${i+1}</strong>
    <span class="rank-stock">
      <b>${x.code} ${x.name}</b>
      <small>${x.market==='TPEx'?'上櫃':'上市'}｜${labelPeriod(x.period)}</small>
      <span class="rank-badges">${isNew?'<i class="badge-new">NEW</i>':''}${hot?'<i class="badge-hot">HOT</i>':''}</span>
    </span>
    <span class="rank-price"><b>${x.close??'-'}</b>${formatPriceChange(x)}</span>
    <strong class="rank-score">${score}</strong>
    <span class="rank-delta ${changeClass}">${changeText}</span>
  </button>`;
 }).join(''):'<p class="ranking-empty">尚無排行榜資料。完成 AI 掃描、單股分析或自選股分析後，會自動建立今日排行榜紀錄。</p>';
}

document.getElementById('sortMode')?.addEventListener('change',renderResults);
const marketFilter=document.getElementById('marketFilter');
if(marketFilter){
 marketFilter.addEventListener('change',()=>{
  page=0;
  results=[];
  renderResults();
  renderRanking();
  updateMarketCounters(0);
  const label=marketFilter.value==='TPEx'?'上櫃':
              marketFilter.value==='TWSE'?'上市':'上市＋上櫃';
  document.getElementById('progressText').textContent=`已切換${label}，共 ${selectedMarketUniverse().length.toLocaleString()} 檔，請按開始 AI 掃描`;
 });
}
$('#refreshRanking')?.addEventListener('click',()=>{
 allScannedResults=safeLoadRanking();
 renderRanking();
});
renderRanking();

async function refreshInstitutionalStatus(){
 const el=$('#institutionalStatus');
 if(!el)return;
 try{
  const r=await fetch('/api/institutional/status');
  const d=await r.json();
  if(!r.ok)throw Error(d.error||'法人資料狀態讀取失敗');
  const total=Number(d.records||0);
  const twse=Number(d.twseCount||0);
  const tpex=Number(d.tpexCount||0);
  el.textContent=`法人資料：官方 ${total.toLocaleString()} 檔（上市 ${twse}／上櫃 ${tpex}）`;
  el.className=total>0?'official-status ok':'official-status warn';
 }catch(e){
  el.textContent='法人資料：暫時無法取得';
  el.className='official-status warn';
 }
}
refreshInstitutionalStatus();








let emaChartResizeTimer=null;
window.addEventListener('resize',()=>{
 clearTimeout(emaChartResizeTimer);
 emaChartResizeTimer=setTimeout(()=>{
  if(detailStock && document.getElementById('detailOverlay')?.classList.contains('open')){
   drawEMA100Chart(detailStock);
  }
 },120);
});

window.openWatchStockAnalysis=async function(code,button=null){
 const btn=button||document.querySelector(`[data-watch-analyze="${code}"]`);
 if(btn?.dataset.busy==='1')return;
 const status=btn?.querySelector('.watch-click-status');
 if(btn){
  btn.dataset.busy='1';
  btn.classList.remove('done','failed');
  btn.classList.add('analyzing');
  if(status)status.innerHTML='<span class="mini-spinner"></span>分析中…';
 }
 try{
  let stock=results.find(v=>v.code===code)||allScannedResults.find(v=>v.code===code);
  if(!stock){
   stock=await analyzeSingleStock(code,singlePeriod);
   if(!stock)throw new Error('分析失敗');
   mergeRankingRows([stock]);
   if(!results.some(x=>x.code===stock.code))results.push(stock);
   renderRanking();
  }
  if(btn){
   btn.classList.remove('analyzing');
   btn.classList.add('done');
   if(status)status.textContent='✓ 已完成，開啟分析';
  }
  setTimeout(()=>{
   if(btn){btn.dataset.busy='0';btn.disabled=false;}
   openStockDetailByCode(stock.code);
  },320);
 }catch(e){
  if(btn){
   btn.dataset.busy='0';
   btn.disabled=false;
   btn.classList.remove('analyzing','done');
   btn.classList.add('failed');
   if(status)status.textContent='分析失敗，點擊重試';
   setTimeout(()=>btn.classList.remove('failed'),1600);
  }
 }
};
bindStockAutocomplete('#singleCode','#singleSuggestions',row=>{
 const status=document.getElementById('singleStatus');
 if(status)status.textContent=`已選擇 ${row.code} ${row.name}（${row.market==='TPEx'?'上櫃':'上市'}）`;
});
bindStockAutocomplete('#manualWatchCode','#watchSuggestions',row=>{
 const input=document.getElementById('manualWatchCode');
 if(input)input.value=row.code;
});
document.addEventListener('click',e=>{
 if(!e.target.closest('.stock-search-wrap')){
  document.querySelectorAll('.stock-suggestions').forEach(x=>x.classList.remove('open'));
 }
});

document.querySelectorAll('.sector-refresh').forEach(btn=>btn.addEventListener('click',()=>loadSectors(btn.dataset.market)));

renderRankingDateOptions();
document.getElementById('rankingDate')?.addEventListener('change',renderRanking);
document.getElementById('clearRankingHistory')?.addEventListener('click',()=>{
 if(!confirm('確定清除排行榜歷史紀錄？'))return;
 localStorage.removeItem('v85-ranking-history');
 localStorage.removeItem('v85-ranking');
 allScannedResults=[];
 renderRankingDateOptions();
 renderRanking();
});
saveDailyRankingSnapshot();
renderRanking();


let activeSectorByMarket={TWSE:'',TPEx:''};
let sectorSortByMarket={TWSE:'up',TPEx:'up'};

function sectorMemberRowHtml(x,index){
 const pct=Number(x.changePct||0);
 const ch=Number(x.change||0);
 const cls=pct>0?'price-up':pct<0?'price-down':'price-flat';
 const symbol=pct>0?'▲':pct<0?'▼':'－';
 const inst=Number(x.institutional||0);
 const main=Number(x.mainForce||0);
 return `<button class="sector-member-row" type="button" onclick="analyzeSingleStock('${x.code}','day').then(()=>openStockDetailByCode('${x.code}'))">
   <span class="sector-rank">${index+1}</span>
   <span class="sector-stock"><b>${x.code}</b><strong>${x.name}</strong><small>${x.market==='TPEx'?'上櫃':'上市'}</small></span>
   <span class="sector-data-card sector-close-card"><small>收盤價</small><b>${x.close??'-'}</b></span>
   <span class="sector-data-card sector-change-card ${cls}"><small>漲跌</small><b>${symbol} ${Math.abs(ch).toFixed(2)}</b><em>${Math.abs(pct).toFixed(2)}%</em></span>
   <span class="sector-data-card sector-ai-card"><small>AI 總分</small><b>${Number(x.aiScore||0)}</b></span>
   <span class="sector-data-card sector-flow-card"><small>法人／主力</small><b class="${inst>=0?'price-up':'price-down'}">法人 ${inst>=0?'+':''}${inst}</b><em>主力 ${main}</em></span>
   <span class="sector-arrow">›</span>
 </button>`;
}

async function loadSectorMembers(market){
 const holder=document.getElementById(market==='TWSE'?'twseSectorMembers':'tpexSectorMembers');
 if(!holder)return;
 holder.innerHTML='<div class="sector-loading">載入成分股中…</div>';
 const sector=activeSectorByMarket[market]||'';
 const sort=sectorSortByMarket[market]||'up';
 try{
  const d=await fetchJsonSafe(`/api/sector-members?market=${market}&sector=${encodeURIComponent(sector)}&sort=${sort}`);
  const rows=Array.isArray(d.results)?d.results:[];
  holder.innerHTML=rows.length?rows.map(sectorMemberRowHtml).join(''):'<div class="sector-loading">目前沒有資料</div>';
 }catch(e){
  holder.innerHTML=`<div class="sector-loading">${e.message}</div>`;
 }
}

document.addEventListener('click',e=>{
 const card=e.target.closest('.sector-card');
 if(card){
  const panel=card.closest('#twseSectorsPanel,#tpexSectorsPanel');
  const market=panel?.id==='tpexSectorsPanel'?'TPEx':'TWSE';
  const title=card.querySelector('h3')?.textContent||'';
  activeSectorByMarket[market]=title.replace(/（.*?）/g,'').trim();
  panel.querySelectorAll('.sector-card').forEach(x=>x.classList.toggle('selected',x===card));
  loadSectorMembers(market);
 }
 const sortBtn=e.target.closest('.sector-sort');
 if(sortBtn){
  const panel=sortBtn.closest('#twseSectorsPanel,#tpexSectorsPanel');
  const market=panel?.id==='tpexSectorsPanel'?'TPEx':'TWSE';
  sectorSortByMarket[market]=sortBtn.dataset.sort||'up';
  panel.querySelectorAll('.sector-sort').forEach(x=>x.classList.toggle('active',x===sortBtn));
  loadSectorMembers(market);
 }
});

function warnIfTpexMissing(){
 const market=document.getElementById('marketFilter')?.value||'all';
 const tpexCount=universe.filter(x=>x.market==='TPEx').length;
 if(market==='TPEx' && tpexCount===0){
  const el=document.getElementById('progressText');
  if(el)el.textContent='上櫃名單暫時未取得，請先按「同步股票名單」重試';
 }
}
document.getElementById('marketFilter')?.addEventListener('change',warnIfTpexMissing);

document.addEventListener('DOMContentLoaded',initTechMultiSelect);

updateDirectionUI();
updateMatchModeUI();
