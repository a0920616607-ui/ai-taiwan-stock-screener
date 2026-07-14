const $=s=>document.querySelector(s);
let universe=safeLoadUniverse(),results=[],period='day',page=0,pageSize=20,pendingCode=null,pendingConfirm=null,singlePeriod='day',singleResult=null;
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
 const r=await fetch('/api/universe'),d=await r.json();
 if(!r.ok) throw Error(d.error||'同步失敗');
 universe=d;
localStorage.setItem('v63-universe',JSON.stringify(d));
localStorage.setItem('v63-last-sync',new Date().toISOString());
page=0;
$('#total').textContent=d.length;
$('#progressText').textContent=`已同步 ${d.length} 檔上市股票`;
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
   body:JSON.stringify({period,offset:page*pageSize,limit:pageSize})
  });
  const d=await r.json();
  if(!r.ok || d.ok===false) throw Error(d.error||'掃描失敗');

  results=Array.isArray(d.results)?d.results:[];
  $('#progress').value=100;
  $('#scanned').textContent=Math.min((page+1)*pageSize,d.total||0);
  $('#high').textContent=results.filter(x=>x.score>=80).length;
  if($('#match')) $('#match').textContent=results.filter(x=>x.score>=65).length;
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
 const inst=Number(x.institutionalNet??0);
 const foreign=Number(x.foreignNet??0);
 const main=Number(x.mainForceScore??50);

 if(ai>=65 && (inst>0 || foreign>0) && main>=60){
  return {type:'buy',label:'買入',icon:'↑'};
 }
 if(ai<=45 && inst<0 && foreign<0 && main<=40){
  return {type:'sell',label:'賣出',icon:'↓'};
 }
 return {type:'neutral',label:'中性',icon:''};
}
function getVolumeHint(x){
 const vr=Number(x.volumeRatio??0);
 const inst=Number(x.institutionalNet??0);
 const foreign=Number(x.foreignNet??0);
 const main=Number(x.mainForceScore??50);

 if(vr>=1.2 && (inst>0 || foreign>0) && main>=60){
  return {type:'buy',text:'買入量能放大'};
 }
 if(vr>=1.2 && inst<0 && foreign<0 && main<=40){
  return {type:'sell',text:'賣出量能放大'};
 }
 if(vr>=1.2){
  return {type:'volume',text:'量能放大'};
 }
 return {type:'flat',text:'量能平穩'};
}
function renderResults(){
 const q=$('#search').value.trim();
 const a=results.filter(x=>!q||x.code.includes(q)||x.name.includes(q));

 $('#body').innerHTML=a.map(x=>{
  const signal=getSignal(x);
  const hint=getVolumeHint(x);
  const ai=Number(x.aiScore??x.score??0);
  return `<tr>
   <td><button title="${inWatch(x.code)?'管理自選股':'加入自選股'}" class="star ${inWatch(x.code)?'on':''}" onclick="chooseGroup('${x.code}')">★</button></td>
   <td class="stock-name"><b>${x.code}</b><br><span>${x.name}</span></td>
   <td class="close-price">${x.close??'-'}</td>
   <td>
    <div class="signal signal-${signal.type}">
      ${signal.icon?`<span class="signal-icon">${signal.icon}</span>`:''}
      <span>${signal.label}</span>
    </div>
   </td>
   <td class="ai-number signal-text-${signal.type}">${ai}</td>
   <td class="flow-cell">
    <div>法人 <b class="${Number(x.institutionalNet)>0?'flow-buy':Number(x.institutionalNet)<0?'flow-sell':''}">${formatShares(x.institutionalNet)}</b></div>
    <div>外資 <b class="${Number(x.foreignNet)>0?'flow-buy':Number(x.foreignNet)<0?'flow-sell':''}">${formatShares(x.foreignNet)}</b></div>
    <div>主力 <b>${x.mainForceScore??'-'}</b></div>
   </td>
   <td>
    <div class="volume-hint hint-${hint.type}">
      <span>${hint.text}</span>
      <span class="volume-bars"><i></i><i></i><i></i></span>
      <small>量比 ${x.volumeRatio??'-'}</small>
    </div>
   </td>
  </tr>`;
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
fetch('/api/health').then(r=>r.json()).then(()=>$('#health').textContent='雲端正常').catch(()=>$('#health').textContent='連線異常');
renderGroups();renderWatch();renderResults();

if(universe.length){
 $('#total').textContent=universe.length;
 const last=localStorage.getItem('v63-last-sync');
 $('#progressText').textContent=`已載入 ${universe.length} 檔股票名單${last?'｜上次同步 '+new Date(last).toLocaleString():''}`;
}
