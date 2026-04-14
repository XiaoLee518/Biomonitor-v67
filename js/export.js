// Stress calculation — G4 logic (piecewise-linear, clamp to 0–100)
//
// 設計邏輯（G4 版）：
//   1.2 倍以下得分極低（忽略小波動），1.2~1.5 倍之間線性攀升至 100。
//
//   S_HR  = constrain((BPM_cur  − BPM_base ×1.20) / (BPM_base ×1.50 − BPM_base ×1.20) ×100, 0, 100)
//           起點 +20%，頂點 +50%；心跳未達 120% 基準時得 0。
//
//   S_RPM = constrain((RPM_cur  − RPM_base ×1.25) / (RPM_base ×1.60 − RPM_base ×1.25) ×100, 0, 100)
//           起點 +25%，頂點 +60%；呼吸未達 125% 基準時得 0。
//
//   S_GSR = constrain((GSR_base ×0.80 − GSR_cur)  / (GSR_base ×0.80 − GSR_base ×0.50) ×100, 0, 100)
//           起點 −20%，頂點 −50%；阻值跌破 80% 才開始計分。
//
//   Stress = S_HR×0.40 + S_RPM×0.40 + S_GSR×0.20   → 0–100

function constrain(val, lo, hi) {
  return Math.min(hi, Math.max(lo, val));
}

function calcStressRT(bpm, rpm, gsrRaw) {
  var baseBPM = S.base.bpm;
  var baseRPM = S.base.rpm;
  var baseGSR = S.base.gsr;

  // If any baseline is missing, cannot calculate
  if (!baseBPM || baseBPM <= 0 || !baseRPM || baseRPM <= 0 || !baseGSR || baseGSR <= 0) {
    return { stress: 0, scoreHR: 0, scoreRPM: 0, scoreGSR: 0 };
  }

  // S_HR: 起點 BPM_base×1.20，頂點 BPM_base×1.50
  var scoreHR = (bpm > 0)
    ? constrain(
        (bpm - baseBPM * 1.20) / (baseBPM * 1.50 - baseBPM * 1.20) * 100,
        0, 100)
    : 0;

  // S_RPM: 起點 RPM_base×1.25，頂點 RPM_base×1.60
  var scoreRPM = (rpm > 0)
    ? constrain(
        (rpm - baseRPM * 1.25) / (baseRPM * 1.60 - baseRPM * 1.25) * 100,
        0, 100)
    : 0;

  // S_GSR: 起點 GSR_base×0.80，頂點 GSR_base×0.50（阻值下降 = 緊張上升）
  var scoreGSR = (gsrRaw > 0)
    ? constrain(
        (baseGSR * 0.80 - gsrRaw) / (baseGSR * 0.80 - baseGSR * 0.50) * 100,
        0, 100)
    : 0;

  // Weighted sum → 0–100
  var stress = scoreHR * 0.4 + scoreRPM * 0.4 + scoreGSR * 0.2;

  return {
    stress:   +stress.toFixed(2),
    scoreHR:  +scoreHR.toFixed(4),
    scoreRPM: +scoreRPM.toFixed(4),
    scoreGSR: +scoreGSR.toFixed(4)
  };
}

// Recalculate all stored data (for analysis / export)
function recalcStress() {
  if (!S.hr.length) return [];
  var result = [];
  var n = Math.min(S.hr.length, S.gsr.length, S.resp.length);
  for (var i = 0; i < n; i++) {
    var bpm    = S.hr[i].bpm || 0;
    var rpm    = S.resp[i].rpm || 0;
    var gsrRaw = S.gsr[i].raw || 0;
    var sc = calcStressRT(bpm, rpm, gsrRaw);
    result.push({
      t: S.hr[i].t,
      val: sc.stress,
      s_hr: sc.scoreHR,
      s_gsr: sc.scoreGSR,
      s_resp: sc.scoreRPM
    });
  }
  return result;
}
