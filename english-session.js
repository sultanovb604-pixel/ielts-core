(() => {
  const members = document.querySelectorAll('[data-member]');
  members.forEach(item => { item.hidden = true; item.style.display = 'none'; });
  const token = localStorage.getItem('vortex-english-token');
  if (!token) return;
  fetch('/api/auth/me', { headers:{ Authorization:`Bearer ${token}` } })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      document.querySelectorAll('[data-guest]').forEach(item => { item.hidden = true; item.style.display = 'none'; });
      members.forEach(item => { item.hidden = false; item.style.display = 'flex'; });
      const label = document.querySelector('#memberName');
      if (label) label.textContent = data.user.name.split(' ')[0] || 'Account';
      document.querySelectorAll('.hero-primary,[data-start-onboarding]').forEach(primary => {
        primary.href = '/english/account';
        primary.removeAttribute('data-start-onboarding');
        primary.innerHTML = 'Continue learning <span aria-hidden="true">→</span>';
      });
    })
    .catch(() => {
      localStorage.removeItem('vortex-english-token');
      localStorage.removeItem('vortex-english-student');
    });
})();
