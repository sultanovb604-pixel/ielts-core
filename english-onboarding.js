(() => {
  const onboarding = document.querySelector('#onboarding');
  if (!onboarding) return;
  const state = { step:1, learning:'', goal:'' };
  const selected = () => state.step === 1 ? state.learning : state.goal;
  const render = () => {
    onboarding.querySelectorAll('.onboarding-step').forEach(panel => panel.classList.toggle('active', Number(panel.dataset.step) === state.step));
    onboarding.querySelectorAll('[data-learning]').forEach(button => button.classList.toggle('selected', button.dataset.learning === state.learning));
    onboarding.querySelectorAll('[data-goal]').forEach(button => button.classList.toggle('selected', button.dataset.goal === state.goal));
    onboarding.querySelector('.onboarding-next').disabled = !selected();
    onboarding.querySelectorAll('.onboarding-progress i').forEach((item,index) => item.classList.toggle('active', index < state.step));
    onboarding.querySelector('.onboarding-next').innerHTML = state.step === 1 ? 'Continue <span>→</span>' : 'Build my learning path <span>→</span>';
  };
  const open = () => { state.step = 1; render(); onboarding.showModal(); };
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-start-onboarding]');
    if (!trigger || localStorage.getItem('vortex-english-token')) return;
    event.preventDefault();
    open();
  });
  onboarding.querySelectorAll('[data-learning]').forEach(button => button.addEventListener('click', () => { state.learning = button.dataset.learning; render(); }));
  onboarding.querySelectorAll('[data-goal]').forEach(button => button.addEventListener('click', () => { state.goal = button.dataset.goal; render(); }));
  onboarding.querySelector('.onboarding-next').addEventListener('click', () => {
    if (state.step === 1) { state.step = 2; render(); return; }
    const level = state.learning === 'foundation' ? 'beginner' : 'elementary';
    localStorage.setItem('vortex-english-onboarding', JSON.stringify({ ...state, level }));
    location.assign('/english/signup');
  });
  onboarding.querySelector('.onboarding-skip').addEventListener('click', () => onboarding.close());
  onboarding.addEventListener('click', event => { if (event.target === onboarding) onboarding.close(); });
})();
