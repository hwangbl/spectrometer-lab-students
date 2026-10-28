/* Source-grounded reference material, separate from the dynamic simulation. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const references = window.SpectrometerReferences || [];
  const find = id => references.find(item => item.id === id);
  function card(id, compact = false) {
    const item = find(id);
    if (!item) return '';
    return `<figure class="sp-reference ${compact ? 'compact' : ''}"><button class="sp-reference-image" data-reference="${escape(id)}" aria-label="放大查看：${escape(item.title)}"><img src="reference-assets/${escape(item.file)}" alt="${escape(item.title)}" loading="lazy"><span>${escape(item.kind)} ↗</span></button><figcaption><strong>${escape(item.title)}</strong><p>${escape(item.caveat)}</p><a href="${escape(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(item.sourceTitle)} ↗</a></figcaption></figure>`;
  }
  function gallery() {
    return `<section class="sp-field-guide" aria-label="真实仪器与原始教学资料"><div class="sp-section-head"><div><p class="sp-eyebrow">FROM THE REAL LAB</p><h2>先看真实仪器，再动虚拟旋钮。</h2></div><span class="sp-tag">6 张原始资料 · 可放大查看</span></div><p class="sp-muted">整机、部件定位、目镜剖视与实际光谱相互对照。各型号的旋钮编号和游标分度可能不同，请先核对实验室仪器。</p><div class="sp-reference-grid">${['ustc-instrument','tjut-parts','tjut-section','tjut-half','ustc-vernier','mercury-spectrum'].map(id => card(id)).join('')}</div><details class="sp-details"><summary>图片来源、作者与使用说明</summary><div>${references.filter(item => !['tjut-vernier','hust-instrument'].includes(item.id)).map(item => `<p><strong>${escape(item.title)}</strong> · ${escape(item.credit)}<br>${escape(item.license)}${item.licenseUrl ? ` · <a href="${escape(item.licenseUrl)}" target="_blank" rel="noopener noreferrer">许可条款 ↗</a>` : ''} · <a href="${escape(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">原文 ↗</a></p>`).join('')}<p>这里的剖视和半调视场是原始教学图，汞谱是光谱实拍，均不冒充同型号目镜直拍。原图保留，完整记录见 <a href="reference-assets/sources.json" target="_blank">来源清单</a>。</p></div></details></section>`;
  }
  function preparation() {
    return `<section class="sp-preparation"><div><p class="sp-eyebrow">AT YOUR BENCH</p><h2>进实验室后的第一件事</h2><p>沿光路辨认光源、狭缝、平行光管、载物台、望远镜和两个游标窗。这里的“拆解”用于理解结构；练习中无需拆卸仪器。</p></div><ol><li><b>看台面。</b>确认底座稳定、镜面完好；双面镜、棱镜和光栅分开放置。</li><li><b>开光源。</b>实物汞灯按实验室要求预热，调节时开启望远镜内照明。</li><li><b>先松锁。</b>松开望远镜止动再粗转；锁紧后只用微调螺钉。</li><li><b>先调目镜。</b>每位观察者先看清自己的叉丝，再调反射像；不要混用两只调焦手轮。</li></ol></section>`;
  }
  function open(id) {
    const item = find(id), dialog = document.getElementById('reference-dialog');
    if (!item || !dialog) return;
    dialog.innerHTML = `<button class="sp-dialog-close" data-close aria-label="关闭图片">×</button><p class="sp-eyebrow">${escape(item.kind)}</p><h2>${escape(item.title)}</h2><img src="reference-assets/${escape(item.file)}" alt="${escape(item.title)}"><p>${escape(item.caveat)}</p><p>${escape(item.credit)} · ${escape(item.license)}</p><a class="sp-button small" href="${escape(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a>`;
    dialog.showModal();
  }
  window.SpectrometerGuide = Object.freeze({card, gallery, preparation, open});
})();
