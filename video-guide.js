/* Local teaching video with keyboard-accessible chapter controls. */
(() => {
  'use strict';
  const CHAPTERS = Object.freeze([
    {start:0,title:'开场 · 从光到角度'},
    {start:5.76,title:'仪器结构'},
    {start:21.72,title:'调焦与消视差'},
    {start:35.84,title:'双面镜各半调节'},
    {start:61.04,title:'平行光管与狭缝'},
    {start:77.48,title:'双游标与跨零读数'},
    {start:104.28,title:'最小偏向角',extension:true},
    {start:122.32,title:'光栅正入射'},
    {start:128.56,title:'正负二级测量'},
    {start:142.84,title:'汞绿线标定'},
    {start:151.72,title:'操作回顾'}
  ].map(Object.freeze));
  const stamp = seconds => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  let release = null;

  function render() {
    return `<aside class="sp-operation-notes" aria-label="本课程操作提醒"><p><strong>调平看哪条线？</strong>视频约 01:06 将横置狭缝说成调到“叉丝交点”。本课程请以<strong>下横线</strong>调平横置狭缝；双面镜自准直反射像则与<strong>上交点</strong>重合。</p><p><strong>01:44 是拓展。</strong>最小偏向角用于理解折射率测量；当前虚拟实验中的三棱镜任务仍是<strong>自准直法测顶角</strong>。</p></aside>
    <div class="sp-operation-layout"><section class="sp-operation-player" aria-label="操作演示播放器"><div class="sp-operation-video-frame"><video id="operation-video" class="sp-operation-video" controls playsinline preload="metadata" poster="media/operation-poster.jpg" aria-label="分光计操作演示视频" aria-describedby="operation-video-caption"><source src="media/spectrometer-cartoon-synced.mp4" type="video/mp4"><track kind="captions" src="media/spectrometer-cartoon-synced.vtt" srclang="zh" label="中文（可选）"><track kind="chapters" src="media/operation-chapters.vtt" srclang="zh" label="操作章节"><p>浏览器暂不支持播放，您可以<a href="media/spectrometer-cartoon-synced.mp4">直接打开演示视频</a>。</p></video></div><div class="sp-operation-caption"><span class="sp-tag sim">配音动画 · 操作示意</span><p id="operation-video-caption">使用播放器可暂停、调节音量、播放速度和全屏观看。视频已带字幕，可选字幕默认关闭。</p></div><p id="operation-video-error" class="sp-operation-error" role="status" hidden>视频暂时无法载入，请检查网络后刷新重试，或<a href="media/spectrometer-cartoon-synced.mp4" target="_blank" rel="noopener">直接打开视频 ↗</a>。</p><p id="operation-video-status" class="sp-muted sp-operation-status" aria-live="polite">点击章节，从相应步骤开始观看。</p></section>
    <nav class="sp-operation-chapters" aria-label="操作演示章节"><div class="sp-operation-chapters-head"><p class="sp-eyebrow">WATCH STEP BY STEP</p><h2>找到你要看的那一步。</h2><p>点击时间，跳转并播放。</p></div><ol>${CHAPTERS.map((chapter,index)=>`<li><button type="button" data-video-chapter="${index}" aria-controls="operation-video" aria-label="跳到 ${stamp(chapter.start)} ${chapter.title}${chapter.extension?'（拓展）':''}并播放"><span class="sp-chapter-time">${stamp(chapter.start)}</span><span>${chapter.title}${chapter.extension?'<small>拓展</small>':''}</span><span class="sp-chapter-play" aria-hidden="true">▶</span></button></li>`).join('')}</ol><p class="sp-operation-current">当前章节：<span id="operation-current-chapter">${CHAPTERS[0].title}</span></p></nav></div>`;
  }

  function unmount() {
    if (release) { const dispose = release; release = null; dispose(); }
  }

  function mount(container = document) {
    unmount();
    const video = container.querySelector('#operation-video');
    if (!video) return;
    const buttons = [...container.querySelectorAll('[data-video-chapter]')];
    const current = container.querySelector('#operation-current-chapter');
    const status = container.querySelector('#operation-video-status');
    const error = container.querySelector('#operation-video-error');
    const listeners = [];
    let disposed = false, pendingSeek = null;
    function listen(target,type,handler) {
      if (!target) return;
      target.addEventListener(type,handler);
      listeners.push(()=>target.removeEventListener(type,handler));
    }
    function highlight(index) {
      buttons.forEach((button,i)=>{
        button.classList.toggle('active',i===index);
        if(i===index)button.setAttribute('aria-current','step');
        else button.removeAttribute('aria-current');
      });
      if(current)current.textContent=CHAPTERS[index].title;
    }
    function update() {
      const time=pendingSeek ?? (Number.isFinite(video.currentTime)?video.currentTime:0);
      let index=0;
      for(let i=1;i<CHAPTERS.length;i++)if(time>=CHAPTERS[i].start)index=i;
      highlight(index);
    }
    function seekWhenReady() {
      if(pendingSeek===null||video.readyState===0)return;
      const time=Number.isFinite(video.duration)?Math.min(pendingSeek,Math.max(0,video.duration-.05)):pendingSeek;
      try { video.currentTime=time; pendingSeek=null; } catch { /* Retry when metadata becomes available. */ }
      update();
    }
    function showError() {
      if(disposed)return;
      if(error)error.hidden=false;
      if(status)status.textContent='暂时无法播放；您仍可返回仪器调节或继续虚拟实验。';
    }
    function select(index) {
      if(!Number.isInteger(index)||index<0||index>=CHAPTERS.length)return;
      pendingSeek=CHAPTERS[index].start;
      if(error)error.hidden=true;
      highlight(index);
      if(status)status.textContent=`已选择 ${stamp(pendingSeek)} · ${CHAPTERS[index].title}。`;
      seekWhenReady();
      try {
        const playback=video.play();
        if(playback?.catch)playback.catch(reason=>{
          if(disposed||reason?.name==='AbortError')return;
          if(video.error)showError();
          else if(status)status.textContent='已定位到所选章节，请点击播放器的播放按钮继续。';
        });
      } catch { showError(); }
    }
    buttons.forEach(button=>listen(button,'click',()=>select(Number(button.dataset.videoChapter))));
    for(const type of ['timeupdate','seeked','ended'])listen(video,type,update);
    for(const type of ['loadedmetadata','durationchange'])listen(video,type,()=>{seekWhenReady();update();});
    listen(video,'error',showError);
    listen(video.querySelector('source'),'error',showError);
    listen(video,'loadeddata',()=>{if(error)error.hidden=true;});
    release=()=>{
      disposed=true;
      listeners.forEach(remove=>remove());
      try { video.pause(); } catch { /* A removed or uninitialized player can already be paused. */ }
    };
    update();
  }

  window.SpectrometerVideo=Object.freeze({CHAPTERS,render,mount,unmount});
})();
