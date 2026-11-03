const YEARS=Array.from({length:27},(_,i)=>2026-i);
const state={year:2026,data:null,index:0,selection:{},revealed:false};
const $=s=>document.querySelector(s);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const progressStorage=(()=>{
  try{const probe='ky-en-v1-storage-test';localStorage.setItem(probe,'1');localStorage.removeItem(probe);return localStorage}
  catch{const memory=new Map();return {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}}
})();
const key=(y,id)=>`ky-en-v1:${y}:${id}`;
const draftKey=(y,id)=>`ky-en-v1-draft:${y}:${id}`;
const gradeKey=(y,id)=>`ky-en-v1-grade:${y}:${id}`;
const timerKey='ky-en-v1-stopwatch';
function readTimer(){
  const saved=storedObject(timerKey);
  const elapsedMs=Number(saved.elapsedMs);
  const startedAt=Number(saved.startedAt);
  return {elapsedMs:Number.isFinite(elapsedMs)&&elapsedMs>0?elapsedMs:0,startedAt:Number.isFinite(startedAt)&&startedAt>0?startedAt:0,running:!!saved.running&&startedAt>0};
}
let timer=readTimer();
function timerElapsed(){return timer.elapsedMs+(timer.running?Math.max(0,Date.now()-timer.startedAt):0)}
function saveTimer(){progressStorage.setItem(timerKey,JSON.stringify(timer))}
function showTimer(){
  const display=$('#timerDisplay');if(!display)return;
  const elapsedSeconds=Math.floor(timerElapsed()/1000);
  const hours=String(Math.floor(elapsedSeconds/3600)).padStart(2,'0');
  const minutes=String(Math.floor(elapsedSeconds/60)%60).padStart(2,'0');
  const seconds=String(elapsedSeconds%60).padStart(2,'0');
  display.textContent=`${hours}:${minutes}:${seconds}`;
  $('#timerStart').disabled=timer.running;
  $('#timerPause').disabled=!timer.running;
  const status=timer.running?'计时中':timer.elapsedMs?'已暂停':'待开始';
  if($('#timerStatus').textContent!==status)$('#timerStatus').textContent=status;
}
function renderTimer(){
  const panel=document.createElement('div');panel.className='timer-panel';panel.setAttribute('aria-label','练习秒表');
  panel.innerHTML='<div class="timer-face"><span>练习秒表</span><output id="timerDisplay" role="timer" aria-live="off">00:00:00</output></div><div class="timer-controls"><button id="timerStart" type="button">开始</button><button id="timerPause" type="button">暂停</button><button id="timerReset" type="button">重置</button></div><span class="timer-status" id="timerStatus" role="status"></span>';
  $('.reading-card').before(panel);
  $('#timerStart').addEventListener('click',()=>{timer.startedAt=Date.now();timer.running=true;saveTimer();showTimer()});
  $('#timerPause').addEventListener('click',()=>{timer.elapsedMs=timerElapsed();timer.startedAt=0;timer.running=false;saveTimer();showTimer()});
  $('#timerReset').addEventListener('click',()=>{timer.elapsedMs=0;timer.startedAt=0;timer.running=false;saveTimer();showTimer()});
  showTimer();
}
setInterval(showTimer,250);
const completed=(y,id)=>progressStorage.getItem(key(y,id))==='done';
const isCloze=item=>item.title.includes('完形填空');
const pointsPerQuestion=item=>isCloze(item)?0.5:2;
function storedObject(storageKey){try{const value=JSON.parse(progressStorage.getItem(storageKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
function maxScore(item){return item.kind==='translation'?Object.keys(item.translations).length*2:Object.keys(item.answers).length*pointsPerQuestion(item)}
function earnedScore(item){
  if(!completed(state.year,item.id))return 0;
  if(item.kind==='translation')return Object.values(storedObject(gradeKey(state.year,item.id))).reduce((sum,grade)=>sum+(Number(grade)||0),0);
  const answers=storedObject(draftKey(state.year,item.id));
  return Object.entries(item.answers).filter(([number,correct])=>answers[number]===correct).length*pointsPerQuestion(item);
}
const labelFor=(year)=>year<2010?'考研英语旧卷':'英语一真题';
const selectYear=$('#yearSelect');
YEARS.forEach(y=>{const option=document.createElement('option');option.value=y;option.textContent=`${y} 年 · ${labelFor(y)}`;selectYear.append(option)});
selectYear.addEventListener('change',()=>loadYear(Number(selectYear.value)));

let localDataPromise;
function loadLocalBundle(){
  if(window.EXAM_DATA)return Promise.resolve(window.EXAM_DATA);
  if(!localDataPromise)localDataPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./data/bundle.js';
    script.onload=()=>window.EXAM_DATA?resolve(window.EXAM_DATA):reject(new Error('本地题库无法加载'));
    script.onerror=()=>reject(new Error('本地题库文件缺失'));
    document.head.append(script);
  });
  return localDataPromise;
}
async function loadYear(year){
  state.year=year;state.index=0;state.data=null;state.selection={};state.revealed=false;
  selectYear.value=year;$('#workspace').innerHTML='<div class="loading">正在打开真题…</div>';
  try{
    if(location.protocol==='file:')state.data=(await loadLocalBundle())[year];
    else{const response=await fetch(`./data/${year}.json`);if(!response.ok)throw new Error('题库暂时无法加载');state.data=await response.json()}
    if(!state.data)throw new Error('这一年的题库无法加载');
    render();
  }
  catch(error){$('#workspace').innerHTML=`<div class="loading">${escapeHtml(error.message)}。请刷新后重试。</div>`}
}
function renderNav(){
  const items=state.data.items;
  $('#yearType').textContent=labelFor(state.year);
  $('#doneCount').textContent=`${items.filter(item=>completed(state.year,item.id)).length} / ${items.length} 篇完成`;
  $('#yearScore').textContent=`${items.reduce((sum,item)=>sum+earnedScore(item),0)} / ${items.reduce((sum,item)=>sum+maxScore(item),0)} 分`;
  $('#sectionNav').innerHTML=items.map((item,i)=>`<button class="nav-item ${state.index===i?'active':''} ${completed(state.year,item.id)?'done':''}" data-index="${i}" type="button"><span class="nav-index">${String(i+1).padStart(2,'0')}</span><span class="nav-title">${escapeHtml(item.title)}</span><span class="nav-check">${completed(state.year,item.id)?'✓':''}</span></button>`).join('');
  $('#sectionNav').querySelectorAll('[data-index]').forEach(button=>button.addEventListener('click',()=>{state.index=Number(button.dataset.index);state.selection={};state.revealed=false;render()}));
}
function render(){
  if(!state.data)return;renderNav();const item=state.data.items[state.index];
  const passage=item.paragraphs.length?(item.kind==='translation'&&item.translationPassages?.length?renderTranslationPassage(item):item.title.includes('完形填空')?renderClozePassage(item):item.paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')):'<p>请阅读下方题目。</p>';
  const directions=item.directions?`<div class="directions"><strong>题目要求 · ${escapeHtml(item.newType)}</strong><p lang="en">${escapeHtml(item.directions.replace(/^Directions:\s*/,'Directions: '))}</p></div>`:'';
  const ordering=item.ordering?.length?`<div class="ordering"><div class="ordering-title">原题排列顺序 <span>已给出的字母为固定位置</span></div><div class="ordering-sequence">${item.ordering.map(slot=>slot.fixed?`<span class="order-fixed" title="原题已给出">${escapeHtml(slot.fixed)}<small>已给出</small></span>`:`<span class="order-slot" data-number="${slot.number}"><span class="order-content">${slot.number}</span><small>待填写</small></span>`).join('<span class="order-arrow" aria-hidden="true">→</span>')}</div></div>`:'';
  const count=Object.keys(item.answers).length||Object.keys(item.translations).length;
  $('#workspace').innerHTML=`<div class="crumb">${state.year} · ${labelFor(state.year)} / ${String(state.index+1).padStart(2,'0')} OF ${state.data.items.length}</div><div class="heading-row"><div><h2>${escapeHtml(item.title)}</h2><p>读完文章、作答当前篇章，再揭晓这一篇的答案。</p></div><span class="pill">${item.kind==='translation'?'翻译练习':`${count} 题`}</span></div><article class="reading-card">${directions}${ordering}<div class="section-kicker">${item.newType?'TEXT & OPTIONS':'READ THE PASSAGE'}</div><div class="passage" lang="en">${passage}</div><div class="reading-tip">${item.kind==='translation'?'划线句是本篇需要翻译的部分；点击句子可跳到对应答题框。':item.title.includes('完形填空')?'点击文中的空号可跳到对应题目。':'题目来自历年真题。'}作答前，答案不会在页面上显示。</div></article><section class="answer-card"><div class="answer-head"><h3>${item.kind==='translation'?'写下你的译文':'完成本篇题目'}</h3><span id="progressCount" aria-live="polite"></span></div><div id="questionArea"></div><div class="actions"><button class="primary" id="submitBtn" type="button">完成本篇，揭晓答案</button><button class="secondary reset-button" id="resetBtn" type="button">重置本篇进度</button><span class="help">需填完本篇全部题目</span></div><div class="error" id="formError" role="alert"></div><div id="resultArea"></div></section><div class="smallprint">参考答案与译文用于练习核对；主观题没有唯一标准译法。</div>`;
  renderTimer();
  renderQuestions(item);
  const saved=restoreDraft(item);
  updateProgress(item);
  $('#questionArea').addEventListener('input',()=>{saveDraft(item);updateProgress(item)});
  $('#questionArea').addEventListener('change',()=>{saveDraft(item);updateProgress(item)});
  $('.passage').querySelectorAll('.cloze-blank').forEach(blank=>blank.addEventListener('click',()=>{const question=$(`#question-${blank.dataset.question}`);question?.scrollIntoView({behavior:'smooth',block:'center'});question?.classList.add('question-target');setTimeout(()=>question?.classList.remove('question-target'),1600)}));
  $('.passage').querySelectorAll('.translation-target').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const field=$(`#tr-${link.dataset.number}`);field?.scrollIntoView({behavior:'smooth',block:'center'});field?.focus({preventScroll:true})}));
  $('#submitBtn').addEventListener('click',()=>submit(item));
  $('#resetBtn').addEventListener('click',()=>resetProgress(item));
  if(completed(state.year,item.id)&&Object.keys(saved).length){state.selection=saved;state.revealed=true;showResult(item,false)}
}
function renderTranslationPassage(item){
  return item.translationPassages.map(paragraph=>`<p>${paragraph.map(segment=>segment.number?`<span class="translation-number">(${segment.number})</span><a class="translation-target" href="#tr-${segment.number}" data-number="${segment.number}" title="跳转到第 ${segment.number} 题译文输入框">${escapeHtml(segment.text)}</a>`:escapeHtml(segment.text)).join('')}</p>`).join('');
}
function renderClozePassage(item){
  const numbers=Object.keys(item.answers).map(Number).sort((a,b)=>a-b);let next=0;
  return item.paragraphs.map(paragraph=>{
    let html='',start=0;
    for(const match of paragraph.matchAll(/(?<![\d,])\b(\d{1,2})\b(?![\d,.%])/g)){
      if(Number(match[1])!==numbers[next])continue;
      html+=escapeHtml(paragraph.slice(start,match.index));
      html+=`<button class="cloze-blank" type="button" data-question="${match[1]}" aria-label="第 ${match[1]} 空，跳转到第 ${match[1]} 题">${match[1]}</button>`;
      start=match.index+match[0].length;next++;
    }
    return `<p>${html+escapeHtml(paragraph.slice(start))}</p>`;
  }).join('');
}
function answerFields(item){return [...$('#questionArea').querySelectorAll(item.kind==='translation'?'textarea':'input[type="radio"]:checked, select[data-number]')]}
function updateProgress(item){
  const total=item.kind==='translation'?Object.keys(item.translations).length:Object.keys(item.answers).length;
  const done=answerFields(item).filter(field=>field.value.trim()).length;
  $('#progressCount').textContent=`已答 ${done} / ${total}`;
  $('.passage').querySelectorAll('.cloze-blank').forEach(blank=>blank.classList.toggle('answered',!!$(`#question-${blank.dataset.question} input:checked`)));
  updateOrdering(item);
}
function updateOrdering(item){
  if(!item.ordering?.length)return;
  $('.ordering').querySelectorAll('.order-slot').forEach(slot=>{
    const n=slot.dataset.number,chosen=$(`#questionArea select[data-number="${n}"]`)?.value;
    const correct=item.answers[n];
    slot.querySelector('.order-content').innerHTML=state.revealed?(chosen===correct?`${n} · ${escapeHtml(correct)}`:`${n} · <span class="order-chosen">${escapeHtml(chosen||'—')}</span> → <span class="order-correct">${escapeHtml(correct)}</span>`):(chosen?`${n} · ${escapeHtml(chosen)}`:n);
    slot.classList.toggle('correct',state.revealed&&chosen===correct);
    slot.classList.toggle('wrong',state.revealed&&chosen!==correct);
    slot.querySelector('small').textContent=state.revealed?(chosen===correct?'正确':'红色为所选 · 绿色为正确'):(chosen?'已选择':'待填写');
  });
}
function saveDraft(item){
  const values={};
  for(const field of answerFields(item))values[field.dataset.number||field.name?.slice(2)]=field.value;
  progressStorage.setItem(draftKey(state.year,item.id),JSON.stringify(values));
}
function restoreDraft(item){
  const values=storedObject(draftKey(state.year,item.id));
  for(const [n,value] of Object.entries(values)){
    const radio=$(`#questionArea input[name="q-${n}"][value="${value}"]`);
    const select=$(`#questionArea select[data-number="${n}"]`);
    const textarea=$(`#questionArea textarea[data-number="${n}"]`);
    if(radio)radio.checked=true;else if(select)select.value=value;else if(textarea)textarea.value=value;
  }
  return values;
}
function resetProgress(item){
  progressStorage.removeItem(key(state.year,item.id));
  progressStorage.removeItem(draftKey(state.year,item.id));
  progressStorage.removeItem(gradeKey(state.year,item.id));
  state.selection={};state.revealed=false;render();
  $('#workspace').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderQuestions(item){
  const area=$('#questionArea');const answerNums=Object.keys(item.answers).map(Number).sort((a,b)=>a-b);
  if(item.kind==='translation'){
    const fromText=[...item.paragraphs.join(' ').matchAll(/\((\d{2})\)/g)].map(m=>Number(m[1]));
    const nums=Object.keys(item.translations).map(Number).sort((a,b)=>a-b);
    const unique=[...new Set([...nums,...fromText])].sort((a,b)=>a-b);
    item.translationNumbers=unique.length?unique:[46,47,48,49,50];
    area.innerHTML=item.translationNumbers.map(n=>`<div class="translation-entry"><label for="tr-${n}">第 ${n} 题 · 你的译文</label><textarea id="tr-${n}" data-number="${n}" placeholder="结合上下文写出中文译文…"></textarea></div>`).join('');
    return;
  }
  if(item.sharedChoices&&Object.keys(item.sharedChoices).length){area.innerHTML=`<div class="shared-list">${Object.entries(item.sharedChoices).map(([l,v])=>`<div class="shared-choice"><b>${l}</b><span>${escapeHtml(v)}</span></div>`).join('')}</div>`}
  if(item.questions.length&&item.questions.every(q=>Object.keys(q.choices).length)){
    area.innerHTML+=item.questions.map(q=>`<div class="question" id="question-${q.number}"><div class="question-title"><span class="qnum">${q.number}.</span><span>${escapeHtml(q.stem||'选择正确答案')}</span></div><div class="choices">${Object.entries(q.choices).map(([letter,value])=>`<label class="choice"><input type="radio" name="q-${q.number}" value="${letter}"><b>${letter}</b><span>${escapeHtml(value)}</span></label>`).join('')}</div></div>`).join('');
  }else{
    const marked=[...item.paragraphs.join(' ').matchAll(/\[\s*([A-H])\s*\]/g)].map(m=>m[1]);
    const letters=[...new Set([...Object.keys(item.sharedChoices||{}),...marked])].sort();
    const fixed=new Set((item.ordering||[]).map(slot=>slot.fixed).filter(Boolean));
    const available=(letters.length?letters:'ABCDEFG'.split('')).filter(letter=>!fixed.has(letter));
    area.innerHTML+=`<p class="help">根据上方文章与选项，为各题选择答案。</p><div class="answer-grid">${answerNums.map(n=>`<label>第 ${n} 题<select data-number="${n}"><option value="">请选择</option>${available.map(l=>`<option value="${l}">${l}</option>`).join('')}</select></label>`).join('')}</div>`;
  }
}
function submit(item){
  if(state.revealed)return;
  const error=$('#formError');error.textContent='';
  if(item.kind==='translation'){
    const fields=[...$('#questionArea').querySelectorAll('textarea')];
    if(fields.some(f=>!f.value.trim())){error.textContent='请先写完本篇的每句译文。';return}
    state.selection=Object.fromEntries(fields.map(f=>[f.dataset.number,f.value.trim()]));
  }else{
    const nums=Object.keys(item.answers).map(Number);
    const answers={};
    for(const n of nums){const radio=document.querySelector(`input[name="q-${n}"]:checked`);const select=document.querySelector(`select[data-number="${n}"]`);answers[n]=radio?.value||select?.value||''}
    if(nums.some(n=>!answers[n])){error.textContent='请先完成本篇全部题目。';return}
    state.selection=answers;
  }
  state.revealed=true;progressStorage.setItem(key(state.year,item.id),'done');saveDraft(item);renderNav();showResult(item);
}
function showResult(item,scroll=true){
  $('#submitBtn').disabled=true;$('#submitBtn').textContent='本篇已完成';
  const area=$('#resultArea');let content='';
  if(item.kind==='translation'){
    const entries=Object.entries(item.translations).sort((a,b)=>Number(a[0])-Number(b[0]));
    const grades=storedObject(gradeKey(state.year,item.id));
    content=entries.length?`<p id="translationScoreSummary"></p><div class="translation-result">${entries.map(([n,translation])=>`<div class="translation-result-entry"><p><strong>${n}.</strong> ${escapeHtml(translation)}</p><div class="grade-controls" aria-label="第 ${n} 句自评分">自评分 ${[0,1,2].map(score=>`<button type="button" class="grade-button ${Number(grades[n])===score&&grades[n]!=null?'selected':''}" data-grade-number="${n}" data-grade-value="${score}" aria-pressed="${Number(grades[n])===score&&grades[n]!=null}">${score} 分</button>`).join('')}</div></div>`).join('')}</div>`:'<p>这一年的参考译文请在下方原始解析页查看。</p>';
  }else{
    const entries=Object.entries(item.answers).sort((a,b)=>Number(a[0])-Number(b[0]));
    const score=entries.filter(([n,a])=>state.selection[n]===a).length;
    content=`<p>本篇得分 <strong>${score*pointsPerQuestion(item)} / ${maxScore(item)} 分</strong>，答对 ${score} / ${entries.length} 题。</p><div class="result-list">${entries.map(([n,a])=>`<div class="result-item"><strong>${n} 题</strong><span class="result-choice ${state.selection[n]===a?'correct':'wrong'}">你选 ${escapeHtml(state.selection[n]||'—')}</span><span class="result-choice correct">正确 ${escapeHtml(a)}</span></div>`).join('')}</div>`;
    document.querySelectorAll('.question').forEach(q=>{const n=q.querySelector('.qnum')?.textContent?.replace('.','');q.querySelectorAll('.choice').forEach(c=>{const value=c.querySelector('input')?.value;if(value===item.answers[n])c.classList.add('correct');else if(value===state.selection[n])c.classList.add('wrong')})});
    document.querySelectorAll('.answer-grid select').forEach(select=>{const n=select.dataset.number;select.classList.add(state.selection[n]===item.answers[n]?'correct':'wrong');const hint=document.createElement('span');hint.className='grid-correct-answer';hint.textContent=`正确 ${item.answers[n]}`;select.after(hint)});
  }
  area.innerHTML=`<div class="result"><h4>本篇答案已揭晓</h4>${content}<p><a href="${escapeHtml(item.analysisUrl)}" target="_blank" rel="noopener">查看逐题解析与原文 ↗</a></p></div>${state.index<state.data.items.length-1?'<div class="next-row"><button class="secondary" id="nextBtn" type="button">下一篇 →</button></div>':''}`;
  $('#questionArea').querySelectorAll('input,select').forEach(field=>field.disabled=true);
  updateOrdering(item);
  $('#questionArea').querySelectorAll('textarea').forEach(field=>field.readOnly=true);
  if(item.kind==='translation'){
    updateTranslationScore(item);
    area.querySelectorAll('[data-grade-number]').forEach(button=>button.addEventListener('click',()=>{
      const grades=storedObject(gradeKey(state.year,item.id));grades[button.dataset.gradeNumber]=Number(button.dataset.gradeValue);
      progressStorage.setItem(gradeKey(state.year,item.id),JSON.stringify(grades));
      area.querySelectorAll(`[data-grade-number="${button.dataset.gradeNumber}"]`).forEach(choice=>{const selected=choice===button;choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected))});
      updateTranslationScore(item);renderNav();
    }));
  }
  $('#nextBtn')?.addEventListener('click',()=>{state.index++;state.selection={};state.revealed=false;render();window.scrollTo({top:0,behavior:'smooth'})});
  if(scroll)area.scrollIntoView({behavior:'smooth',block:'start'});
}
function updateTranslationScore(item){
  const grades=storedObject(gradeKey(state.year,item.id));
  $('#translationScoreSummary').textContent=`本篇自评 ${Object.keys(grades).length} / ${Object.keys(item.translations).length} 句，得分 ${earnedScore(item)} / ${maxScore(item)} 分。`;
}
loadYear(2026);
