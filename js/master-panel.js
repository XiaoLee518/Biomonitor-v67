// Master panel, demo control, drag, mini charts
// Source: biomonitor_v26.html lines 5117-5720

// ============================================================
// MASTER PANEL (主控面板)
// ============================================================
let _mp = {
  state: 'idle',  // idle | calibrating | waiting_for_start | running | paused
  mode:  'none',  // none | ble | usb | demo
  calibSec: 0,
  calibTimer: null,
};
// Variables for master panel demo calibration (must be declared for strict mode)
let _demoCalibSec = 0;
let _demoCalibInterval = null;

function mpUpdate() {
  const mainBtn  = document.getElementById('mpMainBtn');
  const stopBtn  = document.getElementById('mpStopBtn');
  const pill     = document.getElementById('mpPhasePill');
  const hint     = document.getElementById('mpHint');
  const timerSub = document.getElementById('mpTimerSub');
  if(!mainBtn) return;

  const s = _mp.state;
  const connected = _mp.mode !== 'none';

  const pillCfg = {
    idle:'idle', calibrating:'calib', waiting_for_start:'ready',
    running:'running', paused:'paused', ended:'idle',
  };
  if(pill) pill.className = pillCfg[s] || 'idle';
  if(pill) pill.textContent = {idle:'IDLE',calibrating:'CALIBRATING',waiting_for_start:'READY',running:'RUNNING',paused:'PAUSED',ended:'ENDED'}[s]||'IDLE';

  const btnCfg = {
    idle:              {cls:'idle',    txt: typeof t==='function'?t('mp_start_calib'):'開始校正',  dis:!connected},
    calibrating:       {cls:'calib',   txt: typeof t==='function'?t('mp_stop_calib'):'中止校正',  dis:false},
    waiting_for_start: {cls:'ready',   txt: typeof t==='function'?t('mp_start_meas'):'開始量測',  dis:false},
    running:           {cls:'running', txt: typeof t==='function'?t('mp_pause'):'暫停量測',  dis:false},
    paused:            {cls:'paused',  txt: typeof t==='function'?t('mp_resume'):'繼續量測',  dis:false},
  };
  const bc = btnCfg[s] || btnCfg.idle;
  mainBtn.className = bc.cls;
  mainBtn.textContent = bc.txt;
  mainBtn.disabled = bc.dis;

  const active = (s==='running'||s==='paused');
  if(stopBtn)  { stopBtn.disabled=!(active||s==='waiting_for_start'); stopBtn.textContent = typeof t==='function'?t('mp_stop'):'停止'; }

  // 重置按鈕：有量測資料時顯示（idle 或 waiting_for_start 且有舊資料）
  const resetBtn = document.getElementById('mpResetBtn');
  if (resetBtn) {
    const hasData = S.hr && S.hr.length > 0;
    const showReset = hasData && (s === 'idle' || s === 'waiting_for_start');
    resetBtn.style.display = showReset ? 'block' : 'none';
  }

  const _isEN = typeof _lang!=='undefined' && _lang==='en';
  const hints = {
    idle:              connected ? (_isEN ? 'Press Start Calibration to collect resting baseline ('+CFG.calib+'s)' : '按「開始校正」採集靜息基準值（'+CFG.calib+'秒）') : (_isEN?'Please select a connection method':'請先選擇連線方式'),
    calibrating:       (_isEN?'Stay relaxed... collecting baseline ':'靜坐放鬆，正在採集基準值... ')+_mp.calibSec+'/'+CFG.calib+'s',
    waiting_for_start: _isEN?'Baseline ready - Press Start Measurement':'基準值就緒，按「開始量測」正式記錄',
    running:           _isEN?'Measuring — press  Pause or  Stop':'量測中 — 按「」暫停或「」停止',
    paused:            _isEN?'Paused — press  Resume or  Stop':'已暫停 — 按「」繼續或「」停止',
  };
  if(hint) hint.textContent = hints[s] || '';
  const timerSubTxt = {
    idle: _isEN?'Waiting':'等待開始', calibrating: _isEN?'Calibrating':'校正計時',
    waiting_for_start: _isEN?'Ready to measure':'等待開始量測',
    running: _isEN?'Measuring':'量測計時', paused: _isEN?'Paused':'暫停中',
  };
  if(timerSub) timerSub.textContent = timerSubTxt[s]||'';
}

function mpUpdateConn() {
  const dot   = document.getElementById('mpConnDot');
  const label = document.getElementById('mpConnLabel');
  ['mpBleBtn','mpUsbBtn','mpDemoBtn'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.classList.remove('active');
  });
  const cfg={
    none:{cls:'',    lbl: typeof _lang!=='undefined'&&_lang==='en'?'Not Connected':'未連線'},
    ble: {cls:'ble', lbl: typeof _lang!=='undefined'&&_lang==='en'?'BLE Connected':'BLE 已連線', active:'mpBleBtn'},
    usb: {cls:'usb', lbl: typeof _lang!=='undefined'&&_lang==='en'?'USB Connected':'USB 已連線', active:'mpUsbBtn'},
    demo:{cls:'demo',lbl: typeof _lang!=='undefined'&&_lang==='en'?'Demo Mode':'Demo 模式',  active:'mpDemoBtn'},
  };
  const c=cfg[_mp.mode]||cfg.none;
  if(dot)   dot.className=c.cls;
  if(label) label.textContent=c.lbl;
  if(c.active){ const el=document.getElementById(c.active); if(el) el.classList.add('active'); }
  mpUpdate();
}

function mpUpdateStats(bpm, rpm, score) {
  const sc=score>=80?'var(--red)':score>=60?'#f2666a':score>=30?'var(--yellow)':'var(--green)';
  const bpmEl=document.getElementById('mpBPM');
  const rpmEl=document.getElementById('mpRPM');
  const scEl =document.getElementById('mpScore');
  const scVal=document.getElementById('mpScoreVal');
  const scFill=document.getElementById('mpScoreFill');
  if(bpmEl) bpmEl.textContent=bpm>0?Math.round(bpm):'--';
  if(rpmEl) rpmEl.textContent=rpm>0?rpm.toFixed(1):'--';
  if(scEl)  {scEl.textContent=Math.round(score);scEl.style.color=sc;}
  if(scVal) {scVal.textContent=Math.round(score);scVal.style.color=sc;}
  if(scFill) scFill.style.width=Math.min(100,score)+'%';
}

function mpUpdateGSR(chgPct, level) {
  const dot = document.getElementById('mpGsrDot');
  const val = document.getElementById('mpGsrVal');
  if (!dot || !val) return;
  const sign = chgPct >= 0 ? '+' : '';
  val.textContent = sign + chgPct.toFixed(1) + '%';
  if (level === 'hi') {
    dot.style.background = 'var(--red)';
    dot.style.boxShadow  = '0 0 5px var(--red)';
    val.style.color = 'var(--red)';
  } else if (level === 'warn') {
    dot.style.background = 'var(--yellow)';
    dot.style.boxShadow  = '0 0 5px var(--yellow)';
    val.style.color = 'var(--yellow)';
  } else {
    dot.style.background = 'var(--green)';
    dot.style.boxShadow  = '0 0 5px var(--green)';
    val.style.color = 'var(--green)';
  }
}

document.getElementById('mpMainBtn').addEventListener('click', () => {
  const s = _mp.state;
  if      (s==='idle')              mpDoCalib();
  else if (s==='calibrating')       mpDoStop();
  else if (s==='waiting_for_start') mpDoStart();
  else if (s==='running')           mpDoPause();
  else if (s==='paused')            mpDoResume();
});
document.getElementById('mpStopBtn').addEventListener('click', () => mpDoStop());

function mpDoCalib() {
  if(_mp.mode==='none') return;
  _mp.state='calibrating'; _mp.calibSec=0;
  if(_mp.mode==='demo') {
    ingestPacket('STATUS,CALIBRATING');
    _demoStartCalib();
  } else {
    // ★ Optimistically start timer so user sees feedback immediately
    // (ESP32 will echo STATUS,CALIBRATING which re-runs the same init safely)
    S.calibBuf = null;
    S.base = { hr: null, gsr: null, resp: null };
    S.startMs = Date.now();
    startTimer();
    setPhaseUI('calibrating');
    deviceWrite('CALIB');
  }
  clearInterval(_mp.calibTimer);
  _mp.calibTimer=setInterval(()=>{
    _mp.calibSec++;
    const pct=Math.min(100,_mp.calibSec/CFG.calib*100);
    const f=document.getElementById('mpCalibFill'); if(f) f.style.width=pct+'%';
    mpUpdate();
    if(_mp.calibSec>=CFG.calib) clearInterval(_mp.calibTimer);
  },1000);
  mpUpdate();
}
function mpDoStart() {
  if (_mp.mode === 'demo') {
    _demoStartMeasure();
  } else {
    deviceWrite('START');
    // Optimistic local update — don't wait for ESP32 STATUS,RUNNING
    // enterRunning() guards against double-init if ESP32 also echoes STATUS,RUNNING
    enterRunning();
  }
}
function mpDoPause() {
  if(_mp.mode==='demo'){_mp.state='paused';ingestPacket('STATUS,PAUSED');}
  else{deviceWrite('PAUSE');_mp.state='paused';}
  mpUpdate();
}
function mpDoResume() {
  if(_mp.mode==='demo'){_mp.state='running';ingestPacket('STATUS,RUNNING');}
  else{deviceWrite('RESUME');_mp.state='running';}
  mpUpdate();
}
function mpDoStop() {
  clearInterval(_mp.calibTimer); clearInterval(_mp.demoDataTimer);
  _mp.calibSec=0;
  const f=document.getElementById('mpCalibFill'); if(f) f.style.width='0%';
  if(_mp.mode==='demo'){ingestPacket('STATUS,STOPPED');ingestPacket('END');}
  else if(_mp.mode!=='none') deviceWrite('STOP');
  _mp.state='idle'; mpUpdate();
}

// Sync from ESP32 status packets
function cpOnPhaseChange_mp(newPhase) {
  const pm={idle:'idle',calibrating:'calibrating',waiting_for_start:'waiting_for_start',running:'running',paused:'paused',ended:'idle'};
  if(newPhase==='waiting_for_start'){
    clearInterval(_mp.calibTimer);
    const f=document.getElementById('mpCalibFill');
    if(f){f.style.width='100%';setTimeout(()=>{f.style.width='0%';},800);}
  }
  _mp.state=pm[newPhase]||'idle'; mpUpdate();
}

// Connection buttons
document.getElementById('mpBleBtn').addEventListener('click',()=>document.getElementById('bleModal').classList.add('show'));
document.getElementById('mpUsbBtn').addEventListener('click',()=>document.getElementById('btnUsb').click());
document.getElementById('mpDemoBtn').addEventListener('click',()=>{
  if(_mp.mode==='demo'){mpDoStop();_mp.mode='none';}
  else{_mp.mode='demo';_mp.state='idle';}
  mpUpdateConn(); mpUpdate();
});
document.getElementById('mpCamBtn')?.addEventListener('click',async()=>{
});
document.getElementById('mpCsvBtn').addEventListener('click',()=>exportCsv());

// ── 重新量測按鈕 ────────────────────────────────────────────
document.getElementById('mpResetBtn').addEventListener('click', () => {
  // 顯示自訂 Modal，讓使用者選擇是否保留基準值
  const overlay = document.getElementById('resetConfirmOverlay');
  if (overlay) overlay.classList.add('show');
});

// ── 清除資料 Modal 按鈕邏輯 ─────────────────────────────────
function _doReset(keepBaseline) {
  const overlay = document.getElementById('resetConfirmOverlay');
  if (overlay) overlay.classList.remove('show');

  // 停止目前任何進行中的狀態
  if (_mp.mode === 'demo') {
    clearInterval(_mp.calibTimer);
    clearInterval(_mp.demoDataTimer);
  } else if (S.connMode && (S.phase === 'running' || S.phase === 'paused')) {
    deviceWrite('STOP');
  }

  // 清除量測資料
  S.hr = []; S.gsr = []; S.resp = []; S.score = [];
  if (typeof rrDetectReset === 'function') rrDetectReset();
  if (typeof hrDetectReset === 'function') hrDetectReset();
  S.gsrTriggers = 0; S.gsrConsec = 0;
  S._lastChartT = -999;
  S.calibBuf = null;

  // 若選擇全部清除，也清掉基準值和 calib 圖表線
  if (!keepBaseline) {
    S.base = { hr: null, gsr: null, resp: null };
    S.calibEndSec = null;
    updateBaselineUI();
    // 清除 calib dataset[2]
    ;['hr','gsr','resp'].forEach(key => {
      const chart = liveCharts[key];
      if (chart) { chart.data.datasets[2].data = []; chart.update('none'); }
    });
    // ★ 清除 BPM/RPM calib 參考線
    ;['bpm','rpm'].forEach(key => {
      const chart = liveCharts[key];
      if (chart) { chart.data.datasets[2].data = []; chart.update('none'); }
    });
  }

  // 清除 live chart 資料（raw + filtered datasets）
  ;['hr','gsr','resp'].forEach(key => {
    const chart = liveCharts[key];
    if (!chart) return;
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update('none');
  });
  // ★ 清除 BPM/RPM 圖表
  ;['bpm','rpm'].forEach(key => {
    const chart = liveCharts[key];
    if (!chart) return;
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    if (!keepBaseline) chart.data.datasets[2].data = [];
    chart.update('none');
  });
  if (liveCharts.overview) {
    liveCharts.overview.data.datasets.forEach(ds => ds.data = []);
    liveCharts.overview.update('none');
  }

  // 重置計時器
  cancelAnimationFrame(S.timerRaf);
  cancelAnimationFrame(S._mpTimerRaf);
  document.getElementById('mainTimer').textContent = '00:00';
  const mpT = document.getElementById('mpTimer');
  if (mpT) mpT.textContent = '00:00';

  // 重置 log table
  const logBody = document.getElementById('liveLogBody');
  if (logBody) logBody.innerHTML = '';
  const logCount = document.getElementById('logCount');
  if (logCount) logCount.textContent = '0 rows';

  // 重置壓力儀表
  updateStressGauge(0);

  // 決定回到哪個 phase
  const hasBase = keepBaseline && S.base && (S.base.hr != null || S.base.gsr != null);
  if (hasBase) {
    _mp.state = 'waiting_for_start';
    setPhaseUI('waiting_for_start');
    if (_mp.mode === 'demo') ingestPacket('STATUS,WAITING_FOR_START');
  } else {
    _mp.state = 'idle';
    setPhaseUI('idle');
  }
  mpUpdate();
  document.getElementById('mpResetBtn').style.display = 'none';
}

document.getElementById('btnResetCancel').addEventListener('click', () => {
  document.getElementById('resetConfirmOverlay').classList.remove('show');
});
document.getElementById('btnResetKeepBase').addEventListener('click', () => _doReset(true));
document.getElementById('btnResetClearAll').addEventListener('click', () => _doReset(false));

// Sync timer to mpTimer
const _origStartTimer = startTimer;
window.startTimer = function() {
  _origStartTimer();
  // also tick mpTimer
  function mpTick() {
    if(!S.startMs) return;
    const el=document.getElementById('mpTimer');
    if(el){const s=Math.floor((Date.now()-S.startMs)/1000);el.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
    S._mpTimerRaf=requestAnimationFrame(mpTick);
  }
  cancelAnimationFrame(S._mpTimerRaf);
  S._mpTimerRaf=requestAnimationFrame(mpTick);
};

// Demo mode internal
function _demoStartCalib() {
  _demoCalibSec=0; _hasBaselineSim=false;
  clearInterval(_demoCalibInterval);
  // Send simulated DATA packets during calibration (20Hz)
  var _demoCalibDataTimer = setInterval(()=>{
    if(_demoCalibSec >= CFG.calib) { clearInterval(_demoCalibDataTimer); return; }
    var t = (_demoCalibSec + Math.random()).toFixed(3);
    var gsr = Math.round(1800 + (Math.random()-.5)*40);
    var hr = Math.round(2000 + (Math.random()-.5)*40);
    var resp = Math.round(1500 + (Math.random()-.5)*30);
    var bpm = (72 + (Math.random()-.5)*3).toFixed(1);
    var rpm = (14 + (Math.random()-.5)*1.5).toFixed(1);
    ingestPacket('DATA,'+t+','+gsr+','+hr+','+resp+','+bpm+','+rpm+',0');
  }, 50);
  _demoCalibInterval=setInterval(()=>{
    _demoCalibSec++;
    ingestPacket('CALIB_PROG,'+_demoCalibSec+','+CFG.calib);
    if(_demoCalibSec>=CFG.calib){
      clearInterval(_demoCalibInterval); _hasBaselineSim=true;
      // calibBuf already accumulated by ingestPacket during calibration
      ingestPacket('BASELINE,1800,2000,1500');
    }
  },1000);
}
function _demoStartMeasure() {
  _demoTick=0; _mp.state='running'; ingestPacket('STATUS,RUNNING');
  clearInterval(_mp.demoDataTimer);
  _mp.demoDataTimer=setInterval(()=>{
    if(_mp.state!=='running') return;
    _demoTick++;
    const t=(_demoTick*0.05).toFixed(3);
    const stress=(Math.sin(_demoTick*0.015)*0.5+0.5)*60+Math.random()*20;
    const gsr=Math.round(1800-stress*2.2+(Math.random()-.5)*30);
    const hr=Math.round(2000+stress*1.8+(Math.random()-.5)*25);
    const resp=Math.round(1500+stress*1.5+(Math.random()-.5)*20);
    const bpm=(72+stress*0.35+(Math.random()-.5)*2).toFixed(1);
    const rpm=(14+stress*0.10+(Math.random()-.5)*1).toFixed(1);
    const score=Math.min(100,Math.max(0,stress+(Math.random()-.5)*8)).toFixed(1);
    ingestPacket(`DATA,${t},${gsr},${hr},${resp},${bpm},${rpm},${score}`);
    mpUpdateStats(parseFloat(bpm),parseFloat(rpm),parseFloat(score));
  },50);
}

// Override cpOnPhaseChange to also update _mp
const _origCpOnPhaseChange = typeof cpOnPhaseChange === 'function' ? cpOnPhaseChange : null;
window.cpOnPhaseChange = function(newPhase) {
  if(_origCpOnPhaseChange) _origCpOnPhaseChange(newPhase);
  cpOnPhaseChange_mp(newPhase);
};

// Override setBleUI / setUsbUI
const _origSetBleUI2 = setBleUI;
window.setBleUI = function(on) {
  _origSetBleUI2(on);
  _mp.mode = on ? 'ble' : (_mp.mode==='ble'?'none':_mp.mode);
  mpUpdateConn();
};
const _origSetUsbUI2 = setUsbUI;
window.setUsbUI = function(on) {
  _origSetUsbUI2(on);
  _mp.mode = on ? 'usb' : (_mp.mode==='usb'?'none':_mp.mode);
  mpUpdateConn();
};

// Wire DATA packets to mpUpdateStats
const _origIngest2 = ingestPacket;
window.ingestPacket = function(raw) {
  _origIngest2(raw);
  if(S.score.length>0){
    const last=S.score[S.score.length-1];
    const lastHr=S.hr[S.hr.length-1]||{};
    const lastResp=S.resp[S.resp.length-1]||{};
    mpUpdateStats(lastHr.bpm||0,lastResp.rpm||0,last.val||0);
  }
};

mpUpdateConn(); mpUpdate();

// Master panel: no drag/collapse (mobile-only panel)

// ══════════════════════════════════════════════════════════════
// MASTER PANEL MAXIMIZE — 最大化（手機專用）
// ══════════════════════════════════════════════════════════════
const mpMiniCharts = {};
const MP_WIN = 120; // sliding window data points

const mpMiniCfg = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  elements: { point: { radius: 0 } },
  scales: {
    x: {
      type: 'linear',
      grid: { color: 'rgba(255,255,255,.04)' },
      ticks: { color: '#454d66', font: { size: 8, family: 'IBM Plex Mono' }, maxTicksLimit: 6 },
    },
    y: {
      grid: { color: 'rgba(255,255,255,.04)' },
      ticks: { color: '#454d66', font: { size: 8, family: 'IBM Plex Mono' }, maxTicksLimit: 4 },
    },
  },
};

function mpMiniChartsInit() {
  if (mpMiniCharts.hr) return; // already initialized
  const mkMini = (id, color) => {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    return new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ data: [], borderColor: color, borderWidth: 1.5, fill: false, tension: 0.25, pointRadius: 0 }] },
      options: JSON.parse(JSON.stringify(mpMiniCfg)),
    });
  };
  mpMiniCharts.hr   = mkMini('mpCanvasHR',   '#f2666a');
  mpMiniCharts.gsr  = mkMini('mpCanvasGSR',  '#f0b429');
  mpMiniCharts.resp = mkMini('mpCanvasResp', '#3ecf8e');
}

function mpMiniChartsPush() {
  // Pull latest N pts from S arrays
  if (!mpMiniCharts.hr) return;
  const slice = arr => arr.slice(-MP_WIN);
  const toXY  = (arr, key) => arr.map(p => ({ x: p.t, y: p[key] }));

  const hrPts   = toXY(slice(S.hr),   'raw');
  const gsrPts  = toXY(slice(S.gsr),  'raw');
  const respPts = toXY(slice(S.resp), 'raw');

  if (mpMiniCharts.hr  && hrPts.length)   { mpMiniCharts.hr.data.datasets[0].data   = hrPts;   mpMiniCharts.hr.update('none'); }
  if (mpMiniCharts.gsr && gsrPts.length)  { mpMiniCharts.gsr.data.datasets[0].data  = gsrPts;  mpMiniCharts.gsr.update('none'); }
  if (mpMiniCharts.resp&& respPts.length) { mpMiniCharts.resp.data.datasets[0].data = respPts; mpMiniCharts.resp.update('none'); }
}

(function() {
  const panel  = document.getElementById('masterPanel');
  const maxBtn = document.getElementById('mpMaxBtn');
  const togBtn = document.getElementById('mpToggleBtn');
  if (!panel || !maxBtn) return;

  let maximized = false;

  maxBtn.addEventListener('click', e => {
    e.stopPropagation();
    maximized = !maximized;
    panel.classList.toggle('mp-maximized', maximized);

    if (maximized) {
      // Uncollapse if collapsed
      panel.classList.remove('mp-collapsed');
      maxBtn.textContent = '⤡';       // shrink icon
      maxBtn.title = '還原';
      togBtn.style.display = 'none';  // hide collapse btn while maximized

      mpMiniChartsInit();             // lazy init on first open
      // Flush current data into mini charts immediately
      setTimeout(() => {
        mpMiniChartsPush();
        Object.values(mpMiniCharts).forEach(c => c && c.resize());
      }, 50);
    } else {
      maxBtn.textContent = '⤢';
      maxBtn.title = '最大化';
      togBtn.style.display = '';
    }
  });
})();

// Patch mpUpdateStats to also push to mini charts when maximized
const _origMpUpdateStats = mpUpdateStats;
window.mpUpdateStats = function(bpm, rpm, score) {
  _origMpUpdateStats(bpm, rpm, score);
  if (document.getElementById('masterPanel')?.classList.contains('mp-maximized')) {
    mpMiniChartsPush();
  }
};

// ══════════════════════════════════════════════════════════════
// MOBILE HAMBURGER / SIDEBAR TOGGLE
// ══════════════════════════════════════════════════════════════
(function(){
  const menuBtn  = document.getElementById('mobileMenuBtn');
  const sidebar  = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if(!menuBtn || !sidebar) return;

  function openSidebar(){
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('show');
    menuBtn.textContent = '✕';
  }
  function closeSidebar(){
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
    menuBtn.textContent = '☰';
  }
  menuBtn.addEventListener('click', ()=>{
    sidebar.classList.contains('mobile-open') ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);
  // Close sidebar when a nav item is tapped on mobile
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{ if(window.innerWidth<=768) closeSidebar(); });
  });
})();

// ══════════════════════════════════════════════════════════════
// MOBILE BOTTOM NAV — sync with sidebar nav
// ══════════════════════════════════════════════════════════════
(function(){
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');

  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', ()=>{
      const pg = btn.dataset.page;
      // Reuse the existing sidebar nav click logic
      const sidebarBtn = document.querySelector(`.nav-item[data-page="${pg}"]`);
      if(sidebarBtn) sidebarBtn.click();
    });
  });

  // Keep mobile bottom nav in sync when sidebar nav is clicked
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const pg = btn.dataset.page;
      mobileNavBtns.forEach(b => b.classList.toggle('active', b.dataset.page===pg));
    });
  });
})();

