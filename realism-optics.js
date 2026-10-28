/* Teaching optics, not a calibrated instrument or a photograph.
 * Geometry follows the grating equation and Abbe reticle. Normal-incidence
 * data reduction is valid only after the grating has been aligned.
 * Slit width, defocus, parallax and brightness are illustrative mappings.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpectrometerRealism = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEG = Math.PI / 180;
  const LINES = Object.freeze([
    Object.freeze({id:'green', wavelengthNm:546.07, color:'#6cf193', intensity:1}),
    Object.freeze({id:'yellow1', wavelengthNm:576.96, color:'#ffda45', intensity:.85}),
    Object.freeze({id:'yellow2', wavelengthNm:579.07, color:'#ffe565', intensity:.72})
  ]);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const number = (value, fallback=0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const normalized = value => ((value % 360) + 360) % 360;
  const fix = value => Number(value.toFixed(4));
  const adjustValue = (adjust, key) => clamp(number(adjust?.[key]), -3, 3);

  /**
   * vernier(angleDeg) -> a minute-quantized 720-division main scale and SVG.
   * The main scale advances 30 arcminutes per division. 30 vernier divisions
   * span 29 main divisions: each is 29 arcminutes, giving a 1 arcminute least
   * count. The lower zero stays fixed; the upper scale moves relative to it.
   * Read degrees + baseMinutes (0 or 30) + minuteIndex (0..29).
   * `mainTicks`/`vernierTicks` retain unwrapped coordinates across 360 degrees.
   */
  function vernier(angleDeg) {
    if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg)) throw new TypeError('角度必须是有限数字。');
    const totalMinutes = Math.round(normalized(angleDeg) * 60) % 21600;
    const degrees = Math.floor(totalMinutes / 60);
    const baseMinutes = Math.floor((totalMinutes % 60) / 30) * 30;
    const minuteIndex = totalMinutes % 30;
    const x0 = 35, pixelsPerMinute = .38;
    const mainTicks = [];
    const first = Math.floor((totalMinutes - 90) / 30);
    const last = Math.ceil((totalMinutes + 960) / 30);
    for (let index = first; index <= last; index++) {
      const unwrappedMinutes = index * 30;
      mainTicks.push({unwrappedMinutes, angleDeg:normalized(unwrappedMinutes / 60), x:fix(x0 + (unwrappedMinutes - totalMinutes) * pixelsPerMinute), major:index % 2 === 0});
    }
    const vernierTicks = Array.from({length:31}, (_,index) => ({index, x:fix(x0 + index * 29 * pixelsPerMinute)}));
    const mainSvg = mainTicks.filter(t => t.x >= 5 && t.x <= 395).map(t => `<path d="M${t.x} ${t.major?45:55}V85" stroke="#223d48" stroke-width="${t.major?1.2:.8}"/>${t.major?`<text x="${t.x}" y="35" text-anchor="middle" fill="#26404c" font-size="8.5">${Math.round(t.angleDeg)}°</text>`:''}`).join('');
    const vernierSvg = vernierTicks.map(t => `<path d="M${t.x} 92V${t.index%5===0?124:115}" stroke="${t.index===0?'#a33b2b':'#314c56'}" stroke-width="${t.index===0?1.7:.8}"/>${t.index%5===0?`<text x="${t.x}" y="143" text-anchor="middle" fill="#314c56" font-size="11">${t.index}</text>`:''}`).join('');
    const svg = `<svg viewBox="0 0 400 170" role="img" aria-label="仿真游标窗口：上方主尺每格30分，下方游标30格等于主尺29格，最小读数1分"><rect x="1" y="1" width="398" height="168" rx="4" fill="#d7dacb" stroke="#94a19c"/><rect x="7" y="8" width="386" height="77" fill="#edf0df"/><rect x="7" y="92" width="386" height="65" fill="#e0e5d4"/>${mainSvg}${vernierSvg}<path d="M8 85H392M8 92H392" stroke="#8b9890"/><text x="10" y="166" font-size="8" fill="#4f665e">主尺 30′ / 格　·　游标 1′ / 格　·　教学仿真</text></svg>`;
    return {angleDeg:totalMinutes/60,totalMinutes,degrees,baseMinutes,minuteIndex,mainDivisionMinutes:30,vernierDivisions:30,mainTicks,vernierTicks,display:`${String(degrees).padStart(3,'0')}°${String(totalMinutes%60).padStart(2,'0')}′`,svg};
  }

  /** Signed order angle relative to the undeflected beam; null if evanescent.
   * Grating convention: sin(beta) = m*lambda/d - sin(i), theta = beta+i.
   * The fourth argument is incidence i in degrees; the default is normal.
   */
  function diffractionAngle(wavelengthNm, linesPerMm, order, incidenceDeg=0) {
    if (![wavelengthNm,linesPerMm,order,incidenceDeg].every(Number.isFinite) || wavelengthNm<=0 || linesPerMm<=0 || Math.abs(incidenceDeg)>=90) return null;
    if (order===0) return 0;
    const ratio = order * wavelengthNm * linesPerMm / 1e6-Math.sin(incidenceDeg*DEG);
    return Math.abs(ratio) <= 1 ? Math.asin(ratio) / DEG+incidenceDeg : null;
  }

  /**
   * Prism platform height projection at either face normal, -60/+60 degrees.
   * `prismTilt:{x,y}` describes two independent small platform tilts; their
   * dot product with each face normal controls the reflected image height.
   * The factor 18 is a teaching magnification, not a calibrated screw value.
   * If omitted, legacy stageTilt preserves earlier saved-state behavior; that
   * fallback is NOT a physical two-face triangular-prism geometry.
   */
  function prismModel(options={}) {
    const face=options.face==='AC'?'AC':'AB';
    const normalAngleDeg=face==='AB'?-60:60;
    const adjust=options.adjust||{};
    const legacy=!(options.prismTilt&&typeof options.prismTilt==='object');
    const projectedTilt=legacy?(face==='AB'?-1:1)*adjustValue(adjust,'stageTilt'):
      clamp(number(options.prismTilt.x),-3,3)*Math.cos(normalAngleDeg*DEG)+clamp(number(options.prismTilt.y),-3,3)*Math.sin(normalAngleDeg*DEG);
    return {face,normalAngleDeg,projectedTilt,legacy,y:95+18*(projectedTilt-adjustValue(adjust,'telescopeTilt'))};
  }

  /**
   * measurementModel({mode,angleDeg,linesPerMm,adjust,slitWidth,eyePosition,
   * lampOn,slitOrientation,prismTilt}) -> geometry behind measurementScope(). angleDeg is the telescope
   * angle relative to the undeflected central beam, not the 350-degree dial
   * bearing. The field is 1.2 degrees wide. Slit width in mm is a teaching
   * parameter, not a prediction of a particular real spectrometer's PSF.
   * `round` and `side` do not alter physics: both sides are always present.
   */
  function measurementModel(options={}) {
    const mode = options.mode === 'prism' ? 'prism' : 'grating';
    const angleDeg = number(options.angleDeg);
    // Wider API range includes gratings whose higher orders cannot propagate.
    const linesPerMm = clamp(number(options.linesPerMm,300),1,2000);
    const adjust = options.adjust || {};
    const incidenceDeg=mode==='grating'?adjustValue(adjust,'normal')*.5:0;
    const focus = adjustValue(adjust,'focus');
    const collFocus = mode==='grating' ? adjustValue(adjust,'collFocus') : 0;
    const eyePosition = clamp(number(options.eyePosition),-1,1);
    const slitWidth = clamp(number(options.slitWidth,.12),.02,1);
    const slitOrientation = options.slitOrientation==='horizontal'?'horizontal':'vertical';
    const lampOn = options.lampOn !== false;
    const center = 150, pixelsPerDegree = 225;
    const parallaxPx = eyePosition * (focus + collFocus) * 8;
    const reticleBlur = Math.abs(adjustValue(adjust,'eye')) * 1.15;
    const imageBlur = .45 + Math.hypot(focus,collFocus) * 2.8;
    const slitWidthPx = (.015 + slitWidth * .15) * pixelsPerDegree;
    const lines = [];
    if (mode==='grating') {
      for (const order of [1,2]) for (const sign of [-1,1]) for (const spectral of LINES) {
        const absoluteAngle = diffractionAngle(spectral.wavelengthNm,linesPerMm,sign*order,incidenceDeg);
        if (absoluteAngle===null || !Number.isFinite(absoluteAngle)) continue;
        const x = center + (absoluteAngle-angleDeg) * pixelsPerDegree + parallaxPx;
        const yShift = adjustValue(adjust,'collTilt')*13 + sign*adjustValue(adjust,'grooves')*11;
        lines.push({...spectral,order:sign*order,angleDeg:absoluteAngle,x:fix(x),yShift:fix(yShift),widthPx:slitWidthPx,visible:lampOn&&Math.abs(x-center)<=150+slitWidthPx});
      }
      const x = center-angleDeg*pixelsPerDegree+parallaxPx;
      lines.push({id:'zero',order:0,angleDeg:0,x:fix(x),yShift:adjustValue(adjust,'collTilt')*13,widthPx:slitWidthPx*1.2,color:'#f1f8d8',intensity:1,visible:lampOn&&Math.abs(x-center)<=150+slitWidthPx});
    } else {
      for (const sign of [-1,1]) {
        const x = center+(sign*60-angleDeg)*pixelsPerDegree+parallaxPx;
        const reflection=prismModel({face:sign<0?'AB':'AC',prismTilt:options.prismTilt,adjust});
        lines.push({id:reflection.face,angleDeg:sign*60,x:fix(x),y:fix(reflection.y),projectedTilt:reflection.projectedTilt,legacyTilt:reflection.legacy,color:'#89f8ad',visible:lampOn&&Math.abs(x-center)<165});
      }
    }
    const visibleLines = lines.filter(line=>line.visible);
    return {mode,angleDeg,linesPerMm,incidenceDeg,slitWidth,slitOrientation,lampOn,eyePosition,parallaxPx,reticleBlur,imageBlur,slitWidthPx,pixelsPerDegree,fieldWidthDeg:1.2,lines,visibleLines};
  }

  function reticle(cx, upper, lower, width, blurId) {
    return `<g filter="url(#${blurId})" fill="none" stroke="#a4a99c" stroke-opacity=".85" stroke-width=".8"><path d="M0 ${upper}H${width}M0 ${lower}H${width}M${cx} 0V${width}"/></g>`;
  }

  /** Returns the circular simulated eyepiece as an SVG string. */
  function measurementScope(options={}) {
    const m = measurementModel(options);
    let lights = '';
    for (const line of m.visibleLines) {
      if (m.mode==='prism') lights += `<path data-reflection="${line.id}" d="M${line.x-15} ${line.y}H${line.x+15}M${line.x} ${line.y-15}V${line.y+15}" fill="none" stroke="${line.color}" stroke-width="2.4"/>`;
      else if(m.slitOrientation==='horizontal') lights += `<rect data-spectral-line="${line.id}" data-order="${line.order}" x="${line.x-75}" y="${185+line.yShift-line.widthPx/2}" width="150" height="${line.widthPx}" rx=".5" fill="${line.color}" fill-opacity="${line.intensity}"/>`;
      else lights += `<rect data-spectral-line="${line.id}" data-order="${line.order}" x="${line.x-line.widthPx/2}" y="${68+line.yShift}" width="${line.widthPx}" height="150" rx=".5" fill="${line.color}" fill-opacity="${line.intensity}"/>`;
    }
    return `<svg viewBox="0 0 300 300" role="img" aria-label="圆形仿真目镜视场：${m.mode==='prism'?'自准直反射十字像':'汞灯谱线和黄双线'}，移动眼睛可检查视差"><defs><clipPath id="realism-meas-circle"><circle cx="150" cy="150" r="142"/></clipPath><radialGradient id="realism-meas-bg"><stop stop-color="#172923"/><stop offset=".8" stop-color="#0c1713"/><stop offset="1" stop-color="#010604"/></radialGradient><filter id="realism-meas-image" x="-50%" y="-25%" width="200%" height="150%"><feGaussianBlur stdDeviation="${fix(m.imageBlur)}"/></filter><filter id="realism-meas-reticle"><feGaussianBlur stdDeviation="${fix(m.reticleBlur)}"/></filter></defs><circle cx="150" cy="150" r="149" fill="#17251f" stroke="#54675c" stroke-width="2"/><g clip-path="url(#realism-meas-circle)"><circle cx="150" cy="150" r="143" fill="url(#realism-meas-bg)"/><g filter="url(#realism-meas-image)">${lights}</g>${reticle(150,95,185,300,'realism-meas-reticle')}</g></svg>`;
  }

  /**
   * adjustmentModel({adjust,face,eyePosition,lampOn}) -> fixed reticle and
   * reflected-image geometry. The legacy face='AB'/'AC' identifiers mean
   * front/back of the double-sided plane mirror, turned through 180 degrees;
   * they do NOT describe an interchange of two triangular prism faces.
   * Exchanging these plane-mirror faces reverses
   * stage tilt while telescope tilt moves both reflections in the same sense.
   * This simplified relationship demonstrates half adjustment, not a screw
   * calibration. Eye motion only displaces a defocused image.
   */
  function adjustmentModel(options={}) {
    const adjust = options.adjust || {};
    const sign = options.face==='AC' ? -1 : 1;
    const eyePosition = clamp(number(options.eyePosition),-1,1);
    const focus = adjustValue(adjust,'focus');
    return {face:sign===1?'AB':'AC',x:120+eyePosition*focus*8,y:75+18*(sign*adjustValue(adjust,'stageTilt')-adjustValue(adjust,'telescopeTilt')),reticleBlur:Math.abs(adjustValue(adjust,'eye'))*1.4,imageBlur:.35+Math.abs(focus)*2.1,parallaxPx:eyePosition*focus*8,lampOn:options.lampOn!==false};
  }

  /** Returns the circular simulated Abbe autocollimation view as SVG. */
  function adjustmentScope(options={}) {
    const m = adjustmentModel(options);
    return `<svg viewBox="0 0 240 240" role="img" aria-label="双面平面镜仿真自准直视场：固定双十字叉丝与绿色反射十字像"><defs><clipPath id="realism-adjust-circle"><circle cx="120" cy="120" r="116"/></clipPath><radialGradient id="realism-adjust-bg"><stop stop-color="#18362d"/><stop offset="1" stop-color="#030c08"/></radialGradient><filter id="realism-adjust-reticle"><feGaussianBlur stdDeviation="${fix(m.reticleBlur)}"/></filter><filter id="realism-adjust-image" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${fix(m.imageBlur)}"/></filter></defs><circle cx="120" cy="120" r="120" fill="#1e2b24"/><g clip-path="url(#realism-adjust-circle)"><circle cx="120" cy="120" r="116" fill="url(#realism-adjust-bg)"/>${m.lampOn?`<g filter="url(#realism-adjust-image)" stroke="#8bffab" stroke-width="2.5"><path d="M${m.x-15} ${m.y}H${m.x+15}M${m.x} ${m.y-15}V${m.y+15}"/></g>`:''}${reticle(120,75,145,240,'realism-adjust-reticle')}</g></svg>`;
  }

  return Object.freeze({vernier,diffractionAngle,prismModel,measurementModel,measurementScope,adjustmentModel,adjustmentScope,SPECTRAL_LINES:LINES});
});
