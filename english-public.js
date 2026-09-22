// Landing and authentication navigation; no workspace or test-launch side effects.
(() => {
  const context = document.querySelector('[data-auth-context]');
  if (context) {
    const next = new URLSearchParams(location.search).get('next');
    // Explain the account gate without rendering user-provided text or creating redirects.
    if (next && next.startsWith('/english/materials')) {
      const requested = new URL(next, location.origin);
      const skill = requested.searchParams.get('skill');
      const label = skill === 'reading' ? 'Reading practice' : skill === 'listening' ? 'Listening practice' : 'the practice library';
      const action = document.body.dataset.authMode === 'signup' ? 'Create your free account' : 'Sign in';
      context.textContent = action + ' to continue to ' + label + '. Some materials require Premium.';
      context.hidden = false;
    }
  }
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
