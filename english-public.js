// Landing and authentication navigation; no workspace or test-launch side effects.
(() => {
  const menu = document.querySelector('[data-mobile-menu]');
  const nav = document.querySelector('#mainNav');
  if (!menu || !nav) return;
  function setOpen(open, restoreFocus = false) {
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.textContent = open ? 'Close' : 'Menu';
    if (restoreFocus) menu.focus();
  }
  menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) setOpen(false, true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.app-header') && nav.classList.contains('open')) setOpen(false);
  });
  const desktop = window.matchMedia('(min-width: 961px)');
  desktop.addEventListener('change', () => { if (desktop.matches) setOpen(false); });
})();
