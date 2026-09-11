(() => {
  const list = document.querySelector('#resourceList');
  const count = document.querySelector('#resourceCount');
  const search = document.querySelector('#materialSearch');
  const searchBtn = document.querySelector('#materialSearchBtn');
  const searchClear = document.querySelector('#clearSearchInput');
  const clearFiltersBtn = document.querySelector('#clearMaterialFilters');

  // Filter Dropdowns
  const filterPassage = document.querySelector('#filterPassage');
  const filterStatus = document.querySelector('#filterStatus');
  const filterType = document.querySelector('#filterType');
  const filterPlan = document.querySelector('#filterPlan');

  // Sidebar & Layout elements
  const sidebar = document.querySelector('#vxCatalogSidebar');
  const backdrop = document.querySelector('#vxSidebarBackdrop');
  const drawerOpenBtn = document.querySelector('#vxDrawerOpenBtn');
  const breadcrumbCurrent = document.querySelector('#vxBreadcrumbCurrent');
  const catIconBadge = document.querySelector('#vxCatIconBadge');
  const catTitle = document.querySelector('#vxCategoryTitle');
  const catSubtitle = document.querySelector('#vxCategorySubtitle');
  const badgeListening = document.querySelector('#badgeFullListening');
  const badgeReading = document.querySelector('#badgeFullReading');

  // User Profile in Sidebar
  const userAvatar = document.querySelector('#vxUserAvatar');
  const userName = document.querySelector('#vxUserName');
  const userEmail = document.querySelector('#vxUserEmail');
  const logoutBtn = document.querySelector('#vxLogoutBtn');

  // URL state
  const params = new URLSearchParams(location.search);
  const allowedSkills = ['listening', 'speaking', 'reading', 'writing', 'all'];
  const allowedCollections = ['full-test', 'practice', 'article', 'writing-sample', 'speaking', 'book', 'all'];

  let skill = allowedSkills.includes(params.get('skill')) ? params.get('skill') : 'reading';
  let collection = allowedCollections.includes(params.get('collection')) ? params.get('collection') : 'practice';
  let query = (params.get('q') || '').trim();

  let selectedPassage = params.get('passage') || 'all';
  let selectedStatus = params.get('status') || 'all';
  let selectedType = params.get('type') || 'all';
  let selectedPlan = params.get('plan') || 'all';

  let resources = [];
  const token = localStorage.getItem('vortex-english-token') || '';

  // 1. Synchronize UI Inputs with initial URL params
  if (search && query) {
    search.value = query;
    if (searchClear) searchClear.hidden = false;
  }
  if (filterPassage) filterPassage.value = selectedPassage;
  if (filterStatus) filterStatus.value = selectedStatus;
  if (filterType) filterType.value = selectedType;
  if (filterPlan) filterPlan.value = selectedPlan;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  // 2. Countdown Timer for Limited-time Offer (Screenshot 4: 02d: 04h: 14m: 12s)
  const countdownEl = document.querySelector('#vxOfferCountdown');
  if (countdownEl) {
    let targetTime = Date.now() + (2 * 86400 + 4 * 3600 + 14 * 60 + 12) * 1000;
    const storedTarget = localStorage.getItem('vx_offer_target_time');
    if (storedTarget && Number(storedTarget) > Date.now()) {
      targetTime = Number(storedTarget);
    } else {
      localStorage.setItem('vx_offer_target_time', String(targetTime));
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, targetTime - now);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      countdownEl.textContent = `${String(days).padStart(2, '0')}d: ${String(hours).padStart(2, '0')}h: ${String(minutes).padStart(2, '0')}m: ${String(seconds).padStart(2, '0')}s`;
    };
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  // 3. User Profile Card population
  const populateUserProfile = () => {
    let user = null;
    try {
      const stored = localStorage.getItem('vortex-english-user');
      if (stored) user = JSON.parse(stored);
    } catch (_) {}

    if (user && (user.name || user.email)) {
      const displayName = user.name || user.email.split('@')[0];
      if (userName) userName.textContent = displayName;
      if (userEmail) userEmail.textContent = user.email || (user.plan === 'premium' ? 'Premium Candidate' : 'Free Candidate');
      if (userAvatar) {
        const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'C';
        if (user.avatarUrl) {
          userAvatar.innerHTML = `<img src="${escape(user.avatarUrl)}" alt="${escape(displayName)}">`;
        } else {
          userAvatar.textContent = initials;
        }
      }
    } else if (token) {
      // Attempt lightweight profile fetch
      fetch('/api/account', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && (data.name || data.email)) {
            localStorage.setItem('vortex-english-user', JSON.stringify(data));
            populateUserProfile();
          }
        })
        .catch(() => {});
    }
  };
  populateUserProfile();

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('vortex-english-token');
      localStorage.removeItem('vortex-english-user');
      location.replace('/english/login');
    });
  }

  // 4. Mobile Drawer Behavior
  if (drawerOpenBtn && sidebar && backdrop) {
    drawerOpenBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      backdrop.classList.add('active');
    });
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  // 5. Category Meta Configuration
  const getCategoryMeta = (s, c) => {
    if (c === 'full-test') {
      if (s === 'listening') {
        return {
          title: 'Listening Full Tests',
          subtitle: 'Four-part computer-delivered listening practice with a complete audio simulation',
          icon: 'headphones',
          breadcrumb: 'Full Tests > Listening'
        };
      }
      return {
        title: 'Reading Full Tests',
        subtitle: 'Complete three-passage, 40-question reading practice in a timed workspace',
        icon: 'menu_book',
        breadcrumb: 'Full Tests > Reading'
      };
    }
    if (c === 'writing-sample') {
      return {
        title: 'Writing Tasks',
        subtitle: 'Writing Task 1 and Task 2 prompts with high-band model responses',
        icon: 'edit_note',
        breadcrumb: 'Part Practice > Writing'
      };
    }
    if (c === 'speaking') {
      return {
        title: 'Speaking Topics',
        subtitle: 'Speaking topics, cue cards, and high-band answer drills for focused practice',
        icon: 'record_voice_over',
        breadcrumb: 'Part Practice > Speaking'
      };
    }
    if (c === 'article') {
      return {
        title: 'Academic Articles',
        subtitle: 'Curated scientific and academic reading articles with vocabulary banking',
        icon: 'article',
        breadcrumb: 'Study Tools > Articles'
      };
    }
    if (s === 'listening') {
      return {
        title: 'Listening Sections',
        subtitle: 'Practice individual listening sections with targeted question types',
        icon: 'hearing',
        breadcrumb: 'Part Practice > Listening'
      };
    }
    return {
      title: 'Reading Passages',
      subtitle: 'Practice individual reading passages with various question types',
      icon: 'menu_book',
      breadcrumb: 'Reading Passages'
    };
  };

  const updateHeaderAndBreadcrumb = () => {
    const meta = getCategoryMeta(skill, collection);
    if (catTitle) catTitle.textContent = meta.title;
    if (catSubtitle) catSubtitle.textContent = meta.subtitle;
    if (catIconBadge) catIconBadge.textContent = meta.icon;
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = meta.breadcrumb;
    if (search) search.placeholder = `Search ${meta.title.toLowerCase()}...`;
  };

  const syncUrl = () => {
    const url = new URL(location.href);
    url.searchParams.set('skill', skill);
    url.searchParams.set('collection', collection);
    query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
    selectedPassage === 'all' ? url.searchParams.delete('passage') : url.searchParams.set('passage', selectedPassage);
    selectedStatus === 'all' ? url.searchParams.delete('status') : url.searchParams.set('status', selectedStatus);
    selectedType === 'all' ? url.searchParams.delete('type') : url.searchParams.set('type', selectedType);
    selectedPlan === 'all' ? url.searchParams.delete('plan') : url.searchParams.set('plan', selectedPlan);
    history.replaceState({}, '', url);
  };

  const inferCollection = item => {
    if (item.collection) return item.collection;
    if (item.materialKind === 'full-test') return 'full-test';
    if (item.materialKind === 'skill-practice' || item.materialKind === 'passage') return 'practice';
    if (item.type === 'article') return 'article';
    if (item.type === 'book') return 'book';
    if (item.skill === 'writing') return 'writing-sample';
    if (item.skill === 'speaking') return 'speaking';
    return 'practice';
  };

  // 6. Main Render Loop
  const render = () => {
    // Sync sidebar active state
    document.querySelectorAll('[data-side-skill]').forEach(btn => {
      const bSkill = btn.dataset.sideSkill;
      const bColl = btn.dataset.sideCollection;
      const active = (bSkill === 'all' || bSkill === skill) && bColl === collection;
      btn.classList.toggle('active', active);
    });

    updateHeaderAndBreadcrumb();

    const normalized = query.trim().toLocaleLowerCase('en');

    // Filter resources
    const visible = resources.filter(item => {
      const itemColl = inferCollection(item);

      // Skill match
      const matchesSkill = skill === 'all' || item.skill === skill;

      // Collection match
      const matchesColl = collection === 'all'
        || (collection === 'practice' && (itemColl === 'practice' || item.materialKind === 'passage' || item.materialKind === 'skill-practice'))
        || (collection === 'full-test' && (itemColl === 'full-test' || item.materialKind === 'full-test'))
        || itemColl === collection;

      // Passage filter
      let matchesPassage = true;
      if (selectedPassage !== 'all') {
        const pNum = Number(selectedPassage);
        matchesPassage = item.passageNumber === pNum;
      }

      // Status filter
      let matchesStatus = true;
      if (selectedStatus === 'completed') matchesStatus = Boolean(item.completed);
      else if (selectedStatus === 'not-started') matchesStatus = !item.completed;

      // Question Type filter
      let matchesType = true;
      if (selectedType !== 'all') {
        const typesStr = (item.questionTypes || []).join(' ').toLowerCase();
        if (selectedType === 'tfng') matchesType = typesStr.includes('true') || typesStr.includes('yes') || typesStr.includes('not given');
        else if (selectedType === 'headings') matchesType = typesStr.includes('headings');
        else if (selectedType === 'completion') matchesType = typesStr.includes('completion') || typesStr.includes('gap');
        else if (selectedType === 'mcq') matchesType = typesStr.includes('multiple choice') || typesStr.includes('mcq');
      }

      // Plan filter
      let matchesPlan = true;
      if (selectedPlan === 'free') matchesPlan = item.access === 'free' || item.free === true;
      else if (selectedPlan === 'premium') matchesPlan = item.access === 'premium' && !item.free;

      // Query search
      const searchText = `${item.title || ''} ${item.description || ''} ${item.sourceTitle || ''} ${(item.questionTypes || []).join(' ')}`.toLocaleLowerCase('en');
      const matchesQuery = !normalized || searchText.includes(normalized);

      return matchesSkill && matchesColl && matchesPassage && matchesStatus && matchesType && matchesPlan && matchesQuery;
    });

    // Update Result Count
    const totalCount = resources.filter(item => {
      const itemColl = inferCollection(item);
      const matchesSkill = skill === 'all' || item.skill === skill;
      const matchesColl = collection === 'all'
        || (collection === 'practice' && (itemColl === 'practice' || item.materialKind === 'passage' || item.materialKind === 'skill-practice'))
        || (collection === 'full-test' && (itemColl === 'full-test' || item.materialKind === 'full-test'))
        || itemColl === collection;
      return matchesSkill && matchesColl;
    }).length;

    if (count) {
      count.textContent = `Showing ${visible.length} of ${totalCount} tests`;
    }

    // Update active filter select styles
    if (filterPassage) filterPassage.classList.toggle('is-active-filter', selectedPassage !== 'all');
    if (filterStatus) filterStatus.classList.toggle('is-active-filter', selectedStatus !== 'all');
    if (filterType) filterType.classList.toggle('is-active-filter', selectedType !== 'all');
    if (filterPlan) filterPlan.classList.toggle('is-active-filter', selectedPlan !== 'all');

    // Has Active Filters
    const hasActiveFilters = selectedPassage !== 'all' || selectedStatus !== 'all' || selectedType !== 'all' || selectedPlan !== 'all' || Boolean(normalized);
    if (clearFiltersBtn) {
      clearFiltersBtn.hidden = !hasActiveFilters;
    }

    // Empty state
    if (!visible.length) {
      list.innerHTML = `
        <div class="vx-catalog-empty">
          <span class="material-symbols-outlined vx-catalog-empty-icon">search_off</span>
          <h3>No matching practice tests found</h3>
          <p>Try adjusting your search criteria or clearing filters to view available materials.</p>
          <button type="button" class="vx-card-cta-btn primary" style="max-width:200px;margin:0 auto;" id="emptyResetFiltersBtn">Reset all filters</button>
        </div>`;
      document.querySelector('#emptyResetFiltersBtn')?.addEventListener('click', resetFilters);
      return;
    }

    // Render Cards Grid (Screenshot 4 format)
    list.innerHTML = visible.map(item => {
      const isFree = item.access === 'free' || item.free === true;
      const isLocked = item.locked;
      const isCompleted = item.completed;
      const formatTag = item.materialKind === 'full-test' || inferCollection(item) === 'full-test'
        ? 'Full Test'
        : item.skill === 'listening'
          ? 'Listening'
          : item.skill === 'writing'
            ? 'Writing'
            : item.skill === 'speaking'
              ? 'Speaking'
              : 'Reading';

      const metaSubtitle = item.questionCount
        ? `${item.questionCount} Questions · ${item.skill === 'listening' ? 'Audio CDI' : 'Timed'}`
        : (item.formatLabel || 'Practice');

      const pNum = item.passageNumber || (item.skill === 'listening' ? item.partNumber : 1) || 1;

      // Passage / Section badge text
      let badgeLabel = `Passage ${pNum}`;
      if (item.materialKind === 'full-test' || inferCollection(item) === 'full-test') {
        badgeLabel = 'Full Test';
      } else if (item.skill === 'listening') {
        badgeLabel = `Section ${item.partNumber || 1}`;
      } else if (item.skill === 'writing') {
        badgeLabel = 'Task 1 & 2';
      }

      // Graphic center icon
      let centerIcon = 'menu_book';
      if (item.skill === 'listening') centerIcon = 'headphones';
      else if (item.skill === 'writing') centerIcon = 'edit_note';
      else if (item.skill === 'speaking') centerIcon = 'record_voice_over';

      // Question types pills
      const qTypes = Array.isArray(item.questionTypes) && item.questionTypes.length
        ? item.questionTypes
        : ['True False Not Given', 'Summary Completion'];

      const visibleChips = qTypes.slice(0, 2).map(t => `<span class="vx-qtype-chip">${escape(t)}</span>`).join('');
      const moreChips = qTypes.length > 2 ? `<span class="vx-qtype-more">+${qTypes.length - 2} more</span>` : '';

      // Direct Action Link
      const rawHref = item.href || `/english/${item.skill === 'listening' ? 'listening-exam' : 'reading-exam'}?id=${encodeURIComponent(item.id)}`;
      const hrefUrl = new URL(rawHref, location.origin);
      if (token && hrefUrl.origin === location.origin) {
        hrefUrl.searchParams.set('token', token);
      }
      const href = `${hrefUrl.pathname}${hrefUrl.search}`;

      // Review Link
      const reviewUrl = new URL(rawHref, location.origin);
      if (token && reviewUrl.origin === location.origin) {
        reviewUrl.searchParams.set('token', token);
      }
      reviewUrl.searchParams.set('review', 'true');
      const reviewHref = `${reviewUrl.pathname}${reviewUrl.search}`;

      // Clean display title: remove redundant "IELTS Reading Passage — " or "IELTS Listening Test — " prefix
      let displayTitle = (item.title || '')
        .replace(/^IELTS\s+(?:Reading|Listening)\s+(?:Passage|Section|Skill Practice|Practice|Test)\s*[—–-]\s*/i, '')
        .replace(/^IELTS\s+(?:Reading|Listening)\s*[—–-]\s*/i, '')
        .trim();
      if (!displayTitle) displayTitle = item.title;

      // CTA Button
      let actionBtn = '';
      if (isCompleted) {
        actionBtn = `
          <div class="vx-card-actions">
            <a href="${escape(reviewHref)}" class="vx-card-cta-btn review" title="Review your mistakes and answers">
              <span class="material-symbols-outlined" style="font-size:18px;">equalizer</span>
              <span>Review Mistakes</span>
            </a>
          </div>`;
      } else if (isLocked) {
        actionBtn = `
          <div class="vx-card-actions">
            <button type="button" class="vx-card-cta-btn unlock" onclick="window.showUpgradeModal ? window.showUpgradeModal() : location.href='/english/pricing'">
              <span class="material-symbols-outlined" style="font-size:18px;">lock</span>
              <span>Get Access</span>
            </button>
          </div>`;
      } else {
        actionBtn = `
          <div class="vx-card-actions">
            <a href="${escape(href)}" class="vx-card-cta-btn primary">
              <span class="material-symbols-outlined" style="font-size:18px;">star</span>
              <span>Start Practice</span>
            </a>
          </div>`;
      }

      return `
        <article class="vx-test-card skill-${escape(item.skill || 'reading')}">
          <div class="vx-card-graphic">
            <div class="vx-card-graphic-top">
              <span class="vx-card-badge-max"><span class="material-symbols-outlined" aria-hidden="true">star</span> MAX</span>
              <span class="vx-card-badge-passage">${escape(badgeLabel)}</span>
            </div>
            <div class="vx-card-graphic-center">
            <span class="material-symbols-outlined vx-card-center-icon" aria-hidden="true">${centerIcon}</span>
              <span class="vx-card-volume-label">${escape(formatTag)}</span>
            </div>
          </div>
          <div class="vx-card-body">
            <h2 class="vx-card-title">${escape(displayTitle)}</h2>
            <div class="vx-card-sub-pack">
              <span class="material-symbols-outlined" style="font-size:15px;color:#94a3b8;">quiz</span>
              <span>${escape(metaSubtitle)}</span>
              ${isCompleted ? '<span class="vx-completed-badge"><span class="material-symbols-outlined" style="font-size:12px;">check_circle</span> Completed</span>' : ''}
            </div>
            <div class="vx-card-qtypes">
              ${visibleChips}
              ${moreChips}
            </div>
            ${actionBtn}
          </div>
        </article>`;
    }).join('');
  };

  const resetFilters = () => {
    selectedPassage = 'all';
    selectedStatus = 'all';
    selectedType = 'all';
    selectedPlan = 'all';
    query = '';
    if (search) search.value = '';
    if (searchClear) searchClear.hidden = true;
    if (filterPassage) filterPassage.value = 'all';
    if (filterStatus) filterStatus.value = 'all';
    if (filterType) filterType.value = 'all';
    if (filterPlan) filterPlan.value = 'all';
    syncUrl();
    render();
  };

  // 7. Event Handlers
  document.querySelectorAll('[data-side-skill]').forEach(btn => {
    btn.addEventListener('click', () => {
      skill = btn.dataset.sideSkill;
      collection = btn.dataset.sideCollection;
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
      syncUrl();
      render();
    });
  });

  if (filterPassage) {
    filterPassage.addEventListener('change', () => {
      selectedPassage = filterPassage.value;
      syncUrl();
      render();
    });
  }

  if (filterStatus) {
    filterStatus.addEventListener('change', () => {
      selectedStatus = filterStatus.value;
      syncUrl();
      render();
    });
  }

  if (filterType) {
    filterType.addEventListener('change', () => {
      selectedType = filterType.value;
      syncUrl();
      render();
    });
  }

  if (filterPlan) {
    filterPlan.addEventListener('change', () => {
      selectedPlan = filterPlan.value;
      syncUrl();
      render();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', resetFilters);
  }

  if (search) {
    let debounceTimer = null;
    search.addEventListener('input', () => {
      query = search.value;
      if (searchClear) searchClear.hidden = !query;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        syncUrl();
        render();
      }, 150);
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      if (search) query = search.value;
      syncUrl();
      render();
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

  // 8. Fetch Materials from API
  function fetchCatalog() {
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = `
      <div class="vx-skeleton-card"></div>
      <div class="vx-skeleton-card"></div>
      <div class="vx-skeleton-card"></div>`;
    if (count) count.textContent = 'Loading practice tests…';

    fetch('/api/resources', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => {
        if (res.status === 401) {
          localStorage.removeItem('vortex-english-token');
          location.replace(`/english/login?next=${encodeURIComponent(location.pathname + location.search)}`);
          throw new Error('AUTH_REDIRECT');
        }
        return res.ok ? res.json() : Promise.reject(new Error('Network response was not ok'));
      })
      .then(data => {
        resources = Array.isArray(data) ? data : [];
        list.setAttribute('aria-busy', 'false');

        // Update badge counts for full tests
        const listeningFullCount = resources.filter(i => i.skill === 'listening' && (i.collection === 'full-test' || i.materialKind === 'full-test')).length;
        const readingFullCount = resources.filter(i => i.skill === 'reading' && (i.collection === 'full-test' || i.materialKind === 'full-test')).length;
        if (badgeListening) badgeListening.textContent = listeningFullCount || '51';
        if (badgeReading) badgeReading.textContent = readingFullCount || '45';

        render();
      })
      .catch(err => {
        if (err?.message === 'AUTH_REDIRECT') return;
        list.setAttribute('aria-busy', 'false');
        if (count) count.textContent = 'Unable to load materials';
        list.innerHTML = `
          <div class="vx-catalog-empty">
            <span class="material-symbols-outlined vx-catalog-empty-icon">cloud_off</span>
            <h3>Unable to load tests</h3>
            <p>Could not connect to the testing server. Please check your internet connection and try again.</p>
            <button type="button" class="vx-card-cta-btn primary" style="max-width:180px;margin:0 auto;" id="retryFetchBtn">Try Again</button>
          </div>`;
        document.querySelector('#retryFetchBtn')?.addEventListener('click', fetchCatalog);
      });
  }

  fetchCatalog();
})();
