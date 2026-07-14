const $=s=>document.querySelector(s);
let universe=[],results=[],period='day',page=0,pageSize=20,pendingCode=null;
let groups=JSON.parse(localStorage.getItem('v6-groups')||'{"觀察":[],"波段":[],"長期投資":[]}');
let currentGroup=Object.keys(groups)[0]||'觀察';

function saveGroups(){localStorage.setItem('v6-groups',JSON.stringify(groups));renderGroups();renderWatch()}
async function syncUniverse(){
 $('#progressText').textContent='同步股票名單中…';
 const r=await fetch('/api/universe'),d=await r.json();
 if(!r.ok) throw Error(d.error||'同步失敗');
 universe=d;page=0;$('#total').textContent=d.length;$('#progressText').textContent=`已同步 ${d.length} 檔上市股票`;
}
async function scanPage(){
 if(!universe.length) await syncUniverse();
 $('#scanBtn').disabled=true;$('#progressText').textContent='AI 掃描中…';$('#progress').value=15;
 try{
  const r=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({period,offset:page*pageSize,limit:pageSize})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'掃描失敗');
  results=d.results||[];$('#progress').value=100;$('#scanned').textContent=Math.min((page+1)*pageSize,d.total);
  $('#high').textContent=results.filter(x=>x.score>=80).length;$('#match').textContent=results.filter(x=>x.score>=65).length;
  $('#dataDate').textContent=`資料：${d.date}`;$('#progressText').textContent=`第 ${page+1} 頁掃描完成`;
  $('#pageLabel').textContent=`第 ${page+1} 頁 / ${Math.ceil(d.total/pageSize)} 頁`;renderResults();
 }finally{$('#scanBtn').disabled=false}
}
function inWatch(code){return Object.values(groups).some(a=>a.includes(code))}
function renderResults(){
 const q=$('#search').value.trim();const a=results.filter(x=>!q||x.code.includes(q)||x.name.includes(q));
 $('#body').innerHTML=a.map(x=>`<tr><td><button class="star ${inWatch(x.code)?'on':''}" onclick="chooseGroup('${x.code}')">★</button></td>
 <td><b>${x.name}</b><br>${x.code}</td><td>${labelPeriod(x.period)}</td><td class="score">${x.score}</td><td>${x.close}</td>
 <td class="${x.K>x.D?'good':''}">${x.K??'-'}/${x.D??'-'}</td><td>${x.RSI??'-'}</td><td>${x.MACD}</td><td>${x.volumeRatio}</td><td>${x.status}</td></tr>`).join('');
 $('#empty').style.display=a.length?'none':'block';$('#watchCount').textContent=new Set(Object.values(groups).flat()).size;
}
function labelPeriod(p){return p==='day'?'日線':p==='week'?'週線':'月線'}
window.chooseGroup=code=>{pendingCode=code;$('#groupChoices').innerHTML=Object.keys(groups).map(g=>`<button onclick="addToGroup('${g}')">${g}</button>`).join('');$('#groupDialog').showModal()}
window.addToGroup=g=>{Object.keys(groups).forEach(k=>groups[k]=groups[k].filter(x=>x!==pendingCode));groups[g].push(pendingCode);saveGroups();$('#groupDialog').close();renderResults()}
function renderGroups(){
 $('#groups').innerHTML=Object.keys(groups).map(g=>`<button class="group-tab ${g===currentGroup?'active':''}" onclick="setGroup('${g}')">${g} (${groups[g].length})</button>`).join('')
}
window.setGroup=g=>{currentGroup=g;renderGroups();renderWatch()}
function renderWatch(){
 const codes=groups[currentGroup]||[];$('#watchCards').innerHTML=codes.length?codes.map(code=>{let x=results.find(v=>v.code===code),u=universe.find(v=>v.code===code);return `<article class="watch-card"><h3>${x?.name||u?.name||code} ${code}</h3><p>${x?`${labelPeriod(x.period)}｜分數 ${x.score}｜收盤 ${x.close}`:'此頁尚未掃描，切到相應頁面後可更新分析'}</p><button onclick="removeWatch('${code}')">移除</button></article>`}).join(''):'<p id="empty">此分類尚無股票</p>';
}
window.removeWatch=code=>{groups[currentGroup]=groups[currentGroup].filter(x=>x!==code);saveGroups();renderResults()}
$('#addGroup').onclick=()=>{let g=prompt('輸入新分類名稱');if(g&&g.trim()&&!groups[g.trim()]){groups[g.trim()]=[];currentGroup=g.trim();saveGroups()}}
$('#syncBtn').onclick=()=>syncUniverse().catch(e=>alert(e.message));$('#scanBtn').onclick=()=>scanPage().catch(e=>alert(e.message));
$('#prev').onclick=()=>{if(page>0){page--;scanPage().catch(e=>alert(e.message))}};$('#next').onclick=()=>{if((page+1)*pageSize<universe.length){page++;scanPage().catch(e=>alert(e.message))}};
$('#search').oninput=renderResults;
document.querySelectorAll('.period').forEach(b=>b.onclick=()=>{document.querySelectorAll('.period').forEach(x=>x.classList.remove('active'));b.classList.add('active');period=b.dataset.period;page=0;results=[];renderResults();$('#progressText').textContent=`已切換${labelPeriod(period)}，請開始掃描`});
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.p).classList.add('active')});
fetch('/api/health').then(r=>r.json()).then(()=>$('#health').textContent='雲端正常').catch(()=>$('#health').textContent='連線異常');
renderGroups();renderWatch();