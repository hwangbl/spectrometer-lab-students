/* Spectrometer calculations. Angles are degrees; wavelengths/spacings are nm.
 * Uses the experiment guide's workflow: average each line's diffraction angle,
 * calibrate d from the mean green angle, then calculate the yellow wavelengths.
 * The two verniers are opposite index marks, not the two spectrum sides.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpectrometerPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEG = Math.PI / 180;
  const SPECTRAL_LINES = Object.freeze([
    Object.freeze({id:'green', name:'绿线', wavelengthNm:546.07, color:'#42bd83'}),
    Object.freeze({id:'yellow1', name:'黄线 1', wavelengthNm:576.96, color:'#e7b840'}),
    Object.freeze({id:'yellow2', name:'黄线 2', wavelengthNm:579.07, color:'#efce59'})
  ]);
  const LINE_BY_ID = Object.fromEntries(SPECTRAL_LINES.map(line => [line.id, line]));

  function finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error((label || '数值') + '必须是有限数字。');
    }
    return value;
  }

  function positive(value, label) {
    finite(value, label);
    if (value <= 0) throw new Error(label + '必须大于 0。');
    return value;
  }

  function normalizeAngle(value) {
    finite(value, '角度');
    return ((value % 360) + 360) % 360;
  }

  /** Decimal degrees, degrees/minutes or degrees/minutes/seconds.
   * Accepted examples: 123.5, "123.5", "123 30", "123°30′", "123:30:15".
   * Raw instrument readings must be in [0, 360); 360° is entered as 0°.
   */
  function parseAngle(value) {
    if (typeof value === 'number') {
      finite(value, '角度读数');
      if (value < 0 || value >= 360) throw new Error('角度读数应在 0°（含）至 360°（不含）之间。');
      return value;
    }
    if (typeof value !== 'string' || !value.trim()) throw new Error('请填写完整的角度读数。');
    const text = value.trim().replace(/[º度]/g, '°').replace(/[’'分]/g, '′').replace(/["秒]/g, '″');
    const number = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
    const decimal = new RegExp('^(' + number + ')\\s*°?$').exec(text);
    let degrees, minutes = 0, seconds = 0;
    if (decimal) {
      degrees = Number(decimal[1]);
    } else {
      const dms = /^(\d{1,3})\s*(?:°\s*|:\s*|\s+)(\d{1,2})\s*(?:′\s*|:\s*|\s+)(\d{1,2}(?:\.\d+)?)\s*″?$/.exec(text);
      const dm = /^(\d{1,3})\s*(?:°\s*|:\s*|\s+)(\d{1,2}(?:\.\d+)?)\s*′?$/.exec(text);
      const match = dms || dm;
      if (!match) throw new Error('读数格式不正确；请用 123°45′、123 45 或十进制度数。');
      degrees = Number(match[1]);
      minutes = Number(match[2]);
      seconds = dms ? Number(match[3]) : 0;
      if (minutes >= 60 || seconds >= 60) throw new Error('角分和角秒必须小于 60；请先向上一单位进位。');
    }
    const result = degrees + minutes / 60 + seconds / 3600;
    if (!Number.isFinite(result) || result < 0 || result >= 360) {
      throw new Error('角度读数应在 0°（含）至 360°（不含）之间。');
    }
    return result;
  }

  /** Rounds to the requested decimal places of arcminutes, carrying at 60′. */
  function formatAngle(value, minuteDigits) {
    const precision = minuteDigits === undefined ? 0 : minuteDigits;
    if (!Number.isInteger(precision) || precision < 0 || precision > 4) {
      throw new Error('角分的小数位数应为 0 至 4 的整数。');
    }
    const scale = 10 ** precision;
    const units = Math.round(normalizeAngle(value) * 60 * scale) % (360 * 60 * scale);
    const degrees = Math.floor(units / (60 * scale));
    const minutes = (units - degrees * 60 * scale) / scale;
    return String(degrees).padStart(3, '0') + '°' + minutes.toFixed(precision).padStart(precision ? precision + 3 : 2, '0') + '′';
  }

  /** Signed shortest displacement from a to b, in [-180, 180). */
  function angularDifference(a, b) {
    finite(a, '起始角度'); finite(b, '终止角度');
    return ((b - a + 180) % 360 + 360) % 360 - 180;
  }

  function angleSeparation(a, b) {
    return Math.abs(angularDifference(a, b));
  }

  function summarize(values) {
    if (!Array.isArray(values)) throw new Error('统计数据必须是数组。');
    values.forEach(value => finite(value, '统计数据'));
    const count = values.length;
    if (!count) return {count:0, mean:null, sampleStdDev:null, standardError:null};
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const sampleStdDev = count > 1
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1))
      : null;
    return {count, mean, sampleStdDev, standardError:sampleStdDev === null ? null : sampleStdDev / Math.sqrt(count)};
  }

  function orderValue(value) {
    const order = value === undefined ? 2 : value;
    if (!Number.isInteger(order) || order < 1) throw new Error('衍射级次必须是正整数；本实验规定使用二级。');
    return order;
  }

  function diffractionAngle(wavelengthNm, linesPerMm, order) {
    positive(wavelengthNm, '波长'); positive(linesPerMm, '光栅刻线密度');
    const k = orderValue(order);
    const argument = k * wavelengthNm * linesPerMm / 1e6;
    if (argument >= 1) throw new Error('该波长和级次无法形成可测谱线：kλ 必须小于光栅常数 d。');
    return Math.asin(argument) / DEG;
  }

  function readPair(row, options) {
    if (!row || typeof row !== 'object') throw new Error('请提供一组完整的双游标读数。');
    const labels = {left1:'第一位置·游标Ⅰ', left2:'第一位置·游标Ⅱ', right1:'第二位置·游标Ⅰ', right2:'第二位置·游标Ⅱ'};
    const values = {};
    for (const field of Object.keys(labels)) {
      try { values[field] = parseAngle(row[field]); }
      catch (error) { throw new Error(labels[field] + '：' + error.message); }
    }
    const warnings = [];
    const tolerance = options && options.maxVernierMismatchDeg !== undefined ? options.maxVernierMismatchDeg : 1;
    positive(tolerance, '双游标检查容差');
    for (const [first, second, label] of [['left1','left2','第一位置'],['right1','right2','第二位置']]) {
      const mismatch = 180 - angleSeparation(values[first], values[second]);
      if (mismatch > tolerance + 1e-10) throw new Error(label + '的两游标读数应相差约 180°，请检查是否混淆了谱线两侧与两个游标。');
      if (mismatch > 2 / 60 + 1e-10) warnings.push(label + '的双游标相差偏离 180° 超过 2′，建议核对原始读数。');
    }
    const delta1 = angularDifference(values.left1, values.right1);
    const delta2 = angularDifference(values.left2, values.right2);
    const separation1Deg = Math.abs(delta1);
    const separation2Deg = Math.abs(delta2);
    if (Math.abs(separation1Deg - separation2Deg) > tolerance + 1e-10) {
      throw new Error('两个游标给出的转角相差过大，请核对四个读数。');
    }
    if (delta1 * delta2 < 0 && Math.max(separation1Deg, separation2Deg) > tolerance) {
      throw new Error('两个游标给出的转动方向不一致，或读数接近 180° 的判定边界，请重新检查位置。');
    }
    if (Math.abs(separation1Deg - separation2Deg) > 2 / 60 + 1e-10) {
      warnings.push('两个游标的转角相差超过 2′；双游标平均可减小偏心影响，但仍应核对读数。');
    }
    if (separation1Deg + separation2Deg <= 1e-10) throw new Error('两次望远镜位置相同，无法计算有效转角。');
    return {...values, separation1Deg, separation2Deg, warnings};
  }

  function analyzeGratingPair(row, options) {
    const settings = options || {};
    const linesPerMm = settings.linesPerMm === undefined ? 300 : settings.linesPerMm;
    positive(linesPerMm, '光栅刻线密度');
    const line = row && row.line || 'green';
    if (!Object.hasOwn(LINE_BY_ID, line)) throw new Error('请选择绿线、黄线 1 或黄线 2。');
    const order = orderValue(row && row.order);
    const pair = readPair(row, settings);
    const phiDeg = (pair.separation1Deg + pair.separation2Deg) / 4;
    if (phiDeg <= 0 || phiDeg >= 90) throw new Error('衍射角必须大于 0° 且小于 90°。');
    const gratingSpacingNm = 1e6 / linesPerMm;
    const wavelengthNm = gratingSpacingNm * Math.sin(phiDeg * DEG) / order;
    const referenceNm = LINE_BY_ID[line].wavelengthNm;
    const warnings = pair.warnings.slice();
    if (order !== 2) warnings.push('此记录使用了 ' + order + ' 级；指导书的正式数据表要求使用 ±2 级谱线。');
    return {...pair, warnings, line, order, phiDeg, gratingSpacingNm, wavelengthNm, referenceNm,
      relativeErrorPercent:(wavelengthNm - referenceNm) / referenceNm * 100};
  }

  function analyzePrismPair(row, options) {
    const pair = readPair(row, options);
    const thetaDeg = (pair.separation1Deg + pair.separation2Deg) / 2;
    const apexAngleDeg = 180 - thetaDeg;
    if (apexAngleDeg <= 0 || apexAngleDeg >= 180) throw new Error('棱镜顶角必须大于 0° 且小于 180°。');
    return {...pair, thetaDeg, apexAngleDeg};
  }

  /** Invalid rows are reported separately and never silently used in a mean.
   * Calibrate with d = k_green * 546.07 / sin(mean(phi_green)).
   * Each reported line wavelength is d*sin(mean(phi_line))/k_line.
   * Sample scatter / SE describe repetitions only, not total uncertainty.
   */
  function analyzeDataset(rows, options) {
    if (!Array.isArray(rows)) throw new Error('测量记录必须是数组。');
    const settings = options || {};
    const linesPerMm = settings.linesPerMm === undefined ? 300 : settings.linesPerMm;
    positive(linesPerMm, '光栅刻线密度');
    const parsed = [], errors = [], warnings = [];
    rows.forEach((row, index) => {
      try {
        parsed.push({...analyzeGratingPair(row, settings), index, rowId:row.id === undefined ? index : row.id});
      } catch (error) {
        errors.push({index, rowId:row && row.id === undefined ? index : row && row.id, message:error.message});
      }
    });

    // Different orders cannot be averaged as if they were the same angle.
    const rawGroups = [];
    for (const spectralLine of SPECTRAL_LINES) {
      const orders = [...new Set(parsed.filter(row => row.line === spectralLine.id).map(row => row.order))].sort((a,b) => a-b);
      for (const order of orders) {
        const measurements = parsed.filter(row => row.line === spectralLine.id && row.order === order);
        rawGroups.push({line:spectralLine.id, order, measurements, angles:summarize(measurements.map(row => row.phiDeg))});
      }
    }
    const greenGroups = rawGroups.filter(group => group.line === 'green');
    const greenGroup = greenGroups.find(group => group.order === 2) || greenGroups[0];
    const calibratedSpacingNm = greenGroup
      ? greenGroup.order * LINE_BY_ID.green.wavelengthNm / Math.sin(greenGroup.angles.mean * DEG)
      : null;
    const effectiveSpacingNm = calibratedSpacingNm === null ? 1e6 / linesPerMm : calibratedSpacingNm;
    if (greenGroups.length > 1) warnings.push('绿线包含不同级次；优先使用二级绿线校准，各级次分组计算，未混合平均。');
    if (!greenGroup && parsed.length) warnings.push('尚无有效绿线记录，暂按输入的刻线密度计算；正式结果应先用绿线校准光栅常数。');
    if (greenGroup) warnings.push('绿线用于校准，其结果接近参考值不构成独立的精度检验。');
    if (errors.length) warnings.push(errors.length + ' 条无效记录未参与计算，请检查对应读数。');
    const analyzedRows = parsed.map(row => {
      const wavelengthNm = effectiveSpacingNm * Math.sin(row.phiDeg * DEG) / row.order;
      return {...row, gratingSpacingNm:effectiveSpacingNm, wavelengthNm,
        relativeErrorPercent:(wavelengthNm - row.referenceNm) / row.referenceNm * 100};
    });
    const groups = rawGroups.map(group => {
      const samples = analyzedRows.filter(row => row.line === group.line && row.order === group.order);
      const wavelengthStats = summarize(samples.map(row => row.wavelengthNm));
      const meanWavelengthNm = effectiveSpacingNm * Math.sin(group.angles.mean * DEG) / group.order;
      const referenceNm = LINE_BY_ID[group.line].wavelengthNm;
      return {
        line:group.line, name:LINE_BY_ID[group.line].name, order:group.order, count:samples.length,
        meanPhiDeg:group.angles.mean, sampleStdDevPhiDeg:group.angles.sampleStdDev,
        standardErrorPhiDeg:group.angles.standardError,
        meanWavelengthNm, rowMeanWavelengthNm:wavelengthStats.mean,
        sampleStdDevNm:wavelengthStats.sampleStdDev, standardErrorNm:wavelengthStats.standardError,
        referenceNm, relativeErrorPercent:(meanWavelengthNm - referenceNm) / referenceNm * 100
      };
    });
    for (const row of analyzedRows) for (const warning of row.warnings) if (!warnings.includes(warning)) warnings.push(warning);
    return {
      rows:analyzedRows, errors, groups, warnings,
      calibratedSpacingNm,
      calibratedLinesPerMm:calibratedSpacingNm === null ? null : 1e6 / calibratedSpacingNm,
      effectiveSpacingNm, nominalLinesPerMm:linesPerMm,
      calibrationSource:greenGroup ? 'green' : 'nominal',
      calibrationOrder:greenGroup ? greenGroup.order : null,
      calibrationCount:greenGroup ? greenGroup.angles.count : 0
    };
  }

  return Object.freeze({SPECTRAL_LINES, normalizeAngle, parseAngle, formatAngle,
    angularDifference, angleSeparation, summarize, diffractionAngle,
    analyzeGratingPair, analyzePrismPair, analyzeDataset});
});
