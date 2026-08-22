(() => {
  const list = document.querySelector('#resourceList');
  const count = document.querySelector('#resourceCount');
  const search = document.querySelector('#materialSearch');
  const searchClear = document.querySelector('#clearSearchInput');
  const clear = document.querySelector('#clearMaterialFilters');
  const activeTags = document.querySelector('#activeFilterTags');
  const params = new URLSearchParams(location.search);

  const allowedSkills = ['listening', 'speaking', 'reading', 'writing'];
  const allowedCollections = ['full-test', 'practice', 'article', 'writing-sample', 'speaking', 'speaking-sample', 'speaking-question', 'book'];

  let level = ['beginner', 'elementary', 'ielts'].includes(params.get('level')) ? params.get('level') : 'all';
  let skill = allowedSkills.includes(params.get('skill')) ? params.get('skill') : 'all';
  let rawCollection = params.get('collection');
  let collection = allowedCollections.includes(rawCollection) ? rawCollection : 'all';
  let query = (params.get('q') || '').trim();
  let resources = [];
  const token = localStorage.getItem('vortex-english-token') || '';

  if (search && query) {
    search.value = query;
    if (searchClear) searchClear.hidden = false;
  }

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

  const labels = {
    beginner: 'Beginner (A1)',
    elementary: 'Elementary (A2)',
    ielts: 'IELTS',
    listening: 'Listening',
    speaking: 'Speaking',
    reading: 'Reading',
    writing: 'Writing',
    video: 'Video',
    pdf: 'PDF',
    audio: 'Audio',
    article: 'Article',
    exam: 'Exam practice',
    book: 'Course Book',
    sample: 'Model sample',
    free: 'Free',
    premium: 'Premium',
    'full-test': 'Full Mock Tests',
    practice: 'Passage Drills',
    'writing-sample': 'Writing Models',
    'speaking-sample': 'Speaking Samples',
    'speaking-question': 'Speaking Questions',
    speaking: 'Speaking'
  };

  const inferCollection = item => {
    if (item.collection) return item.collection;
    if (item.materialKind === 'full-test') return 'full-test';
    if (item.materialKind === 'skill-practice' || item.materialKind === 'practice') return 'practice';
    if (item.type === 'article') return 'article';
    if (item.type === 'book') return 'book';
    if (item.skill === 'writing') return 'writing-sample';
    if (item.skill === 'speaking') return 'speaking-question';
    return 'practice';
  };

  const syncUrl = () => {
    const url = new URL(location.href);
    level === 'all' ? url.searchParams.delete('level') : url.searchParams.set('level', level);
    skill === 'all' ? url.searchParams.delete('skill') : url.searchParams.set('skill', skill);
    collection === 'all' ? url.searchParams.delete('collection') : url.searchParams.set('collection', collection);
    query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
    history.replaceState({}, '', url);
  };

  const renderActiveTags = () => {
    if (!activeTags) return;
    const tags = [];
    if (collection !== 'all') tags.push({ label: labels[collection] || collection, type: 'collection' });
    if (level !== 'all') tags.push({ label: labels[level] || level, type: 'level' });
    if (skill !== 'all') tags.push({ label: labels[skill] || skill, type: 'skill' });
    if (query) tags.push({ label: `"${query}"`, type: 'query' });

    if (!tags.length) {
      activeTags.innerHTML = '';
      return;
    }
    activeTags.innerHTML = tags.map(t => `<span class="active-filter-tag">${escape(t.label)}<button type="button" data-remove-tag="${escape(t.type)}" aria-label="Remove ${escape(t.label)} filter">×</button></span>`).join('');
  };

  const render = () => {
    document.querySelectorAll('[data-level]').forEach(button => {
      const active = button.dataset.level === level;
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-material-skill]').forEach(button => {
      const active = button.dataset.materialSkill === skill;
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-collection]').forEach(button => {
      const active = button.dataset.collection === collection;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-selected', String(active));
    });

    const normalized = query.trim().toLocaleLowerCase('en');
    const english = resources.filter(item => {
      const g = item.grade || item.level || 'ielts';
      return ['beginner', 'elementary', 'ielts'].includes(g);
    });

    const visible = english.filter(item => {
      const itemCollection = inferCollection(item);
      const matchesLevel = level === 'all' || item.grade === level;
      const matchesSkill = skill === 'all' || item.skill === skill;
      const matchesCollection = collection === 'all'
        || (collection === 'speaking' && (itemCollection === 'speaking-sample' || itemCollection === 'speaking-question' || item.skill === 'speaking'))
        || itemCollection === collection;
      const itemSearchText = `${item.title || ''} ${item.description || ''} ${item.sourceTitle || ''} ${item.formatLabel || ''} ${item.skill || ''}`.toLocaleLowerCase('en');
      const matchesQuery = !normalized || itemSearchText.includes(normalized);
      return matchesLevel && matchesSkill && matchesCollection && matchesQuery;
    });

    const isFiltered = level !== 'all' || skill !== 'all' || collection !== 'all' || Boolean(normalized);
    if (clear) clear.hidden = !isFiltered;
    renderActiveTags();

    // Header & Ribbon Handling
    const topRibbonEl = document.querySelector('.vx-top-notification-banner');
    const isUserPremium = document.body.classList.contains('user-is-premium') || document.documentElement.classList.contains('user-is-premium');
    if (topRibbonEl && isUserPremium) {
      topRibbonEl.style.display = 'none';
    }

    const freeVisible = visible.filter(item => item.access === 'free').length;
    const totalLabel = `${visible.length} ${visible.length === 1 ? 'item' : 'materials'}`;
    const freeLabel = visible.length > 0 && freeVisible > 0 ? ` · ${freeVisible} free` : '';
    if (count) count.textContent = `${totalLabel}${freeLabel}`;



    if (!visible.length) {
      const selectedLabel = collection === 'all' ? 'materials' : (labels[collection] || collection).toLowerCase();
      list.innerHTML = `
        <div class="empty library-empty" role="region" aria-label="No results">
          <div class="library-empty-box">
            <span class="material-symbols-outlined library-empty-icon" aria-hidden="true">search_off</span>
            <h2>${isFiltered ? `No ${escape(selectedLabel)} matching filters.` : 'Your library is ready.'}</h2>
            <p>${isFiltered ? 'Try clearing or changing your search terms, skill, or level filter to explore more items.' : 'Materials will appear here as you select a category.'}</p>
            ${isFiltered ? '<button class="button primary" type="button" data-empty-clear>Reset all filters</button>' : ''}
          </div>
        </div>`;
      list.querySelector('[data-empty-clear]')?.addEventListener('click', reset);
      return;
    }

    list.innerHTML = visible.map(item => {
      const itemCollection = inferCollection(item);
      const isFree = item.access === 'free';
      const format = item.formatLabel || labels[itemCollection] || labels[item.type] || item.type || 'Practice';

      // 1. Sleek Skill & Category Tag
      let skillIcon = 'menu_book';
      let skillName = 'Reading';
      if (item.skill === 'listening') { skillIcon = 'headphones'; skillName = 'Listening'; }
      else if (item.skill === 'writing') { skillIcon = 'history_edu'; skillName = 'Writing'; }
      else if (item.skill === 'speaking') { skillIcon = 'record_voice_over'; skillName = 'Speaking'; }
      else if (itemCollection === 'article') { skillIcon = 'auto_stories'; skillName = 'Article'; }
      else if (itemCollection === 'book') { skillIcon = 'library_books'; skillName = 'Course Book'; }

      const typeTag = `
        <div class="resource-skill-tag skill-${escape(item.skill || 'general')}">
          <span class="material-symbols-outlined">${skillIcon}</span>
          <span>${escape(skillName)} · ${escape(format)}</span>
        </div>`;

      // 2. Access / Completion Status Pill
      let statusBadge = '';
      if (item.completed) {
        let scoreLabel = 'Completed';
        const numBand = Number(item.bestBand);
        const numPoints = Number(item.bestPoints);
        if (hasNumber(item.bestBand) && numBand >= 2.0) {
          scoreLabel = `Band ${numBand.toFixed(1)}`;
        } else if (hasNumber(item.bestPoints) && numPoints > 0) {
          scoreLabel = `${numPoints} pts`;
        }
        statusBadge = `<span class="resource-status-badge completed" title="Attempt saved to your dashboard"><span class="material-symbols-outlined">check_circle</span> ${escape(scoreLabel)}</span>`;
      } else if (isFree) {
        statusBadge = `<span class="resource-status-badge free">Free Practice</span>`;
      } else {
        statusBadge = `<span class="resource-status-badge premium">Premium</span>`;
      }

      // 3. Decision-Useful Exam Facts
      const facts = [];
      if (item.grade === 'ielts' && item.type === 'exam' && item.questionCount) {
        if (item.skill === 'listening') {
          facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">headphones</i>${escape(item.partCount || 4)} parts</span>`);
          facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">quiz</i>${escape(item.questionCount)} questions</span>`);
          facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">timer</i>30 min</span>`);
        } else {
          const passageText = item.passageCount ? `${escape(item.passageCount)} ${Number(item.passageCount) === 1 ? 'passage' : 'passages'}` : (itemCollection === 'full-test' ? '3 passages' : '1 passage');
          facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">menu_book</i>${passageText}</span>`);
          facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">quiz</i>${escape(item.questionCount)} questions</span>`);
          if (itemCollection === 'full-test') facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">timer</i>60 min</span>`);
        }
      } else if (itemCollection === 'article') {
        facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">auto_stories</i>${item.interactive ? 'Interactive reader' : 'PDF edition'}</span>`);
        if (Array.isArray(item.parts) && item.parts.length > 1) {
          facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">format_list_numbered</i>${item.parts.length} sections</span>`);
        }
      } else if (itemCollection === 'writing-sample') {
        facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">history_edu</i>Band 9 model answer</span>`);
      } else if (itemCollection === 'book') {
        facts.push(`<span><i class="material-symbols-outlined" aria-hidden="true">library_books</i>Course book</span>`);
      }

      const factsHtml = facts.length ? `<div class="resource-facts">${facts.join('')}</div>` : '';

      // Links & actions
      const rawHref = item.href || item.url || `/english/lesson?id=${encodeURIComponent(item.id)}`;
      const hrefUrl = new URL(rawHref, location.origin);
      if (token && hrefUrl.origin === location.origin && ['/english/reading-exam', '/english/exam', '/english/listening-exam'].includes(hrefUrl.pathname)) {
        hrefUrl.searchParams.set('token', token);
      }
      const href = hrefUrl.origin === location.origin ? `${hrefUrl.pathname}${hrefUrl.search}${hrefUrl.hash}` : hrefUrl.href;

      const examUrl = new URL(rawHref, location.origin);
      if (token && examUrl.origin === location.origin && ['/english/reading-exam', '/english/exam', '/english/listening-exam'].includes(examUrl.pathname)) {
        examUrl.searchParams.set('token', token);
      }
      examUrl.searchParams.set('mode', 'exam');
      const examHref = examUrl.origin === location.origin ? `${examUrl.pathname}${examUrl.search}${examUrl.hash}` : examUrl.href;

      const practiceUrl = new URL(rawHref, location.origin);
      if (token && practiceUrl.origin === location.origin && ['/english/reading-exam', '/english/exam', '/english/listening-exam'].includes(practiceUrl.pathname)) {
        practiceUrl.searchParams.set('token', token);
      }
      practiceUrl.searchParams.set('mode', 'practice');
      const practiceHref = practiceUrl.origin === location.origin ? `${practiceUrl.pathname}${practiceUrl.search}${practiceUrl.hash}` : practiceUrl.href;

      const reviewUrl = new URL(rawHref, location.origin);
      if (token && reviewUrl.origin === location.origin && ['/english/reading-exam', '/english/exam', '/english/listening-exam'].includes(reviewUrl.pathname)) {
        reviewUrl.searchParams.set('token', token);
      }
      reviewUrl.searchParams.set('review', 'true');
      const reviewHref = reviewUrl.origin === location.origin ? `${reviewUrl.pathname}${reviewUrl.search}${reviewUrl.hash}` : reviewUrl.href;

      // Card Action Buttons
      let actionButtons = '';

      if (item.completed) {
        if (itemCollection === 'full-test' || item.type === 'exam') {
          actionButtons = `
            <div class="card-action-group">
              <a class="vx-card-btn vx-btn-primary" href="${escape(href)}" title="Retake this test in Real Exam or Practice mode">
                <span class="material-symbols-outlined">refresh</span>
                <span>Retake Test</span>
              </a>
              <a class="vx-card-btn vx-btn-review" href="${escape(reviewHref)}" title="Review your previous answers and mistake explanations">
                <span class="material-symbols-outlined">analytics</span>
                <span>Review Mistakes</span>
              </a>
            </div>`;
        } else if (itemCollection === 'practice') {
          actionButtons = `
            <div class="card-action-group">
              <a class="vx-card-btn vx-btn-primary" href="${escape(href)}">
                <span class="material-symbols-outlined">refresh</span>
                <span>Retake Practice</span>
              </a>
              <a class="vx-card-btn vx-btn-review" href="${escape(reviewHref)}">
                <span class="material-symbols-outlined">analytics</span>
                <span>Review</span>
              </a>
            </div>`;
        } else {
          actionButtons = `<a class="vx-card-btn vx-btn-primary full-width" href="${escape(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}><span>Open Material</span><span aria-hidden="true">→</span></a>`;
        }
      } else if (item.locked) {
        actionButtons = `
          <div class="card-action-group">
            <button class="vx-card-btn vx-btn-unlock full-width" type="button" data-locked-btn onclick="window.showUpgradeModal()" aria-label="Unlock ${escape(item.title)} with Premium">
              <span class="material-symbols-outlined">lock</span>
              <span>Unlock Full Test (30 000 UZS / oy)</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>`;
      } else if (item.skill === 'writing' && (itemCollection === 'practice' || item.type === 'exam')) {
        actionButtons = `
          <div class="card-action-group">
            <a class="vx-card-btn vx-btn-primary full-width vx-btn-start" href="${escape(href)}" title="Write your essay in Real Exam or Practice Mode">
              <span class="material-symbols-outlined">edit_note</span>
              <span>Write Essay (CDI)</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>`;
      } else if (itemCollection === 'full-test' || item.type === 'exam') {
        actionButtons = `
          <div class="card-action-group">
            <a class="vx-card-btn vx-btn-primary full-width vx-btn-start" href="${escape(href)}" title="Choose Real Exam or Practice Mode to start">
              <span class="material-symbols-outlined">play_arrow</span>
              <span>Start Test</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>`;
      } else {
        const actionLabel = itemCollection === 'article' ? 'Read article'
          : itemCollection === 'book' ? 'Open book'
            : itemCollection.includes('sample') ? 'View model answer'
              : itemCollection === 'speaking-question' ? 'Open questions' : 'Start practice';

        actionButtons = `
          <a class="vx-card-btn vx-btn-primary full-width" href="${escape(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}>
            <span>${actionLabel}</span>
            <span aria-hidden="true">→</span>
          </a>`;
      }

      const description = item.description ? `<p class="resource-desc">${escape(item.description)}</p>` : '';

      return `
        <article class="resource${item.completed ? ' is-completed' : ''}${item.locked ? ' is-locked' : ''}">
          <div class="resource-card-top">
            ${typeTag}
            ${statusBadge}
          </div>
          <h2 class="resource-title">${escape(item.title)}</h2>
          ${description}
          ${factsHtml}
          ${actionButtons}
        </article>`;
    }).join('');
  };

  function reset() {
    level = 'all';
    skill = 'all';
    collection = 'all';
    query = '';
    if (search) search.value = '';
    if (searchClear) searchClear.hidden = true;
    syncUrl();
    render();
  }

  // Event Listeners
  document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
    level = button.dataset.level;
    syncUrl();
    render();
  }));

  document.querySelectorAll('[data-material-skill]').forEach(button => button.addEventListener('click', () => {
    skill = button.dataset.materialSkill;
    syncUrl();
    render();
  }));

  document.querySelectorAll('[data-collection]').forEach(button => button.addEventListener('click', () => {
    collection = button.dataset.collection;
    syncUrl();
    render();
  }));

  if (search) {
    let debounceTimer = null;
    search.addEventListener('input', () => {
      query = search.value;
      if (searchClear) searchClear.hidden = !query;
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        syncUrl();
        render();
      }, 120);
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      query = '';
      if (search) {
        search.value = '';
        search.focus();
      }
      searchClear.hidden = true;
      syncUrl();
      render();
    });
  }

  if (activeTags) {
    activeTags.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-tag]');
      if (!button) return;
      const type = button.dataset.removeTag;
      if (type === 'collection') collection = 'all';
      else if (type === 'level') level = 'all';
      else if (type === 'skill') skill = 'all';
      else if (type === 'query') {
        query = '';
        if (search) search.value = '';
        if (searchClear) searchClear.hidden = true;
      }
      syncUrl();
      render();
    });
  }

  list.addEventListener('click', event => {
    if (event.target.closest('[data-locked-btn], .resource-lock')) {
      event.preventDefault();
      if (typeof window.showUpgradeModal === 'function') {
        window.showUpgradeModal();
      }
    }
  });

  // Fetch logic with retry capability
  function fetchLibrary() {
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = `
      <div class="loading-state" role="status" aria-label="Loading materials">
        <div class="loading-card"><span></span><span></span><span></span><span></span></div>
        <div class="loading-card"><span></span><span></span><span></span><span></span></div>
        <div class="loading-card"><span></span><span></span><span></span><span></span></div>
        <div class="loading-card"><span></span><span></span><span></span><span></span></div>
      </div>`;
    if (count) count.textContent = 'Loading materials…';

    fetch('/api/resources', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(response => {
        if (response.status === 401) {
          localStorage.removeItem('vortex-english-token');
          location.replace(`/english/login?next=${encodeURIComponent(location.pathname + location.search)}`);
          throw new Error('AUTH_REDIRECT');
        }
        return response.ok ? response.json() : Promise.reject(new Error('Network response was not ok'));
      })
      .then(data => {
        resources = Array.isArray(data) ? data : [];
        list.setAttribute('aria-busy', 'false');
        render();
      })
      .catch(error => {
        if (error?.message === 'AUTH_REDIRECT') return;
        list.setAttribute('aria-busy', 'false');
        if (count) count.textContent = 'Materials could not be loaded';
        list.innerHTML = `
          <div class="empty library-error" role="alert">
            <div class="library-empty-box">
              <span class="material-symbols-outlined library-error-icon" aria-hidden="true">cloud_off</span>
              <h2>Unable to load materials</h2>
              <p>We encountered an issue communicating with the server. Please verify your connection and try again.</p>
              <button class="button primary" id="retryLibraryBtn" type="button">Try again</button>
            </div>
          </div>`;
        document.getElementById('retryLibraryBtn')?.addEventListener('click', fetchLibrary);
      });
  }

  fetchLibrary();
})();
