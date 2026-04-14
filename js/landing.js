// Landing page
document.getElementById('landingEnter')?.addEventListener('click', () => {
  const lp = document.getElementById('landingPage');
  if (lp) {
    lp.style.opacity = '0';
    lp.style.transition = 'opacity .35s';
    setTimeout(() => { lp.style.display = 'none'; }, 350);
  }
});
