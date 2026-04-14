// Report page & LTI calculation
// Source: biomonitor_v26.html lines 3718-3958

// ── LTI 長期緊張指數計算（報告頁用）─────────────────────────
// LTI = Peak×0.4 + 平均×0.4 + 事件密度×0.2
// 事件密度 = (Score ≥ 60 的點數 / 總點數) × 100
function calcLTI(scoreArr) {
  if (!scoreArr.length) return 0;
  const vals = scoreArr.map(p => (typeof p === 'object') ? p.val : p);
  const peak = Math.max(...vals);
  const avg  = vals.reduce((a, v) => a + v, 0) / vals.length;
  const density = (vals.filter(v => v >= 100).length / vals.length) * 100;
  return Math.min(100, peak * 0.4 + avg * 0.4 + density * 0.2);
}

// ============================================================
// REPORT BUILDER
// ============================================================
let rptCharts = {};
function buildReport() {
  const now = new Date();
  document.getElementById('rpt_date').textContent        = now.toLocaleDateString('zh-TW');
  document.getElementById('rpt_footer_date').textContent = now.toLocaleString('zh-TW');

  const dur = S.hr.length > 0 ? S.hr[S.hr.length-1].t : 0;
  document.getElementById('rpt_duration').textContent = `時長: ${dur.toFixed(0)} s`;
  document.getElementById('rpt_pts').textContent      = `資料點: ${S.hr.length}`;

  // ── Baseline ──────────────────────────────────────────────
  const b = S.base;
  const bEl = document.getElementById('rpt_baseline');

  // gsrRawAvg from calibBuf (the actual resting baseline period), fall back to session data
  const gsrRawAvg = (S.calibBuf && S.calibBuf.gsr && S.calibBuf.gsr.length > 0)
    ? S.calibBuf.gsr.reduce((a, v) => a + v, 0) / S.calibBuf.gsr.length
    : (b.gsr != null ? b.gsr : null);

  if (b.bpm != null || b.rpm != null || gsrRawAvg != null) {
    bEl.innerHTML = [
      b.bpm     != null ? `<div style="background:#f0f4ff;border:1px solid #d0daff;border-radius:4px;padding:5px 10px;text-align:center"><div style="font-size:.54rem;color:#888;font-family:'IBM Plex Mono',monospace">BPM baseline</div><div style="font-size:1.1rem;font-weight:700;color:#2d4a8a;font-family:'IBM Plex Mono',monospace">${b.bpm.toFixed(1)}</div></div>` : '',
      b.rpm     != null ? `<div style="background:#f0fff8;border:1px solid #a0e0c0;border-radius:4px;padding:5px 10px;text-align:center"><div style="font-size:.54rem;color:#888;font-family:'IBM Plex Mono',monospace">RPM baseline</div><div style="font-size:1.1rem;font-weight:700;color:#006040;font-family:'IBM Plex Mono',monospace">${b.rpm.toFixed(1)}</div></div>` : '',
      gsrRawAvg != null ? `<div style="background:#fffbf0;border:1px solid #ffe0a0;border-radius:4px;padding:5px 10px;text-align:center"><div style="font-size:.54rem;color:#888;font-family:'IBM Plex Mono',monospace">GSR baseline avg</div><div style="font-size:1.1rem;font-weight:700;color:#8a5a00;font-family:'IBM Plex Mono',monospace">${gsrRawAvg.toFixed(0)}</div></div>` : '',
    ].filter(Boolean).join('');
  } else {
    bEl.innerHTML = '<span style="color:#aaa;font-size:.76rem;font-family:\'IBM Plex Mono\'">無基準值記錄</span>';
  }

  // ── Stress data: ESP32 優先，fallback 重算 ───────────────
  const espOK = S.score && S.score.length > 0 && S.score.some(p => p.val > 0);
  const stressData = espOK
    ? S.score.map(p => ({ t: p.t, val: p.val }))
    : recalcStress();
  const src = espOK ? 'ESP32 計算值' : '前端重算';

  // ── Formula ───────────────────────────────────────────────
  document.getElementById('rpt_formula').textContent =
    `Score = S_HR×0.40 + S_GSR×0.20 + S_Resp×0.40  [${src}]  |  ` +
    `S_HR=max(0,(BPM−Base)/(Base×0.20))  S_Resp=max(0,(RPM−Base)/(Base×0.25))  S_GSR=max(0,(BaseGSR−GSR)/(BaseGSR×0.20))  ×100  |  ` +
    `LTI = Peak×0.4 + Avg×0.4 + 事件密度×0.2`;

  // ── Stress statistics + LTI ───────────────────────────────
  const sv    = stressData.map(p => p.val);
  const sAvg  = sv.length ? sv.reduce((a,v)=>a+v,0)/sv.length : 0;
  const sMax  = sv.length ? Math.max(...sv) : 0;
  const sMin  = sv.length ? Math.min(...sv) : 0;
  const sEv100 = (() => {
    let cnt = 0, inEv = false;
    sv.forEach(v => { if (v >= 100 && !inEv) { cnt++; inEv=true; } else if (v < 100) inEv=false; });
    return cnt;
  })();
  const lti = calcLTI(stressData);
  const ltiLevel = lti >= 115 ? '高度' : lti >= 100 ? '中度' : lti >= 90 ? '輕度' : '放鬆';
  const ltiColor = lti >= 115 ? '#c0392b' : lti >= 100 ? '#f2666a' : lti >= 90 ? '#d68910' : '#27ae60';

  // Session BPM / RPM averages
  const bpmVals = S.hr.map(p => p.bpm).filter(v => v > 0);
  const rpmVals = S.resp.map(p => p.rpm).filter(v => v > 0);
  const avgBpm  = bpmVals.length ? bpmVals.reduce((a,v)=>a+v,0)/bpmVals.length : null;
  const avgRpm  = rpmVals.length ? rpmVals.reduce((a,v)=>a+v,0)/rpmVals.length : null;

  document.getElementById('rpt_stressStats').style.gridTemplateColumns = 'repeat(5,1fr)';
  document.getElementById('rpt_stressStats').innerHTML = [
    ['平均 Score',  sAvg.toFixed(1),                    '#4a9eff'],
    ['最大 Score',  sMax.toFixed(1),                    '#f2666a'],
    ['緊張事件',    sEv100,                              '#f0b429'],
    [`LTI (${ltiLevel})`, lti.toFixed(1),               ltiColor ],
    ['平均 BPM',    avgBpm != null ? avgBpm.toFixed(1) : '--', '#e74c3c'],
  ].map(([lbl, val, col]) =>
    `<div style="background:#f8f9ff;border:1px solid #e8eaf0;border-radius:4px;padding:6px 8px;text-align:center">
      <div style="font-size:.54rem;color:#999;font-family:'IBM Plex Mono',monospace;margin-bottom:3px">${lbl}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${col};font-family:'IBM Plex Mono',monospace">${val}</div>
 </div>`
  ).join('');

  // ── Stress events table ───────────────────────────────────
  const evEl = document.getElementById('rpt_events');
  const events = [];
  for (let i = 0; i < stressData.length; i++) {
    if (stressData[i].val >= 100) {
      let j = i;
      while (j < stressData.length && stressData[j].val >= 100) j++;
      const seg = stressData.slice(i, j);
      events.push({
        start: seg[0].t, end: seg[seg.length-1].t,
        peak:  Math.max(...seg.map(p=>p.val)),
        avg:   seg.reduce((a,p)=>a+p.val,0)/seg.length,
      });
      i = j - 1;
    }
  }
  if (!events.length) {
    evEl.innerHTML = '<div style="color:#aaa;font-size:.74rem;font-family:\'IBM Plex Mono\'">無緊張事件 (Score &lt; 100)</div>';
  } else {
    evEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:.7rem">
      <thead><tr style="border-bottom:2px solid #ddd;color:#888;font-size:.6rem">
        <th style="padding:5px 6px;text-align:left">#</th>
        <th style="padding:5px 6px;text-align:left">開始(s)</th>
        <th style="padding:5px 6px;text-align:left">結束(s)</th>
        <th style="padding:5px 6px;text-align:left">持續(s)</th>
        <th style="padding:5px 6px;text-align:left">Peak</th>
        <th style="padding:5px 6px;text-align:left">平均</th>
        <th style="padding:5px 6px;text-align:left">評估</th>
 </tr></thead>
      <tbody>${events.map((e,i) => {
        const dur = (e.end - e.start).toFixed(0);
        const [level, color] = e.peak >= 115 ? ['高度緊張','#c0392b'] : ['中度緊張','#d68910'];
        return `<tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:5px 6px;color:#888">${i+1}</td>
          <td style="padding:5px 6px">${e.start.toFixed(1)}</td>
          <td style="padding:5px 6px">${e.end.toFixed(1)}</td>
          <td style="padding:5px 6px">${dur}</td>
          <td style="padding:5px 6px;font-weight:700;color:${color}">${e.peak.toFixed(1)}</td>
          <td style="padding:5px 6px">${e.avg.toFixed(1)}</td>
          <td style="padding:5px 6px;color:${color};font-weight:600">${level}</td>
 </tr>`;
      }).join('')}</tbody>
 </table>`;
  }

  // ── Charts ────────────────────────────────────────────────
  Object.values(rptCharts).forEach(c => { try { c.destroy(); } catch(_){} });
  rptCharts = {};

  const lightOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { type:'linear', grid:{color:'#f4f4f4'}, ticks:{color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:10} },
      y: {                 grid:{color:'#f4f4f4'}, ticks:{color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:5}  },
    },
  };

  // ── Calibration period chart ──────────────────────────────
  const calibCanvas = document.getElementById('cRptCalib');
  if (calibCanvas && S.calibBuf && S.calibBuf.hr.length > 0) {
    const cb = S.calibBuf;
    const n  = cb.hr.length;
    const tArr = cb.t?.length === n ? cb.t : Array.from({length: n}, (_, i) => (i + 1) / (CFG.data_rate || 25));
    const bpmPts = [], rpmPts = [], gsrPts = [];
    for (let i = 0; i < n; i++) {
      const t = tArr[i];
      gsrPts.push({ x: t, y: cb.gsr[i] });
      if (cb.bpm[i] != null) bpmPts.push({ x: t, y: cb.bpm[i] });
      if (cb.rpm[i] != null) rpmPts.push({ x: t, y: cb.rpm[i] });
    }
    rptCharts.calib = new Chart(calibCanvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [
          { label:'BPM',     data: bpmPts, borderColor:'#f2666a', borderWidth:1.5, pointRadius:0, fill:false, tension:0.3, yAxisID:'yL' },
          { label:'RPM',     data: rpmPts, borderColor:'#3ecf8e', borderWidth:1.5, pointRadius:0, fill:false, tension:0.3, yAxisID:'yL' },
          { label:'GSR raw', data: gsrPts, borderColor:'#f0b429', borderWidth:1.2, pointRadius:0, fill:false, tension:0.2, yAxisID:'yR' },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: true, labels: { color:'#999', font:{size:8,family:'IBM Plex Mono'}, boxWidth:10, padding:8 } } },
        scales: {
          x:  { type:'linear', grid:{color:'#f4f4f4'}, ticks:{color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:10},
                title:{display:true, text:'時間 (s)', color:'#bbb', font:{size:8,family:'IBM Plex Mono'}} },
          yL: { position:'left',  grid:{color:'#f4f4f4'}, ticks:{color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:5},
                title:{display:true, text:'BPM / RPM', color:'#bbb', font:{size:8,family:'IBM Plex Mono'}} },
          yR: { position:'right', grid:{drawOnChartArea:false}, ticks:{color:'#f0b429aa', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:5},
                title:{display:true, text:'GSR raw', color:'#f0b429aa', font:{size:8,family:'IBM Plex Mono'}} },
        }
      }
    });
  } else if (calibCanvas) {
    // No calibration data — show placeholder text
    const ctx = calibCanvas.getContext('2d');
    calibCanvas.height = 140;
    ctx.fillStyle = '#ccc';
    ctx.font = '11px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('無校正期數據 / No calibration data recorded', calibCanvas.width / 2, 70);
  }

  // Full-session stress chart — colored by level, threshold line, event annotations
  if (stressData.length > 0) {
    // Build segment-colored datasets
    const mkSegColor = pt => {
      if (pt.val >= 115) return '#c0392b';
      if (pt.val >= 100) return '#f2666a';
      if (pt.val >= 90)  return '#f0b429';
      return '#3ecf8e';
    };
    const stressPoints = stressData.map(p => ({ x: p.t, y: p.val }));
    const tMax = stressData[stressData.length-1].t;
    const tMin = stressData[0].t;

    const stressCtx = document.getElementById('cRptStress').getContext('2d');
    // Segment colors as background fill areas
    // Use gradient-like approach: single dataset with point background colors
    rptCharts.stress = new Chart(stressCtx, {
      type: 'line',
      data: {
        datasets: [
          // Colored line segments (one dataset per color range, filled)
          {
            label: 'Score',
            data: stressPoints,
            borderColor: '#2d7dd2',
            borderWidth: 2,
            pointRadius: stressPoints.length < 120 ? 2 : 0,
            pointBackgroundColor: stressData.map(p => mkSegColor(p)),
            fill: false, tension: 0.2,
            segment: {
              borderColor: ctx => {
                const v = ctx.p0.parsed.y;
                if (v >= 115) return '#c0392b';
                if (v >= 100) return '#f2666a';
                if (v >= 90)  return '#f0b429';
                return '#3ecf8e';
              }
            }
          },
          // Threshold 100 dashed line (stress onset)
          {
            label: 'Threshold 100',
            data: [{ x: tMin, y: 100 }, { x: tMax, y: 100 }],
            borderColor: '#e74c3c', borderWidth: 1.2,
            borderDash: [5, 4], pointRadius: 0, fill: false,
          },
          // Threshold 90 dashed line (baseline rest)
          {
            label: 'Threshold 90',
            data: [{ x: tMin, y: 90 }, { x: tMax, y: 90 }],
            borderColor: '#f0b429', borderWidth: 1,
            borderDash: [3, 4], pointRadius: 0, fill: false,
          },
        ]
      },
      options: {
        ...lightOpts,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex !== 0) return null;
                const v = ctx.parsed.y;
                const lv = v>=115?'高度緊張':v>=100?'中度緊張':v>=90?'輕度緊張':'放鬆';
                return `Score: ${v.toFixed(1)} — ${lv}`;
              }
            }
          }
        },
        scales: {
          ...lightOpts.scales,
          y: {
            ...lightOpts.scales.y,
            min: 0,
            ticks: { color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, callback: v => v },
          }
        }
      }
    });
  }

  const mkRpt = (id, color, data, labelY) => {
    const canvas = document.getElementById(id);
    if (!canvas || !data.length) return;
    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ data, borderColor:color, borderWidth:1.3, pointRadius:0, fill:false, tension:0.3 }] },
      options: {
        ...lightOpts,
        scales: {
          ...lightOpts.scales,
          y: { ...lightOpts.scales.y,
            title: { display: !!labelY, text: labelY, color:'#bbb', font:{size:7,family:'IBM Plex Mono'} }
          }
        }
      }
    });
  };

  // BPM over session time
  rptCharts.bpm = mkRpt('cRptHR', '#e74c3c',
    S.hr.filter(p => p.bpm > 0).map(p => ({ x: p.t, y: p.bpm })), 'BPM');

  // RPM over session time
  rptCharts.rpm = mkRpt('cRptGSR', '#27ae60',
    S.resp.filter(p => p.rpm > 0).map(p => ({ x: p.t, y: p.rpm })), 'RPM');

  // GSR raw over session time
  rptCharts.gsr = mkRpt('cRptResp', '#d4a017',
    S.gsr.map(p => ({ x: p.t, y: p.raw })), 'GSR raw');
}

// Print report
document.getElementById('btnPrintReport').addEventListener('click', () => {
  window.print();
});

