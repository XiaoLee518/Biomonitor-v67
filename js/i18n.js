// Language strings
// Source: biomonitor_v26.html lines 1854-1885

// ============================================================
// NAVIGATION
// ============================================================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const pg = btn.dataset.page;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + pg).classList.add('active');
    // restore masterPanel whenever navigating (report tab hides it)
    document.getElementById('masterPanel').style.display = '';
    if (pg === 'analysis') refreshAnalysis();
  });
});

document.querySelectorAll('.sub-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.subtab;
    btn.closest('.page').querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('subtab-' + id).classList.add('active');
    if (id === 'report') {
      buildReport();
      document.getElementById('masterPanel').style.display = 'none';
    } else {
      document.getElementById('masterPanel').style.display = '';
    }
  });
});

