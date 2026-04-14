// Hardware control state machine
// Source: biomonitor_v26.html lines 3210-3413

// ============================================================
// CONTROL AUTHORITY SYSTEM
// Modes: 'esp' (ESP32 physical buttons) | 'web' (web UI sends BLE/USB commands)
// ============================================================
let _ctrlMode = 'esp';  // 'esp' | 'web'
// web mode mirrors the same state machine as demo mode, but sends real BLE/USB commands
let _ctrlState   = 'idle';  // idle | calibrating | waiting_for_start | running | paused
let _ctrlCalibInterval = null;
let _ctrlCalibSec = 0;

function cpUpdatePanel() {
  const btn1 = document.getElementById('cpBtn1');
  const btn2 = document.getElementById('cpBtn2');
  const tmr  = document.getElementById('cpTimer');
  if (!btn1) return;

  btn1.disabled = false;
  btn2.disabled = false;

  if (_ctrlState === 'idle') {
    btn1.textContent = 'BTN1 — 開機 / 開始校正';
    btn1.className   = 'dp-btn dp-btn-start';
    btn2.textContent = 'BTN2 — 開始量測';
    btn2.className   = 'dp-btn dp-btn-pause';
    btn2.disabled    = true;
    document.getElementById('cpCalibFill').style.width = '0%';
    if (tmr) tmr.textContent = '等待操作...';

  } else if (_ctrlState === 'calibrating') {
    btn1.textContent = 'BTN1 — 強制停止 / 關機';
    btn1.className   = 'dp-btn dp-btn-stop';
    btn2.textContent = 'BTN2 — 校正中，請稍候…';
    btn2.className   = 'dp-btn dp-btn-pause';
    btn2.disabled    = true;

  } else if (_ctrlState === 'waiting_for_start') {
    btn1.textContent = 'BTN1 — 強制停止 / 關機';
    btn1.className   = 'dp-btn dp-btn-stop';
    btn2.textContent = 'BTN2 — 開始量測';
    btn2.className   = 'dp-btn dp-btn-start';
    btn2.disabled    = false;
    if (tmr) tmr.textContent = '基準值就緒，按 BTN2 開始';

  } else if (_ctrlState === 'running') {
    btn1.textContent = 'BTN1 — 暫停';
    btn1.className   = 'dp-btn dp-btn-pause';
    btn2.textContent = 'BTN2 — 停止量測';
    btn2.className   = 'dp-btn dp-btn-stop';

  } else if (_ctrlState === 'paused') {
    btn1.textContent = 'BTN1 — 繼續';
    btn1.className   = 'dp-btn dp-btn-start';
    btn2.textContent = 'BTN2 — 停止量測';
    btn2.className   = 'dp-btn dp-btn-stop';
  }
}

// Sync ctrlState with the actual S.phase when switching to web mode
function cpSyncStateFromPhase() {
  const phaseMap = {
    'idle': 'idle', 'calibrating': 'calibrating',
    'waiting_for_start': 'waiting_for_start',
    'running': 'running', 'paused': 'paused', 'ended': 'idle'
  };
  _ctrlState = phaseMap[S.phase] || 'idle';
  cpUpdatePanel();
}

// Switch authority mode
function setCtrlMode(mode) {
  _ctrlMode = mode;
  const espBtn = document.getElementById('cpAuthEsp');
  const webBtn = document.getElementById('cpAuthWeb');
  const webCtrl = document.getElementById('cpWebCtrl');
  const espHints = document.getElementById('cpEspHints');
  const statusTag = document.getElementById('cpStatus');
  if (mode === 'web') {
    espBtn.classList.remove('active'); webBtn.classList.add('active');
    webCtrl.style.display = 'flex';
    espHints.style.display = 'none';
    statusTag.innerHTML = '<span class="cp-mode-tag web">網頁</span>網頁 UI 送指令至 ESP32';
    document.getElementById('cpCalibSec').textContent = CFG.calib;
    cpSyncStateFromPhase();
  } else {
    espBtn.classList.add('active'); webBtn.classList.remove('active');
    webCtrl.style.display = 'none';
    espHints.style.display = 'block';
    statusTag.innerHTML = '<span class="cp-mode-tag esp">ESP32</span>實體 BTN1/BTN2 主控';
    clearInterval(_ctrlCalibInterval);
  }
}

// Authority toggle buttons
document.getElementById('cpAuthEsp').addEventListener('click', () => setCtrlMode('esp'));
document.getElementById('cpAuthWeb').addEventListener('click', () => setCtrlMode('web'));

// Web-ctrl BTN1 (mirrors demo BTN1 but sends real commands)
document.getElementById('cpBtn1').addEventListener('click', () => {
  if (_ctrlMode !== 'web') return;

  if (_ctrlState === 'idle') {
    _ctrlState = 'calibrating';
    _ctrlCalibSec = 0;
    document.getElementById('cpCalibFill').style.width = '0%';
    deviceWrite('CALIB');
    // ★ Immediately set S.phase = 'calibrating' so DATA packets go into calibBuf
    // (ESP32 may not echo STATUS,CALIBRATING in time for the first packets)
    ingestPacket('STATUS,CALIBRATING');
    cpUpdatePanel();
    // local countdown for visual feedback
    _ctrlCalibInterval = setInterval(() => {
      _ctrlCalibSec++;
      const pct = Math.min(100, _ctrlCalibSec / CFG.calib * 100);
      document.getElementById('cpCalibFill').style.width = pct + '%';
      const tmr = document.getElementById('cpTimer');
      if (tmr) tmr.textContent = `校正中 ${_ctrlCalibSec}/${CFG.calib}s`;
      if (_ctrlCalibSec >= CFG.calib) {
        clearInterval(_ctrlCalibInterval);
        // Wait for ESP32 to send BASELINE packet to confirm
      }
    }, 1000);

  } else if (_ctrlState === 'calibrating') {
    clearInterval(_ctrlCalibInterval);
    _ctrlCalibSec = 0;
    document.getElementById('cpCalibFill').style.width = '0%';
    deviceWrite('STOP');
    _ctrlState = 'idle';
    cpUpdatePanel();

  } else if (_ctrlState === 'waiting_for_start') {
    deviceWrite('STOP');
    _ctrlState = 'idle';
    document.getElementById('cpCalibFill').style.width = '0%';
    cpUpdatePanel();

  } else if (_ctrlState === 'running') {
    deviceWrite('PAUSE');
    _ctrlState = 'paused';
    cpUpdatePanel();

  } else if (_ctrlState === 'paused') {
    deviceWrite('RESUME');
    _ctrlState = 'running';
    cpUpdatePanel();
  }
});

// Web-ctrl BTN2
document.getElementById('cpBtn2').addEventListener('click', () => {
  if (_ctrlMode !== 'web') return;
  if (_ctrlState === 'idle' || _ctrlState === 'calibrating') return;

  if (_ctrlState === 'waiting_for_start') {
    deviceWrite('START');
    _ctrlState = 'running';
    cpUpdatePanel();

  } else if (_ctrlState === 'running' || _ctrlState === 'paused') {
    clearInterval(_ctrlCalibInterval);
    deviceWrite('STOP');
    _ctrlState = 'idle';
    cpUpdatePanel();
  }
});

// Keep ctrlState in sync when ESP32 sends status packets
// (injected into ingestPacket via a hook — see below)
function cpOnPhaseChange(newPhase) {
  if (_ctrlMode !== 'web') return;
  const m = {'idle':'idle','calibrating':'calibrating',
    'waiting_for_start':'waiting_for_start','running':'running',
    'paused':'paused','ended':'idle'};
  if (m[newPhase] !== undefined) { _ctrlState = m[newPhase]; cpUpdatePanel(); }
}

// Open/close ctrl panel
document.getElementById('btnCtrl').addEventListener('click', () => {
  document.getElementById('ctrlPanel').classList.toggle('hidden');
  document.getElementById('cpCalibSec').textContent = CFG.calib;
});
document.getElementById('ctrlPanelClose').addEventListener('click', () => {
  document.getElementById('ctrlPanel').classList.add('hidden');
});

// Draggable ctrl panel
(function() {
  const panel = document.getElementById('ctrlPanel');
  const head  = document.getElementById('ctrlPanelHead');
  head.addEventListener('mousedown', e => {
    const startX = e.clientX - panel.offsetLeft;
    const startY = e.clientY - panel.offsetTop;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    const move = ev => { panel.style.left=(ev.clientX-startX)+'px'; panel.style.top=(ev.clientY-startY)+'px'; };
    const up = () => { document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
})();

// Show/hide btnCtrl based on connection state
function updateCtrlBtn() {
  const btn = document.getElementById('btnCtrl');
  if (S.connMode) { btn.classList.remove('hidden'); }
  else { btn.classList.add('hidden'); document.getElementById('ctrlPanel').classList.add('hidden'); }
}

