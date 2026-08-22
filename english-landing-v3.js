(() => {
  const landing=document.querySelector('.v3-landing');
  if (!landing) return;

  const libraryFilters=[...landing.querySelectorAll('[data-library-filter]')];
  const libraryItems=[...landing.querySelectorAll('[data-resource]')];
  libraryFilters.forEach(button => {
    button.addEventListener('click',() => {
      libraryFilters.forEach(item => {
        item.classList.toggle('active',item===button);
        item.setAttribute('aria-pressed',String(item===button));
      });
      libraryItems.forEach(item => {
        item.hidden=button.dataset.libraryFilter!=='all' && item.dataset.resource!==button.dataset.libraryFilter;
      });
    });
  });

  landing.querySelectorAll('.v3-exam-ui>aside button').forEach(button => {
    button.addEventListener('click',() => {
      landing.querySelectorAll('.v3-exam-ui>aside button').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
    });
  });

  const questionForm=landing.querySelector('[data-v3-question]');
  if (questionForm) {
    const status=questionForm.querySelector('.v3-answer-status');
    questionForm.addEventListener('submit',event => {
      event.preventDefault();
      const answer=new FormData(questionForm).get('answer');
      if (!answer) {
        status.textContent='Choose an answer before continuing.';
        return;
      }
      status.textContent=answer==='B' ? 'Correct — the housing application process.' : 'Not quite. The correct answer is B.';
    });
  }

  const playButton=landing.querySelector('.v3-audio-play');
  const audioRange=landing.querySelector('.v3-player input[type="range"]');
  if (playButton && audioRange) {
    let playing=false;
    let frame=0;
    let previous=0;
    let value=Number(audioRange.value);
    const render=() => {
      const icon=playButton.querySelector('.material-symbols-outlined');
      icon.textContent=playing ? 'pause' : 'play_arrow';
      playButton.setAttribute('aria-label',playing ? 'Pause audio sample' : 'Play audio sample');
      playButton.setAttribute('aria-pressed',String(playing));
    };
    const tick=now => {
      if (!playing) return;
      if (previous) {
        value+=(now-previous)*.012;
        if (value>=Number(audioRange.max)) value=0;
        audioRange.value=String(value);
      }
      previous=now;
      frame=requestAnimationFrame(tick);
    };
    playButton.addEventListener('click',() => {
      playing=!playing;
      previous=0;
      cancelAnimationFrame(frame);
      render();
      if (playing) frame=requestAnimationFrame(tick);
    });
    audioRange.addEventListener('input',() => { value=Number(audioRange.value); });
    document.addEventListener('visibilitychange',() => {
      if (!document.hidden || !playing) return;
      playing=false;
      cancelAnimationFrame(frame);
      render();
    });
    render();
  }

  const periodSelect=landing.querySelector('.v3-progress-panel select');
  if (periodSelect) {
    const score=landing.querySelector('.v3-score strong');
    const trend=landing.querySelector('.v3-score small');
    const bars=[...landing.querySelectorAll('.v3-skills progress')];
    const values=[...landing.querySelectorAll('.v3-skills b')];
    const datasets={
      'Last 4 weeks':{score:'64%',trend:'↑ 8%',skills:[68,72,58,60]},
      'Last 8 weeks':{score:'71%',trend:'↑ 15%',skills:[74,79,63,68]}
    };
    periodSelect.addEventListener('change',() => {
      const data=datasets[periodSelect.value];
      score.textContent=data.score;
      trend.textContent=data.trend;
      bars.forEach((bar,index) => { bar.value=data.skills[index]; });
      values.forEach((label,index) => { label.textContent=`${data.skills[index]}%`; });
    });
  }
})();
