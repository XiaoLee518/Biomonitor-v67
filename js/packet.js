// Packet ingestion & baseline UI
// Supports v5 (7-field DATA) and v6 (10-field DATA)

function ingestPacket(raw) {
  const line = raw.trim();

  // ── CALIB progress ──────────────────────────────────────────
  if (line.startsWith('CALIB_PROG,')) {
    const p = line.split(',');
    const pct = parseInt(p[2]) > 0 ? Math.min(100, parseInt(p[1]) / parseInt(p[2]) * 100) : 0;
    const f = document.getElementById('mpCalibFill');
    if (f) f.style.width = pct + '%';
    if (typeof _mp !== 'undefined') { _mp.calibSec = parseInt(p[1]); mpUpdate(); }
    return;
  }

  // ── BASELINE packet ─────────────────────────────────────────
  if (line.startsWith('BASELINE,')) {
    const p = line.split(',');
    S.base.gsr  = parseFloat(p[1]);
    S.base.hr   = parseFloat(p[2]);
    S.base.resp = parseFloat(p[3]);

    // Compute baseline BPM/RPM from calibBuf
    if (S.calibBuf) {
      const validBpm = (S.calibBuf.bpm || []).filter(v => v != null && v >= 40 && v <= 150);
      const validRpm = (S.calibBuf.rpm || []).filter(v => v != null && v >= 3 && v <= 35);
      if (validBpm.length >= 3) {
        validBpm.sort((a, b) => a - b);
        S.base.bpm = validBpm[Math.floor(validBpm.length / 2)];
      } else {
        // Average fallback
        const avg = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        S.base.bpm = avg(S.calibBuf.bpm) || null;
      }
      if (validRpm.length >= 2) {
        validRpm.sort((a, b) => a - b);
        S.base.rpm = validRpm[Math.floor(validRpm.length / 2)];
      } else {
        const avg = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        S.base.rpm = avg(S.calibBuf.rpm) || null;
      }
      // GSR average from calibBuf
      const avgGsr = S.calibBuf.gsr?.length ? S.calibBuf.gsr.reduce((a, b) => a + b, 0) / S.calibBuf.gsr.length : null;
      if (avgGsr) S.base.gsr = avgGsr;
    }

    updateBaselineUI();
    _mpShowBaselineResult();
    setPhaseUI('waiting_for_start');
    return;
  }

  // ── STATUS packet ───────────────────────────────────────────
  if (line.startsWith('STATUS,')) {
    const status = line.split(',')[1];
    if (status === 'WAITING') {
      cancelAnimationFrame(S.timerRaf);
      document.getElementById('mainTimer').textContent = '00:00';
      setPhaseUI('idle');
    } else if (status === 'CALIBRATING') {
      S.hr = []; S.gsr = []; S.resp = []; S.score = [];
      S.calibBuf = null;
      S._lastCalibChartT = -999;
      _overviewAvgCtr = 0;
      hrDetectReset(); rrDetectReset();
      S.gsrTriggers = 0; S.gsrConsec = 0;
      S.base = { hr: null, gsr: null, resp: null, bpm: null, rpm: null };
      // ★ fix: clear calib dataset and bpm/rpm charts on re-calibration
      ;['hr','gsr','resp'].forEach(key => {
        const chart = liveCharts[key];
        if (chart) { chart.data.datasets[0].data = []; chart.data.datasets[1].data = []; chart.data.datasets[2].data = []; chart.update('none'); }
      });
      if (liveCharts.bpm)  { liveCharts.bpm.data.datasets[0].data  = []; liveCharts.bpm.data.datasets[1].data  = []; liveCharts.bpm.update('none'); }
      if (liveCharts.rpm)  { liveCharts.rpm.data.datasets[0].data  = []; liveCharts.rpm.data.datasets[1].data  = []; liveCharts.rpm.update('none'); }
      S.startMs = Date.now();
      startTimer();
      setPhaseUI('calibrating');
    } else if (status === 'RUNNING') {
      enterRunning();
    } else if (status === 'WAITING_FOR_START') {
      setPhaseUI('waiting_for_start');
    } else if (status === 'PAUSED') {
      setPhaseUI('paused');
    } else if (status === 'STOPPED') {
      handleEnd();
    }
    return;
  }

  // ── END packet ──────────────────────────────────────────────
  if (line === 'END') { handleEnd(); return; }

  // ── DATA packet ─────────────────────────────────────────────
  // v5: DATA,sec,gsrRaw,hrRaw,respRaw,BPM,RPM,Score
  // v6: DATA,sec,gsrRaw,hrRaw,respRaw,respOhm,BPM,RPM,Score,RespStatus
  if (line.startsWith('DATA,')) {
    const p = line.split(',');
    if (p.length < 8) return;
    const t      = parseFloat(p[1]);
    const gsrRaw = parseInt(p[2]);
    const hrRaw  = parseInt(p[3]);
    const respRaw = parseInt(p[4]);
    let bpm, rpm;
    if (p.length >= 10) {
      bpm = parseFloat(p[6]); rpm = parseFloat(p[7]);
    } else {
      bpm = parseFloat(p[5]); rpm = parseFloat(p[6]);
    }
    if (isNaN(t)) return;

    // Frontend fallback detection (when ESP32 sends 0)
    const feBPM = hrDetectPush(t, hrRaw);
    const feRPM = rrDetectPush(t, respRaw);
    if (!(bpm > 0) && feBPM > 0) bpm = feBPM;
    if (!(rpm > 0) && feRPM > 0) rpm = feRPM;

    // ── Calibrating: collect into calibBuf ───────────────────
    if (S.phase === 'calibrating') {
      const elapsed = (Date.now() - S.startMs) / 1000;

      if (!S.calibBuf) S.calibBuf = { hr: [], gsr: [], resp: [], bpm: [], rpm: [], t: [] };
      S.calibBuf.t.push(+elapsed.toFixed(3));
      S.calibBuf.hr.push(hrRaw);
      S.calibBuf.gsr.push(gsrRaw);
      S.calibBuf.resp.push(respRaw);
      S.calibBuf.bpm.push(bpm > 0 ? bpm : null);
      S.calibBuf.rpm.push(rpm > 0 ? rpm : null);

      // Live chart updates during calibration
      const ci = 1 / (CFG.chart_rate || 10);
      if (elapsed - (S._lastCalibChartT || -999) >= ci) {
        S._lastCalibChartT = elapsed;
        const pushCalib = (chart, val) => {
          if (!chart) return;
          pushPt(chart.data.datasets[0].data, { x: elapsed, y: val });
          pushPt(chart.data.datasets[2].data, { x: elapsed, y: val });
          chart.options.scales.x.min = 0;
          chart.options.scales.x.max = Math.max(CFG.calib, elapsed + 2);
          chart.update('none');
        };
        pushCalib(liveCharts.hr, hrRaw);
        pushCalib(liveCharts.gsr, gsrRaw);
        pushCalib(liveCharts.resp, respRaw);
        if (bpm > 0 && liveCharts.bpm) {
          pushPt(liveCharts.bpm.data.datasets[0].data, { x: elapsed, y: bpm });
          pushPt(liveCharts.bpm.data.datasets[2].data, { x: elapsed, y: bpm });
          liveCharts.bpm.options.scales.x.min = 0;
          liveCharts.bpm.options.scales.x.max = Math.max(CFG.calib, elapsed + 2);
          liveCharts.bpm.update('none');
        }
        if (rpm > 0 && liveCharts.rpm) {
          pushPt(liveCharts.rpm.data.datasets[0].data, { x: elapsed, y: rpm });
          pushPt(liveCharts.rpm.data.datasets[2].data, { x: elapsed, y: rpm });
          liveCharts.rpm.options.scales.x.min = 0;
          liveCharts.rpm.options.scales.x.max = Math.max(CFG.calib, elapsed + 2);
          liveCharts.rpm.update('none');
        }
      }

      // Live baseline display (rolling avg of what's collected so far)
      const avg = arr => {
        const valid = arr.filter(v => v != null);
        return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      };
      const cb = S.calibBuf;
      const liveHR   = avg(cb.hr);
      const liveGSR  = avg(cb.gsr);
      const liveResp = avg(cb.resp);
      const liveBPM  = avg(cb.bpm);
      const liveRPM  = avg(cb.rpm);
      const nn = cb.hr.length;

      const ss  = (id, v, d) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v.toFixed(d); };
      const ss2 = (id, v, d) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v.toFixed(d); else if (el) el.textContent = '--'; };
      // baseline avg slots → show BPM / RPM; raw slots → show ADC values
      ss('baseHR',    liveBPM,   1); ss('baseGSR',    liveGSR,  0); ss('baseRR',    liveRPM,  1);
      ss('baseRawHR', liveHR,    0); ss('baseRawRR',  liveResp, 0);
      ss('s_hr_base', liveBPM,   1); ss('s_gsr_base', liveGSR,  1); ss('s_rr_base', liveRPM,  1);
      ss2('mpCalibHR', liveHR, 0); ss2('mpCalibGSR', liveGSR, 0); ss2('mpCalibResp', liveResp, 0);
      ss2('mpCalibBPM', liveBPM, 1); ss2('mpCalibRPM', liveRPM, 1);
      const nEl = document.getElementById('mpCalibN'); if (nEl) nEl.textContent = nn + ' pts';

      const mpBPM = document.getElementById('mpBPM');
      const mpRPM = document.getElementById('mpRPM');
      const mpSc  = document.getElementById('mpScore');
      if (mpBPM) mpBPM.textContent = bpm > 0 ? bpm.toFixed(1) : '--';
      if (mpRPM) mpRPM.textContent = rpm > 0 ? rpm.toFixed(1) : '--';
      if (mpSc)  mpSc.textContent  = '校正中';

      updateOverview(elapsed, hrRaw, gsrRaw, respRaw);
      return;
    }

    // ── Running: calculate stress and store ──────────────────
    const sc = calcStressRT(bpm, rpm, gsrRaw);

    S.hr.push({ t, raw: hrRaw, bpm });
    S.gsr.push({ t, raw: gsrRaw, pct: (S.base.gsr && S.base.gsr > 0) ? ((gsrRaw - S.base.gsr) / S.base.gsr * 100) : null });
    S.resp.push({ t, raw: respRaw, rpm });
    S.score.push({ t, val: sc.stress });

    updateOverview(t, hrRaw, gsrRaw, respRaw);
    const _ci = 1 / (CFG.chart_rate || 10);
    if (t - (S._lastChartT || -999) >= _ci) {
      S._lastChartT = t;
      updateLiveChart(liveCharts.hr, t, hrRaw, hrRaw);
      updateLiveChart(liveCharts.gsr, t, gsrRaw, gsrRaw);
      updateLiveChart(liveCharts.resp, t, respRaw, respRaw);
      // ★ BPM/RPM live charts during running
      if (bpm > 0 && liveCharts.bpm) {
        pushPt(liveCharts.bpm.data.datasets[0].data, { x: t, y: bpm });
        liveCharts.bpm.update('none');
      }
      if (rpm > 0 && liveCharts.rpm) {
        pushPt(liveCharts.rpm.data.datasets[0].data, { x: t, y: rpm });
        liveCharts.rpm.update('none');
      }
    }
    updateStressGauge(sc.stress);
    updateStatsUI(t, hrRaw, gsrRaw, respRaw, bpm, rpm);
    if (typeof updateQualityPanel === 'function') updateQualityPanel();
    updateLogTable(t, gsrRaw, hrRaw, respRaw, bpm, rpm, sc.stress);
    return;
  }
}

// ── Baseline UI ─────────────────────────────────────────────
function updateBaselineUI() {
  const b = S.base;
  const ss = (id, val, d) => { const el = document.getElementById(id); if (el) el.textContent = val != null ? val.toFixed(d) : '--'; };
  // baseline avg slots → computed BPM / RPM; raw slots → ADC value from ESP32
  ss('baseHR',    b.bpm,  1); ss('baseGSR', b.gsr, 0); ss('baseRR',    b.rpm,  1);
  ss('baseRawHR', b.hr,   0); ss('baseRawRR', b.resp, 0);
  ss('s_hr_base', b.bpm,  1); ss('s_gsr_base', b.gsr, 1); ss('s_rr_base', b.rpm,  1);
  S.calibEndSec = CFG.calib;
}

function _mpShowBaselineResult() {
  const b = S.base;
  const buf = S.calibBuf || {};
  const n = (buf.hr || []).length;
  const ss = (id, val, dec) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (val != null && !isNaN(val)) ? Number(val).toFixed(dec) : '--';
  };
  ss('mpBaseBPM', b.bpm, 1); ss('mpBaseRPM', b.rpm, 1);
  ss('mpBaseGSR', b.gsr, 0); ss('mpBaseN', n, 0);

  const mpBPM = document.getElementById('mpBPM');
  const mpRPM = document.getElementById('mpRPM');
  const mpSc = document.getElementById('mpScore');
  if (mpBPM) mpBPM.textContent = b.bpm != null ? b.bpm.toFixed(1) : '--';
  if (mpRPM) mpRPM.textContent = b.rpm != null ? b.rpm.toFixed(1) : '--';
  if (mpSc) mpSc.textContent = '--';

  const noteEl = document.getElementById('mpBaseNote');
  if (noteEl) {
    const bpmNote = b.bpm != null ? `BaseBPM ${b.bpm.toFixed(1)}` : '未偵測到 BPM';
    const rpmNote = b.rpm != null ? `BaseRPM ${b.rpm.toFixed(1)}` : '未偵測到 RPM';
    noteEl.innerHTML = `壓力演算法基準：${bpmNote} · ${rpmNote} · GSR ${b.gsr != null ? b.gsr.toFixed(0) : '--'}`;
  }
}
