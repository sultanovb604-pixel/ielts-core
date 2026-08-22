(() => {
  const params = new URLSearchParams(location.search);
  const labels = { listening: 'Listening', speaking: 'Speaking', reading: 'Reading', writing: 'Writing' };
  const allowedLevels = ['beginner', 'elementary', 'ielts'];
  let skill = labels[params.get('skill')] ? params.get('skill') : 'all';
  let level = allowedLevels.includes(params.get('level')) ? params.get('level') : 'all';
  const title = document.querySelector('#practiceTitle');

  const render = () => {
    document.querySelectorAll('[data-skill]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.skill === skill)));
    document.querySelectorAll('[data-practice-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.practiceLevel === level)));
    document.querySelectorAll('[data-practice-skill]').forEach(card => {
      card.hidden = skill !== 'all' && card.dataset.practiceSkill !== skill;
      card.querySelectorAll('a').forEach(link => {
        try {
          const url = new URL(link.href, location.origin);
          if (level === 'all') {
            url.searchParams.delete('level');
          } else {
            url.searchParams.set('level', level);
          }
          link.href = url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
        } catch (_) {}
      });
    });

    const levelNames = { ielts: 'IELTS (CDI)', elementary: 'Elementary (A2)', beginner: 'Beginner (A1)' };
    const levelLabel = levelNames[level] || '';
    if (title) {
      if (skill === 'all') {
        title.textContent = levelLabel ? `${levelLabel} Practice Hub` : 'Targeted IELTS Practice Hub';
      } else {
        title.textContent = `${levelLabel ? `${levelLabel} · ` : ''}${labels[skill]} Focused Practice`;
      }
    }

    const url = new URL(location.href);
    skill === 'all' ? url.searchParams.delete('skill') : url.searchParams.set('skill', skill);
    level === 'all' ? url.searchParams.delete('level') : url.searchParams.set('level', level);
    history.replaceState({}, '', url);
  };
  document.querySelectorAll('[data-skill]').forEach(button => button.addEventListener('click', () => { skill = button.dataset.skill; render(); }));
  document.querySelectorAll('[data-practice-level]').forEach(button => button.addEventListener('click', () => { level = button.dataset.practiceLevel; render(); }));
  render();
})();
