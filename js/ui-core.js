// Timer, phase UI, BTN handling, page switching
// Source: biomonitor_v26.html lines 2235-2436

// ============================================================
// TIMER
// ============================================================
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function startTimer() {
  function tick() {
    if (S.startMs) document.getElementById('mainTimer').textContent = fmt(Date.now() - S.startMs);
    S.timerRaf = requestAnimationFrame(tick);
  }
  cancelAnimationFrame(S.timerRaf);
  S.timerRaf = requestAnimationFrame(tick);
}

// ============================================================
// STATUS BANNER — single source of truth for UI state
// ============================================================
function setPhaseUI(phase, customText) {
  S.phase = phase;
  const badge  = document.getElementById('phaseBadge');
  const dot    = document.getElementById('statusDot');
  const main   = document.getElementById('statusMainText');
  const sub    = document.getElementById('statusSubText');
  const banner = document.getElementById('statusBanner');
  const timer  = document.getElementById('mainTimer');
  const ptext  = document.getElementById('phaseText');

  // Reset
  badge.className = 'phase-badge';
  timer.className = 'timer-value';

  const _isEN = typeof _lang!=='undefined' && _lang==='en';
  const cfg = {
    idle: {
      badgeCls: 'ph-idle',   badgeTxt: 'IDLE',
      dotColor: '#454d66',   bannerBorder: 'var(--line)',
      main: _isEN?'Idle — awaiting ESP32 operation':'閒置中 — 等待 ESP32 操作',
      sub:  '',
      timerCls: '',
    },
    calibrating: {
      badgeCls: 'ph-calib',  badgeTxt: 'CALIBRATING',
      dotColor: '#f0b429',   bannerBorder: 'rgba(240,180,41,.35)',
      main: _isEN?'Calibrating — collecting resting baseline':'校正中 — ESP32 正在採集靜息基準值',
      sub:  _isEN?'BTN2 unlocks after calibration completes':'校正完成後 BTN2 解鎖，按下即可開始量測',
      timerCls: 'cal',
    },
    waiting_for_start: {
      badgeCls: 'ph-paused', badgeTxt: 'READY',
      dotColor: '#9b7fe8',   bannerBorder: 'rgba(155,127,232,.5)',
      main: _isEN?'Baseline ready — press BTN2 to start':'基準值採集完成 — 按 BTN2 開始量測',
      sub:  '',
      timerCls: '',
    },
    running: {
      badgeCls: 'ph-run',    badgeTxt: 'RUNNING',
      dotColor: '#f2666a',   bannerBorder: 'rgba(242,102,106,.35)',
      main: _isEN?'量測中 — 正在接收生理數據':'量測中 — 正在接收生理數據',
      sub:  '',
      timerCls: 'rec',
    },
    paused: {
      badgeCls: 'ph-paused', badgeTxt: 'PAUSED',
      dotColor: '#9b7fe8',   bannerBorder: 'rgba(155,127,232,.35)',
      main: _isEN?'Paused — data reception paused':'暫停中 — 數據接收暫停',
      sub:  '',
      timerCls: '',
    },
    ended: {
      badgeCls: 'ph-idle',   badgeTxt: 'ENDED',
      dotColor: '#3ecf8e',   bannerBorder: 'rgba(62,207,142,.25)',
      main: _isEN?'Session complete':'量測完成',
      sub:  _isEN?'Redirecting to Data Center...':'即將跳轉數據中心...',
      timerCls: '',
    },
  };

  const c = cfg[phase] || cfg.idle;
  badge.classList.add(c.badgeCls);
  badge.textContent = c.badgeTxt;
  dot.style.background = c.dotColor;
  dot.style.boxShadow  = `0 0 8px ${c.dotColor}`;
  banner.style.borderColor = c.bannerBorder;
  main.textContent = customText || c.main;
  sub.textContent  = c.sub;
  if (c.timerCls) timer.classList.add(c.timerCls);
  if (ptext) ptext.textContent = c.main;
  document.getElementById('calibTime').textContent = CFG.calib + 's';

  // ★ 校正基準值面板
  const calibStatsEl = document.getElementById('mpCalibStats');
  const calibLiveEl  = document.getElementById('mpCalibLive');
  const baseResultEl = document.getElementById('mpBaseResult');
  if (calibStatsEl) {
    const showPanel = (phase === 'calibrating' || phase === 'waiting_for_start');
    calibStatsEl.style.display = showPanel ? 'block' : 'none';
    if (showPanel) {
      calibStatsEl.style.background = phase === 'calibrating'
        ? 'rgba(240,180,41,.06)' : 'rgba(62,207,142,.06)';
      calibStatsEl.style.border = phase === 'calibrating'
        ? '1px solid rgba(240,180,41,.3)' : '1px solid rgba(62,207,142,.25)';
    }
    // 校正中：顯示即時進度；校正完成：顯示結果摘要
    if (calibLiveEl)  calibLiveEl.style.display  = (phase === 'calibrating')       ? 'block' : 'none';
    if (baseResultEl) baseResultEl.style.display = (phase === 'waiting_for_start') ? 'block' : 'none';
    if (phase === 'running' || phase === 'paused' || phase === 'idle' || phase === 'ended') {
      calibStatsEl.style.display = 'none';
      const mpSc = document.getElementById('mpScore');
      if (mpSc && mpSc.textContent === '校正中') mpSc.textContent = '--';
    }
  }

  // Sync web-ctrl panel state
  if (typeof cpOnPhaseChange === 'function') cpOnPhaseChange(phase);

  // Show/hide stop+pause buttons only during active session
  const isActive = (phase === 'running' || phase === 'paused');
  document.getElementById('btnStop').classList.toggle('hidden', !isActive);
  document.getElementById('btnPause').classList.toggle('hidden', !isActive);
  if (phase === 'paused') {
    document.getElementById('btnPause').textContent = '繼續接收';
  } else {
    document.getElementById('btnPause').textContent = '暫停接收';
  }
}

// ============================================================
// CONTROL BUTTONS — only STOP/PAUSE send commands back to ESP32
// (Calibration / Start are handled by physical buttons on ESP32)
// ============================================================
document.getElementById('btnStop').addEventListener('click', () => {
  if (S.connMode) deviceWrite('STOP');
  else stopDemo();
});

document.getElementById('btnPause').addEventListener('click', () => {
  if (S.phase === 'running') {
    if (S.connMode) deviceWrite('PAUSE');
    // UI will update when ESP32 sends STATUS,PAUSED back
    // But for USB we can optimistically update
    if (S.connMode === 'usb') setPhaseUI('paused');
  } else if (S.phase === 'paused') {
    if (S.connMode) deviceWrite('RESUME');
    if (S.connMode === 'usb') setPhaseUI('running');
  }
});

document.getElementById('btnExportCsv').addEventListener('click', exportCsv);

// Demo button — toggle the floating panel
document.getElementById('btnDemo').addEventListener('click', () => {
  document.getElementById('demoPanel').classList.toggle('hidden');
  document.getElementById('dpCalibSec').textContent = CFG.calib;
});

function enterRunning() {
  // ★ 從 waiting_for_start 或 idle 進入：完整重置 + 重新計時
  if (S.phase === 'waiting_for_start' || S.phase === 'idle') {
    S.hr = []; S.gsr = []; S.resp = []; S.score = []; rrDetectReset(); hrDetectReset();
    S.gsrTriggers = 0; S.gsrConsec = 0;
    S._lastChartT = -999;
    S.startMs = Date.now();
    startTimer();
  } else {
    if (!S.startMs) S.startMs = Date.now();
    startTimer();
  }

  // ── 量測開始後，清除所有圖表（含校正段），從零開始顯示
  // Clear overview chart (all 6 datasets)
  if (liveCharts.overview) {
    liveCharts.overview.data.datasets.forEach(ds => { ds.data = []; });
    liveCharts.overview.options.scales.x.min = undefined;
    liveCharts.overview.options.scales.x.max = undefined;
    liveCharts.overview.update('none');
  }
  _overviewAvgCtr = 0;

  ;['hr','gsr','resp'].forEach(key => {
    const chart = liveCharts[key];
    if (!chart) return;
    // Clear all datasets including calib reference (dataset[2])
    chart.data.datasets.forEach(ds => { ds.data = []; });
    chart.options.scales.x.min = undefined;
    chart.options.scales.x.max = undefined;
    chart.update('none');
  });
  // ★ 清除 BPM/RPM 所有 dataset
  ;['bpm','rpm'].forEach(key => {
    const chart = liveCharts[key];
    if (!chart) return;
    chart.data.datasets.forEach(ds => { ds.data = []; });
    chart.options.scales.x.min = undefined;
    chart.options.scales.x.max = undefined;
    chart.update('none');
  });

  setPhaseUI('running');
}

function handleEnd() {
  cancelAnimationFrame(S.timerRaf);
  setPhaseUI('ended');
  document.getElementById('btnDemo').textContent = 'Demo';
  setTimeout(() => switchPage('analysis'), 800);
}

function switchPage(pg) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-page="${pg}"]`).classList.add('active');
  document.getElementById('page-' + pg).classList.add('active');
  if (pg === 'analysis') refreshAnalysis();
}

