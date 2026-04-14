// CSV Export - Split into Baseline + Measurement files
// Baseline: calibration period data
// Measurement: running period data with baseline averages

function exportCsv() {
  if (!S.hr.length) { alert('尚無數據'); return; }
  const ts = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
  const scores = recalcStress();

  // ── Baseline CSV ──────────────────────────────────────────
  let csvBase = 'time_s,hr_raw_b,gsr_raw_b,resp_raw_b,BPM_b,RPM_b\n';
  if (S.calibBuf) {
    const cb = S.calibBuf;
    const n = cb.hr?.length || 0;
    for (let i = 0; i < n; i++) {
      const t = cb.t?.[i] != null ? cb.t[i].toFixed(3) : ((i + 1) / (CFG.data_rate || 25)).toFixed(3);
      csvBase += [
        t,
        cb.hr?.[i]   ?? '',
        cb.gsr?.[i]  ?? '',
        cb.resp?.[i] ?? '',
        cb.bpm?.[i]  != null ? Number(cb.bpm[i]).toFixed(1) : '',
        cb.rpm?.[i]  != null ? Number(cb.rpm[i]).toFixed(1) : '',
      ].join(',') + '\n';
    }
  }

  // ── Measurement CSV ───────────────────────────────────────
  const baseGSR = S.base.gsr != null ? S.base.gsr.toFixed(1) : '';
  const baseBPM = S.base.bpm != null ? S.base.bpm.toFixed(1) : '';
  const baseRPM = S.base.rpm != null ? S.base.rpm.toFixed(1) : '';

  let csvMeas = 'time_s,base_gsr,base_bpm,base_rpm,hr_raw,gsr_raw,resp_raw,BPM,RPM,Score,Score_HR,Score_RPM,Score_GSR\n';
  const n = Math.min(S.hr.length, S.gsr.length, S.resp.length);
  for (let i = 0; i < n; i++) {
    const hr   = S.hr[i];
    const gsr  = S.gsr[i]  || {};
    const resp = S.resp[i] || {};
    const sc   = scores[i] || {};
    csvMeas += [
      hr.t.toFixed(3),
      baseGSR, baseBPM, baseRPM,
      hr.raw   ?? '',
      gsr.raw  ?? '',
      resp.raw ?? '',
      hr.bpm   != null ? hr.bpm.toFixed(1)   : '',
      resp.rpm != null ? resp.rpm.toFixed(1)  : '',
      sc.val   != null ? sc.val.toFixed(3)    : '',
      sc.s_hr  != null ? sc.s_hr.toFixed(3)   : '',
      sc.s_resp != null ? sc.s_resp.toFixed(3) : '',
      sc.s_gsr != null ? sc.s_gsr.toFixed(3)  : '',
    ].join(',') + '\n';
  }

  // Download both
  _dlFile(csvBase, `BioMonitor_Baseline_${ts}.csv`);
  setTimeout(() => _dlFile(csvMeas, `BioMonitor_Measurement_${ts}.csv`), 300);
}

function _dlFile(content, fname) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
}
