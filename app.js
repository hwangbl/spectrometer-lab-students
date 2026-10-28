/* Native, dependency-free spectrometer experiment. All measurements stay local. */
(() => {
  'use strict';
  const P = window.SpectrometerPhysics;
  const R = window.SpectrometerRealism;
  const Guide = window.SpectrometerGuide;
  const Video = window.SpectrometerVideo;
  if (!P) { document.getElementById('app').textContent = '计算模块未能载入，请刷新页面。'; return; }
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lineById = Object.fromEntries(P.SPECTRAL_LINES.map(line => [line.id, line]));
  const MODULES = [ ['principle','原理与任务'], ['apparatus','仪器认识'], ['adjustment','仪器调节'], ['operation','操作演示'], ['simulation','虚拟实验'], ['data','数据处理'], ['questions','思考与自检'] ];
  const KEY = 'physics-spectrometer-v1';
  function newRecordId(){
    // Record identifiers are local bookkeeping, not security tokens. HTTP
    // classroom previews may not expose the secure-context randomUUID API.
    return typeof crypto.randomUUID==='function'?crypto.randomUUID():'sp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  }
  const initialAdjust = {eye:2.2,focus:-1.6,telescopeTilt:.8,stageTilt:-1.2,collFocus:1.8,collTilt:.7,normal:1.1,grooves:-.9};
  const labDefaults = () => ({lampOn:true,eyePosition:0,eyeSeen:{left:false,right:false},parallaxChecked:false,faces:{AB:false,AC:false},collChecked:false,gratingChecked:false,slitOrientation:'vertical',slitWidth:.12,telescopeLocked:false,lockAnchor:0,prismTilt:{x:.6,y:-.5},prismFaces:{AB:false,AC:false},practice:true,free:false,reveal:false,demo:false});
  const defaults = () => ({version:1,lab:labDefaults(),completed:[],adjust:{...initialAdjust},rows:[],pending:{},sim:{mode:'grating',line:'green',side:'left',angleMinutes:0,round:1,linesPerMm:300},nominalDensity:300,dataSource:'simulation',quiz:{}});
  let state=defaults(), storageAvailable=true, route='principle', part='telescope', adjustFace='AB', toastTimer, quizSubmitted=false;
  try {
    const saved=JSON.parse(localStorage.getItem(KEY)||'null');
    if(saved && saved.version===1) {
      state.completed=Array.isArray(saved.completed)?[...new Set(saved.completed.filter(x=>MODULES.some(m=>m[0]===x)))]:[];
      for(const key of Object.keys(initialAdjust)) if(Number.isFinite(saved.adjust?.[key])) state.adjust[key]=clamp(saved.adjust[key],-3,3);
      const restoredIds=new Set();
      state.rows=Array.isArray(saved.rows)?saved.rows.filter(r=>r&&['grating','prism'].includes(r.kind)&&['simulation','measurement'].includes(r.source)&&['left1','left2','right1','right2'].every(k=>typeof r[k]==='string'&&r[k].length<60)).slice(-500).map((row,index)=>{
        // A stable unique identity is required for matching results and deleting
        // exactly one record. Preserve the original angle strings unchanged.
        let id=typeof row.id==='string'&&row.id.length>0&&row.id.length<=100?row.id:newRecordId();
        if(restoredIds.has(id))id=newRecordId();
        restoredIds.add(id);
        return {...row,id,round:Number.isInteger(row.round)&&row.round>0?row.round:index+1};
      }):[];
      if(['measurement','simulation'].includes(saved.dataSource))state.dataSource=saved.dataSource;
      if(Number.isFinite(saved.nominalDensity)&&saved.nominalDensity>=100&&saved.nominalDensity<=600)state.nominalDensity=saved.nominalDensity;
      if(saved.sim&&typeof saved.sim==='object'){
        if(['grating','prism'].includes(saved.sim.mode))state.sim.mode=saved.sim.mode;
        if(Object.hasOwn(lineById,saved.sim.line))state.sim.line=saved.sim.line;
        if(['left','right'].includes(saved.sim.side))state.sim.side=saved.sim.side;
        if(Number.isInteger(saved.sim.angleMinutes))state.sim.angleMinutes=clamp(saved.sim.angleMinutes,-4800,4800);
        if(Number.isInteger(saved.sim.round))state.sim.round=clamp(saved.sim.round,1,state.sim.mode==='prism'?3:2);
        if([250,300,350].includes(saved.sim.linesPerMm))state.sim.linesPerMm=saved.sim.linesPerMm;
      }
      if(saved.lab && typeof saved.lab==='object') {
        for(const key of ['lampOn','parallaxChecked','collChecked','gratingChecked','practice','free','reveal','demo'])if(typeof saved.lab[key]==='boolean')state.lab[key]=saved.lab[key];
        if(Number.isFinite(saved.lab.slitWidth))state.lab.slitWidth=clamp(saved.lab.slitWidth,.03,.8);
        if(['horizontal','vertical'].includes(saved.lab.slitOrientation))state.lab.slitOrientation=saved.lab.slitOrientation;
        for(const face of ['AB','AC'])state.lab.faces[face]=saved.lab.faces?.[face]===true;
        for(const axis of ['x','y'])if(Number.isFinite(saved.lab.prismTilt?.[axis]))state.lab.prismTilt[axis]=clamp(saved.lab.prismTilt[axis],-3,3);
        for(const face of ['AB','AC'])state.lab.prismFaces[face]=saved.lab.prismFaces?.[face]===true;
        // A fresh page starts with the telescope unlocked and no half-readings.
      }
      if(saved.quiz&&typeof saved.quiz==='object')for(let i=0;i<4;i++)if([0,1,2].includes(saved.quiz[i]))state.quiz[i]=saved.quiz[i];
      // Incomplete pairs intentionally restart after reload, so readings from
      // different instrument setups cannot silently become one measurement.
    }
    localStorage.setItem(KEY,JSON.stringify(state));
  } catch { storageAvailable=false; }

  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageAvailable=false;}showStorage();}
  function showStorage(){$('#storage-note').textContent=storageAvailable?'学习记录保存在当前浏览器':'当前浏览器无法保存，请及时导出数据';}
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
  function report(){
    const count=state.completed.length,total=MODULES.length;$('#progress-text').textContent=`${count} / ${total}`;$('#progress-bar').max=total;$('#progress-bar').value=count;
    if(parent!==window)parent.postMessage({type:'physics-lab-state',id:'spectrometer',hash:location.hash,completed:count,total},location.origin);
  }
  function complete(id){if(!state.completed.includes(id)){state.completed.push(id);save();report();renderNav();toast('本模块已标记完成');}}
  function renderNav(){$('#spectrometer-nav').innerHTML=MODULES.map(([id,name],i)=>`<a href="#${id}" class="${route===id?'active ':''}${state.completed.includes(id)?'done':''}" ${route===id?'aria-current="page"':''}><span>${state.completed.includes(id)?'✓':String(i+1).padStart(2,'0')}</span>${name}</a>`).join('');}
  function heading(en,title,description){return `<div class="sp-page-heading"><p class="sp-eyebrow">${en}</p><h1>${title}</h1><p>${description}</p></div>`;}
  function endModule(id,next){return `<div class="sp-module-end"><p>完成本模块后，记录你的学习进度。</p><div class="sp-actions"><button class="sp-button" data-complete="${id}">${state.completed.includes(id)?'✓ 已完成本模块':'标记本模块完成'}</button>${next?`<a class="sp-button primary" href="#${next}">下一步 · ${MODULES.find(m=>m[0]===next)[1]} →</a>`:''}</div></div>`;}
  function point(angle,r,cx=330,cy=235){const rad=angle*Math.PI/180;return {x:cx+r*Math.cos(rad),y:cy-r*Math.sin(rad)};}
  function lineSvg(x1,y1,x2,y2,color,width=1,extra=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;}

  function instrumentSvg(dark=false,interactive=false){
    const bg=dark?'#143f59':'#edf3f6',line=dark?'#4e829a':'#9bb6c5',text=dark?'#a5cbdc':'#466b80';
    const ticks=Array.from({length:72},(_,i)=>{const a=point(i*5,112),b=point(i*5,i%6===0?101:106);return lineSvg(a.x,a.y,b.x,b.y,line,i%6===0?1.4:.8);}).join('');
    const hot=(id,x,y,n)=>interactive?`<g data-part="${id}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="14" fill="${part===id?'#00deff':'#10405c'}" stroke="white" stroke-width="2"/><text x="${x}" y="${y+4}" text-anchor="middle" font-family="Arial" font-size="11" fill="${part===id?'#10405c':'white'}">${n}</text></g>`:'';
    return `<svg viewBox="0 0 660 420" role="img" aria-label="分光计结构示意：平行光管、载物台、可旋转望远镜、度盘和两个对径游标"><defs><linearGradient id="sp-metal"><stop stop-color="#82a0af"/><stop offset=".45" stop-color="#d7e6ed"/><stop offset="1" stop-color="#698d9e"/></linearGradient></defs><circle cx="330" cy="235" r="150" fill="none" stroke="${line}" stroke-dasharray="2 9" opacity=".4"/><ellipse cx="330" cy="270" rx="135" ry="103" fill="#082a40" opacity=".15"/><circle cx="330" cy="235" r="123" fill="${bg}" stroke="${line}" stroke-width="3"/><circle cx="330" cy="235" r="96" fill="none" stroke="${line}" opacity=".7"/>${ticks}<circle cx="330" cy="235" r="61" fill="#24516a" stroke="#82acbe" stroke-width="3"/><path d="M330 204 360 254 300 254Z" fill="#8fe7f4" fill-opacity=".2" stroke="#82e6ee" stroke-width="1.5"/><path d="M88 225H302M330 235 506 133M330 235 520 175M330 235 518 206" fill="none" stroke="#75d8e8" stroke-width="1.5"/><path d="M330 235 515 153" stroke="#f1d37b" stroke-width="1.5"/><g transform="translate(90 216)"><rect width="205" height="38" rx="3" fill="url(#sp-metal)" stroke="#668e9e"/><rect x="8" y="-7" width="23" height="52" rx="2" fill="#1e455b"/><rect x="155" y="-4" width="26" height="46" rx="3" fill="#1e455b"/><path d="M35 19H155" stroke="#e2fbff" stroke-opacity=".8"/></g><g transform="translate(330 235) rotate(-32)"><path d="M0 0H85" stroke="#7498aa" stroke-width="12"/><rect x="67" y="-21" width="173" height="42" rx="4" fill="url(#sp-metal)" stroke="#668e9e"/><rect x="94" y="-26" width="24" height="52" rx="3" fill="#193c52"/><rect x="218" y="-16" width="42" height="32" rx="2" fill="#173c52"/><rect x="257" y="-12" width="15" height="24" rx="2" fill="#89abbc"/><circle cx="166" cy="25" r="9" fill="#173c52"/></g><path d="M289 315 269 356M371 315 392 356" stroke="#52798d" stroke-width="11"/><rect x="269" y="216" width="22" height="39" fill="#e8f1f5" stroke="#48788e"/><rect x="369" y="216" width="22" height="39" fill="#e8f1f5" stroke="#48788e"/><path d="M280 224V247M380 224V247" stroke="#be924a" stroke-width="2"/><rect x="42" y="209" width="30" height="54" rx="3" fill="#355f76"/><path d="M57 219V251" stroke="#76ecac" stroke-width="4"/><text x="107" y="284" fill="${text}" font-size="12">平行光管</text><text x="453" y="104" fill="${text}" font-size="12">望远镜</text><text x="303" y="389" fill="${text}" font-size="11">精密测角 · 双窗口读数</text>${hot('collimator',158,210,'01')}${hot('telescope',484,151,'02')}${hot('stage',335,222,'03')}${hot('circle',400,315,'04')}${hot('verniers',280,240,'05')}${hot('slit',112,243,'06')}${hot('grating',339,263,'07')}${hot('lamp',55,213,'08')}</svg>`;
  }

  function renderPrinciple(){
    $('#app').innerHTML=`<div class="sp-kicker"><span>EXPERIMENT 07 / OPTICS</span><span>观察 · 调节 · 测量 · 验证</span></div><section class="sp-hero"><div class="sp-hero-copy"><p class="sp-eyebrow">SPECTROMETER LABORATORY</p><h1>从一个角度，<br><strong>读懂一束光。</strong></h1><p>让望远镜对准一条谱线，用精密的角度读数，测量三棱镜顶角与汞灯黄双线波长。</p><div class="sp-actions"><a class="sp-button accent" href="#adjustment">开始调节仪器 <span>→</span></a><a class="sp-button" href="#simulation">进入虚拟实验 ↗</a></div></div><div class="sp-hero-figure sp-hero-real"><img src="reference-assets/ustc-spectrometer-photo.jpg" alt="中国科学技术大学公开的分光计实物照片"><span>实物照片 · 中国科学技术大学物理实验教学中心</span></div></section><div class="sp-strip"><div><strong>双游标</strong><span><b>角度差的平均</b>减小度盘偏心影响</span></div><div><strong>±2</strong><span><b>二级衍射光谱</b>同时观测两侧谱线</span></div><div><strong>546.07<small> nm</small></strong><span><b>已知绿线</b>校准光栅常数</span></div></div>
    <div class="sp-section-head"><h2>两种测量，同一套测角方法。</h2><p>先调好仪器，再读取两个位置的双游标。</p></div><div class="sp-grid-2"><article class="sp-panel"><span class="sp-tag">任务 01 · 自准直法</span><h3 style="margin-top:15px">测三棱镜顶角</h3><p>固定棱镜，分别使 AB、AC 两面的反射“十”字像与分划板上交点重合。两个望远镜方向的夹角 θ 与顶角 A 互为补角。</p><div class="sp-formula">A = 180° − θ<small>θ = (Δ₁ + Δ₂) / 2；Δ₁、Δ₂是两个游标各自的转角。</small></div><p>重复记录 3 组。自准直法与选做的反射法光路不同，不能混用顶角公式。</p></article><article class="sp-panel"><span class="sp-tag">任务 02 · 透射光栅</span><h3 style="margin-top:15px">测黄双线波长</h3><p>平行光正入射光栅，满足光程差为波长整数倍的方向形成明亮谱线。测同一谱线的 −2、+2 级，夹角为 2φ。</p><div class="sp-formula">d sin φ = 2λ<small>φ = (Δ₁ + Δ₂) / 4；两个“除以 2”分别来自双游标平均和对称两侧。</small></div><p>先用绿线标定 d，再测黄 1、黄 2。每条谱线记录 2 组，黄 2 位于更外侧。</p></article></div>
    <div class="sp-spectrum">${P.SPECTRAL_LINES.map(l=>`<div class="sp-line-key"><i style="--line-color:${l.color}"></i><div><strong>${l.wavelengthNm.toFixed(2)} <small>nm</small></strong><small>${l.name} · ${l.id==='green'?'用于光栅标定':'计算后比较'}</small></div></div>`).join('')}</div>
    <div class="sp-section-head"><h2>一次完整的实验</h2></div><div class="sp-grid-3"><article class="sp-panel tinted"><h3>01 / 调清与调平</h3><p>分别调目镜和物镜，完成自准直调平；随后调平行光管和光栅。</p></article><article class="sp-panel tinted"><h3>02 / 对准与记录</h3><p>看清目标、微调重合、读两个游标。转动跨过 0°时按环形角差处理。</p></article><article class="sp-panel tinted"><h3>03 / 标定与比较</h3><p>重复测量取平均角，绿线标定光栅，再计算黄线及有符号相对误差。</p></article></div><p class="sp-note">本模块对应指导书必做内容。数字仪器是教学仿真；实际原始记录、仪器参数和操作要求以实验室设备与教师说明为准。</p>${endModule('principle','apparatus')}`;
  }

  const PARTS={
    collimator:{n:'01',name:'平行光管',text:'狭缝位于物镜焦平面时，出射光近似平行。先调好望远镜，再移动狭缝前后位置，使像边缘清晰。',tip:'此时调的是平行光管，不应再转动已经调好的望远镜物镜。'},
    telescope:{n:'02',name:'自准直望远镜',text:'目镜用于看清分划板；物镜用于使平行光成像在分划板平面。望远镜绕中心轴旋转，用于测量不同光线方向。',tip:'自准直反射“十”字像与上交点重合；平行光管调水平时使用下横线。'},
    stage:{n:'03',name:'载物台与调平螺钉',text:'载物台放置三棱镜或光栅，由三颗螺钉调平。对棱镜两光学面分别检查，用半调法交替修正。',tip:'只调清一面还不够。两面同向偏离多与望远镜俯仰有关，反向偏离多与台面倾斜有关。'},
    circle:{n:'04',name:'度盘',text:'指导书度盘共 720 等分，因此每一主尺格为 0.5°，也就是 30′。测量要读同一位置的两个对径游标。',tip:'本仿真用 1′作为读数步长。指导书所列“仪器误差 1′”另属误差指标，不应当作完整游标结构说明。'},
    verniers:{n:'05',name:'两个对径游标',text:'两个窗口相距约 180°。分别计算各窗口从位置一转到位置二的角度，再平均两个转角，以减小度盘偏心影响。',tip:'不能直接平均两个约差 180°的原始读数；“左右窗口”也不是光谱的 −2、+2 两侧。'},
    slit:{n:'06',name:'可调狭缝',text:'狭缝可以调宽度、前后位置和方向。先使光最亮，再调边缘清晰。指导书先调约 0.5 mm，观察像宽约 0.3–0.5 mm。',tip:'把狭缝转水平进行俯仰调整，再转回竖直。刀口闭合后不能继续旋紧。'},
    grating:{n:'07',name:'三棱镜 / 透射光栅',text:'三棱镜用于自准直调节及顶角测量；换上光栅后要重新检查正入射和刻痕方向，不能沿用棱镜调平结果。',tip:'不要触碰、用纸巾或手帕擦拭光栅面。光栅应保持竖直，左右对应谱线应等高。'},
    lamp:{n:'08',name:'汞灯',text:'本实验取汞灯绿线与两条黄色谱线。绿线的已知波长用于反算光栅常数，黄双线是待测对象。',tip:'灯与平行光管狭缝对准。绿色、黄 1、黄 2 都在每一衍射级中出现，别把谱线颜色与级次混淆。'}
  };
  function renderApparatus(){const selected=PARTS[part];$('#app').innerHTML=`${heading('KNOW YOUR INSTRUMENT','先认识每一处调节。','点击结构图上的编号或下方部件名称，理解它改变的物理量。示意图用于结构教学，不代表具体仪器型号。')}<div class="sp-apparatus-layout"><section class="sp-instrument">${instrumentSvg(false,true)}<div class="sp-part-buttons">${Object.entries(PARTS).map(([id,p])=>`<button data-part="${id}" class="${part===id?'active':''}" aria-pressed="${part===id}">${p.n} · ${p.name.split('与')[0].split(' / ')[0]}</button>`).join('')}</div></section><aside class="sp-panel sp-part-detail"><span class="sp-part-number">${selected.n}</span><h2>${selected.name}</h2><p>${selected.text}</p><p class="sp-note">${selected.tip}</p></aside></div><div class="sp-grid-2" style="margin-top:20px"><article class="sp-panel"><h3>读数会跨过 0°</h3><p>第一位置 355°45′，第二位置 115°43′。经过 0°转动，真实转角为 119°58′。</p><div class="sp-formula">Δ = min(|b − a|, 360° − |b − a|)<small>适用于本模块已知转角小于 180°的光路。大转角需按实际转动方向展开。</small></div></article><article class="sp-panel"><h3>双窗口，分别求差</h3><div class="sp-mini-dial"><span>游标Ⅰ</span><strong>350°25′</strong></div><div class="sp-mini-dial"><span>游标Ⅱ</span><strong>170°25′</strong></div><p style="margin:14px 0 0">两个数字代表同一个望远镜方向。移动到另一位置后，再分别算Ⅰ和Ⅱ的转角。</p></article></div>${Guide?Guide.preparation()+Guide.gallery():''}${endModule('apparatus','adjustment')}`;}


  function checks(){const a=state.adjust,l=state.lab;return [
    {name:'分划板叉丝清晰',ok:Math.abs(a.eye)<=.25},
    {name:'反射像清晰，已左右移眼检查无视差',ok:Math.abs(a.focus)<=.25&&l.parallaxChecked},
    {name:'双面平面镜正、背面均已重合并复查',ok:Math.abs(a.telescopeTilt)<=.15&&Math.abs(a.stageTilt)<=.15&&l.faces.AB&&l.faces.AC},
    {name:'横置狭缝调平检查完成，已恢复竖直',ok:Math.abs(a.collFocus)<=.25&&Math.abs(a.collTilt)<=.15&&l.collChecked&&l.slitOrientation==='vertical'},
    {name:'光栅正入射、左右谱线等高已复查',ok:Math.abs(a.normal)<=.15&&Math.abs(a.grooves)<=.15&&l.gratingChecked}
  ];}
  function ready(){return checks().every(c=>c.ok);}
  function prismReady(){const l=state.lab;return l.prismFaces.AB&&l.prismFaces.AC&&Math.abs(l.prismTilt.x)<=.15&&Math.abs(l.prismTilt.y)<=.15;}
  function measurementReady(){return state.lab.lampOn&&(state.sim.mode==='prism'?checks().slice(0,3):checks()).every(c=>c.ok)&&(state.sim.mode!=='prism'||prismReady());}
  function setIdeal(){
    for(const k of Object.keys(state.adjust))state.adjust[k]=0;
    Object.assign(state.lab,{lampOn:true,parallaxChecked:true,faces:{AB:true,AC:true},collChecked:true,gratingChecked:true,slitOrientation:'vertical',prismTilt:{x:0,y:0},prismFaces:{AB:true,AC:true},demo:true});
    state.pending={};save();toast('演示状态已载入；可观察和测量，实操检查仍需亲自完成。');
  }
  function changedSetup(key){
    const l=state.lab;
    if(l.demo){Object.assign(l,{parallaxChecked:false,faces:{AB:false,AC:false},prismFaces:{AB:false,AC:false},collChecked:false,gratingChecked:false,demo:false});}
    if(['eye','focus'].includes(key)){l.parallaxChecked=false;l.eyeSeen={left:false,right:false};}
    if(['stageTilt','telescopeTilt'].includes(key)){l.faces={AB:false,AC:false};l.prismFaces={AB:false,AC:false};}
    if(['collFocus','collTilt'].includes(key))l.collChecked=false;
    if(['normal','grooves'].includes(key))l.gratingChecked=false;
    state.pending={};
  }
  function control(id,label){return `<div class="sp-field"><label class="sp-control-label" for="adj-${id}"><span>${label}</span><output id="out-${id}">${state.adjust[id].toFixed(1)}</output></label><input type="range" id="adj-${id}" data-adjust="${id}" min="-3" max="3" step="0.1" value="${state.adjust[id]}" aria-label="${label}"></div>`;}
  function adjustScope(){return R?R.adjustmentScope({adjust:state.adjust,face:adjustFace,eyePosition:state.lab.eyePosition,lampOn:state.lab.lampOn}):'';}
  function workflow(){
    const c=checks(),active=c.findIndex(item=>!item.ok);
    return `<section class="sp-workflow" aria-label="实验操作顺序"><div class="sp-workflow-title"><span class="sp-eyebrow">A STUDENT'S WORKFLOW</span><strong>${state.lab.demo?'当前为演示状态':active<0?'调节检查已完成':`当前：${['看清叉丝','调清反射像并消视差','双面镜各半调平','横缝调平再竖置','光栅正入射与等高'][active]}`}</strong></div><ol>${['调目镜','消视差','双面复查','调平行光管','换光栅检查'].map((title,i)=>`<li class="${c[i].ok?'done':i===active?'active':''}"><span>${c[i].ok?'✓':i+1}</span>${title}</li>`).join('')}</ol><p>先依次完成观察与检查；读数时再按“松锁粗转 → 锁紧微调 → 看两个游标 → 记录”操作。</p></section>`;
  }
  function updateAdjustment(){
    const a=state.adjust,l=state.lab;
    $('#adjust-scope').innerHTML=adjustScope();
    $('#adjust-status').innerHTML=checks().map(c=>`<div class="sp-status-row ${c.ok?'ready':''}"><i>${c.ok?'✓':'·'}</i><span>${c.name}</span></div>`).join('');
    $('#workflow').innerHTML=workflow();
    const blur=Math.abs(a.collFocus)*3, y=48+a.collTilt*12;
    $('#collimator-view').innerHTML=`<svg viewBox="0 0 420 100" role="img" aria-label="平行光管狭缝调平：横置狭缝像应落在下横线上"><defs><filter id="coll-blur" filterUnits="userSpaceOnUse" x="-30" y="-30" width="480" height="160"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><path d="M0 48H420M210 0V100" stroke="#97a6ac" stroke-width=".8"/><g filter="url(#coll-blur)" stroke="#ebf7ed" stroke-width="${2+l.slitWidth*15}" opacity="${l.lampOn?1:0}"><path d="${l.slitOrientation==='horizontal'?`M147 ${y}H273`:`M210 ${y-31}V${y+31}`}"/></g></svg>`;
    const gx=210+25*a.normal;
    $('#grating-reflection').innerHTML=`<svg viewBox="0 0 420 100" role="img" aria-label="光栅正入射反射十字和左右等高谱线"><path d="M0 34H420M210 0V100" stroke="#82989f" stroke-width=".8"/><g opacity="${l.lampOn?1:0}"><path d="M${gx-13} 34H${gx+13}M${gx} 20V48" stroke="#84df9b" stroke-width="2"/><path d="M100 ${54+a.grooves*11}V${88+a.grooves*11}M320 ${54-a.grooves*11}V${88-a.grooves*11}" stroke="#8bd1a0" stroke-width="3"/></g></svg>`;
    $('#adjust-state').textContent=l.demo?'演示状态：观察调好后的视场；重置后可亲手完成全部检查。':ready()?'✓ 调节检查已完成，可以进入测量。':'观察成像后点击对应检查；改动相关旋钮会使旧检查失效。';
    $('#eye-position-note').textContent=`眼睛位置：${l.eyePosition<0?'偏左':l.eyePosition>0?'偏右':'居中'} · 已观察${l.eyeSeen.left?'左':''}${l.eyeSeen.right?'右':''}${!l.eyeSeen.left&&!l.eyeSeen.right?'：尚未左右移眼':''}`;
    $('#parallax-check').textContent=l.parallaxChecked?'✓ 无视差已确认':'检查：清晰且无视差';
    $('#face-check').textContent=l.faces[adjustFace]?'✓ 本面已复查':'确认本面与上交点重合';
    $('#collimator-check').textContent=l.collChecked?'✓ 横缝调平已确认':'确认横缝清晰且落在下横线';
    $('#grating-check').textContent=l.gratingChecked?'✓ 光栅检查已确认':'确认正入射、左右等高';
    $('#lamp-toggle').textContent=l.lampOn?'照明已开 · 关闭':'照明已关 · 开启';
  }
  function renderAdjustment(){
    const l=state.lab;
    $('#app').innerHTML=`${heading('ALIGNMENT BEFORE MEASUREMENT','在目镜里，找到调节的依据。','先看清固定叉丝，再看清反射像；左右移眼确认无视差，翻转双面平面镜完成各半调节。旋钮读数仅表示虚拟机械位置。')}<div id="workflow"></div><div class="sp-adjust-layout"><div class="sp-controls"><section class="sp-panel"><div class="sp-step-title"><span>01—02</span><h3>看清叉丝，再调反射像</h3></div>${control('eye','目镜调焦手轮')}${control('focus','望远镜物镜调焦')}<p class="sp-muted">目镜只调清固定叉丝。反射像调清后，左右移动眼睛，看亮十字与叉丝是否相对移动。</p><div class="sp-field"><label for="eye-position">移动眼睛检查视差</label><input type="range" min="-1" max="1" step="1" id="eye-position" value="${l.eyePosition}"><span id="eye-position-note" class="sp-muted"></span></div><button class="sp-button small" id="parallax-check">检查：清晰且无视差</button></section><section class="sp-panel"><div class="sp-step-title"><span>03</span><h3>双面平面镜 · 各半调节</h3></div>${control('stageTilt','载物台调平螺钉')}${control('telescopeTilt','望远镜俯仰螺钉')}<p class="sp-muted">先使正面像重合，翻转平面镜 180°。若背面偏离，调台面消去一半高度差，再调望远镜消去另一半；反复翻面复查。这里使用双面镜，测顶角时再换三棱镜。</p><div class="sp-actions"><button id="half-stage" class="sp-button small">台面：消去当前高度差的一半</button><button id="half-telescope" class="sp-button small">俯仰：使当前像重合</button></div><p class="sp-muted">两个辅助按钮示范各半操作；也可以亲自拖动对应旋钮。</p><button class="sp-button small" id="face-check">确认本面与上交点重合</button></section><section class="sp-panel"><div class="sp-step-title"><span>04</span><h3>狭缝先横置调平，再恢复竖直</h3></div>${control('collFocus','平行光管狭缝前后位置')}${control('collTilt','平行光管俯仰螺钉')}<label class="sp-field">狭缝方向<select id="slit-orientation"><option value="horizontal" ${l.slitOrientation==='horizontal'?'selected':''}>横置 · 对准下横线</option><option value="vertical" ${l.slitOrientation==='vertical'?'selected':''}>竖置 · 准备测谱</option></select></label><p class="sp-muted">保持望远镜原有调焦位置，移动狭缝使像细锐清晰，横置时调至下横线并检查，最后转回竖直。</p><button id="collimator-check" class="sp-button small">确认横缝清晰且落在下横线</button></section><section class="sp-panel"><div class="sp-step-title"><span>05</span><h3>换上光栅，再检查光路</h3></div>${control('normal','光栅面法线调整')}${control('grooves','光栅刻痕方向调整')}<p class="sp-muted">先看反射十字是否与上交点重合，再看左右谱线是否等高。实际仪器还需翻转复查正入射。不要触碰光学表面。</p><button id="grating-check" class="sp-button small">确认正入射、左右等高</button></section></div><div class="sp-observation-column"><section class="sp-adjust-view"><div class="sp-tools-row"><span class="sp-tag sim">动态教学仿真</span><button class="sp-button small" id="lamp-toggle"></button></div><div class="sp-segment" aria-label="观察双面平面镜"><button data-face="AB" aria-pressed="${adjustFace==='AB'}">平面镜正面</button><button data-face="AC" aria-pressed="${adjustFace==='AC'}">翻转 180° · 背面</button></div><div class="sp-eyepiece" id="adjust-scope"></div><div class="sp-scope-legend"><span>暗线 · 固定分划板</span><span>绿十字 · 反射像</span></div><div id="adjust-status" class="sp-status-list" aria-live="polite"></div><p id="adjust-state" class="sp-note"></p><div class="sp-actions"><button id="ideal-adjustment" class="sp-button small">进入演示状态</button><button id="reset-adjustment" class="sp-button small">从待调仪器重新练习</button></div></section><section class="sp-panel" style="margin-top:20px"><h3>平行光管 · 下横线参考</h3><div id="collimator-view" class="sp-sim-scope"></div></section><section class="sp-panel" style="margin-top:20px"><h3>光栅 · 正入射与左右等高</h3><div id="grating-reflection" class="sp-sim-scope"></div></section>${Guide?Guide.card('tjut-half',true):''}<p class="sp-note">照片和原始教学图用于对照；动态目镜是几何光学与成像模糊的教学近似。旋钮位置、视差幅度和线宽不对应某台实物仪器的标定曲线。</p></div></div>${endModule('adjustment','operation')}`;
    updateAdjustment();
    document.querySelectorAll('[data-adjust]').forEach(input=>input.addEventListener('input',()=>{changedSetup(input.dataset.adjust);state.adjust[input.dataset.adjust]=Number(input.value);$(`#out-${input.dataset.adjust}`).textContent=Number(input.value).toFixed(1);save();updateAdjustment();}));
    $('#eye-position').oninput=e=>{l.eyePosition=Number(e.target.value);if(l.eyePosition<0)l.eyeSeen.left=true;if(l.eyePosition>0)l.eyeSeen.right=true;save();updateAdjustment();};
    $('#slit-orientation').onchange=e=>{l.slitOrientation=e.target.value;state.pending={};save();updateAdjustment();};
  }
  function checkAction(id){
    const a=state.adjust,l=state.lab;
    if(!l.lampOn){toast('先开启照明，观察实际出现的像。');return;}
    if(id==='parallax-check'){
      if(Math.abs(a.eye)>.25||Math.abs(a.focus)>.25){toast('叉丝或反射像仍模糊；请先分别调焦。');return;}
      if(!l.eyeSeen.left||!l.eyeSeen.right){toast('请先把眼睛移向左、右两边，比较反射像与固定叉丝。');return;}
      l.parallaxChecked=true;
    }else if(id==='face-check'){
      if(!l.parallaxChecked){toast('先完成清晰、无视差检查。');return;}
      if(Math.abs((adjustFace==='AB'?1:-1)*a.stageTilt-a.telescopeTilt)>.15){toast('当前反射十字尚未与上交点重合；请观察后继续调节。');return;}
      l.faces[adjustFace]=true;
    }else if(id==='collimator-check'){
      if(!checks().slice(0,3).every(c=>c.ok)){toast('先完成望远镜调焦和双面镜调平。');return;}
      if(l.slitOrientation!=='horizontal'){toast('先把狭缝横置，对照下横线检查俯仰。');return;}
      if(Math.abs(a.collFocus)>.25||Math.abs(a.collTilt)>.15){toast('狭缝仍不清晰或未落在下横线。');return;}
      l.collChecked=true;
    }else if(id==='grating-check'){
      if(!checks().slice(0,4).every(c=>c.ok)){toast('先调好平行光管，检查横缝后恢复竖置。');return;}
      if(Math.abs(a.normal)>.15||Math.abs(a.grooves)>.15){toast('反射十字或左右谱线高度尚未对齐。');return;}
      l.gratingChecked=true;
    }
    save();updateAdjustment();toast('已记录这一步观察检查。');
  }

  function targetAngle(){return state.sim.mode==='prism'?(state.sim.side==='left'?-60:60):P.diffractionAngle(lineById[state.sim.line].wavelengthNm,state.sim.linesPerMm,2)*(state.sim.side==='left'?-1:1);}
  function bearing(){return P.normalizeAngle(350+state.sim.angleMinutes/60);}
  function simulatedReadings(){
    // The two index marks carry opposite eccentricity terms; only the visible
    // minute-quantized strings are ever saved to the raw measurement table.
    const theta=bearing(),eccentricity=.012*Math.sin(theta*Math.PI/180);
    return {v1:P.formatAngle(theta+eccentricity),v2:P.formatAngle(theta+180-eccentricity)};
  }
  function pendingKey(){return `${state.sim.mode}:${state.sim.linesPerMm}:${state.sim.mode==='grating'?state.sim.line:'prism'}:${state.sim.round}`;}
  function pendingPair(){return state.pending[pendingKey()]||{};}
  function sideName(side){return state.sim.mode==='prism'?(side==='left'?'AB 面':'AC 面'):(side==='left'?'−2 级':'+2 级');}
  function opticalTable(){
    const t=state.sim.angleMinutes/60,cx=330,cy=230,r=170;
    const ticks=Array.from({length:72},(_,i)=>{const a=point(i*5,r,cx,cy),b=point(i*5,r-(i%6===0?10:4),cx,cy);return lineSvg(a.x,a.y,b.x,b.y,'#416980',i%6===0?1.3:.8);}).join('');
    const pathEnd=point(t,247,cx,cy);let rays='';
    if(state.sim.mode==='grating'){
      for(const k of [1,2])for(const s of [-1,1])for(const l of P.SPECTRAL_LINES){const a=s*P.diffractionAngle(l.wavelengthNm,state.sim.linesPerMm,k),p=point(a,270,cx,cy);rays+=lineSvg(cx,cy,p.x,p.y,l.color,k===2?1.2:.7,`opacity="${k===2?.8:.3}"`);}
      rays+=lineSvg(cx,cy,610,cy,'#c6dbe5',1.2,'stroke-dasharray="5 5"');
      for(const k of [1,2])for(const s of [-1,1]){const p=point(s*P.diffractionAngle(576.96,state.sim.linesPerMm,k),294,cx,cy);rays+=`<text x="${p.x}" y="${p.y+4}" fill="#98b8c9" text-anchor="middle" font-size="11">${s<0?'−':'+'}${k}</text>`;}
    }else{for(const s of [-1,1]){const p=point(s*60,220,cx,cy);rays+=lineSvg(cx,cy,p.x,p.y,'#79d6c3',1.5,'stroke-dasharray="6 4"')+`<text x="${p.x+12}" y="${p.y}" fill="#b8dccd" font-size="12">${s<0?'AB':'AC'} 法线</text>`;}}
    return `<svg viewBox="0 0 680 455" role="img" aria-label="分光计俯视光路图，望远镜随角度控制旋转"><defs><radialGradient id="table-bg"><stop stop-color="#244e65"/><stop offset="1" stop-color="#0d293d"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="198" fill="url(#table-bg)" stroke="#25485c"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#416980"/><circle cx="${cx}" cy="${cy}" r="116" fill="none" stroke="#42657a" stroke-dasharray="2 6"/>${ticks}${rays}${state.sim.mode==='grating'?`<path d="M48 ${cy}H${cx}" stroke="#c4f3bd" stroke-width="2"/>`:''}<rect x="48" y="${cy-17}" width="149" height="34" fill="#597d91" stroke="#83a4b4"/><rect x="58" y="${cy-22}" width="19" height="44" fill="#183e55"/><rect x="175" y="${cy-21}" width="18" height="42" fill="#183e55"/><text x="78" y="${cy+52}" fill="#91b5c8" font-size="11">${state.sim.mode==='prism'?'棱镜测量使用望远镜内光源':'汞灯 → 平行光管'}</text><circle cx="${cx}" cy="${cy}" r="43" fill="#214f68" stroke="#76a1b5" stroke-width="2"/>${state.sim.mode==='prism'?`<path d="M${cx-26} ${cy-26} ${cx+18} ${cy} ${cx-26} ${cy+26}Z" fill="#6ec7dd33" stroke="#9de7ef" stroke-width="2"/>`:`<path d="M${cx} ${cy-34}V${cy+34}" stroke="#91dded" stroke-width="6"/><path d="M${cx-5} ${cy-28}H${cx+5}M${cx-5} ${cy-18}H${cx+5}M${cx-5} ${cy-8}H${cx+5}M${cx-5} ${cy+2}H${cx+5}M${cx-5} ${cy+12}H${cx+5}M${cx-5} ${cy+22}H${cx+5}" stroke="#234f67"/>`}<g transform="translate(${cx} ${cy}) rotate(${-t})"><path d="M48 0H125" stroke="#86a9b9" stroke-width="8"/><rect x="117" y="-17" width="121" height="34" rx="3" fill="#87a8b8" stroke="#c1d8e4"/><rect x="135" y="-22" width="19" height="44" fill="#244e66"/><rect x="230" y="-13" width="33" height="26" fill="#2a5269"/><path d="M118 0H232" stroke="#dcecf2" stroke-opacity=".4"/>${state.sim.mode==='prism'?'<path d="M44 -4H112M112 4H44" stroke="#7ae5ba" stroke-width="1.5"/><path d="M49 -8 43 -4 49 0M107 0 113 4 107 8" fill="none" stroke="#7ae5ba"/>':''}</g><circle cx="${cx}" cy="${cy}" r="4" fill="#d5edf5"/><text x="28" y="30" fill="#7da7bd" font-size="10" letter-spacing="2">TOP VIEW / OPTICAL PATH</text><text x="${clamp(pathEnd.x-20,40,590)}" y="${clamp(pathEnd.y-33,45,420)}" fill="#d1e8f4" font-size="11">望远镜</text><text x="24" y="428" fill="#739db4" font-size="10">仿真光路 · 角度刻度为示意 · 正式读数见双游标窗口</text></svg>`;
  }

  function measurementScope(){return R?R.measurementScope({mode:state.sim.mode,angleDeg:state.sim.angleMinutes/60,linesPerMm:state.sim.linesPerMm,round:state.sim.round,side:state.sim.side,adjust:state.adjust,prismTilt:state.lab.prismTilt,slitWidth:state.lab.slitWidth,slitOrientation:state.lab.slitOrientation,eyePosition:state.lab.eyePosition,lampOn:state.lab.lampOn}):'';}
  function clearReadings(){for(const id of ['reading-one','reading-two'])if($('#'+id))$('#'+id).value='';if($('#reading-error'))$('#reading-error').textContent='';}
  function measurementGate(){
    if(state.sim.mode==='prism'&&!prismReady())return '换上三棱镜后，保持望远镜俯仰不动，调载物台并分别复查 AB、AC 两个面。';
    if(!measurementReady())return '先完成仪器调节检查并打开照明。';
    if(!state.lab.telescopeLocked)return '先松锁粗转找到谱线，再锁紧望远镜，用微调螺钉对准。';
    if(state.sim.mode==='grating'&&state.sim.line!=='green'&&state.lab.slitWidth>.35&&!state.lab.free)return '狭缝过宽，黄双线难以分辨；收窄狭缝后再读数。';
    if(!state.lab.free&&Math.abs(state.sim.angleMinutes/60-targetAngle())*60>1.5)return '请观察目镜，使当前目标像与准线重合；自由测量模式可保留偏位读数。';
    return '';
  }
  function updateSimulation(){
    const readings=simulatedReadings(),diff=Math.abs(state.sim.angleMinutes/60-targetAngle())*60,pending=pendingPair(),l=state.lab;
    $('#optical-table').innerHTML=opticalTable();$('#measurement-scope').innerHTML=measurementScope();
    $('#vernier-one').textContent=l.reveal?readings.v1:'先读主尺，再找游标重合线';$('#vernier-two').textContent=l.reveal?readings.v2:'两窗相差约 180°';
    if(R){$('#vernier-window-one').innerHTML=R.vernier(P.parseAngle(readings.v1)).svg;$('#vernier-window-two').innerHTML=R.vernier(P.parseAngle(readings.v2)).svg;}
    $('#telescope-value').textContent=l.reveal?P.formatAngle(bearing()):'观察目镜与游标窗';
    $('#telescope-angle').value=state.sim.angleMinutes;$('#telescope-angle').disabled=l.telescopeLocked;
    document.querySelectorAll('[data-nudge]').forEach(b=>b.disabled=!l.telescopeLocked);
    $('#near-target').disabled=l.telescopeLocked;
    $('#telescope-lock').textContent=l.telescopeLocked?'已锁紧 · 松开粗调':'松开状态 · 锁紧后微调';
    $('#lock-state').textContent=l.telescopeLocked?`微调剩余行程 ${Math.max(0,30-Math.abs(state.sim.angleMinutes-l.lockAnchor))}′（本次虚拟行程 ±30′）`:'粗转时握持支臂，不要推镜筒；找到目标附近后再锁紧。';
    const gate=measurementGate();
    $('#capture-feedback').textContent=gate||(l.free&&diff>1.5?'自由测量：本次偏位会进入原始记录，可在结果中观察其影响。':'目标在准线附近；分别读两个游标窗，填好后记录。');
    $('#capture-reading').disabled=Boolean(gate);
    $('#pending-status').innerHTML=['left','right'].map(side=>`<div class="${pending[side]?'recorded':''}">${sideName(side)} ${pending[side]?'✓ 已记录':'· 待读数'}</div>`).join('');
    $('#save-pair').disabled=!(pending.left&&pending.right);
    const kindRows=state.rows.filter(row=>row.source==='simulation'&&row.kind===state.sim.mode&&(row.kind==='prism'||row.nominalDensity===state.sim.linesPerMm));
    $('#record-count').textContent=state.sim.mode==='prism'?`三棱镜已保存 ${kindRows.length} / 3 组。换棱镜后在实物上应固定望远镜俯仰，仅调载物台复查 AB、AC 两面。`:`当前光栅已保存 ${kindRows.length} / 6 组（绿、黄1、黄2各两组）。`;
    if($('#prism-face-state'))$('#prism-face-state').textContent=`AB 面：${l.prismFaces.AB?'✓ 已复查':'待复查'} · AC 面：${l.prismFaces.AC?'✓ 已复查':'待复查'}`;
    $('#measurement-session').innerHTML=`<span class="sp-tag ${l.demo?'sim':'real'}">${l.demo?'演示仪器':'实操检查完成后测量'}</span><span class="sp-muted">${l.free?'自由测量 · 允许偏位记录':'引导测量 · 对准后记录'} · ${l.practice?'手动读取双游标':'自动抄数演示'}</span>`;
  }

  function renderSimulation(){
    const s=state.sim;
    $('#app').innerHTML=`${heading('VIRTUAL MEASUREMENT',s.mode==='prism'?'寻找两个面的反射十字。':'把谱线，带到叉丝中央。','转动望远镜，观察视场，再记录同一位置的两个游标。松锁粗转、锁紧微调，再从两个游标窗读取角度。计算只使用你实际记录的原始字符串。')}<div id="measurement-session" class="sp-measurement-session"></div><div class="sp-tools-row"><div class="sp-segment" style="margin:0"><button data-mode="grating" aria-pressed="${s.mode==='grating'}">光栅 · 测波长</button><button data-mode="prism" aria-pressed="${s.mode==='prism'}">棱镜 · 测顶角</button></div><div class="sp-actions"><span class="sp-tag sim">仿真测量</span><button class="sp-button small" id="sim-ideal">载入调好的演示仪器</button></div></div><div class="sp-sim-layout"><div><section class="sp-optical-table"><div class="sp-figure-top"><span>${s.mode==='grating'?'TRANSMISSION GRATING':'AUTOCOLLIMATION PRISM'}</span><span>${s.mode==='grating'?'正式记录：±2 级':'固定棱镜 · 转动望远镜'}</span></div><div id="optical-table"></div><div class="sp-figure-caption">${s.mode==='grating'?'浅色内侧为 ±1 级，外侧为 ±2 级；颜色表示谱线。实际黄双线夹角很小，请使用右侧放大视场。':'虚线表示两个光学面的法线；望远镜分别接收自准直反射像。两方向夹角约 120°，由补角求棱镜顶角。'}</div></section><section class="sp-vernier-lab"><div class="sp-section-head"><h3>从游标窗读数</h3><button class="sp-button small" data-reference="ustc-vernier">对照实物照片 ↗</button></div><p class="sp-muted">虚拟配置：主尺每格 30′，游标 30 格跨主尺 29 格，分度 1′。先读游标零线左侧的主尺（整度 / 30′），再加游标重合线的分数。</p><div class="sp-vernier-windows"><div><h4>游标Ⅰ</h4><div id="vernier-window-one"></div><p id="vernier-one" class="sp-reading-answer"></p></div><div><h4>游标Ⅱ</h4><div id="vernier-window-two"></div><p id="vernier-two" class="sp-reading-answer"></p></div></div><label class="sp-check"><input type="checkbox" id="reveal-readings" ${state.lab.reveal?'checked':''}>显示核对读数（先自己读，再核对）</label></section><p class="sp-note">中央方向仿真设为 350°，因此测量可能跨过 0°。这是正常的度盘环绕；不要把它当作异常跳变。</p><p id="record-count" class="sp-muted"></p><a href="#data" class="sp-button">查看已保存的数据 →</a></div><div class="sp-sim-controls">${s.mode==='prism'?`<section class="sp-panel sp-prism-setup"><p class="sp-eyebrow">CHANGE THE OPTICAL ELEMENT</p><h3>换三棱镜 · 只调载物台</h3><p class="sp-muted">双面镜调平后保持望远镜俯仰不变。三棱镜两工作面法线夹角约 120°，分别观察 AB、AC 面反射像，仅用台面两方向调平。</p>${['x','y'].map(axis=>`<label class="sp-field">平台 ${axis.toUpperCase()} 向调平螺钉<input id="prism-tilt-${axis}" data-prism-axis="${axis}" type="range" min="-3" max="3" step=".1" value="${state.lab.prismTilt[axis]}"></label>`).join('')}<button class="sp-button small" id="prism-face-check">确认当前棱镜面已对准上交点</button><p id="prism-face-state" class="sp-muted"></p></section>`:''}<section class="sp-panel"><div class="sp-grid-2">${s.mode==='grating'?`<div class="sp-field"><label for="sim-line">目标谱线</label><select id="sim-line">${P.SPECTRAL_LINES.map(l=>`<option value="${l.id}" ${s.line===l.id?'selected':''}>${l.name}</option>`).join('')}</select></div>`:''}<div class="sp-field"><label for="sim-side">观测位置</label><select id="sim-side"><option value="left" ${s.side==='left'?'selected':''}>${sideName('left')}</option><option value="right" ${s.side==='right'?'selected':''}>${sideName('right')}</option></select></div><div class="sp-field"><label for="sim-round">记录轮次</label><select id="sim-round">${Array.from({length:s.mode==='prism'?3:2},(_,i)=>`<option value="${i+1}" ${s.round===i+1?'selected':''}>第 ${i+1} 轮</option>`).join('')}</select></div>${s.mode==='grating'?`<div class="sp-field"><label for="sim-density">虚拟光栅设定</label><select id="sim-density">${[250,300,350].map(n=>`<option value="${n}" ${n===s.linesPerMm?'selected':''}>${n} 线/mm</option>`).join('')}</select></div>`:''}</div><button class="sp-button small" id="near-target" style="width:100%;margin-top:15px">移至目标附近 →</button></section><section class="sp-panel"><div class="sp-scope-label"><span>目镜视场</span><span>动态仿真 · 圆形视场</span></div><div id="measurement-scope" class="sp-sim-scope sp-real-scope"></div><div class="sp-field" ${s.mode==='prism'?'hidden':''}><label for="sim-slit-width">狭缝宽度 <output id="slit-width-value">${state.lab.slitWidth.toFixed(2)} mm</output></label><input id="sim-slit-width" type="range" min="0.03" max="0.8" step="0.01" value="${state.lab.slitWidth}"></div><p class="sp-muted" ${s.mode==='prism'?'hidden':''}>收窄狭缝可分开相邻黄线；过宽或离焦会重叠。亮度和线宽是教学近似。</p><button class="sp-button small" id="telescope-lock" style="width:100%"></button><p id="lock-state" class="sp-muted"></p><label for="telescope-angle" class="sp-control-label" style="margin-top:15px"><span>望远镜转角 · 粗调</span></label><input id="telescope-angle" type="range" min="-4800" max="4800" step="1" value="${s.angleMinutes}" style="width:100%;accent-color:#257b9b" aria-label="望远镜转角"><div class="sp-bearings" id="telescope-value"></div><div class="sp-nudge"><button class="sp-button small" data-nudge="-1">−1′ 微调</button><button class="sp-button small" data-nudge="1">+1′ 微调</button></div><p id="capture-feedback" class="sp-live-feedback" style="margin:15px 0" aria-live="polite"></p><div class="sp-manual-readings"><label class="sp-check"><input id="practice-readings" type="checkbox" ${state.lab.practice?'checked':''}>手动读数练习</label><div class="sp-grid-2"><label class="sp-field">游标Ⅰ原始读数<input id="reading-one" placeholder="例：330 52" autocomplete="off"></label><label class="sp-field">游标Ⅱ原始读数<input id="reading-two" placeholder="例：150 52" autocomplete="off"></label></div><p id="reading-error" class="sp-form-error" aria-live="polite"></p><label class="sp-check"><input id="free-measurement" type="checkbox" ${state.lab.free?'checked':''}>自由测量：允许未居中记录，观察偏位误差</label></div><button class="sp-button primary" id="capture-reading" style="width:100%">记录当前位置双游标</button></section><section class="sp-panel"><h3>收齐两个方向，保存一组</h3><div class="sp-capture-status" id="pending-status"></div><button class="sp-button" id="save-pair" style="width:100%;margin-top:13px">保存本组原始读数</button><p class="sp-muted" style="margin:10px 0 0">未保存的半组读数在刷新后清除；更换光栅时重新开始收集。</p></section></div></div><div class="sp-note" ${s.mode==='prism'?'hidden':''}>指导书建议光栅观测顺序：−2 黄2 → −2 黄1 → −2 绿 → +2 绿 → +2 黄1 → +2 黄2，完成两轮。可先记录各谱线一侧，再回来补另一侧。</div>${Guide?`<div class="sp-reference-pair">${Guide.card(s.mode==='prism'?'tjut-section':'mercury-spectrum',true)}<article class="sp-panel"><p class="sp-eyebrow">LOOK THROUGH THE EYEPIECE</p><h3>${s.mode==='prism'?'反射十字应落在上交点。':'黄双线是两条相邻的像。'}</h3><p>${s.mode==='prism'?'望远镜内的照明十字经物镜射出，由棱镜工作面反射回来。保持目镜与望远镜调焦不动，分别对准两个面。':'−2 级的黄2更靠外，+2 级同样如此。两条黄线一直同时参与成像，选择目标只是改变记录标签。把狭缝开宽，观察它们如何逐渐难以分开。'}</p><p>测顶角时换三棱镜，分别找 AB、AC 面的反射十字；不要把光栅谱线的竖丝对准规则，直接替代自准直像与上交点重合的规则。</p></article></div>`:''}${endModule('simulation','data')}`;
    updateSimulation();
    document.querySelectorAll('[data-prism-axis]').forEach(input=>input.oninput=()=>{state.lab.prismTilt[input.dataset.prismAxis]=Number(input.value);state.lab.prismFaces={AB:false,AC:false};state.pending={};clearReadings();save();updateSimulation();});
    $('#sim-slit-width').oninput=e=>{state.lab.slitWidth=Number(e.target.value);$('#slit-width-value').textContent=state.lab.slitWidth.toFixed(2)+' mm';state.pending={};clearReadings();save();updateSimulation();};
    for(const [id,key] of [['reveal-readings','reveal'],['practice-readings','practice'],['free-measurement','free']])$('#'+id).onchange=e=>{state.lab[key]=e.target.checked;clearReadings();save();updateSimulation();};
    $('#telescope-angle').addEventListener('input',e=>{if(state.lab.telescopeLocked)return;state.sim.angleMinutes=Number(e.target.value);clearReadings();save();updateSimulation();});
    for(const [id,key] of [['sim-line','line'],['sim-side','side'],['sim-round','round'],['sim-density','linesPerMm']])$('#'+id)?.addEventListener('change',e=>{state.sim[key]=['round','linesPerMm'].includes(key)?Number(e.target.value):e.target.value;clearReadings();if(key==='linesPerMm'){state.pending={};toast('光栅已更换，未保存的读数已清除；已保存数据按光栅设定分别查看。');}save();updateSimulation();});
  }

  function capture(){
    const gate=measurementGate();if(gate){toast(gate);return;}
    const actual=simulatedReadings();let readings=actual;
    if(state.lab.practice){
      readings={v1:$('#reading-one').value,v2:$('#reading-two').value};
      try{
        for(const key of ['v1','v2']){
          const value=P.parseAngle(readings[key]);
          if(Math.abs(P.angularDifference(value,P.parseAngle(actual[key])))>1/120)throw new Error(`${key==='v1'?'游标Ⅰ':'游标Ⅱ'}与当前刻度窗不符。先读主尺，再加重合游标线；可打开核对读数检查。`);
        }
        if(Math.abs(P.angleSeparation(P.parseAngle(readings.v1),P.parseAngle(readings.v2))-180)>.1)throw new Error('两个游标应约差 180°，请复查。');
      }catch(error){$('#reading-error').textContent=error.message;toast('读数尚未保存，请检查输入。');return;}
    }
    const key=pendingKey();state.pending[key]||={};state.pending[key][state.sim.side]={...readings,offsetArcmin:(state.sim.angleMinutes/60-targetAngle())*60,readManually:state.lab.practice};
    save();updateSimulation();toast(`${sideName(state.sim.side)}的原始读数已记录`);
  }

  function savePair(){
    const pending=pendingPair(),s=state.sim;if(!pending.left||!pending.right)return;
    const record={id:newRecordId(),kind:s.mode,source:'simulation',line:s.mode==='grating'?s.line:'prism',order:2,round:s.round,nominalDensity:s.linesPerMm,left1:pending.left.v1,left2:pending.left.v2,right1:pending.right.v1,right2:pending.right.v2,createdAt:new Date().toISOString(),practice:state.lab.practice,freeMeasurement:state.lab.free,demoInstrument:state.lab.demo,alignmentOffsetsArcmin:[pending.left.offsetArcmin??0,pending.right.offsetArcmin??0]};
    if(state.rows.some(r=>r.source==='simulation'&&r.kind===record.kind&&r.line===record.line&&r.round===record.round&&(r.kind==='prism'||r.nominalDensity===record.nominalDensity))){toast('这一轮已有记录。请切换轮次，或在数据处理页删除旧记录后重测。');return;}
    try{record.kind==='prism'?P.analyzePrismPair(record):P.analyzeGratingPair(record,{linesPerMm:record.nominalDensity});}catch(error){toast(error.message);return;}
    if(state.rows.length>=500){toast('已达到 500 组记录上限，请先导出并删除旧记录。');return;}
    state.rows.push(record);delete state.pending[pendingKey()];save();updateSimulation();toast('已保存一组仿真原始读数');
  }

  function activeRows(){const density=state.dataSource==='simulation'?state.sim.linesPerMm:state.nominalDensity;return state.rows.filter(r=>r.source===state.dataSource&&(r.kind==='prism'||r.nominalDensity===density));}
  function dataset(){return P.analyzeDataset(activeRows().filter(r=>r.kind==='grating'),{linesPerMm:state.dataSource==='simulation'?state.sim.linesPerMm:state.nominalDensity});}
  function prismDataset(){const rows=[],errors=[];activeRows().filter(r=>r.kind==='prism').forEach(row=>{try{rows.push({...P.analyzePrismPair(row),raw:row});}catch(error){errors.push({row,message:error.message});}});return {rows,errors,summary:P.summarize(rows.map(r=>r.apexAngleDeg))};}
  function numeric(value,digits=2){return Number.isFinite(value)?value.toFixed(digits):'—';}
  function signed(value,digits=3){return Number.isFinite(value)?(value>=0?'+':'')+value.toFixed(digits):'—';}
  function rawTable(rows,kind){if(!rows.length)return `<div class="sp-empty">${kind==='prism'?'尚无棱镜记录。':'尚无光栅记录。'}可以在虚拟实验中采集，或使用下方表单录入实测读数。</div>`;
    const d=dataset(),prism=prismDataset();return `<div class="sp-table-wrap"><table class="sp-table"><caption>${kind==='prism'?'自准直法 · 每组两个反射面，分别读两个游标。':'二级光谱 · 每组 −2、+2 两侧，分别读两个游标。'}</caption><thead><tr><th>记录</th><th>${kind==='prism'?'AB 面':'−2 级'} · Ⅰ</th><th>${kind==='prism'?'AB 面':'−2 级'} · Ⅱ</th><th>${kind==='prism'?'AC 面':'+2 级'} · Ⅰ</th><th>${kind==='prism'?'AC 面':'+2 级'} · Ⅱ</th><th>${kind==='prism'?'顶角 A':'衍射角 φ'}</th><th>操作</th></tr></thead><tbody>${rows.map((r,i)=>{const result=kind==='prism'?prism.rows.find(x=>x.raw.id===r.id):d.rows.find(x=>x.rowId===r.id);const error=kind==='prism'?prism.errors.find(x=>x.row.id===r.id):d.errors.find(x=>x.rowId===r.id);return `<tr><td>${kind==='prism'?'棱镜':esc(lineById[r.line]?.name||r.line)} · 第 ${esc(r.round||i+1)} 组</td>${['left1','left2','right1','right2'].map(k=>`<td>${esc(r[k])}</td>`).join('')}<td>${result?P.formatAngle(kind==='prism'?result.apexAngleDeg:result.phiDeg,2):'无效'}${error?`<small style="color:#ad4c44">${esc(error.message)}</small>`:''}</td><td><button class="sp-delete" data-delete="${esc(r.id)}" aria-label="删除${kind==='prism'?'棱镜':esc(lineById[r.line]?.name)}第${esc(r.round||i+1)}组">删除</button></td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function renderData(){
    const rows=activeRows(),d=dataset(),prism=prismDataset(),gRows=rows.filter(r=>r.kind==='grating'),pRows=rows.filter(r=>r.kind==='prism'),green=d.groups.find(g=>g.line==='green'),y1=d.groups.find(g=>g.line==='yellow1'),y2=d.groups.find(g=>g.line==='yellow2');
    $('#app').innerHTML=`${heading('FROM READINGS TO RESULTS','每一个结果，都能回到原始读数。','先分别计算两个游标的环形角差，再求衍射角或顶角。重复记录先取平均角，用绿线确定光栅常数，最后求黄双线波长。')}<div class="sp-tools-row"><div class="sp-field"><label for="data-source">当前数据集</label><select id="data-source"><option value="simulation" ${state.dataSource==='simulation'?'selected':''}>仿真练习数据</option><option value="measurement" ${state.dataSource==='measurement'?'selected':''}>手动录入的实测数据</option></select></div><div class="sp-field"><label for="data-density">${state.dataSource==='simulation'?'虚拟光栅数据分组':'实物光栅数据分组 · 名义密度（线/mm）'}</label>${state.dataSource==='simulation'?`<select id="data-density">${[250,300,350].map(n=>`<option value="${n}" ${state.sim.linesPerMm===n?'selected':''}>${n} 线/mm</option>`).join('')}</select>`:`<input id="data-density" type="number" min="100" max="600" step="1" value="${state.nominalDensity}" aria-label="名义刻线密度">`}</div><div class="sp-actions"><button class="sp-button" id="export-csv" ${rows.length?'':'disabled'}>导出 CSV ↓</button><button class="sp-button" id="print-results">打印结果</button></div></div><p class="sp-note ${state.dataSource==='simulation'?'warning':''}">${state.dataSource==='simulation'?'当前为仿真数据，已与实测数据分开。不同虚拟光栅的记录按设定分别计算，不混合标定。':'实测记录按名义刻线密度分别计算。相同密度仍可能来自不同实物光栅或调整状态；更换同密度光栅前，请先导出并删除旧记录，避免混用。原始记录仍需按课程要求由教师确认。'}</p><div class="sp-result-grid"><article class="sp-result"><span>绿线标定 · 光栅常数 d</span><strong>${numeric(d.calibratedSpacingNm,2)}<small>nm</small></strong><p>${green?`${green.count} 组绿线 · 折合 ${numeric(d.calibratedLinesPerMm,3)} 线/mm`:'等待有效绿线记录'}</p></article><article class="sp-result"><span>黄 1 · 平均角计算波长</span><strong>${numeric(y1?.meanWavelengthNm,2)}<small>nm</small></strong><p>${y1?`${d.calibrationSource==='green'?'绿线标定后':'按名义密度暂算'} · E = ${signed(y1.relativeErrorPercent)}%`:'参考值 576.96 nm'}</p></article><article class="sp-result"><span>黄 2 · 平均角计算波长</span><strong>${numeric(y2?.meanWavelengthNm,2)}<small>nm</small></strong><p>${y2?`${d.calibrationSource==='green'?'绿线标定后':'按名义密度暂算'} · E = ${signed(y2.relativeErrorPercent)}%`:'参考值 579.07 nm'}</p></article></div>
    <div class="sp-section-head"><h2>光栅原始记录</h2><span class="sp-tag ${state.dataSource==='simulation'?'sim':'real'}">${state.dataSource==='simulation'?'仿真练习':'手动实测'}</span></div>${rawTable(gRows,'grating')}
    ${d.groups.length?`<div class="sp-table-wrap"><table class="sp-table"><caption>重复测量汇总（角分保留小数仅为计算中间量，不表示原始读数精度增加）</caption><thead><tr><th>谱线</th><th>有效组数</th><th>平均衍射角</th><th>波长 / nm</th><th>有符号 E / %</th><th>重复读数标准误 / nm</th></tr></thead><tbody>${d.groups.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.count} / 2${g.count<2?' · 待补测':''}</td><td>${P.formatAngle(g.meanPhiDeg,3)}</td><td>${numeric(g.meanWavelengthNm,3)}</td><td>${g.line==='green'?'用于标定':signed(g.relativeErrorPercent)}</td><td>${numeric(g.standardErrorNm,3)}${g.count<2?'（需重复测量）':''}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${d.warnings.map(w=>`<p class="sp-note warning">${esc(w)}</p>`).join('')}
    <div class="sp-grid-2"><article class="sp-panel"><h3>计算顺序</h3><div class="sp-formula">φ = (Δ₁ + Δ₂) / 4<small>先分别求两个游标跨零后的角差。</small></div><div class="sp-formula">d = 2λ<sub>G</sub> / sin φ̄<sub>G</sub><small>使用绿线各组平均角 φ̄G；λG = 546.07 nm。</small></div><div class="sp-formula">λ<sub>Y</sub> = d sin φ̄<sub>Y</sub> / 2<small>相对误差 E = (λ测 − λ参考) / λ参考 × 100%，保留正负。</small></div></article><article class="sp-panel"><h3>怎样判断结果是否完整？</h3><div class="sp-status-list">${P.SPECTRAL_LINES.map(l=>{const g=d.groups.find(x=>x.line===l.id);return `<div class="sp-status-row ${g?.count>=2?'ready':''}"><i>${g?.count>=2?'✓':'·'}</i><span>${l.name}：${g?.count||0} 组 / 至少 2 组</span></div>`;}).join('')}<div class="sp-status-row ${prism.rows.length>=3?'ready':''}"><i>${prism.rows.length>=3?'✓':'·'}</i><span>棱镜顶角：${prism.rows.length} 组 / 至少 3 组</span></div></div><p class="sp-note">重复读数标准误只描述这些记录的离散程度，未包含绿线校准、仪器误差、调节偏差和读数偏差，不等于总测量不确定度。绿线参与校准，不能用它的零相对误差证明仪器准确。</p><p class="sp-muted">需要改正某条记录时，先删除该条，再重新录入。导出包含原始读数、计算结果、数据来源和标定状态。</p></article></div>
    <div class="sp-section-head"><h2>三棱镜顶角</h2><p>自准直法 · A = 180° − (Δ₁ + Δ₂) / 2</p></div>${rawTable(pRows,'prism')}${prism.rows.length?`<p class="sp-note success">${prism.rows.length} 组有效记录：平均顶角 <strong>${P.formatAngle(prism.summary.mean,2)}</strong>；重复测量标准误 ${prism.summary.standardError===null?'需至少两组':numeric(prism.summary.standardError*60,3)+'′'}。${state.dataSource==='simulation'?'本仿真设定顶角为 60°。':''}</p>`:''}
    <details class="sp-details" id="manual-entry"><summary>＋ 手动录入一组实测原始读数</summary><div><p class="sp-muted">新增记录归入实测 ${state.nominalDensity} 线/mm 分组，不会覆写仿真读数。需要更改分组时，请先在顶部选择实测数据并修改名义密度。角度输入例：350 25、350°25′、350.4167。分必须小于 60；360°请记为 0°。</p><form id="measurement-form" class="sp-entry-form" novalidate><div class="sp-field wide"><label for="manual-kind">实验类型</label><select id="manual-kind"><option value="grating">光栅 · ±2 级</option><option value="prism">三棱镜 · 自准直法</option></select></div><div class="sp-field wide" id="manual-line-field"><label for="manual-line">谱线</label><select id="manual-line">${P.SPECTRAL_LINES.map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}</select></div>${[['left1','−2 级 · 游标Ⅰ'],['left2','−2 级 · 游标Ⅱ'],['right1','+2 级 · 游标Ⅰ'],['right2','+2 级 · 游标Ⅱ']].map(([id,label])=>`<div class="sp-field"><label for="manual-${id}" data-angle-label="${id}">${label}</label><input id="manual-${id}" name="${id}" type="text" inputmode="text" maxlength="40" autocomplete="off" placeholder="度 分" required></div>`).join('')}<p id="manual-error" class="sp-form-error full" role="alert"></p><div class="sp-actions"><button class="sp-button primary" type="submit">校验并添加实测记录</button><span class="sp-tag real">手动录入 · 实测</span></div></form></div></details>${endModule('data','questions')}`;
    $('#data-source').onchange=e=>{state.dataSource=e.target.value;save();renderData();};
    $('#data-density').onchange=e=>{const value=Number(e.target.value),simulation=state.dataSource==='simulation';if(!Number.isFinite(value)||value<100||value>600||(simulation&&![250,300,350].includes(value))){toast('请输入 100 至 600 线/mm 的名义密度。');e.target.value=simulation?state.sim.linesPerMm:state.nominalDensity;return;}if(simulation){if(value!==state.sim.linesPerMm)state.pending={};state.sim.linesPerMm=value;}else state.nominalDensity=value;save();renderData();};
    $('#manual-kind').onchange=e=>{const isPrism=e.target.value==='prism';$('#manual-line-field').hidden=isPrism;document.querySelectorAll('[data-angle-label]').forEach(el=>{const k=el.dataset.angleLabel;el.textContent=(k.startsWith('left')?(isPrism?'AB 面':'−2 级'):(isPrism?'AC 面':'+2 级'))+' · 游标'+(k.endsWith('1')?'Ⅰ':'Ⅱ');});};
    $('#measurement-form').onsubmit=e=>{e.preventDefault();addManual();};
  }
  function addManual(){
    const kind=$('#manual-kind').value,line=kind==='prism'?'prism':$('#manual-line').value;
    const previousRounds=state.rows.filter(x=>x.kind===kind&&x.line===line&&x.source==='measurement'&&(kind==='prism'||x.nominalDensity===state.nominalDensity)).map(x=>Number.isInteger(x.round)&&x.round>0?x.round:0);
    const r={id:newRecordId(),kind,line,source:'measurement',order:2,nominalDensity:state.nominalDensity,round:Math.max(0,...previousRounds)+1,createdAt:new Date().toISOString()};
    for(const k of ['left1','left2','right1','right2'])r[k]=$('#manual-'+k).value.trim();
    try{kind==='prism'?P.analyzePrismPair(r):P.analyzeGratingPair(r,{linesPerMm:state.nominalDensity});if(state.rows.length>=500)throw new Error('已达到 500 组记录上限，请先导出并删除旧记录。');}
    catch(error){$('#manual-error').textContent=error.message;return;}
    state.rows.push(r);state.dataSource='measurement';save();renderData();toast('已添加实测记录，并切换到实测数据集');
  }
  function csvCell(value){let s=String(value??'');if(/^[=+@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function exportCsv(){
    const rows=activeRows(),d=dataset(),prism=prismDataset();if(!rows.length)return;
    const source=state.dataSource==='simulation'?'仿真练习数据':'手动实测数据';
    const header=['数据来源','实验类型','谱线','轮次','级次','名义刻线密度_线每毫米','位置一_游标I','位置一_游标II','位置二_游标I','位置二_游标II','转角I_度','转角II_度','衍射角或顶角_度','波长_nm','有符号相对误差_百分比','光栅常数_nm','标定方式','校验提示','记录时间'];
    const matrix=[['分光计实验导出',source,'光栅位置一=−2级,位置二=+2级;棱镜位置一=AB面,位置二=AC面'],header];
    for(const row of rows){const res=row.kind==='prism'?prism.rows.find(x=>x.raw.id===row.id):d.rows.find(x=>x.rowId===row.id);const err=row.kind==='prism'?prism.errors.find(x=>x.row.id===row.id):d.errors.find(x=>x.rowId===row.id);
      matrix.push([source,row.kind==='prism'?'自准直法测顶角':'光栅测波长',lineById[row.line]?.name||'棱镜',row.round,row.kind==='grating'?row.order:'',row.nominalDensity,row.left1,row.left2,row.right1,row.right2,res?.separation1Deg,res?.separation2Deg,row.kind==='prism'?res?.apexAngleDeg:res?.phiDeg,row.kind==='grating'?res?.wavelengthNm:'',row.kind==='grating'?res?.relativeErrorPercent:'',row.kind==='grating'?d.effectiveSpacingNm:'',row.kind==='grating'?(d.calibrationSource==='green'?'绿线平均角标定':'名义密度暂算'):'',err?.message||res?.warnings?.join('；')||'',row.createdAt]);}
    matrix.push([],['谱线汇总','组数','平均衍射角_度','平均角计算波长_nm','有符号相对误差_百分比','重复读数标准误_nm']);
    for(const g of d.groups)matrix.push([g.name,g.count,g.meanPhiDeg,g.meanWavelengthNm,g.relativeErrorPercent,g.standardErrorNm]);
    if(prism.rows.length)matrix.push([],['棱镜有效组数','平均顶角_度','重复读数标准误_度'],[prism.rows.length,prism.summary.mean,prism.summary.standardError]);
    matrix.push([],['说明','重复读数标准误不是总测量不确定度。仿真数据不能替代实物原始记录。']);
    const blob=new Blob(['\uFEFF'+matrix.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`spectrometer-${state.dataSource}-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前数据集的原始读数与计算结果');
  }

  const QUESTIONS=[
    {q:'两个游标读数相差约 180°，测角时应该怎样使用？',options:['把同一位置的两个原始读数直接平均。','各自计算两位置间的角差，再平均两个转角。','只读其中一个，另一个仅用于找零。'],answer:1,why:'两个对径窗口用于减小度盘偏心影响。分别求角差后再平均；对 ±2 光谱还要再除以 2 才得到单侧衍射角。'},
    {q:'从 340°20′经过 0°转到 16°01′，转过的小角是多少？',options:['35°41′','324°19′','356°21′'],answer:0,why:'跨零转角为 (360° − 340°20′) + 16°01′ = 35°41′。直接相减会得到错误的大角。'},
    {q:'望远镜已经调好后，狭缝像仍模糊，应优先调哪里？',options:['重新调整望远镜物镜。','旋转度盘读数窗口。','移动平行光管狭缝的前后位置。'],answer:2,why:'已调好望远镜可以接收平行光。调整狭缝位置，使其位于平行光管焦平面；不要破坏望远镜已有调整。'},
    {q:'正式测黄双线前，为什么先测绿线？',options:['用已知绿线波长和平均衍射角标定光栅常数。','因为黄线与绿线的波长相同。','因为绿线的测量结果独立证明了仪器没有误差。'],answer:0,why:'指导书用 546.07 nm 绿线确定 d，再求黄线波长。绿线参与标定，其算回值不能作为独立的准确度检验。'}
  ];
  function renderOperation(){
    $('#app').innerHTML=`${heading('WATCH THE OPERATION','先看一遍，再亲手操作。','按章节回看调焦、各半调节与双游标读数，再到虚拟仪器中练习。观看演示不替代亲自完成仪器调节检查。')}${Video?.render?.() || '<p class="sp-note">操作演示模块未能载入，请刷新页面后重试。</p>'}${endModule('operation','simulation')}`;
    Video?.mount?.($('#app'));
  }

  function renderQuestions(){
    $('#app').innerHTML=`${heading('CHECK YOUR UNDERSTANDING','读数之外，理解每一步。','完成四道自检，解释为什么需要双窗口、如何跨零、该调哪里，以及绿线标定的意义。')}<form id="quiz-form" class="sp-quiz">${QUESTIONS.map((q,i)=>`<fieldset class="sp-question"><legend>${String(i+1).padStart(2,'0')} / ${q.q}</legend><div class="sp-options">${q.options.map((o,j)=>`<label><input type="radio" name="q${i}" value="${j}" ${state.quiz[i]===j?'checked':''}>${o}</label>`).join('')}</div>${quizSubmitted?`<div class="sp-answer ${state.quiz[i]===q.answer?'':'incorrect'}">${state.quiz[i]===q.answer?'✓ 回答正确':'请再想一想'} · ${q.why}</div>`:''}</fieldset>`).join('')}<div class="sp-actions"><button class="sp-button primary" type="submit">检查答案</button><a class="sp-button" href="#data">返回数据处理 →</a><span class="sp-muted" id="quiz-result" aria-live="polite">${quizSubmitted?`答对 ${QUESTIONS.filter((q,i)=>state.quiz[i]===q.answer).length} / 4`:'完成全部题目后可检查答案。'}</span></div></form><div class="sp-section-head"><h2>写进报告前，再检查一次。</h2></div><div class="sp-grid-2"><article class="sp-panel"><h3>操作记录</h3><ul><li>记录两反射面或同一谱线的两个方向。</li><li>每一位置有两个游标读数，标明度与分。</li><li>棱镜 3 组；绿、黄 1、黄 2 各 2 组。</li><li>实测原始数据按课程要求当堂签字。</li></ul></article><article class="sp-panel"><h3>结果说明</h3><ul><li>说明跨零处理及平均角的计算顺序。</li><li>列明光栅常数来自绿线标定还是名义密度。</li><li>解释误差来源，保留相对误差的正负。</li><li>区分重复性统计量与总测量不确定度。</li></ul></article></div><p class="sp-note"><strong>测量前必须记零读数吗？</strong>本实验测量两个方向的角度差，稳定的零点偏移会在相减时抵消，因此不必专门作零差修正。记录中央亮线的方向有助于寻找两侧谱线，但不等于必须把度盘调到 0°。</p>`;
    $('#quiz-form').onchange=e=>{if(e.target.name?.startsWith('q')){state.quiz[Number(e.target.name.slice(1))]=Number(e.target.value);save();}};
    $('#quiz-form').onsubmit=e=>{e.preventDefault();quizSubmitted=true;if(QUESTIONS.every((q,i)=>state.quiz[i]===q.answer))complete('questions');renderQuestions();$('#quiz-result').scrollIntoView({block:'nearest'});};
  }
  function render(){
    Video?.unmount?.();
    const hash=location.hash.slice(1);route=MODULES.some(m=>m[0]===hash)?hash:'principle';
    document.title=`${MODULES.find(m=>m[0]===route)[1]} · 分光计实验`;renderNav();
    ({principle:renderPrinciple,apparatus:renderApparatus,adjustment:renderAdjustment,operation:renderOperation,simulation:renderSimulation,data:renderData,questions:renderQuestions})[route]();report();window.scrollTo(0,0);
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a,[data-part]');if(!target)return;
    if(target.dataset.reference){Guide?.open(target.dataset.reference);return;}
    if(target.dataset.part){part=target.dataset.part;renderApparatus();return;}
    if(target.dataset.complete){const id=target.dataset.complete;
      if(id==='adjustment'&&state.lab.demo){toast('当前是演示状态。重置后亲自完成观察检查，再标记实操完成。');return;}
      if(id==='adjustment'&&!ready()){toast('请先完成仪器调节的全部自检。');return;}
      if(id==='simulation'&&!state.rows.some(r=>r.source==='simulation')){toast('请先保存至少一组仿真读数。');return;}
      if(id==='data'){const d=dataset(),p=prismDataset();if(d.errors.length||p.errors.length||!P.SPECTRAL_LINES.every(l=>d.groups.some(g=>g.line===l.id&&g.count>=2))||p.rows.length<3){toast('请先完成当前数据集：棱镜 3 组，三条谱线各 2 组，并修正无效记录。');return;}}
      complete(id);target.textContent='✓ 已完成本模块';return;
    }
    if(target.dataset.face){adjustFace=target.dataset.face;document.querySelectorAll('[data-face]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.face===adjustFace)));updateAdjustment();return;}
    if(target.dataset.mode){state.sim.mode=target.dataset.mode;state.sim.round=1;state.sim.side='left';state.sim.angleMinutes=0;state.lab.telescopeLocked=false;state.pending={};save();renderSimulation();return;}
    if(target.dataset.nudge){
      if(!state.lab.telescopeLocked){toast('先锁紧望远镜，才能使用微调螺钉。');return;}
      const next=state.sim.angleMinutes+Number(target.dataset.nudge);
      if(Math.abs(next-state.lab.lockAnchor)>30){toast('微调已到虚拟行程边界；松锁重新粗转后再锁紧。');return;}
      state.sim.angleMinutes=clamp(next,-4800,4800);clearReadings();save();updateSimulation();return;
    }
    if(target.dataset.delete){const row=state.rows.find(r=>r.id===target.dataset.delete);if(row&&confirm('删除这组原始记录？建议先导出 CSV 保存。')){state.rows=state.rows.filter(r=>r.id!==row.id);save();renderData();toast('已删除所选记录');}return;}
    if(target.hasAttribute('data-close')){target.closest('dialog').close();return;}
    const id=target.id;
    if(['parallax-check','face-check','collimator-check','grating-check'].includes(id)){checkAction(id);return;}
    if(id==='half-stage'||id==='half-telescope'){
      const a=state.adjust,sign=adjustFace==='AB'?1:-1,gap=sign*a.stageTilt-a.telescopeTilt;
      changedSetup(id==='half-stage'?'stageTilt':'telescopeTilt');
      if(id==='half-stage')a.stageTilt=clamp(a.stageTilt-sign*gap/2,-3,3);else a.telescopeTilt=clamp(sign*a.stageTilt,-3,3);
      save();renderAdjustment();return;
    }
    if(id==='lamp-toggle'){state.lab.lampOn=!state.lab.lampOn;save();updateAdjustment();return;}
    if(id==='prism-face-check'){
      if(!state.lab.lampOn||!checks().slice(0,3).every(c=>c.ok)){toast('先完成望远镜和双面镜调节，再换上棱镜。');return;}
      const sign=state.sim.side==='left'?-1:1,tilt=state.lab.prismTilt;
      const vertical=.5*tilt.x+sign*Math.sqrt(3)/2*tilt.y-state.adjust.telescopeTilt;
      if(Math.abs(state.sim.angleMinutes/60-targetAngle())*60>1.5||Math.abs(vertical)>.15){toast('请转到当前棱镜面，并调台面使反射十字与上交点重合。');return;}
      state.lab.prismFaces[state.sim.side==='left'?'AB':'AC']=true;save();updateSimulation();toast('本棱镜面已复查；另一个面也需要检查。');return;
    }
    if(id==='telescope-lock'){state.lab.telescopeLocked=!state.lab.telescopeLocked;state.lab.lockAnchor=state.sim.angleMinutes;clearReadings();save();updateSimulation();return;}
    if(id==='ideal-adjustment'){setIdeal();renderAdjustment();}
    else if(id==='reset-adjustment'){state.adjust={...initialAdjust};state.lab=labDefaults();adjustFace='AB';state.pending={};save();renderAdjustment();}
    else if(id==='sim-ideal'){setIdeal();updateSimulation();}
    else if(id==='near-target'){if(state.lab.telescopeLocked){toast('先松开望远镜再粗转。');return;}clearReadings();state.sim.angleMinutes=clamp(Math.round(targetAngle()*60)+6,-4800,4800);save();updateSimulation();}
    else if(id==='capture-reading')capture();
    else if(id==='save-pair')savePair();
    else if(id==='export-csv')exportCsv();
    else if(id==='print-results')window.print();
  });
  $('#help-button').onclick=()=>$('#help-dialog').showModal();$('#sources-button').onclick=()=>$('#sources-dialog').showModal();
  $('#reset-progress').onclick=()=>{if(confirm('只重置学习进度与自检答案？已保存的原始测量记录会保留。')){state.completed=[];state.quiz={};quizSubmitted=false;save();render();toast('学习进度已重置，测量记录已保留');}};
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  window.addEventListener('hashchange',render);window.addEventListener('pagehide',save);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&parent!==window)parent.postMessage({type:'physics-lab-escape',id:'spectrometer'},location.origin);});
  showStorage();render();
})();
