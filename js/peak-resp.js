// RPM Detection - Conductive Rubber Band
// 5s baseline tracking → +3% slope detection → peak-to-peak timing

const _rrDet = {
  baselineBuf: [],     // last 5s of values for baseline
  BASELINE_SEC: 5,     // baseline window
  sampleRate: 20,      // Hz
  RISE_PCT: 0.03,      // +3% above baseline = inhale start
  DEAD_ZONE_MS: 1500,  // minimum time between breaths (max 40 RPM)
  lastPeakMs: 0,
  rising: false,       // currently in rising phase?
  peakVal: 0,          // current peak value during rise
  lastBPM: 0,          // current RPM
  ibiHistory: [],      // last 5 breath intervals
};

function rrDetectPush(t, rawResp) {
  const now = performance.now();

  // 1. Maintain 5-second baseline buffer
  _rrDet.baselineBuf.push(rawResp);
  const maxBufSize = _rrDet.BASELINE_SEC * _rrDet.sampleRate;
  if (_rrDet.baselineBuf.length > maxBufSize) _rrDet.baselineBuf.shift();
  if (_rrDet.baselineBuf.length < 20) return 0;

  // 2. Calculate baseline (average of buffer)
  const baseline = _rrDet.baselineBuf.reduce((a, b) => a + b, 0) / _rrDet.baselineBuf.length;
  const threshold = baseline * (1 + _rrDet.RISE_PCT);

  // 3. Slope detection
  if (!_rrDet.rising) {
    // Check if signal rises above baseline + 3%
    if (rawResp > threshold) {
      _rrDet.rising = true;
      _rrDet.peakVal = rawResp;
    }
  } else {
    // Track peak
    if (rawResp > _rrDet.peakVal) {
      _rrDet.peakVal = rawResp;
    } else if (rawResp < _rrDet.peakVal * 0.97) {
      // Signal falling from peak → breath complete
      // Check dead zone
      if (_rrDet.lastPeakMs > 0 && (now - _rrDet.lastPeakMs) >= _rrDet.DEAD_ZONE_MS) {
        const interval = now - _rrDet.lastPeakMs;
        if (interval >= 1500 && interval <= 12000) { // 5-40 RPM range
          _rrDet.ibiHistory.push(interval);
          if (_rrDet.ibiHistory.length > 5) _rrDet.ibiHistory.shift();
          const sorted = [..._rrDet.ibiHistory].sort((a, b) => a - b);
          _rrDet.lastBPM = +(60000 / sorted[Math.floor(sorted.length / 2)]).toFixed(1);
        }
      }
      _rrDet.lastPeakMs = now;
      _rrDet.rising = false;
      _rrDet.peakVal = 0;
    }
  }

  // Timeout
  if (_rrDet.lastPeakMs > 0 && (now - _rrDet.lastPeakMs) > 15000) _rrDet.lastBPM = 0;
  return _rrDet.lastBPM;
}

function rrDetectReset() {
  _rrDet.baselineBuf = []; _rrDet.lastPeakMs = 0;
  _rrDet.rising = false; _rrDet.peakVal = 0;
  _rrDet.lastBPM = 0; _rrDet.ibiHistory = [];
}
