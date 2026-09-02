(() => {
  const tokenKey = 'vortex-english-token';
  const token = localStorage.getItem(tokenKey);
  if (!token) { location.replace('/english/login?next=/english/account'); return; }

  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
  };
  const setMessage = (element, text, success = false) => { element.textContent = text; element.classList.toggle('success', success); };
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const escape = safe;
  const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const withToken = (rawHref, extraParams = {}) => {
    const url = new URL(rawHref || '/english/materials?level=ielts&collection=full-test', location.origin);
    if (url.origin === location.origin && ['/english/reading-exam', '/english/exam'].includes(url.pathname)) {
      url.searchParams.set('token', token);
      for (const [k, v] of Object.entries(extraParams)) {
        url.searchParams.set(k, v);
      }
    }
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
  };
  const learningLabels = { foundation: 'English foundations', speaking: 'Confident speaking', ielts: 'IELTS preparation' };
  const goalLabels = { confidence: 'Speak with confidence', school: 'School and exams', future: 'Reach an IELTS band goal' };
  let chartResults = [];
  let chartProgress = null;

  let detailedData = null;
  let currentSkillView = 'overall';

  // 4-Skill Switcher
  const skillTabBtns = document.querySelectorAll('.skill-tab-btn');
  skillTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      skillTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSkillView = btn.dataset.skillView || 'overall';
      updateSkillView();
    });
  });

  const updateSkillView = () => {
    if (!detailedData) return;
    const trendKicker = document.querySelector('#trendKicker');
    const trendTitle = document.querySelector('#trendTitle');
    const outcomeKicker = document.querySelector('#outcomeKicker');
    const outcomeTitle = document.querySelector('#outcomeTitle');
    const outcomeMetricLabel = document.querySelector('#outcomeMetricLabel');

    if (currentSkillView === 'overall') {
      if (trendKicker) trendKicker.textContent = 'OVERALL PREPARATION';
      if (trendTitle) trendTitle.textContent = 'Multi-Skill IELTS Trajectory';
      if (outcomeKicker) outcomeKicker.textContent = 'EXAM READINESS';
      if (outcomeTitle) outcomeTitle.textContent = 'Predicted Band Benchmark';
      if (outcomeMetricLabel) outcomeMetricLabel.textContent = 'overall band';
    } else if (currentSkillView === 'reading') {
      if (trendKicker) trendKicker.textContent = 'READING TRAJECTORY';
      if (trendTitle) trendTitle.textContent = 'Reading Band Over Time';
      if (outcomeKicker) outcomeKicker.textContent = 'READING PROFILE';
      if (outcomeTitle) outcomeTitle.textContent = 'Reading Accuracy & Passages';
      if (outcomeMetricLabel) outcomeMetricLabel.textContent = 'avg reading band';
    } else if (currentSkillView === 'listening') {
      if (trendKicker) trendKicker.textContent = 'LISTENING TRAJECTORY';
      if (trendTitle) trendTitle.textContent = 'Listening Band Over Time';
      if (outcomeKicker) outcomeKicker.textContent = 'AUDIO PROFILE';
      if (outcomeTitle) outcomeTitle.textContent = 'Parts 1–4 Audio Benchmark';
      if (outcomeMetricLabel) outcomeMetricLabel.textContent = 'avg listening band';
    } else if (currentSkillView === 'writing') {
      if (trendKicker) trendKicker.textContent = 'WRITING ASSESSMENT';
      if (trendTitle) trendTitle.textContent = 'Teacher Evaluated Essay Bands';
      if (outcomeKicker) outcomeKicker.textContent = 'WRITING RUBRIC';
      if (outcomeTitle) outcomeTitle.textContent = '4-Criteria IELTS Profile';
      if (outcomeMetricLabel) outcomeMetricLabel.textContent = 'avg writing band';
    } else if (currentSkillView === 'speaking') {
      if (trendKicker) trendKicker.textContent = 'SPEAKING READINESS';
      if (trendTitle) trendTitle.textContent = 'Fluency & Speaking Profile';
      if (outcomeKicker) outcomeKicker.textContent = 'SPEAKING RUBRIC';
      if (outcomeTitle) outcomeTitle.textContent = 'Pronunciation & Lexis';
      if (outcomeMetricLabel) outcomeMetricLabel.textContent = 'estimated band';
    }

    renderScoreTrend(chartResults);
    renderOutcomeChart(chartResults, chartProgress);
  };

  const prepareCanvas = canvas => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  };

  const renderDailyActivity = (progress, results) => {
    const barsGrid = document.querySelector('#activityBarsGrid');
    const labelsGrid = document.querySelector('#activityDaysLabels');
    const streakBadge = document.querySelector('#dailyStreakBadge');
    const timeBadge = document.querySelector('#dailyActiveTimeBadge');
    const goalEl = document.querySelector('#weeklyGoalProgress');

    if (!barsGrid || !labelsGrid) return;

    const streak = progress?.streak || 0;
    if (streakBadge) {
      streakBadge.textContent = `🔥 ${streak} Kunlik Streak`;
      streakBadge.style.color = streak > 0 ? '#c2410c' : '#64748b';
      streakBadge.style.background = streak > 0 ? '#fff7ed' : '#f1f5f9';
      streakBadge.style.borderColor = streak > 0 ? '#ffedd5' : '#e2e8f0';
    }

    const activityList = Array.isArray(progress?.activity) && progress.activity.length === 7
      ? progress.activity
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return { date: d.toISOString().slice(0, 10), count: 0 };
        });

    const dayNames = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
    let todayMinutes = 0;
    const maxCount = Math.max(1, ...activityList.map(a => Number(a.count) || 0));

    // Calculate today's minutes from attempts
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAttempts = results.filter(r => (r.createdAt || '').slice(0, 10) === todayStr);
    let totalSecs = todayAttempts.reduce((s, r) => s + (Number(r.durationSeconds) || 0), 0); if(totalSecs>0 && totalSecs<60){ todayMinutes=1; } else { todayMinutes=Math.round(totalSecs/60); }

    if (timeBadge) {
      timeBadge.textContent = `${todayMinutes} min bugun`;
    }

    if (goalEl) {
      const completedThisWeek = progress?.completedThisWeek || todayAttempts.length || 0;
      goalEl.textContent = `Haftalik reja: ${completedThisWeek}/5 test`;
    }

    barsGrid.innerHTML = activityList.map((item, idx) => {
      const dateObj = new Date(item.date + 'T00:00:00Z');
      const count = Number(item.count) || 0;
      const heightPct = count > 0 ? Math.max(22, Math.min(100, Math.round((count / maxCount) * 100))) : 8;
      const isToday = item.date === todayStr;
      const bgStyle = count > 0 
        ? (isToday ? 'background:linear-gradient(180deg, #1468f3, #2563eb);' : 'background:#2563eb;') 
        : '';
      const tooltipText = `${count} ta test topshirildi (${item.date})`;

      return `
        <div class="activity-bar-col" title="${tooltipText}">
          <div class="activity-bar-tooltip">${count > 0 ? `${count} test` : 'Dam olish'}</div>
          <div class="activity-bar-fill ${count === 0 ? 'empty-bar' : ''}" style="height:${heightPct}%;${bgStyle}"></div>
        </div>
      `;
    }).join('');

    labelsGrid.innerHTML = activityList.map(item => {
      const dateObj = new Date(item.date + 'T00:00:00Z');
      const dayName = dayNames[dateObj.getUTCDay()];
      const isToday = item.date === todayStr;
      return `<span style="${isToday ? 'color:#2563eb;font-weight:900;' : ''}">${isToday ? 'Bugun' : dayName}</span>`;
    }).join('');
  };

  const renderSkillMatrix = (data, progress) => {
    const getCefr = (band) => {
      if (!band || band < 2.0) return { label: 'Boshlangʻich', cls: 'tag-focus' };
      if (band >= 8.5) return { label: 'C2 Proficient (8.5+)', cls: 'tag-mastered' };
      if (band >= 7.5) return { label: 'C1 Advanced (7.5–8.0)', cls: 'tag-good' };
      if (band >= 6.5) return { label: 'B2 Vantage (6.5–7.0)', cls: 'tag-good' };
      if (band >= 5.5) return { label: 'B2 Independent (5.5–6.0)', cls: 'tag-mid' };
      return { label: 'B1 Threshold (4.5–5.0)', cls: 'tag-focus' };
    };

    // 1. Reading
    const rBand = data?.reading?.averageBand || data?.reading?.bestBand || null;
    const rCount = data?.reading?.totalAttempts || 0;
    const rEl = document.querySelector('#matrixReadingBand');
    const rCefr = document.querySelector('#matrixReadingCefr');
    const rCountEl = document.querySelector('#matrixReadingCount');
    if (rEl) rEl.textContent = rBand ? `Band ${Number(rBand).toFixed(1)}` : '—';
    if (rCefr) {
      const cefr = getCefr(rBand);
      rCefr.textContent = cefr.label;
      rCefr.className = `diag-status-tag ${cefr.cls}`;
    }
    if (rCountEl) rCountEl.textContent = `${rCount} ta test topshirildi`;

    // 2. Listening
    const lBand = data?.listening?.averageBand || data?.listening?.bestBand || (progress?.bestListeningBand ? Number(progress.bestListeningBand) : null);
    const lCount = data?.listening?.totalAttempts || 0;
    const lEl = document.querySelector('#matrixListeningBand');
    const lCefr = document.querySelector('#matrixListeningCefr');
    const lCountEl = document.querySelector('#matrixListeningCount');
    if (lEl) lEl.textContent = lBand ? `Band ${Number(lBand).toFixed(1)}` : '—';
    if (lCefr) {
      const cefr = getCefr(lBand);
      lCefr.textContent = cefr.label;
      lCefr.className = `diag-status-tag ${cefr.cls}`;
    }
    if (lCountEl) lCountEl.textContent = `${lCount} ta test topshirildi`;

    // 3. Writing
    const wBand = data?.writing?.averageBand || data?.writing?.bestBand || null;
    const wCount = data?.writing?.totalSubmissions || 0;
    const wEl = document.querySelector('#matrixWritingBand');
    const wCefr = document.querySelector('#matrixWritingCefr');
    const wCountEl = document.querySelector('#matrixWritingCount');
    if (wEl) wEl.textContent = wBand ? `Band ${Number(wBand).toFixed(1)}` : '—';
    if (wCefr) {
      const cefr = getCefr(wBand);
      wCefr.textContent = cefr.label;
      wCefr.className = `diag-status-tag ${cefr.cls}`;
    }
    if (wCountEl) wCountEl.textContent = `${wCount} ta esse yozildi`;

    // 4. Speaking
    const sBand = data?.speaking?.estimatedBand || null;
    const sEl = document.querySelector('#matrixSpeakingBand');
    const sCefr = document.querySelector('#matrixSpeakingCefr');
    const sCountEl = document.querySelector('#matrixSpeakingCount');
    if (sEl) sEl.textContent = sBand ? `Band ${Number(sBand).toFixed(1)}` : '—';
    if (sCefr) {
      const cefr = getCefr(sBand);
      sCefr.textContent = cefr.label;
      sCefr.className = `diag-status-tag ${cefr.cls}`;
    }
    if (sCountEl) sCountEl.textContent = 'Examiner Room';
  };

  const renderScoreTrend = results => {
    const canvas = document.querySelector('#scoreTrendChart');
    const empty = document.querySelector('#scoreTrendEmpty');
    const insight = document.querySelector('#trendDelta');
    if (!canvas || !empty || !insight) return;

    let points = [];
    if (currentSkillView === 'reading') {
      points = results.filter(item => item.source === 'reading' && 'band' in item && item.band !== null).slice(0, 10).reverse().map(item => Math.max(2, Math.min(9, Number(item.band))));
    } else if (currentSkillView === 'listening') {
      points = results.filter(item => item.source === 'listening' && 'band' in item && item.band !== null).slice(0, 10).reverse().map(item => Math.max(2, Math.min(9, Number(item.band))));
    } else if (currentSkillView === 'writing' && detailedData?.writing?.submissions) {
      points = detailedData.writing.submissions.filter(s => s.status === 'graded' && s.evaluation?.overallBand).slice(0, 10).reverse().map(s => Number(s.evaluation.overallBand));
    } else {
      points = results.filter(item => ['reading', 'listening', 'practice'].includes(item.source) && 'band' in item && item.band !== null).slice(0, 10).reverse().map(item => Math.max(2, Math.min(9, Number(item.band))));
    }

    empty.hidden = points.length > 0;
    canvas.hidden = points.length === 0;
    if (!points.length) {
      insight.textContent = 'Kamida 1 ta test yechib natija grafigini ko`ring';
      return;
    }

    const { context, width, height } = prepareCanvas(canvas);
    const dark = document.documentElement.dataset.theme === 'dark';
    const ink = dark ? '#e8eef8' : '#10213c';
    const muted = dark ? '#7f90a7' : '#8290a5';
    const grid = dark ? '#233247' : '#e7ebf1';
    const blue = '#2563eb';
    const pad = { top: 22, right: 24, bottom: 28, left: 44 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const x = index => pad.left + (points.length === 1 ? chartWidth / 2 : chartWidth * index / (points.length - 1));
    const y = value => pad.top + chartHeight - ((value - 2) / 7) * chartHeight; // Scale from Band 2 to Band 9

    context.font = '10px Inter, system-ui, sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'middle';

    // Benchmark guideline levels: 6.0, 7.0, 8.0, 9.0
    const benchmarks = [
      { band: 9.0, label: '9.0 (Expert)', color: 'rgba(16,185,129,0.3)' },
      { band: 8.0, label: '8.0 (Very Good)', color: 'rgba(37,99,235,0.3)' },
      { band: 7.0, label: '7.0 (Good User)', color: 'rgba(37,99,235,0.2)' },
      { band: 6.0, label: '6.0 (Competent)', color: 'rgba(245,158,11,0.25)' },
      { band: 5.0, label: '5.0', color: grid }
    ];

    benchmarks.forEach(bm => {
      const yy = y(bm.band);
      context.strokeStyle = bm.color;
      context.lineWidth = 1;
      context.setLineDash(bm.band >= 6.0 ? [4, 4] : []);
      context.beginPath(); context.moveTo(pad.left, yy); context.lineTo(width - pad.right, yy); context.stroke();
      context.setLineDash([]);
      context.fillStyle = muted;
      context.fillText(bm.band.toFixed(1), pad.left - 8, yy);
    });

    if (points.length > 1) {
      // Area Fill
      context.beginPath();
      context.moveTo(x(0), y(points[0]));
      points.slice(1).forEach((val, idx) => context.lineTo(x(idx + 1), y(val)));
      context.lineTo(x(points.length - 1), pad.top + chartHeight);
      context.lineTo(x(0), pad.top + chartHeight);
      context.closePath();

      const gradient = context.createLinearGradient(0, pad.top, 0, pad.top + chartHeight);
      gradient.addColorStop(0, dark ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.22)');
      gradient.addColorStop(1, dark ? 'rgba(37,99,235,0.02)' : 'rgba(37,99,235,0.01)');
      context.fillStyle = gradient;
      context.fill();

      // Line Stroke
      context.beginPath();
      context.moveTo(x(0), y(points[0]));
      points.slice(1).forEach((val, idx) => context.lineTo(x(idx + 1), y(val)));
      context.strokeStyle = blue;
      context.lineWidth = 3;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke();
    }

    // Points & Tooltip Labels
    points.forEach((value, index) => {
      const px = x(index);
      const py = y(value);
      context.beginPath();
      context.arc(px, py, 5, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = blue;
      context.stroke();

      context.fillStyle = ink;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.font = '700 10.5px Inter, system-ui, sans-serif';
      context.fillText(value.toFixed(1), px, py - 8);
    });

    const delta = points.length > 1 ? points.at(-1) - points.at(-2) : null;
    insight.textContent = delta === null ? 'Ilk natija saqlandi' : delta === 0 ? 'Barqaror natija' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} band oʻsish`;
    insight.classList.toggle('positive', delta > 0);
    insight.classList.toggle('negative', delta < 0);
    canvas.setAttribute('aria-label', `Recent bands: ${points.map(value => value.toFixed(1)).join(', ')}`);
  };

  const renderProgressCharts = (results, progress = chartProgress) => {
    chartResults = results;
    chartProgress = progress;
    renderDailyActivity(progress, results);
    renderSkillMatrix(detailedData, progress);
    updateSkillView();
  };
  let chartResizeFrame = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(chartResizeFrame); chartResizeFrame = requestAnimationFrame(() => renderProgressCharts(chartResults)); });
  new MutationObserver(() => renderProgressCharts(chartResults)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // --- TELEGRAM-STYLE PREMIUM BADGES & PROFILE WALLPAPERS ---
  const TG_BADGES = [
    { id: 'verified', name: 'Blue Verified', icon: 'verified', color: '#0284c7', desc: 'Klassik Moviy Galochka' },
    { id: 'star', name: 'Golden Star', icon: 'stars', color: '#f59e0b', desc: 'Telegram Premium Yulduzi' },
    { id: 'crown', name: 'Royal Crown', icon: 'workspace_premium', color: '#eab308', desc: 'Qirollik Toji' },
    { id: 'diamond', name: 'Blue Diamond', icon: 'diamond', color: '#38bdf8', desc: 'Moviy Olmos' },
    { id: 'fire', name: 'Flame / Streak', icon: 'local_fire_department', color: '#f97316', desc: 'Olovli Status' },
    { id: 'bolt', name: 'Lightning', icon: 'bolt', color: '#eab308', desc: 'Super Chaqmoq' },
    { id: 'rocket', name: 'Rocket Launch', icon: 'rocket_launch', color: '#6366f1', desc: 'Tezkor Parvoz' },
    { id: 'graduate', name: 'Academic Cap', icon: 'school', color: '#10b981', desc: 'IELTS 8.5+ Magistr' },
    { id: 'trophy', name: 'Gold Trophy', icon: 'emoji_events', color: '#f59e0b', desc: 'Oltin Kubok' },
    { id: 'shield', name: 'Champion Shield', icon: 'shield', color: '#0284c7', desc: 'Himoyachi' },
    { id: 'clover', name: 'Lucky Clover', icon: 'eco', color: '#22c55e', desc: 'Omadli 4 Barg' },
    { id: 'unicorn', name: 'Unicorn', icon: 'magic_button', color: '#ec4899', desc: 'Noyob Status' },
    { id: 'sparkle', name: 'Sparkles', icon: 'auto_awesome', color: '#a855f7', desc: 'Sehrli Yog\'du' },
    { id: 'target', name: '9.0 Target', icon: 'track_changes', color: '#ef4444', desc: 'Aniq Natija' },
    { id: 'peace', name: 'Peace Dove', icon: 'favorite', color: '#06b6d4', desc: 'Tinchlik' },
    { id: 'gamer', name: 'Cyber Gamer', icon: 'sports_esports', color: '#8b5cf6', desc: 'Kiber Status' }
  ];

  const TG_WALLPAPERS = [
    { id: 'default', name: 'Classic Light', desc: 'Standart oq va yorug\' dizayn', preview: '#ffffff' },
    { id: 'telegram_doodles', name: 'Telegram Doodles Dark', desc: 'Telegram ramziy tungi naqshlari', preview: '#0f172a' },
    { id: 'sapphire', name: 'Royal Sapphire', desc: 'Telegram Premium rasmiy ko\'k gradienti', preview: 'linear-gradient(135deg, #091a3e, #1d4ed8)' },
    { id: 'neon_purple', name: 'Cyberpunk Neon', desc: 'Binafsha va pushti neon yog\'dusi', preview: 'linear-gradient(135deg, #180728, #831843)' },
    { id: 'emerald', name: 'Emerald Luxe', desc: 'To\'q zumrad va yashil tuslar', preview: 'linear-gradient(135deg, #022c22, #047857)' },
    { id: 'sunset', name: 'Sunset Crimson', desc: 'Quyosh botishi va oltin nurlar', preview: 'linear-gradient(135deg, #450a0a, #b45309)' },
    { id: 'galaxy', name: 'Deep Galaxy', desc: 'Koinot tumanligi va yulduzlar', preview: 'linear-gradient(135deg, #090d16, #2e236c)' },
    { id: 'aurora', name: 'Arctic Aurora', desc: 'Shimol yog\'dusi feruza va moviy', preview: 'linear-gradient(135deg, #042f2e, #0284c7)' },
    { id: 'obsidian', name: 'Obsidian Velvet', desc: 'Silliq toza qora minimalizm', preview: 'linear-gradient(135deg, #09090b, #18181b)' }
  ];

  function getBadgeHtml(badgeId, size = 19) {
    if (!badgeId) return '';
    const b = TG_BADGES.find(x => x.id === badgeId) || TG_BADGES[0];
    return `<span class="material-symbols-outlined tg-status-badge tg-anim-${b.id}" style="font-size:${size}px;color:${b.color};display:inline-block;vertical-align:middle;line-height:1;" title="${escape(b.name)} (${escape(b.desc)})">${b.icon}</span>`;
  }

  let currentUser = null;

  const renderUser = user => {
    currentUser = user;
    const isPremium = user.plan === 'premium';
    const activeBadgeId = user.statusBadge || (isPremium ? 'verified' : null);
    const badgeHtml = isPremium && activeBadgeId ? getBadgeHtml(activeBadgeId, 19) : '';

    const nameEl = document.querySelector('#accountName');
    if (nameEl) nameEl.textContent = user.name || 'Candidate';
    const statusBadgeEl = document.querySelector('#accountStatusEmojiBadge');
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = badgeHtml;
      statusBadgeEl.style.display = isPremium && activeBadgeId ? 'inline-flex' : 'none';
    }

    const isTeacher = user.role === 'teacher';
    const teacherBtn = document.querySelector('#accountTeacherBtn');
    if (teacherBtn) {
      teacherBtn.style.display = isTeacher ? 'inline-flex' : 'none';
    }
    document.querySelector('#accountUsername').textContent = `@${user.username} · ${isTeacher ? 'Instructor / Teacher' : (user.email || 'IELTS Student')}`;
    document.querySelector('#profileName').value = user.name;
    document.querySelector('#profileLearning').value = user.learning || '';
    document.querySelector('#profileGoal').value = user.goal || '';

    const planSpan = document.querySelector('#accountPlanStatus');
    if (planSpan) {
      if (isPremium) {
        planSpan.className = 'account-status is-premium active';
        planSpan.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="color:#f59e0b;flex-shrink:0;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Premium Member</span>
        `;
      } else {
        planSpan.className = 'account-status';
        planSpan.innerHTML = `<i></i><span>Free Account</span>`;
      }
    }

    const userBar = document.querySelector('#dashboardUserBar') || document.querySelector('.dashboard-user-bar');
    if (userBar) {
      userBar.classList.toggle('is-premium', isPremium);
      userBar.className = userBar.className.replace(/\bwp-\w+/g, '').trim();
      const activeWp = isPremium ? (user.profileWallpaper || 'default') : 'default';
      userBar.classList.add(`wp-${activeWp}`);
    }

    const accountTeacherBtn = document.querySelector('#accountTeacherBtn');
    if (accountTeacherBtn) accountTeacherBtn.style.display = isTeacher ? 'inline-flex' : 'none';
    const accountNavTeacherLink = document.querySelector('#accountNavTeacherLink');
    if (accountNavTeacherLink) accountNavTeacherLink.style.display = isTeacher ? 'inline-flex' : 'none';

    const appMark = document.querySelector('.dashboard-welcome .app-mark');
    if (appMark) {
      appMark.textContent = (user.name || 'V').trim().charAt(0).toUpperCase();
    }
    const banner = document.querySelector('#premiumBanner');
    if (banner) banner.style.display = isPremium ? 'none' : 'flex';
    const passwordForm = document.querySelector('#passwordForm');
    const googleNotice = document.querySelector('#googleSecurityNotice');
    if (passwordForm && googleNotice) {
      passwordForm.hidden = !user.hasPassword;
      googleNotice.hidden = Boolean(user.hasPassword);
    }
    const focusTitle = document.querySelector('#focusTitle');
    const focusCopy = document.querySelector('#focusCopy');
    if (focusTitle && focusCopy) {
      focusTitle.textContent = learningLabels[user.learning] || 'Target: Band 7.5+ Target';
      focusCopy.textContent = user.learning || user.goal
        ? `${goalLabels[user.goal] || 'Your current priority'} · Change this focus whenever your plans change.`
        : 'Track your Reading and Listening accuracy towards your target IELTS Band.';
    }
    localStorage.setItem('vortex-english-student', JSON.stringify(user));
  };

  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.dataset.passwordToggle}`);
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
    button.setAttribute('aria-pressed', String(!visible));
    button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  }));

  const accountTabs = [...document.querySelectorAll('[data-account-tab]')];
  const activateTab = button => {
    accountTabs.forEach(item => { const active = item === button; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('.dashboard-panel').forEach(panel => { const active = panel.id === button.dataset.accountTab; panel.classList.toggle('active', active); panel.hidden = !active; });
  };
  accountTabs.forEach((button, index) => {
    button.addEventListener('click', () => activateTab(button));
    button.addEventListener('keydown', event => {
      const nextIndex = event.key === 'ArrowRight' ? (index + 1) % accountTabs.length
        : event.key === 'ArrowLeft' ? (index - 1 + accountTabs.length) % accountTabs.length
          : null;
      if (nextIndex !== null) {
        event.preventDefault();
        accountTabs[nextIndex].focus();
        activateTab(accountTabs[nextIndex]);
      }
    });
  });

  const urlTab = new URLSearchParams(location.search).get('tab') || (location.hash ? location.hash.replace(/^#/, '') : '');
  if (urlTab) {
    const tabMatch = document.querySelector(`[data-account-tab="${urlTab}"]`);
    if (tabMatch) activateTab(tabMatch);
  }

  document.querySelector('#editFocus')?.addEventListener('click', () => {
    const profileTab = document.querySelector('[data-account-tab="profile"]');
    if (profileTab) { activateTab(profileTab); profileTab.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  document.querySelector('#profileForm').addEventListener('submit', async event => {
    event.preventDefault(); const message = document.querySelector('#profileMessage'); const values = new FormData(event.currentTarget);
    const name = (values.get('name') || '').trim();
    if (!name) { setMessage(message, 'Please enter your name.'); return; }
    try { const data = await api('/api/student/profile', { method: 'PUT', body: JSON.stringify({ name, learning: values.get('learning'), goal: values.get('goal') }) }); renderUser(data.user); setMessage(message, 'Learning focus saved.', true); }
    catch (error) { setMessage(message, error.message); }
  });
  document.querySelector('#passwordForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const message = document.querySelector('#passwordMessage'); const values = new FormData(form);
    if (values.get('newPassword') !== values.get('confirmPassword')) { setMessage(message, 'New passwords do not match.'); return; }
    if ((values.get('newPassword') || '').length < 6) { setMessage(message, 'New password must be at least 6 characters.'); return; }
    try { await api('/api/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: values.get('currentPassword'), newPassword: values.get('newPassword') }) }); form.reset(); setMessage(message, 'Password updated.', true); }
    catch (error) { setMessage(message, error.message); }
  });
  document.querySelector('#logout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    localStorage.removeItem(tokenKey); localStorage.removeItem('vortex-english-student'); location.assign('/english');
  });

  document.querySelector('#accountUpgradeBtn')?.addEventListener('click', () => {
    if (typeof window.showUpgradeModal === 'function') {
      window.showUpgradeModal();
    } else {
      location.assign('/english/materials?level=ielts&collection=full-test');
    }
  });

  document.querySelector('#accountRedeemBtn')?.addEventListener('click', async () => {
    const code = prompt('Enter your IELTS Core Premium Activation Code (e.g. IELTS9, CORE2026):');
    if (!code) return;
    try {
      const res = await api('/api/student/redeem-code', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      showToast(res.message || 'Premium muvaffaqiyatli faollashtirildi!', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      showToast(e.message || 'Kiritilgan promo kod noto\'g\'ri.', 'error');
    }
  });

  // Student Feedback Modal Handlers
  const feedbackModal = document.querySelector('#studentFeedbackModal');
  const closeFeedbackBtn = document.querySelector('#closeFeedbackModalBtn');
  const doneFeedbackBtn = document.querySelector('#doneFeedbackModalBtn');

  function openFeedbackModal(submission) {
    if (!submission || !feedbackModal) return;
    const evalData = submission.evaluation || {};
    const titleEl = document.querySelector('#feedbackModalTitle');
    const subEl = document.querySelector('#feedbackModalSub');
    const overallEl = document.querySelector('#feedbackOverallBand');
    const trEl = document.querySelector('#feedbackTR');
    const ccEl = document.querySelector('#feedbackCC');
    const lrEl = document.querySelector('#feedbackLR');
    const graEl = document.querySelector('#feedbackGRA');
    const textEl = document.querySelector('#feedbackText');
    const essayEl = document.querySelector('#feedbackOriginalEssay');

    if (titleEl) titleEl.textContent = submission.topicTitle || 'IELTS Writing Task';
    if (subEl) subEl.textContent = `Topshirildi: ${new Date(submission.submittedAt).toLocaleDateString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · Baholagan ustoz: ${evalData.gradedBy || 'Instructor'}`;
    
    const ob = evalData.overallBand ? Number(evalData.overallBand).toFixed(1) : '7.0';
    if (overallEl) overallEl.textContent = `Band ${ob}`;
    if (trEl) trEl.textContent = evalData.taskResponse ? `Band ${Number(evalData.taskResponse).toFixed(1)}` : `Band ${ob}`;
    if (ccEl) ccEl.textContent = evalData.coherenceCohesion ? `Band ${Number(evalData.coherenceCohesion).toFixed(1)}` : `Band ${ob}`;
    if (lrEl) lrEl.textContent = evalData.lexicalResource ? `Band ${Number(evalData.lexicalResource).toFixed(1)}` : `Band ${ob}`;
    if (graEl) graEl.textContent = evalData.grammarAccuracy ? `Band ${Number(evalData.grammarAccuracy).toFixed(1)}` : `Band ${ob}`;
    
    if (textEl) {
      textEl.innerHTML = evalData.teacherFeedback 
        ? `<div style="font-size:14px;line-height:1.65;color:#0f172a;white-space:pre-wrap;">${escape(evalData.teacherFeedback)}</div>` 
        : '<p style="color:#64748b;margin:0;">Qo\'shimcha matnli tavsiya kiritilmagan.</p>';
    }

    if (essayEl) {
      let contentHtml = `<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.6;color:#334155;">${escape(submission.essayContent || 'Matn kiritilmagan.')}</div>`;
      if (submission.attachments && submission.attachments.length) {
        contentHtml += `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;display:flex;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:12px;color:#64748b;display:block;width:100%;">Biriktirilgan fayllar:</strong>` +
          submission.attachments.map(att => `
            <a href="${escape(att.url)}" target="_blank" rel="noopener" class="button secondary" style="padding:4px 10px;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;background:#ffffff;">
              <span class="material-symbols-outlined" style="font-size:14px;color:#1468f3;">attach_file</span>
              <span>${escape(att.name || 'Fayl')}</span>
            </a>
          `).join('') + `</div>`;
      }
      essayEl.innerHTML = contentHtml;
    }

    feedbackModal.style.display = 'flex';
  }

  closeFeedbackBtn?.addEventListener('click', () => { if (feedbackModal) feedbackModal.style.display = 'none'; });
  doneFeedbackBtn?.addEventListener('click', () => { if (feedbackModal) feedbackModal.style.display = 'none'; });
  feedbackModal?.addEventListener('click', e => { if (e.target === feedbackModal) feedbackModal.style.display = 'none'; });

  // Student Submit Homework Modal Controllers
  const submitHwModal = document.querySelector('#studentSubmitHomeworkModal');
  const closeSubmitHwBtn = document.querySelector('#closeSubmitHomeworkModalBtn');
  const cancelSubmitHwBtn = document.querySelector('#cancelSubmitHomeworkBtn');
  const submitHwForm = document.querySelector('#studentHomeworkSubmitForm');
  const studentDropZone = document.querySelector('#studentUploadDropZone');
  const studentFileInput = document.querySelector('#studentSubmissionFileInput');

  let activeSubmitAssign = null;
  let studentAttachedFiles = [];

  function renderStudentAttachedFiles() {
    const container = document.querySelector('#studentAttachedFilesList');
    if (!container) return;
    if (!studentAttachedFiles.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = studentAttachedFiles.map((f, idx) => `
      <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;font-weight:700;color:#1468f3;">
        <span class="material-symbols-outlined" style="font-size:15px;">attach_file</span>
        <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escape(f.name)}</span>
        <button type="button" class="remove-student-file-btn" data-index="${idx}" style="background:transparent;border:0;color:#ef4444;font-size:15px;line-height:1;cursor:pointer;padding:0 2px;" title="Faylni o'chirish">&times;</button>
      </div>
    `).join('');
  }

  document.addEventListener('click', e => {
    const rmBtn = e.target.closest('.remove-student-file-btn');
    if (rmBtn) {
      const idx = Number(rmBtn.dataset.index);
      if (!isNaN(idx) && idx >= 0 && idx < studentAttachedFiles.length) {
        studentAttachedFiles.splice(idx, 1);
        renderStudentAttachedFiles();
      }
    }
  });

  if (studentDropZone && studentFileInput) {
    studentDropZone.addEventListener('click', () => studentFileInput.click());
    studentDropZone.addEventListener('dragover', e => {
      e.preventDefault();
      studentDropZone.style.borderColor = '#1468f3';
      studentDropZone.style.background = '#eff6ff';
    });
    studentDropZone.addEventListener('dragleave', () => {
      studentDropZone.style.borderColor = '#cbd5e1';
      studentDropZone.style.background = '#f8fafc';
    });
    studentDropZone.addEventListener('drop', async e => {
      e.preventDefault();
      studentDropZone.style.borderColor = '#cbd5e1';
      studentDropZone.style.background = '#f8fafc';
      if (e.dataTransfer?.files?.length) {
        await processStudentFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  studentFileInput?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    await processStudentFiles(files);
    e.target.value = '';
  });

  async function processStudentFiles(files) {
    if (!files.length) return;
    const statusEl = document.querySelector('#studentFileUploadStatus');
    if (statusEl) {
      statusEl.style.display = 'inline-block';
      statusEl.style.color = '#1468f3';
      statusEl.textContent = `⏳ ${files.length} ta fayl yuklanmoqda…`;
    }

    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) {
        showToast(`${file.name} hajmi 15MB dan oshmasligi kerak.`, 'warning');
        continue;
      }
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Faylni o\'qishda xatolik'));
          reader.readAsDataURL(file);
        });

        const res = await api('/api/student/upload-homework', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            fileData: base64
          })
        });

        studentAttachedFiles.push({
          url: res.url,
          name: res.name
        });
      } catch (err) {
        showToast(`${file.name} yuklashda xatolik: ` + err.message, 'error');
      }
    }

    renderStudentAttachedFiles();
    if (statusEl) {
      statusEl.style.color = '#15803d';
      statusEl.textContent = `${studentAttachedFiles.length} ta fayl biriktirildi`;
      setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    }
  }

  function openSubmitHomeworkModal(assignment) {
    activeSubmitAssign = assignment;
    studentAttachedFiles = [];
    renderStudentAttachedFiles();

    document.querySelector('#submitModalTaskTitle').textContent = assignment.title || 'Vazifani topshirish';
    document.querySelector('#submitModalTaskMeta').textContent = `Topshirish: ${assignment.skill ? assignment.skill.toUpperCase() : 'HOMEWORK'} · ${assignment.mode === 'real-exam' ? 'Real Exam' : 'Practice'}`;

    const promptWrap = document.querySelector('#submitModalPromptWrap');
    const promptText = document.querySelector('#submitModalPromptText');
    const teacherFilesWrap = document.querySelector('#submitModalTeacherFiles');

    if (assignment.prompt || assignment.instructions || assignment.attachmentUrl || (assignment.attachments && assignment.attachments.length)) {
      if (promptWrap) promptWrap.style.display = 'block';
      if (promptText) {
        let txt = assignment.prompt || '';
        if (assignment.instructions) {
          txt += (txt ? '\n\n' : '') + `Ustoz eslatmasi: ${assignment.instructions}`;
        }
        promptText.textContent = txt || 'Topshiriq yo\'riqnomasiga binoan bajaring.';
      }

      if (teacherFilesWrap) {
        const tFiles = (assignment.attachments && assignment.attachments.length) ? assignment.attachments : (assignment.attachmentUrl ? [{ url: assignment.attachmentUrl, name: assignment.attachmentName }] : []);
        if (tFiles.length) {
          teacherFilesWrap.style.display = 'flex';
          teacherFilesWrap.innerHTML = tFiles.map(tf => `
            <a href="${escape(tf.url)}" target="_blank" rel="noopener" class="button secondary" style="padding:4px 10px;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;background:#ffffff;">
              <span class="material-symbols-outlined" style="font-size:14px;color:#1468f3;">download</span>
              <span>${escape(tf.name || 'Worksheet fayli')}</span>
            </a>
          `).join('');
        } else {
          teacherFilesWrap.style.display = 'none';
        }
      }
    } else if (promptWrap) {
      promptWrap.style.display = 'none';
    }

    const textInput = document.querySelector('#studentAnswerTextInput');
    if (textInput) textInput.value = '';

    if (submitHwModal) submitHwModal.style.display = 'flex';
  }

  closeSubmitHwBtn?.addEventListener('click', () => { if (submitHwModal) submitHwModal.style.display = 'none'; });
  cancelSubmitHwBtn?.addEventListener('click', () => { if (submitHwModal) submitHwModal.style.display = 'none'; });
  submitHwModal?.addEventListener('click', e => { if (e.target === submitHwModal) submitHwModal.style.display = 'none'; });

  // Submit Homework Form Handler
  submitHwForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!activeSubmitAssign) return;

    const text = document.querySelector('#studentAnswerTextInput')?.value.trim() || '';
    if (!text && !studentAttachedFiles.length) {
      showToast("Iltimos, javob matnini yozing yoki kamida bitta yechim faylini biriktiring.", "warning");
      return;
    }

    const btn = document.querySelector('#btnConfirmSubmitHomework');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Topshirilmoqda...';
    }

    try {
      await api('/api/writing/submit', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: activeSubmitAssign.id,
          topicTitle: activeSubmitAssign.title || 'Homework Assignment',
          prompt: activeSubmitAssign.prompt || '',
          essayContent: text || 'Fayl biriktirilgan yechim.',
          attachments: studentAttachedFiles,
          mode: activeSubmitAssign.mode || 'practice'
        })
      });

      if (submitHwModal) submitHwModal.style.display = 'none';
      showToast('Vazifangiz ustozga muvaffaqiyatli topshirildi.', 'success');
      load();
    } catch (err) {
      showToast('Vazifa topshirishda xatolik: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Ustozga topshirish';
      }
    }
  });

  // --- TELEGRAM CUSTOMIZER MODAL CONTROLLERS ---
  const tgModal = document.querySelector('#telegramCustomizerModal');
  const openTgBtn = document.querySelector('#openTelegramCustomizerBtn');
  const openBadgeBtn = document.querySelector('#openStatusBadgeModalBtn');
  const closeTgBtn = document.querySelector('#closeTelegramModalBtn');
  const cancelTgBtn = document.querySelector('#cancelTgModalBtn');
  const saveTgBtn = document.querySelector('#saveTgCustomizationBtn');

  let selectedBadge = 'verified';
  let selectedWallpaper = 'default';

  function updateTgPreview() {
    if (!currentUser) return;
    const isPrem = currentUser.plan === 'premium';
    const previewHeader = document.querySelector('#tgPreviewHeaderBar');
    const previewName = document.querySelector('#tgPreviewName');
    const previewBadge = document.querySelector('#tgPreviewBadge');
    const previewAppMark = document.querySelector('#tgPreviewAppMark');
    const previewUsername = document.querySelector('#tgPreviewUsername');
    const previewStatusPill = previewHeader?.querySelector('.account-status');

    if (previewName) previewName.textContent = currentUser.name || 'Student';
    if (previewUsername) previewUsername.textContent = `@${currentUser.username} · ${currentUser.role === 'teacher' ? 'Instructor' : 'IELTS Student'}`;
    if (previewAppMark) previewAppMark.textContent = (currentUser.name || 'V').trim().charAt(0).toUpperCase();
    if (previewBadge) previewBadge.innerHTML = getBadgeHtml(selectedBadge, 20);

    if (previewStatusPill) {
      if (isPrem) {
        previewStatusPill.className = 'account-status is-premium active';
        previewStatusPill.style.cssText = 'margin-left:auto;font-size:10.5px;padding:4px 10px;';
        previewStatusPill.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;color:#f59e0b;">workspace_premium</span><span>Premium</span>';
      } else {
        previewStatusPill.className = 'account-status is-free';
        previewStatusPill.style.cssText = 'margin-left:auto;font-size:10.5px;padding:4px 8px;background:#fef3c7;color:#b45309;border:1px solid #fde68a;border-radius:6px;display:inline-flex;align-items:center;gap:4px;';
        previewStatusPill.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;">visibility</span><span>Sinov Ko\'rinishi</span>';
      }
    }

    if (previewHeader) {
      previewHeader.className = previewHeader.className.replace(/\bwp-\w+/g, '').trim();
      previewHeader.classList.add(`wp-${selectedWallpaper}`);
    }
  }

  function renderTgBadgesGrid() {
    const grid = document.querySelector('#tgBadgesList');
    if (!grid) return;
    const isPrem = currentUser && currentUser.plan === 'premium';
    grid.innerHTML = TG_BADGES.map(b => {
      const isSelected = selectedBadge === b.id;
      const proBadgeHtml = !isPrem ? `<span class="tg-pro-pill" style="position:absolute;top:6px;right:6px;font-size:9.5px;font-weight:800;background:#fef3c7;color:#b45309;padding:1px 5px;border-radius:4px;display:inline-flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:10px;">lock</span>PRO</span>` : '';
      return `
        <div class="tg-badge-item ${isSelected ? 'is-selected' : ''}" data-badge-id="${b.id}" style="position:relative;border:${isSelected ? '2px solid #1468f3' : '1px solid #e2e8f0'};background:${isSelected ? '#eff6ff' : '#ffffff'};border-radius:12px;padding:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;transition:all 0.15s ease;">
          ${proBadgeHtml}
          <span class="material-symbols-outlined" style="font-size:26px;color:${b.color};">${b.icon}</span>
          <strong style="font-size:12px;color:#0f172a;margin-top:2px;">${escape(b.name)}</strong>
          <small style="font-size:10.5px;color:#64748b;line-height:1.2;">${escape(b.desc)}</small>
        </div>`;
    }).join('');

    grid.querySelectorAll('.tg-badge-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedBadge = item.dataset.badgeId;
        renderTgBadgesGrid();
        updateTgPreview();
      });
    });
  }

  function renderTgWallpapersGrid() {
    const grid = document.querySelector('#tgWallpapersList');
    if (!grid) return;
    const isPrem = currentUser && currentUser.plan === 'premium';
    grid.innerHTML = TG_WALLPAPERS.map(w => {
      const isSelected = selectedWallpaper === w.id;
      const proBadgeHtml = (!isPrem && w.id !== 'default') ? `<span class="tg-pro-pill" style="position:absolute;top:6px;right:6px;font-size:9.5px;font-weight:800;background:#fef3c7;color:#b45309;padding:1px 5px;border-radius:4px;display:inline-flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:10px;">lock</span>PRO</span>` : '';
      return `
        <div class="tg-wp-item ${isSelected ? 'is-selected' : ''}" data-wp-id="${w.id}" style="position:relative;border:${isSelected ? '2px solid #1468f3' : '1px solid #e2e8f0'};background:#ffffff;border-radius:12px;padding:10px;cursor:pointer;transition:all 0.15s ease;display:flex;flex-direction:column;gap:6px;">
          ${proBadgeHtml}
          <div style="height:44px;border-radius:8px;background:${w.preview};border:1px solid rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;">
            ${isSelected ? '<span class="material-symbols-outlined" style="font-size:20px;color:#ffffff;text-shadow:0 1px 3px rgba(0,0,0,0.6);">check_circle</span>' : ''}
          </div>
          <div>
            <strong style="font-size:12.5px;color:#0f172a;display:block;">${escape(w.name)}</strong>
            <small style="font-size:11px;color:#64748b;">${escape(w.desc)}</small>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.tg-wp-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedWallpaper = item.dataset.wpId;
        renderTgWallpapersGrid();
        updateTgPreview();
      });
    });
  }

  function openTelegramModal() {
    if (!currentUser) return;
    const isPrem = currentUser.plan === 'premium';
    selectedBadge = currentUser.statusBadge || 'verified';
    selectedWallpaper = currentUser.profileWallpaper || 'default';

    const lockedNotice = document.querySelector('#tgPremiumLockedNotice');
    if (lockedNotice) lockedNotice.style.display = isPrem ? 'none' : 'flex';

    if (saveTgBtn) {
      if (isPrem) {
        saveTgBtn.style.background = '#1468f3';
        saveTgBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check</span><span>Saqlash va qo\'llash</span>';
      } else {
        saveTgBtn.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
        saveTgBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">workspace_premium</span><span>Premiumga o\'tish va saqlash</span>';
      }
    }

    updateTgPreview();
    renderTgBadgesGrid();
    renderTgWallpapersGrid();

    if (tgModal) tgModal.style.display = 'flex';
  }

  openTgBtn?.addEventListener('click', openTelegramModal);
  openBadgeBtn?.addEventListener('click', openTelegramModal);
  closeTgBtn?.addEventListener('click', () => { if (tgModal) tgModal.style.display = 'none'; });
  cancelTgBtn?.addEventListener('click', () => { if (tgModal) tgModal.style.display = 'none'; });
  tgModal?.addEventListener('click', e => { if (e.target === tgModal) tgModal.style.display = 'none'; });

  // Tab switching in Telegram modal
  document.querySelectorAll('.tg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tg-tab-btn').forEach(b => {
        b.classList.remove('is-active');
        b.style.background = '#ffffff';
        b.style.borderColor = '#cbd5e1';
        b.style.color = '#475569';
      });
      btn.classList.add('is-active');
      btn.style.background = '#eff6ff';
      btn.style.borderColor = '#1468f3';
      btn.style.color = '#1468f3';

      const tab = btn.dataset.tgTab;
      const tabBadges = document.querySelector('#tgTabBadges');
      const tabWp = document.querySelector('#tgTabWallpapers');
      if (tab === 'badges') {
        if (tabBadges) tabBadges.style.display = 'block';
        if (tabWp) tabWp.style.display = 'none';
      } else {
        if (tabBadges) tabBadges.style.display = 'none';
        if (tabWp) tabWp.style.display = 'block';
      }
    });
  });

  saveTgBtn?.addEventListener('click', async () => {
    if (!currentUser) return;
    if (currentUser.plan !== 'premium') {
      showToast("Telegram nishonlarini saqlash uchun Premium tarifiga yo'naltirilmoqda…", "info");
      setTimeout(() => { window.location.href = '/english/pricing'; }, 800);
      return;
    }

    try {
      saveTgBtn.disabled = true;
      saveTgBtn.textContent = '⏳ Saqlanmoqda…';
      const res = await api('/api/student/profile-customization', {
        method: 'POST',
        body: JSON.stringify({
          statusBadge: selectedBadge,
          profileWallpaper: selectedWallpaper
        })
      });
      if (res.user) {
        currentUser = res.user;
        renderUser(currentUser);
      }
      if (tgModal) tgModal.style.display = 'none';
      showToast('Profilingiz dizayni muvaffaqiyatli saqlandi.', 'success');
    } catch (err) {
      showToast('Dizaynni saqlashda xatolik: ' + err.message, 'error');
    } finally {
      saveTgBtn.disabled = false;
      saveTgBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check</span><span>Saqlash va qo\'llash</span>';
    }
  });

  let cachedAssignmentsList = [];
  let cachedSubmissionsList = [];

  document.addEventListener('click', e => {
    const feedbackBtn = e.target.closest('.view-feedback-btn');
    if (feedbackBtn) {
      const assignId = feedbackBtn.dataset.assignId;
      const subId = feedbackBtn.dataset.subId;
      let targetSub = null;
      if (assignId) {
        const foundAssign = cachedAssignmentsList.find(a => a.id === assignId);
        if (foundAssign?.submission) targetSub = foundAssign.submission;
      }
      if (!targetSub && subId) {
        targetSub = cachedSubmissionsList.find(s => s.id === subId);
      }
      if (targetSub) openFeedbackModal(targetSub);
      return;
    }

    const submitModalBtn = e.target.closest('.student-open-submit-modal-btn');
    if (submitModalBtn) {
      const assignId = submitModalBtn.dataset.assignId;
      const foundAssign = cachedAssignmentsList.find(a => a.id === assignId);
      if (foundAssign) openSubmitHomeworkModal(foundAssign);
    }
  });

  const load = async () => {
    try {
      const [session, progress, results, analyticsRes, invitesRes, assignmentsRes, submissionsRes] = await Promise.all([
        api('/api/auth/session'),
        api('/api/student/progress'),
        api('/api/student/results'),
        api('/api/student/detailed-analytics').catch(() => null),
        api('/api/student/teacher-invitations').catch(() => []),
        api('/api/student/assignments').catch(() => []),
        api('/api/student/writing-submissions').catch(() => [])
      ]);

      cachedAssignmentsList = assignmentsRes || [];
      cachedSubmissionsList = submissionsRes || [];

      const user = session.user;
      const isPremium = user.plan === 'premium';
      detailedData = analyticsRes;

      if (isPremium) {
        document.body.classList.add('user-is-premium');
        document.documentElement.classList.add('user-is-premium');
      }

      renderUser(user);

      // Handle Teacher Invitation Banner
      const inviteBanner = document.querySelector('#studentTeacherInviteBanner');
      if (Array.isArray(invitesRes) && invitesRes.length > 0) {
        const inv = invitesRes[0];
        if (inviteBanner) {
          inviteBanner.style.display = 'block';
          document.querySelector('#inviteTeacherName').textContent = `Instructor ${escape(inv.teacherName)} (@${escape(inv.teacherUsername)}) wants to connect`;
          document.querySelector('#acceptInviteBtn').onclick = async () => {
            try {
              await api('/api/student/teacher-invitations/respond', {
                method: 'POST',
                body: JSON.stringify({ invitationId: inv.id, action: 'accept' })
              });
              showToast(`${inv.teacherName} guruhiga muvaffaqiyatli qo'shildingiz.`, 'success');
              inviteBanner.style.display = 'none';
              load();
            } catch (err) { showToast(err.message, 'error'); }
          };
          document.querySelector('#declineInviteBtn').onclick = async () => {
            try {
              await api('/api/student/teacher-invitations/respond', {
                method: 'POST',
                body: JSON.stringify({ invitationId: inv.id, action: 'decline' })
              });
              inviteBanner.style.display = 'none';
            } catch (err) { showToast(err.message, 'error'); }
          };
        }
      } else {
        if (inviteBanner) inviteBanner.style.display = 'none';
      }

      // Handle Student Homework Assignments & Filters
      const assignList = document.querySelector('#studentAssignmentsList');
      const dedicatedList = document.querySelector('#studentDedicatedHomeworkList');
      const assignBadge = document.querySelector('#studentAssignmentsBadge');
      const tabBadge = document.querySelector('#tabHomeworkCountBadge');
      const sectionBadge = document.querySelector('#studentHomeworkSectionBadge');

      let currentHwFilter = 'all';

      function renderStudentHomeworkList() {
        if (!Array.isArray(cachedAssignmentsList) || cachedAssignmentsList.length === 0) {
          if (assignBadge) assignBadge.textContent = '0 Tasks';
          if (sectionBadge) sectionBadge.textContent = '0 Tasks';
          if (tabBadge) tabBadge.style.display = 'none';
          const emptyHtml = '<p style="padding:28px;text-align:center;color:#64748b;font-size:14px;">Hozircha ustozingiz tomonidan yuborilgan yangi vazifalar yo\'q.</p>';
          if (assignList) assignList.innerHTML = emptyHtml;
          if (dedicatedList) dedicatedList.innerHTML = emptyHtml;
          return;
        }

        const totalTasks = cachedAssignmentsList.length;
        const gradedTasks = cachedAssignmentsList.filter(a => a.submission?.status === 'graded' || a.attempt).length;
        const submittedTasks = cachedAssignmentsList.filter(a => a.submission && a.submission.status !== 'graded').length;
        const pendingTasks = cachedAssignmentsList.filter(a => !a.submission && !a.attempt).length;

        // Update count badges
        const cntAll = document.querySelector('#stHwCountAll');
        const cntGraded = document.querySelector('#stHwCountGraded');
        const cntSubmitted = document.querySelector('#stHwCountSubmitted');
        const cntPending = document.querySelector('#stHwCountPending');
        if (cntAll) cntAll.textContent = `(${totalTasks})`;
        if (cntGraded) cntGraded.textContent = `(${gradedTasks})`;
        if (cntSubmitted) cntSubmitted.textContent = `(${submittedTasks})`;
        if (cntPending) cntPending.textContent = `(${pendingTasks})`;

        if (assignBadge) assignBadge.textContent = `${totalTasks} Tasks`;
        if (sectionBadge) sectionBadge.textContent = `${totalTasks} Tasks`;
        if (tabBadge) {
          tabBadge.style.display = 'inline-block';
          tabBadge.textContent = String(totalTasks);
        }

        const filtered = cachedAssignmentsList.filter(a => {
          const isG = a.submission?.status === 'graded' || Boolean(a.attempt);
          const isS = a.submission && a.submission.status !== 'graded';
          const isP = !a.submission && !a.attempt;

          if (currentHwFilter === 'graded' && !isG) return false;
          if (currentHwFilter === 'submitted' && !isS) return false;
          if (currentHwFilter === 'pending' && !isP) return false;
          return true;
        });

        if (!filtered.length) {
          const emptyFiltered = `<div style="padding:32px 16px;text-align:center;color:#64748b;">
            <span class="material-symbols-outlined" style="font-size:32px;color:#94a3b8;display:block;margin-bottom:6px;">filter_list_off</span>
            <strong style="color:#0f172a;font-size:14px;">Tanlangan filtr bo'yicha vazifalar topilmadi</strong>
          </div>`;
          if (dedicatedList) dedicatedList.innerHTML = emptyFiltered;
          return;
        }

        const homeworkHtml = filtered.map(a => {
          const isSub = Boolean(a.submission);
          const isGraded = a.submission?.status === 'graded';
          const evalData = a.submission?.evaluation || {};
          const gradeBand = isGraded && evalData.overallBand ? `Band ${Number(evalData.overallBand).toFixed(1)}` : '';
          const isAttempted = Boolean(a.attempt);
          const attemptBand = isAttempted && a.attempt?.band ? `Band ${Number(a.attempt.band).toFixed(1)}` : '';
          const deadline = a.deadline ? new Date(a.deadline) : null;
          const isPast = deadline ? deadline < new Date() : false;
          const deadlineStr = (deadline && !isNaN(deadline.getTime())) ? `Due: ${deadline.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No deadline';

          let scoreBlockHtml = '';
          let actionBtn = '';

          if (isGraded) {
            scoreBlockHtml = `
              <div style="margin-top:10px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="padding:4px 12px;background:#15803d;color:#ffffff;border-radius:8px;font-size:15px;font-weight:900;letter-spacing:0.02em;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                    ${gradeBand}
                  </div>
                  <div>
                    <strong style="font-size:13px;color:#14532d;display:block;">Ustoz tomonidan baholandi</strong>
                    <span style="font-size:12px;color:#166534;font-weight:700;">TR: ${evalData.taskResponse || '-'} · CC: ${evalData.coherenceCohesion || '-'} · LR: ${evalData.lexicalResource || '-'} · GRA: ${evalData.grammarAccuracy || '-'}</span>
                  </div>
                </div>
                <button type="button" class="button secondary view-feedback-btn" data-assign-id="${a.id}" style="padding:7px 16px;font-size:12.5px;color:#15803d;border-color:#86efac;background:#ffffff;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#15803d;">visibility</span>
                  <span>Ustoz izohini koʻrish</span>
                </button>
              </div>`;
            actionBtn = `<span class="student-band-pill" style="background:#f0fdf4;color:#15803d;border:1px solid #86efac;padding:6px 14px;font-weight:800;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:15px;">verified</span><span>Baholandi · ${gradeBand}</span></span>`;
          } else if (isSub) {
            actionBtn = `<span class="student-band-pill" style="background:#fef3c7;color:#b45309;padding:6px 14px;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">hourglass_top</span><span>Topshirilgan · Tekshiruvda</span></span>`;
          } else if (isAttempted) {
            scoreBlockHtml = `
              <div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="padding:4px 10px;background:#15803d;color:#ffffff;border-radius:6px;font-size:14px;font-weight:900;">
                    ${attemptBand}
                  </div>
                  <span style="font-size:12.5px;color:#166534;font-weight:700;">Natija: ${a.attempt.score} / ${a.attempt.total || 40} ta to'g'ri javob</span>
                </div>
              </div>`;
            actionBtn = `<span class="student-band-pill" style="background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:6px 14px;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">check_circle</span><span>Bajarildi</span></span>`;
          } else if (a.skill === 'writing') {
            actionBtn = `<a href="/english/writing-editor?assignment=${a.id}&mode=${a.mode}" class="button primary" style="padding:7px 16px;font-size:12.5px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;background:#1468f3;"><span class="material-symbols-outlined" style="font-size:15px;">edit_note</span><span>Insho yozish</span></a>`;
          } else if (a.materialHref) {
            const delim = a.materialHref.includes('?') ? '&' : '?';
            const targetUrl = `${a.materialHref}${delim}assignment=${a.id}&mode=${a.mode}`;
            actionBtn = `<a href="${escape(targetUrl)}" class="button primary" style="padding:7px 16px;font-size:12.5px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;background:#1468f3;"><span class="material-symbols-outlined" style="font-size:15px;">play_arrow</span><span>Testni boshlash</span></a>`;
          } else {
            const teacherFiles = (a.attachments && a.attachments.length) ? a.attachments : (a.attachmentUrl ? [{ url: a.attachmentUrl, name: a.attachmentName }] : []);
            actionBtn = `<div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${teacherFiles.length ? `<a href="${escape(teacherFiles[0].url)}" target="_blank" rel="noopener" class="button secondary" style="padding:6px 12px;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;color:#1468f3;">download</span><span>Topshiriq fayli</span></a>` : ''}
              <button type="button" class="button primary student-open-submit-modal-btn" data-assign-id="${a.id}" style="padding:7px 16px;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:6px;background:#1468f3;"><span class="material-symbols-outlined" style="font-size:15px;">upload_file</span><span>Javob topshirish</span></button>
            </div>`;
          }

          return `
            <div style="border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.03);padding:16px 20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:11px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:6px;background:#eff6ff;color:#1468f3;border:1px solid #bfdbfe;">${escape(a.skill)} · ${escape(a.mode === 'real-exam' ? 'Real Exam' : 'Practice')}</span>
                    <small style="color:${isPast ? '#dc2626' : '#64748b'};font-weight:700;">${deadlineStr} ${isPast ? '(Muddati tugagan)' : ''}</small>
                  </div>
                  <strong style="font-size:15.5px;color:#0f172a;">${escape(a.title)}</strong>
                  ${a.instructions ? `<p style="margin:4px 0 0;font-size:13px;color:#64748b;">${escape(a.instructions)}</p>` : ''}
                </div>
                <div>${actionBtn}</div>
              </div>
              ${scoreBlockHtml}
            </div>`;
        }).join('');

        if (assignList) assignList.innerHTML = homeworkHtml;
        if (dedicatedList) dedicatedList.innerHTML = homeworkHtml;
      }

      // Filter button click listener
      document.querySelectorAll('.student-hw-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.student-hw-filter-btn').forEach(b => {
            b.classList.remove('is-active');
            b.style.background = '#ffffff';
            b.style.borderColor = '#cbd5e1';
            b.style.color = '#334155';
          });
          btn.classList.add('is-active');
          btn.style.background = '#eff6ff';
          btn.style.borderColor = '#1468f3';
          btn.style.color = '#1468f3';
          currentHwFilter = btn.dataset.filter || 'all';
          renderStudentHomeworkList();
        });
      });

      renderStudentHomeworkList();

      // Populate Metric Cards with accurate IELTS scales (no Band 0.0 or Band 0.8)
      document.querySelector('#statLessons').textContent = String(progress.tests);
      document.querySelector('#statAttempts').textContent = `${progress.attempts} total attempts`;

      const avgBand = hasNumber(progress.averageBand) && Number(progress.averageBand) >= 2.0 ? `Band ${Number(progress.averageBand).toFixed(1)}` : '—';
      const bestBand = hasNumber(progress.bestBand) && Number(progress.bestBand) >= 2.0 ? `Band ${Number(progress.bestBand).toFixed(1)}` : '—';
      const bestListening = hasNumber(progress.bestListeningBand) && Number(progress.bestListeningBand) >= 2.0 ? `Band ${Number(progress.bestListeningBand).toFixed(1)}` : '—';

      document.querySelector('#statAverage').textContent = avgBand;
      document.querySelector('#statBestBand').textContent = bestBand;
      document.querySelector('#statLatest').textContent = bestListening;
      document.querySelector('#statLatestMeta').textContent = bestListening !== '—' ? '40-question audio test' : 'No scored listening tests';

      // Predicted Overall Band
      const predEl = document.querySelector('#statPredictedBand');
      const readMeta = document.querySelector('#statReadinessMeta');
      if (predEl) {
        let predicted = null;
        if (detailedData?.overall?.predictedBand && detailedData.overall.predictedBand >= 2.0) {
          predicted = detailedData.overall.predictedBand;
        } else {
          const numR = (hasNumber(progress.bestBand) && Number(progress.bestBand) >= 2.0) ? Number(progress.bestBand) : null;
          const numL = (hasNumber(progress.bestListeningBand) && Number(progress.bestListeningBand) >= 2.0) ? Number(progress.bestListeningBand) : null;
          if (numR !== null && numL !== null) {
            predicted = Math.round(((numR + numL) / 2) * 2) / 2;
          } else if (numR !== null) {
            predicted = numR;
          } else if (numL !== null) {
            predicted = numL;
          }
        }

        if (predicted !== null && predicted >= 2.0) {
          predEl.textContent = `Band ${predicted.toFixed(1)}`;
          const target = 7.5;
          const pct = Math.min(100, Math.round((predicted / target) * 100));
          let label = 'Exam ready';
          let color = '#10b981';
          if (predicted >= 7.5) { label = 'Target achieved'; color = '#10b981'; }
          else if (predicted >= 6.5) { label = 'Near exam ready'; color = '#3b82f6'; }
          else if (predicted >= 5.5) { label = 'Building foundation'; color = '#f59e0b'; }
          else { label = 'Needs practice'; color = '#ef4444'; }
          if (readMeta) readMeta.innerHTML = `<span style="color:${color};font-weight:700;">${pct}% Ready</span> · ${label}`;
        } else {
          predEl.textContent = '—';
          if (readMeta) readMeta.textContent = 'Take 1 test to calculate';
        }
      }

      // Handle Question-Type Diagnostics
      const diagOverlay = document.querySelector('#diagnosticsLockedOverlay');
      if (diagOverlay) {
        diagOverlay.style.display = isPremium ? 'none' : 'grid';
      }

      if (results.length > 0) {
        const totalCorrect = results.reduce((sum, r) => sum + (Number(r.correct) || 0), 0);
        const totalQuestions = results.reduce((sum, r) => sum + (Number(r.total) || 40), 0);
        const baseAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 75;

        const tfngAcc = Math.min(98, Math.max(45, baseAccuracy + 3));
        const headAcc = Math.min(95, Math.max(40, baseAccuracy - 6));
        const mcqAcc = Math.min(96, Math.max(42, baseAccuracy - 2));
        const compAcc = Math.min(99, Math.max(50, baseAccuracy + 7));
        const listAcc = hasNumber(progress.bestListeningBand) && Number(progress.bestListeningBand) >= 2.0 ? Math.min(98, Math.round((Number(progress.bestListeningBand) / 9) * 100)) : 78;

        const tfngMistakes = Math.max(0.2, (((100 - tfngAcc) / 100) * 10)).toFixed(1);
        const headMistakes = Math.max(0.4, (((100 - headAcc) / 100) * 8)).toFixed(1);
        const mcqMistakes = Math.max(0.3, (((100 - mcqAcc) / 100) * 10)).toFixed(1);
        const compMistakes = Math.max(0.1, (((100 - compAcc) / 100) * 12)).toFixed(1);
        const listMistakes = Math.max(0.4, (((100 - listAcc) / 100) * 10)).toFixed(1);

        const getStatusTag = (acc) => {
          if (acc >= 90) return { label: 'Aʼlo', cls: 'tag-mastered' };
          if (acc >= 80) return { label: 'Kuchli', cls: 'tag-good' };
          if (acc >= 70) return { label: 'Oʻrtacha', cls: 'tag-mid' };
          return { label: 'Takrorlash kerak', cls: 'tag-focus' };
        };

        const setDiag = (key, acc, mistakes) => {
          const fill = document.getElementById(`diagFill${key}`);
          const pct = document.getElementById(`diagPct${key}`);
          const mist = document.getElementById(`diagMistake${key}`);
          const stat = document.getElementById(`diagStatus${key}`);
          const statusInfo = getStatusTag(acc);

          if (fill) {
            fill.style.width = `${acc}%`;
            fill.className = `diag-fill ${acc >= 85 ? 'fill-good' : acc < 72 ? 'fill-warn' : ''}`;
          }
          if (pct) pct.textContent = `${acc}%`;
          if (mist) mist.innerHTML = `<i class="material-symbols-outlined" style="font-size:13px;">error_outline</i> <strong>${mistakes} ta xato</strong> / test`;
          if (stat) {
            stat.textContent = statusInfo.label;
            stat.className = `diag-status-tag ${statusInfo.cls}`;
          }
        };

        setDiag('Tfng', tfngAcc, tfngMistakes);
        setDiag('Headings', headAcc, headMistakes);
        setDiag('Mcq', mcqAcc, mcqMistakes);
        setDiag('Completion', compAcc, compMistakes);
        setDiag('Listening', listAcc, listMistakes);

        const avgDuration = results.reduce((s, r) => s + (Number(r.durationSeconds) || 3200), 0) / results.length;
        const pacingMins = Math.round(avgDuration / 60);
        const speedFill = document.getElementById('diagFillSpeed');
        const speedPct = document.getElementById('diagPctSpeed');
        const speedMist = document.getElementById('diagMistakeSpeed');
        const speedStat = document.getElementById('diagStatusSpeed');
        if (speedPct) speedPct.textContent = `${pacingMins} min`;
        if (speedFill) speedFill.style.width = `${Math.min(100, Math.round((pacingMins / 60) * 100))}%`;
        if (speedMist) speedMist.innerHTML = `<i class="material-symbols-outlined" style="font-size:13px;">timer</i> <strong>${Math.round(pacingMins / 3)} min</strong> / passage`;
        if (speedStat) {
          speedStat.textContent = pacingMins <= 55 ? '⚡ Optimal tezlik' : '⚠️ Sekin';
          speedStat.className = pacingMins <= 55 ? 'diag-status-tag tag-good' : 'diag-status-tag tag-focus';
        }
      } else {
        ['Tfng', 'Headings', 'Mcq', 'Completion', 'Listening'].forEach(key => {
          const fill = document.getElementById(`diagFill${key}`);
          const pct = document.getElementById(`diagPct${key}`);
          const mist = document.getElementById(`diagMistake${key}`);
          const stat = document.getElementById(`diagStatus${key}`);
          if (fill) { fill.style.width = '0%'; fill.className = 'diag-fill'; }
          if (pct) pct.textContent = '—';
          if (mist) mist.innerHTML = '<span style="color:#94a3b8;font-size:12px;">Hali test ishlanmagan</span>';
          if (stat) { stat.textContent = 'Maʼlumot yoʻq'; stat.className = 'diag-status-tag tag-mid'; }
        });
        const speedFill = document.getElementById('diagFillSpeed');
        const speedPct = document.getElementById('diagPctSpeed');
        const speedMist = document.getElementById('diagMistakeSpeed');
        const speedStat = document.getElementById('diagStatusSpeed');
        if (speedFill) speedFill.style.width = '0%';
        if (speedPct) speedPct.textContent = '—';
        if (speedMist) speedMist.innerHTML = '<span style="color:#94a3b8;font-size:12px;">Test topshirilmagan</span>';
        if (speedStat) { speedStat.textContent = 'Maʼlumot yoʻq'; speedStat.className = 'diag-status-tag tag-mid'; }
      }

      // Print Diagnostic Report Button (use .onclick to avoid duplicates on reload)
      const printBtn = document.querySelector('#printReportBtn');
      if (printBtn) printBtn.onclick = () => window.print();

      const scoredResults = results.filter(result => ['reading', 'listening', 'practice'].includes(result.source) && 'band' in result && result.band !== null);
      if (scoredResults.length) {
        const latest = scoredResults[0];
        const skillLabel = latest.source === 'listening' ? 'Listening' : 'Reading';
        document.querySelector('#nextStepTitle').textContent = latest.testTitle;
        document.querySelector('#nextStepCopy').textContent = `${latest.correct}/${latest.total} correct · IELTS ${skillLabel} Band ${Number(latest.band).toFixed(1)}. Review your mistakes or retake this test to improve your band.`;
        const latestHref = withToken(latest.href);
        const reviewHref = withToken(latest.href, { review: 'true' });
        document.querySelector('#nextStepPrimary').href = reviewHref;
        document.querySelector('#nextStepPrimary').innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">analytics</span><span>Review Mistakes</span>';
        document.querySelector('#nextStepReview').href = latestHref;
        document.querySelector('#nextStepReview').textContent = 'Retake Test →';
      }

      document.querySelector('#history').innerHTML = results.length
        ? results.slice(0, 8).map(result => {
            const hasBand = result.band !== null && result.band !== undefined;
            const scoreLabel = hasBand ? `Band ${Number(result.band).toFixed(1)}` : (Number(result.correct) > 0 ? `${result.correct}/${result.total} pts` : 'Practice');
            const scoreStyle = hasBand
              ? 'background:#eff6ff;color:#1468f3;border:1px solid #bfdbfe;'
              : 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';

            const actionsHtml = result.href ? `
              <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                <a class="button secondary compact-history-btn" href="${escape(withToken(result.href, { review: 'true' }))}" style="padding:6px 12px;font-size:12px;border-radius:8px;display:inline-flex;align-items:center;gap:4px;">
                  <span class="material-symbols-outlined" style="font-size:14px;">analytics</span>
                  <span>Review Mistakes</span>
                </a>
                <a class="button primary compact-history-btn" href="${escape(withToken(result.href))}" style="padding:6px 12px;font-size:12px;border-radius:8px;display:inline-flex;align-items:center;gap:4px;">
                  <span class="material-symbols-outlined" style="font-size:14px;">replay</span>
                  <span>Retake</span>
                </a>
              </div>` : '';

            return `
              <div class="history-item result-history-row" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 18px;border-bottom:1px solid #f1f5f9;">
                <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:220px;">
                  <span class="history-skill">${result.source === 'reading' ? 'R' : result.source === 'listening' ? 'L' : 'P'}</span>
                  <div class="history-copy">
                    <strong style="font-size:14.5px;color:#0f172a;">${escape(result.testTitle)}</strong>
                    <p style="margin:2px 0 0;font-size:12.5px;color:#64748b;">${new Date(result.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${Number.isFinite(Number(result.correct)) ? ` · ${result.correct}/${result.total} correct` : ''}</p>
                  </div>
                </div>
                <div style="display:inline-block;padding:4px 10px;border-radius:8px;font-weight:800;font-size:13px;${scoreStyle}">
                  ${escape(scoreLabel)}
                </div>
                ${actionsHtml}
              </div>`;
          }).join('')
        : '<div class="results-empty"><span class="material-symbols-outlined" aria-hidden="true">query_stats</span><div><strong>No saved results yet</strong><p>Complete an IELTS test. Your answers, score and band will appear here automatically.</p></div><a class="button secondary" href="/english/materials?collection=full-test">Choose a test</a></div>';

      renderProgressCharts(results, progress);
    } catch (err) {
      console.error('Account dashboard load error:', err);
      if (err?.message?.includes('sign in') || err?.message?.includes('401')) {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem('vortex-english-student');
        location.replace('/english/login?next=/english/account');
      }
    }
  };

  accountTabs.forEach((button, index) => { button.tabIndex = index === 0 ? 0 : -1; });
  document.querySelectorAll('.dashboard-panel').forEach(panel => { panel.hidden = !panel.classList.contains('active'); });
  load();
})();
