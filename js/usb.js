// USB serial connection
// Source: biomonitor_v26.html lines 3098-3209

// ============================================================
// USB SERIAL (Web Serial API)
// ============================================================
// State
S.usbPort       = null;
S.usbReader     = null;
S.usbWriter     = null;
S.usbReading    = false;

document.getElementById('btnUsb').addEventListener('click', async () => {
  // If already connected, disconnect
  if (S.connMode === 'usb') {
    await usbDisconnect();
    return;
  }
  if (!navigator.serial) {
    alert('此瀏覽器不支援 Web Serial API。\n請使用 Chrome 或 Edge，並確認網址為 https:// 或 localhost。');
    return;
  }
  try {
    // Request port — user picks from dialog (ESP32 shows up as CP210x or CH340)
    const port = await navigator.serial.requestPort();
    S.usbPort = port;

    // Open at 115200, matching Arduino Serial.begin(115200)
    await port.open({ baudRate: 115200 });

    S.connMode = 'usb';
    setUsbUI(true);
    document.getElementById('btnUsb').textContent = 'USB 中斷';
    // 連線成功 → 顯示等待狀態，不做任何其他動作
    document.getElementById('statusMainText').textContent = 'USB 已連線 — 等待 ESP32 狀態同步...';
    document.getElementById('statusSubText').textContent  = '';

    // Start read loop
    usbReadLoop();

    // Get writer for sending commands back to ESP32
    const ws = port.writable.getWriter();
    S.usbWriter = ws;
    ws.releaseLock(); // release immediately; we re-acquire on each write

  } catch (err) {
    if (err.name !== 'NotFoundError') {
      // NotFoundError = user cancelled picker, not a real error
      console.warn('USB connect error:', err);
      alert('USB 連線失敗：' + err.message);
    }
  }
});

async function usbReadLoop() {
  S.usbReading = true;
  let buffer = '';

  while (S.usbPort && S.usbPort.readable && S.usbReading) {
    S.usbReader = S.usbPort.readable.getReader();
    try {
      while (true) {
        const { value, done } = await S.usbReader.read();
        if (done) break;
        // value is Uint8Array
        buffer += new TextDecoder().decode(value);
        // Split on newlines, process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last chunk
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) ingestPacket(trimmed);
        }
      }
    } catch (err) {
      if (S.usbReading) console.warn('USB read error:', err);
    } finally {
      try { S.usbReader.releaseLock(); } catch(_) {}
    }
  }
}

async function usbDisconnect() {
  S.usbReading = false;
  S.connMode   = null;
  try { if (S.usbReader) S.usbReader.cancel(); } catch(_) {}
  try { if (S.usbPort)   await S.usbPort.close(); } catch(_) {}
  S.usbPort   = null;
  S.usbReader = null;
  S.usbWriter = null;
  setUsbUI(false);
  document.getElementById('btnUsb').textContent = 'USB 連線';
}

async function usbWrite(cmd) {
  if (S.connMode !== 'usb' || !S.usbPort || !S.usbPort.writable) return;
  try {
    const writer = S.usbPort.writable.getWriter();
    await writer.write(new TextEncoder().encode(cmd + '\n'));
    writer.releaseLock();
  } catch (e) { console.warn('USB write error:', e); }
}

function setUsbUI(on) {
  document.getElementById('usbDot').className   = 'ble-dot' + (on ? ' on' : '');
  document.getElementById('usbText').textContent = on ? (typeof _lang!=='undefined'&&_lang==='en'?'USB Connected':'USB 已連線') : (typeof _lang!=='undefined'&&_lang==='en'?'USB Disconnected':'USB 未連線');
  updateCtrlBtn();
}

// Unified write — sends to whichever transport is active
async function deviceWrite(cmd) {
  if (S.connMode === 'ble') bleWrite(cmd);
  else if (S.connMode === 'usb') usbWrite(cmd);
}

