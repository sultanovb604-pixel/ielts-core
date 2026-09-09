(() => {
  const tabs = [...document.querySelectorAll('.precision-tab')];
  if (!tabs.length) return;
  const panels = [...document.querySelectorAll('.precision-panel')];
  const timer = document.querySelector('.precision-time');
  function activate(tab, focus = false) {
    tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    if (timer) timer.hidden = tab.id !== 'precisionReadingTab';
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const moves = {ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1};
      if (!(event.key in moves)) return;
      event.preventDefault();
      activate(tabs[moves[event.key]], true);
    });
  });
})();
