const $=s=>document.querySelector(s);
async function readJsonResponse(r){
 const text=await r.text();
 try{return JSON.parse(text)}catch(e){
  const message=text.trim().startsWith('<')
   ? `伺服器暫時回傳網頁錯誤（HTTP ${r.status}），請稍後重試`
   : `資料格式錯誤（HTTP ${r.status}）`;
  throw new Error(message);
 }
}
let universe=safeLoadUniverse(),results=[],allScannedResults=[],period='day',page=0,pageSize=12,pendingCode=null,pendingConfirm=null,singlePeriod='day',singleResult=null;
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
async function syncUniverse(){
 $('#progressText').textContent='同步股票名單中…';
 const r=await fetch('/api/universe'),d=await readJsonResponse(r);
 if(!r.ok) throw Error(d.error||'同步失敗');
 universe=d;
localStorage.setItem('v63-universe',JSON.stringify(d));
localStorage.setItem('v63-last-sync',new Date().toISOString());
page=0;
$('#total').textContent=d.length;
$('#progressText').textContent=`已同步 ${d.length} 檔上市＋上櫃股票`;
 renderWatch();
}
async function scanPage(){
 if(!universe.length) await syncUniverse();
 $('#scanBtn').disabled=true;
 $('#progressText').textContent='AI 掃描中…';
 $('#progress').value=15;
 $('#empty').textContent='正在取得歷史行情、法人與主力代理指標…';
 try{
  const r=await fetch('/api/scan',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({period,offset:page*pageSize,limit:pageSize,market:$('#marketFilter')?.value||'all'})
  });
  const d=await readJsonResponse(r);
  if(!r.ok || d.ok===false) throw Error(d.error||'掃描失敗');

  results=Array.isArray(d.results)?d.results:[];
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
  results=[];
  renderResults();
  $('#empty').style.display='block';
  $('#empty').textContent=`掃描失敗：${e.message}`;
  $('#progressText').textContent='掃描失敗';
  alert(`掃描失敗：${e.message}`);
 }finally{
  $('#scanBtn').disabled=false;
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

function filteredResults(){
 const q=$('#search')?.value.trim()||'';
 const market=$('#marketFilter')?.value||'all';
 const tech=$('#techFilter')?.value||'all';
 const sort=$('#sortMode')?.value||'score_desc';

 let a=results.filter(x=>{
  if(q && !x.code.includes(q) && !x.name.includes(q)) return false;
  if(market!=='all' && x.market!==market) return false;

  const signal=getSignal(x);
  if(tech==='macd_gold' && !(Number(x.MACD)>0 || hasReason(x,'MACD 柱翻正'))) return false;
  if(tech==='kd_gold' && !hasReason(x,'KD 黃金交叉')) return false;
  if(tech==='rsi_up' && !hasReason(x,'RSI 向上')) return false;
  if(tech==='volume' && Number(x.volumeRatio)<1.2) return false;
  if(tech==='ma_bull' && !hasReason(x,'站上')) return false;
  if(tech==='buy' && signal.type!=='buy') return false;
  if(tech==='sell' && signal.type!=='sell') return false;
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
    </button>

    <div class="pro-close">${x.close??'-'}</div>

    <div class="pro-signal signal-${signal.type}">
      <span class="pro-signal-icon">${signal.icon}</span>
      <small>${signal.label}</small>
    </div>

    <div class="pro-ai signal-text-${signal.type}">${ai}</div>

    <div class="pro-flow">
      <span>法人 <b class="${institutional>0?'flow-buy':institutional<0?'flow-sell':''}">${formatShares(institutional)}</b></span>
      <span>主力 <b>${x.mainForceScore??'-'}</b></span><em class="flow-tag ${signal.type==='buy'?'tag-buy':signal.type==='sell'?'tag-sell':''}">${signal.type==='buy'?'買入量能放大':signal.type==='sell'?'賣出量能放大':''}</em>
    </div>

    <div class="pro-volume hint-${hint.type}">
      <span class="volume-bars"><i></i><i></i><i></i></span>
      <small>${hint.text}</small>
    </div>
  </article>`;
 }).join('');

 $('#empty').style.display=a.length?'none':'block';
 $('#watchCount').textContent=new Set(Object.values(groups).flat()).size;
}
function formatShares(v){
 const n=Number(v||0);
 if(Math.abs(n)>=1000000)return `${(n/1000000).toFixed(1)}M`;
 if(Math.abs(n)>=1000)return `${(n/1000).toFixed(1)}K`;
 return String(Math.round(n));
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
   <h3>${name} ${code}</h3>
   <p>${x?`${labelPeriod(x.period)}｜分數 ${x.score}｜收盤 ${x.close}`:'目前頁面尚未掃描此股票，可切換至相應頁面取得分析。'}</p>
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
  alert('請輸入 4 碼股票代號');
  return null;
 }
 $('#singleStatus').textContent='分析中…';
 $('#analyzeSingle').disabled=true;
 try{
  const r=await fetch(`/api/stock/${code}?period=${selectedPeriod}`);
  const d=await r.json();
  if(!r.ok||d.ok===false) throw Error(d.error||'分析失敗');
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

$('#syncBtn').onclick=()=>syncUniverse().catch(e=>alert(e.message));
$('#scanBtn').onclick=()=>scanPage().catch(e=>alert(e.message));
$('#prev').onclick=()=>{if(page>0){page--;scanPage().catch(e=>alert(e.message))}};
$('#next').onclick=()=>{if((page+1)*pageSize<universe.length){page++;scanPage().catch(e=>alert(e.message))}};
$('#search').oninput=renderResults;
document.querySelectorAll('.period').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));
 b.classList.add('active');period=b.dataset.period;page=0;results=[];renderResults();
 $('#progressText').textContent=`已切換${labelPeriod(period)}，請開始掃描`;
});
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));
 b.classList.add('active');$('#'+b.dataset.p).classList.add('active');
});
fetch('/api/health').then(readJsonResponse).then(()=>$('#health').textContent='雲端正常').catch(()=>$('#health').textContent='連線異常');
renderGroups();renderWatch();renderResults();

if(universe.length){
 $('#total').textContent=universe.length;
 const last=localStorage.getItem('v63-last-sync');
 $('#progressText').textContent=`已載入 ${universe.length} 檔股票名單${last?'｜上次同步 '+new Date(last).toLocaleString():''}`;
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
 overlay.setAttribute('aria-hidden','false');
 document.body.classList.add('modal-open');
}

window.closeStockDetail=function(e){
 if(e){e.preventDefault?.();e.stopPropagation?.();}
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

$('#closeDetail').onclick=window.closeStockDetail;
$('#closeDetail').addEventListener('touchend',e=>{e.preventDefault();window.closeStockDetail();});
$('#detailOverlay').addEventListener('click',e=>{
 if(e.target===$('#detailOverlay')) window.closeStockDetail();
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape') window.closeStockDetail();
});
$('#detailAddWatch').addEventListener('click',()=>{
 if(!detailStock)return;
 window.closeStockDetail();
 chooseGroup(detailStock.code);
});

document.querySelectorAll('.reason-tab').forEach(btn=>{
 btn.addEventListener('click',()=>{
  const key=btn.dataset.reason;
  document.querySelectorAll('.reason-tab').forEach(b=>b.classList.toggle('active',b===btn));
  document.querySelectorAll('.reason-panel').forEach(p=>p.classList.toggle('active',p.dataset.reasonPanel===key));
 });
});


function renderRanking(){
 const holder=$('#rankingList');
 if(!holder) return;

 const ranked=[...allScannedResults]
  .sort((a,b)=>Number(b.aiScore||0)-Number(a.aiScore||0))
  .slice(0,30);

 holder.innerHTML=ranked.length?ranked.map((x,i)=>{
  const signal=getSignal(x);
  return `<button class="ranking-row rank-${signal.type}" onclick="openStockDetailByCode('${x.code}')" type="button">
    <strong class="rank-no">${i+1}</strong>
    <span class="rank-stock"><b>${x.code} ${x.name}</b><small>${x.market==='TPEx'?'上櫃':'上市'}｜${labelPeriod(x.period)}</small></span>
    <span class="rank-signal signal-${signal.type}">${signal.icon} ${signal.label}</span>
    <strong class="rank-score">${x.aiScore}</strong>
  </button>`;
 }).join(''):'<p class="ranking-empty">請先開始 AI 掃描，排行榜才會出現資料。</p>';
}

const marketEl=document.getElementById('marketFilter');
if(marketEl) marketEl.addEventListener('change',()=>{
 page=0;
 scanPage().catch(e=>alert(e.message));
});
['techFilter','sortMode'].forEach(id=>{
 const el=document.getElementById(id);
 if(el) el.addEventListener('change',renderResults);
});
$('#refreshRanking')?.addEventListener('click',renderRanking);
renderRanking();
