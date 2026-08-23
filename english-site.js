(() => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('vortex-english-theme');
  root.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';

  const header = document.querySelector('.app-header');
  if (header && !header.querySelector('[data-theme-toggle]')) {
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.type = 'button';
    themeToggle.dataset.themeToggle = '';
    const syncThemeLabel = () => {
      const dark = root.dataset.theme === 'dark';
      themeToggle.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${dark ? 'light_mode' : 'dark_mode'}</span>`;
      const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
      themeToggle.setAttribute('aria-label', label);
      themeToggle.title = label;
    };
    syncThemeLabel();
    themeToggle.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('vortex-english-theme', root.dataset.theme);
      syncThemeLabel();
    });
    header.insertBefore(themeToggle, header.querySelector('.app-actions'));
  }

  const menu = document.querySelector('[data-mobile-menu]');
  const nav = document.querySelector('.app-nav');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'Close' : 'Menu';
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.addEventListener('click', event => {
      if (!event.target.closest('a')) return;
      nav.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
      menu.textContent = 'Menu';
      menu.setAttribute('aria-label', 'Open menu');
    });
  }

  const token = localStorage.getItem('vortex-english-token');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  // --- MODERN TOAST NOTIFICATION SYSTEM ---
  function showToast(message, type = 'success', duration = 3500) {
    if (!message) return;
    let container = document.querySelector('#vortexToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'vortexToastContainer';
      container.className = 'vx-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `vx-toast vx-toast-${type}`;

    let iconName = 'check_circle';
    if (type === 'error') iconName = 'error';
    else if (type === 'warning') iconName = 'warning';
    else if (type === 'info') iconName = 'info';

    toast.innerHTML = `
      <div class="vx-toast-icon-wrap">
        <span class="material-symbols-outlined">${iconName}</span>
      </div>
      <div class="vx-toast-content">
        <div class="vx-toast-message">${safe(message)}</div>
      </div>
      <button type="button" class="vx-toast-close" aria-label="Close">&times;</button>
      <div class="vx-toast-progress" style="animation-duration:${duration}ms;"></div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    let dismissTimeout;
    const dismiss = () => {
      clearTimeout(dismissTimeout);
      toast.classList.remove('is-visible');
      toast.classList.add('is-hiding');
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    };

    dismissTimeout = setTimeout(dismiss, duration);
    toast.querySelector('.vx-toast-close').addEventListener('click', e => {
      e.stopPropagation();
      dismiss();
    });
    toast.addEventListener('click', e => {
      if (!e.target.closest('a')) dismiss();
    });
  }

  window.showToast = showToast;
  // Professional override so native browser popups never interrupt the experience
  window.alert = msg => {
    const text = String(msg || '');
    if (/xatolik|error|fail|rad/i.test(text)) {
      showToast(text, 'error');
    } else if (/warning|ogoh|faqat|iltimos|must/i.test(text)) {
      showToast(text, 'warning');
    } else {
      showToast(text, 'success');
    }
  };

  const mountMemberSidebar = user => {
    if (document.querySelector('.member-sidebar')) return;
    const params = new URLSearchParams(location.search);
    const activeCollection = params.get('collection');
    const activeSkill = params.get('skill');
    const activePath = location.pathname;
    const isTeacher = Boolean(user && user.role === 'teacher');

    const candidateLinks = isTeacher ? [
      { label: 'Home (Materials)', icon: 'home', href: '/english/materials', active: activePath === '/english/materials' && !activeCollection && !activeSkill },
      { label: 'Teacher Workspace', icon: 'school', href: '/english/teacher', active: activePath === '/english/teacher' },
      { label: 'Student View', icon: 'dashboard', href: '/english/account', active: activePath === '/english/account' && !params.get('tab') }
    ] : [
      { label: 'Home (Materials)', icon: 'home', href: '/english/materials', active: activePath === '/english/materials' && !activeCollection && !activeSkill },
      { label: 'Dashboard & Progress', icon: 'dashboard', href: '/english/account', active: activePath === '/english/account' && !params.get('tab') },
      { label: 'Homework & Tasks', icon: 'assignment', href: '/english/account?tab=homework', active: activePath === '/english/account' && params.get('tab') === 'homework' }
    ];

    const sections = [
      {
        title: isTeacher ? 'INSTRUCTOR' : 'WORKSPACE',
        links: candidateLinks
      },
      {
        title: 'FULL TESTS',
        links: [
          { label: 'Listening Tests', icon: 'headphones', href: '/english/materials?level=ielts&skill=listening&collection=full-test', active: activePath === '/english/materials' && activeSkill === 'listening' && activeCollection === 'full-test' },
          { label: 'Reading Tests', icon: 'menu_book', href: '/english/materials?level=ielts&skill=reading&collection=full-test', active: activePath === '/english/materials' && activeSkill === 'reading' && activeCollection === 'full-test' },
          { label: 'Random Writing Mock', icon: 'shuffle', href: '/english/writing-editor?mode=random', active: activePath === '/english/writing-editor' },
          { label: 'Speaking Tests', icon: 'record_voice_over', href: '/english/materials?level=ielts&skill=speaking', active: activePath === '/english/materials' && activeSkill === 'speaking' && !activeCollection }
        ]
      },
      {
        title: 'PART PRACTICE',
        links: [
          { label: 'Reading Passages', icon: 'auto_stories', href: '/english/materials?level=ielts&skill=reading&collection=practice', active: activePath === '/english/materials' && activeSkill === 'reading' && activeCollection === 'practice' },
          { label: 'Listening Sections', icon: 'hearing', href: '/english/materials?level=ielts&skill=listening&collection=practice', active: activePath === '/english/materials' && activeSkill === 'listening' && activeCollection === 'practice' },
          { label: 'Writing Models', icon: 'history_edu', href: '/english/materials?level=ielts&skill=writing&collection=writing-sample', active: activePath === '/english/materials' && activeSkill === 'writing' && activeCollection === 'writing-sample' },
          { label: 'Speaking Topics', icon: 'chat', href: '/english/materials?level=ielts&skill=speaking&collection=speaking', active: activePath === '/english/materials' && activeSkill === 'speaking' && activeCollection === 'speaking' }
        ]
      },
      {
        title: 'STUDY TOOLS',
        links: [
          { label: 'Articles & Reader', icon: 'article', href: '/english/materials?collection=article', active: activePath === '/english/materials' && activeCollection === 'article' },
          { label: 'Vocabulary Builder', icon: 'bookmarks', href: '/english/vocabulary', active: activePath === '/english/vocabulary' },
          { label: 'Skill Training Hub', icon: 'tune', href: '/english/practice', active: activePath === '/english/practice' },
          { label: 'Course Books', icon: 'library_books', href: '/english/materials?collection=book', active: activePath === '/english/materials' && activeCollection === 'book' },
          { label: 'Curriculum Courses', icon: 'school', href: '/english/courses', active: activePath === '/english/courses' }
        ]
      }
    ];

    const navMarkup = sections.map(sec => {
      const linksHtml = sec.links.map(l => {
        const badgeHtml = l.badge ? `<span class="member-nav-badge">${safe(l.badge)}</span>` : '';
        return `<a href="${l.href}"${l.active ? ' aria-current="page"' : ''} title="${safe(l.label)}">
          <span class="material-symbols-outlined member-nav-icon" aria-hidden="true">${l.icon}</span>
          <span class="member-nav-label">${safe(l.label)}</span>
          ${badgeHtml}
        </a>`;
      }).join('');
      return `<div class="member-nav-group"><span class="member-nav-section-title">${safe(sec.title)}</span>${linksHtml}</div>`;
    }).join('');

    const planLabel = user.plan === 'premium' ? 'Premium Member' : 'Free Account';
    const avatarUrl = /^https:\/\//.test(String(user.avatarUrl || '')) ? String(user.avatarUrl) : '';
    const avatarContent = avatarUrl ? `<img src="${safe(avatarUrl)}" alt="">` : safe(String(user.name || 'V').trim().charAt(0).toUpperCase());

    const sidebar = document.createElement('aside');
    sidebar.className = 'member-sidebar';
    sidebar.id = 'memberSidebar';
    sidebar.innerHTML = `
      <div class="member-sidebar-top">
        <a class="member-sidebar-brand" href="/english/materials" aria-label="IELTS Core materials">
          <span class="app-mark"><img src="/assets/ielts-core-mark.png" height="28" alt="IELTS Core"></span>
          <span class="member-brand-text">IELTS CORE</span>
          <span class="app-brand-badge">BETA</span>
        </a>
        <button class="member-sidebar-collapse-btn" type="button" id="sidebarCollapseBtn" title="Toggle sidebar width" aria-label="Collapse sidebar">
          <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>
      </div>
      <nav class="member-sidebar-nav" aria-label="Student workspace">
        ${navMarkup}
      </nav>
      <div class="member-sidebar-footer">
        ${user.plan !== 'premium' ? `
          <div class="member-sidebar-pro-card" id="sidebarUpgradeBtn" role="button" tabindex="0" title="Upgrade to IELTS Core Premium (30 000 UZS/oy)">
            <div class="pro-card-collapsed-badge">
              <span class="material-symbols-outlined pro-icon" aria-hidden="true">diamond</span>
              <span class="pro-tag">PRO</span>
            </div>
            <div class="pro-card-expanded-content">
              <div class="pro-header-row">
                <span class="pro-star-badge">PREMIUM</span>
                <span class="pro-price-pill">30k / oy</span>
              </div>
              <p class="pro-desc">Authentic CDI testlar va toʻliq tahlillarni ochish</p>
              <div class="pro-action-link">
                <span>Faollashtirish</span>
                <span aria-hidden="true">→</span>
              </div>
            </div>
          </div>
        ` : ''}
        <a class="member-sidebar-profile" href="/english/account" aria-label="Open student dashboard">
          <span class="member-avatar">${avatarContent}</span>
          <span class="member-profile-info">
            <strong>${safe(user.name || 'Student')}</strong>
            <small class="${user.plan === 'premium' ? 'plan-premium' : 'plan-free'}">${planLabel}</small>
          </span>
          <span class="material-symbols-outlined member-profile-arrow" aria-hidden="true">chevron_right</span>
        </a>
      </div>
    `;

    const overlay = document.createElement('button');
    overlay.className = 'member-sidebar-overlay';
    overlay.type = 'button';
    overlay.setAttribute('aria-label', 'Close student menu');

    const mobileBar = document.createElement('div');
    mobileBar.className = 'member-mobile-bar';
    mobileBar.innerHTML = `
      <button class="member-sidebar-toggle" type="button" aria-controls="memberSidebar" aria-expanded="false">
        <span class="material-symbols-outlined" aria-hidden="true">menu</span>
        <span>Menu</span>
      </button>
      <a class="member-mobile-brand" href="/english/materials" aria-label="IELTS Core Materials">
        <span class="app-mark"><img src="/assets/ielts-core-mark.png" height="28" alt="IELTS Core"></span>
        <span class="member-brand-text">IELTS CORE</span>
      </a>
      <div class="member-mobile-actions">
        <button class="theme-toggle member-theme-btn" type="button" data-member-theme-toggle title="Toggle theme">
          <span class="material-symbols-outlined" aria-hidden="true">${root.dataset.theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>
        <a class="member-mobile-avatar" href="/english/account" title="My Account">
          ${avatarContent}
        </a>
      </div>
    `;

    const toggle = mobileBar.querySelector('.member-sidebar-toggle');
    const closeMobile = () => {
      document.body.classList.remove('member-sidebar-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('member-sidebar-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    overlay.addEventListener('click', closeMobile);
    sidebar.addEventListener('click', event => {
      if (event.target.closest('a')) closeMobile();
    });

    const themeBtn = mobileBar.querySelector('[data-member-theme-toggle]');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('vortex-english-theme', root.dataset.theme);
        const icon = themeBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = root.dataset.theme === 'dark' ? 'light_mode' : 'dark_mode';
      });
    }

    // Collapse State Persistence
    const isInitiallyCollapsed = localStorage.getItem('vortex-sidebar-collapsed') === 'true';
    if (isInitiallyCollapsed) {
      document.body.classList.add('member-sidebar-collapsed');
      const icon = sidebar.querySelector('#sidebarCollapseBtn .material-symbols-outlined');
      if (icon) icon.textContent = 'chevron_right';
    }

    sidebar.querySelector('#sidebarCollapseBtn')?.addEventListener('click', () => {
      const isCollapsed = document.body.classList.toggle('member-sidebar-collapsed');
      localStorage.setItem('vortex-sidebar-collapsed', String(isCollapsed));
      const icon = sidebar.querySelector('#sidebarCollapseBtn .material-symbols-outlined');
      if (icon) icon.textContent = isCollapsed ? 'chevron_right' : 'chevron_left';
    });

    sidebar.querySelector('#sidebarUpgradeBtn')?.addEventListener('click', () => {
      if (typeof window.showUpgradeModal === 'function') window.showUpgradeModal();
    });

    // Sidebar Scroll Position Persistence & Active Link Visibility
    const navEl = sidebar.querySelector('.member-sidebar-nav');
    if (navEl) {
      const savedNavScroll = sessionStorage.getItem('vortex-sidebar-nav-scroll');
      if (savedNavScroll !== null) {
        navEl.scrollTop = parseInt(savedNavScroll, 10) || 0;
      }
      navEl.addEventListener('scroll', () => {
        sessionStorage.setItem('vortex-sidebar-nav-scroll', String(navEl.scrollTop));
      }, { passive: true });

      // Ensure active menu item is scrolled into comfortable view
      const activeLink = navEl.querySelector('a[aria-current="page"]');
      if (activeLink) {
        setTimeout(() => {
          activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 50);
      }
    }

    document.body.classList.add('member-layout');
    document.body.prepend(mobileBar);
    document.body.prepend(overlay);
    document.body.prepend(sidebar);
    // =========================================================================
    // IELTS Pre-Flight Test Launch Modal (Real Exam vs Practice Mode)
    // =========================================================================
    const mountTestLaunchModal = () => {
      if (document.querySelector('#testLaunchModal')) return;

      const modal = document.createElement('div');
      modal.className = 'test-launch-modal';
      modal.id = 'testLaunchModal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'testLaunchTitle');

      modal.innerHTML = `
        <div class="test-launch-card">
          <div class="test-launch-header">
            <div>
              <span class="eyebrow" style="font-size:11px;font-weight:800;letter-spacing:0.08em;color:var(--v4-blue);text-transform:uppercase;">TEST INITIATION</span>
              <h2 id="testLaunchTitle">IELTS Reading Full Test</h2>
              <p style="margin:0;font-size:13px;color:var(--v4-muted);">Review exam guidelines and choose your preferred practice mode.</p>
            </div>
            <button type="button" class="test-launch-close" id="testLaunchClose" aria-label="Close dialog">&times;</button>
          </div>

          <div class="test-launch-section">
            <span class="test-launch-section-title">INSTRUCTIONS</span>
            <ul class="test-launch-list">
              <li>Practice first without dictionaries or external assistance.</li>
              <li>After completing the exam, review your mistakes in the verified answer key.</li>
              <li>You can use answer location and explanations to understand why each answer is correct.</li>
              <li>You can use the vocabulary section to save and master new words.</li>
            </ul>
          </div>

          <div class="test-launch-section test-launch-note">
            <span class="test-launch-section-title" style="color:#d97706;">NOTE & FAIR PRACTICE</span>
            <ul class="test-launch-list">
              <li>We strongly recommend completing the exam without ChatGPT or other third-party tools.</li>
              <li>If you use a study tool, copy only the specific sentence or short excerpt you need.</li>
              <li>Do not copy entire transcripts or question sets, or take repeated screenshots of test content.</li>
              <li>Normal note-taking and copying a small excerpt for review are allowed.</li>
            </ul>
          </div>

          <div class="test-launch-section">
            <span class="test-launch-section-title">CHOOSE EXAM MODE</span>
            <div class="test-mode-grid">
              <!-- Mode 1: Real Exam Mode -->
              <label class="test-mode-card selected" id="cardModeReal">
                <span class="test-mode-badge real">
                  <span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px">verified</span>
                  <span>100% Real Exam Interface</span>
                </span>
                <div class="test-mode-card-title-row">
                  <input type="radio" name="testExamMode" value="real" class="test-mode-radio" checked>
                  <h3>Real Exam Mode</h3>
                </div>
                <p class="test-mode-desc">Practice in an exact copy of the real computer-based exam interface with official split pane, timed countdown, and CDI highlight & notes.</p>
              </label>

              <!-- Mode 2: Practice Mode -->
              <label class="test-mode-card" id="cardModePractice">
                <span class="test-mode-badge practice">
                  <span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px">tune</span>
                  <span>Daily Practice Interface</span>
                </span>
                <div class="test-mode-card-title-row">
                  <input type="radio" name="testExamMode" value="practice" class="test-mode-radio">
                  <h3>Practice Mode</h3>
                </div>
                <p class="test-mode-desc">Practice in the comfortable daily practice interface — easier to navigate, built for daily drills with flexible section checking.</p>
              </label>
            </div>
          </div>

          <div class="test-launch-actions">
            <button type="button" id="startTestFinalBtn" class="test-launch-start-btn">
              <span>Start Test</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      let currentTargetUrl = '';

      const closeDialog = () => {
        modal.classList.remove('show');
      };

      modal.querySelector('#testLaunchClose')?.addEventListener('click', closeDialog);
      modal.addEventListener('click', e => {
        if (e.target === modal) closeDialog();
      });

      const realCard = modal.querySelector('#cardModeReal');
      const practiceCard = modal.querySelector('#cardModePractice');
      const realRadio = modal.querySelector('input[value="real"]');
      const practiceRadio = modal.querySelector('input[value="practice"]');

      realCard?.addEventListener('click', () => {
        realRadio.checked = true;
        realCard.classList.add('selected');
        practiceCard.classList.remove('selected');
      });

      practiceCard?.addEventListener('click', () => {
        practiceRadio.checked = true;
        practiceCard.classList.add('selected');
        realCard.classList.remove('selected');
      });

      modal.querySelector('#startTestFinalBtn')?.addEventListener('click', () => {
        if (!currentTargetUrl) return;
        const selectedMode = practiceRadio?.checked ? 'practice' : 'real';
        const url = new URL(currentTargetUrl, location.origin);
        url.searchParams.set('mode', selectedMode);
        if (token && !url.searchParams.has('token')) {
          url.searchParams.set('token', token);
        }
        location.assign(url.href);
      });

      // Intercept clicks on reading-exam / exam / listening-exam links
      document.addEventListener('click', e => {
        const link = e.target.closest('a[href*="/english/reading-exam"], a[href*="/english/exam"], a[href*="/english/listening-exam"]');
        if (!link) return;
        // If user clicked Review result or explicitly bypasses with modifier key, allow normal click
        if (link.href.includes('review=true') || e.ctrlKey || e.metaKey) return;

        e.preventDefault();
        currentTargetUrl = link.href;

        // Extract test title from closest card or link
        const card = link.closest('.resource, .course-card, .next-step-card, article');
        const title = card ? card.querySelector('h2, h3, .resource-title')?.textContent?.trim() : 'IELTS Full Test';
        const titleEl = modal.querySelector('#testLaunchTitle');
        if (titleEl && title) titleEl.textContent = title;

        modal.classList.add('show');
      });
    };

    mountTestLaunchModal();
  };

  if (!token) {
    // Mount pre-flight modal for guest users too
    const guestLaunchModal = () => {
      const modal = document.createElement('div');
      modal.className = 'test-launch-modal';
      modal.id = 'testLaunchModal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'testLaunchTitle');

      modal.innerHTML = `
        <div class="test-launch-card">
          <div class="test-launch-header">
            <div>
              <span class="eyebrow" style="font-size:11px;font-weight:800;letter-spacing:0.08em;color:var(--v4-blue);text-transform:uppercase;">TEST INITIATION</span>
              <h2 id="testLaunchTitle">IELTS Reading Full Test</h2>
              <p style="margin:0;font-size:13px;color:var(--v4-muted);">Review exam guidelines and choose your preferred practice mode.</p>
            </div>
            <button type="button" class="test-launch-close" id="testLaunchClose" aria-label="Close dialog">&times;</button>
          </div>

          <div class="test-launch-section">
            <span class="test-launch-section-title">INSTRUCTIONS</span>
            <ul class="test-launch-list">
              <li>Practice first without dictionaries or external assistance.</li>
              <li>After completing the exam, review your mistakes in the verified answer key.</li>
              <li>You can use answer location and explanations to understand why each answer is correct.</li>
              <li>You can use the vocabulary section to save and master new words.</li>
            </ul>
          </div>

          <div class="test-launch-section test-launch-note">
            <span class="test-launch-section-title" style="color:#d97706;">NOTE & FAIR PRACTICE</span>
            <ul class="test-launch-list">
              <li>We strongly recommend completing the exam without ChatGPT or other third-party tools.</li>
              <li>If you use a study tool, copy only the specific sentence or short excerpt you need.</li>
              <li>Do not copy entire transcripts or question sets, or take repeated screenshots of test content.</li>
              <li>Normal note-taking and copying a small excerpt for review are allowed.</li>
            </ul>
          </div>

          <div class="test-launch-section">
            <span class="test-launch-section-title">CHOOSE EXAM MODE</span>
            <div class="test-mode-grid">
              <label class="test-mode-card selected" id="cardModeReal">
                <span class="test-mode-badge real">
                  <span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px">verified</span>
                  <span>100% Real Exam Interface</span>
                </span>
                <div class="test-mode-card-title-row">
                  <input type="radio" name="testExamMode" value="real" class="test-mode-radio" checked>
                  <h3>Real Exam Mode</h3>
                </div>
                <p class="test-mode-desc">Practice in an exact copy of the real computer-based exam interface with official split pane, timed countdown, and CDI highlight & notes.</p>
              </label>

              <label class="test-mode-card" id="cardModePractice">
                <span class="test-mode-badge practice">
                  <span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px">tune</span>
                  <span>Daily Practice Interface</span>
                </span>
                <div class="test-mode-card-title-row">
                  <input type="radio" name="testExamMode" value="practice" class="test-mode-radio">
                  <h3>Practice Mode</h3>
                </div>
                <p class="test-mode-desc">Practice in the comfortable daily practice interface — easier to navigate, built for daily drills with flexible section checking.</p>
              </label>
            </div>
          </div>

          <div class="test-launch-actions">
            <button type="button" id="startTestFinalBtn" class="test-launch-start-btn">
              <span>Start Test</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      let currentTargetUrl = '';

      const closeDialog = () => modal.classList.remove('show');
      modal.querySelector('#testLaunchClose')?.addEventListener('click', closeDialog);
      modal.addEventListener('click', e => { if (e.target === modal) closeDialog(); });

      const realCard = modal.querySelector('#cardModeReal');
      const practiceCard = modal.querySelector('#cardModePractice');
      const realRadio = modal.querySelector('input[value="real"]');
      const practiceRadio = modal.querySelector('input[value="practice"]');

      realCard?.addEventListener('click', () => {
        realRadio.checked = true;
        realCard.classList.add('selected');
        practiceCard.classList.remove('selected');
      });

      practiceCard?.addEventListener('click', () => {
        practiceRadio.checked = true;
        practiceCard.classList.add('selected');
        realCard.classList.remove('selected');
      });

      modal.querySelector('#startTestFinalBtn')?.addEventListener('click', () => {
        if (!currentTargetUrl) return;
        const selectedMode = practiceRadio?.checked ? 'practice' : 'real';
        const url = new URL(currentTargetUrl, location.origin);
        url.searchParams.set('mode', selectedMode);
        location.assign(url.href);
      });

      document.addEventListener('click', e => {
        const link = e.target.closest('a[href*="/english/reading-exam"], a[href*="/english/exam"], a[href*="/english/listening-exam"]');
        if (!link || link.href.includes('review=true') || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        currentTargetUrl = link.href;
        const card = link.closest('.resource, .course-card, .next-step-card, article');
        const title = card ? card.querySelector('h2, h3, .resource-title')?.textContent?.trim() : 'IELTS Full Test';
        const titleEl = modal.querySelector('#testLaunchTitle');
        if (titleEl && title) titleEl.textContent = title;
        modal.classList.add('show');
      });
    };
    guestLaunchModal();
    return;
  }

  // Global Premium Upgrade Modal
  window.showUpgradeModal = function() {
    let modal = document.querySelector('#ieltsUpgradeModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ieltsUpgradeModal';
      modal.innerHTML = `
        <div class="upgrade-modal-backdrop" style="position:fixed;inset:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;">
          <div class="upgrade-modal-card" style="background:#ffffff;border-radius:16px;max-width:580px;width:100%;padding:32px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);position:relative;max-height:90vh;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
            <button id="closeUpgradeModal" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer;">✕</button>
            <div style="text-align:center;margin-bottom:24px;">
              <span style="display:inline-block;padding:4px 12px;border-radius:20px;background:#fef3c7;color:#d97706;font-weight:800;font-size:12px;margin-bottom:8px;">★ IELTS CORE PREMIUM</span>
              <h2 style="font-size:24px;font-weight:800;color:#0f172a;margin:0 0 8px 0;">Unlock Unlimited IELTS Prep</h2>
              <p style="font-size:14px;color:#64748b;margin:0;">Get full access to all 40+ computer-delivered tests, verified explanations, and advanced Band score diagnostics.</p>
            </div>
            
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:12px;margin-bottom:24px;">
              <div style="border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;background:#f8fafc;">
                <div style="font-size:12px;font-weight:700;color:#64748b;">1 OY (1 MONTH)</div>
                <div style="font-size:20px;font-weight:800;color:#0f172a;margin:6px 0;">30 000 UZS</div>
                <small style="color:#64748b;">Boshlangʻich narx</small>
              </div>
              <div style="border:2px solid #e11d48;border-radius:12px;padding:16px;text-align:center;background:#fff1f2;position:relative;">
                <span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#e11d48;color:#fff;font-size:9.5px;font-weight:800;padding:2px 8px;border-radius:10px;">ENG OMMABOP</span>
                <div style="font-size:12px;font-weight:700;color:#e11d48;">3 OY (3 MONTHS)</div>
                <div style="font-size:20px;font-weight:800;color:#0f172a;margin:6px 0;">75 000 UZS</div>
                <small style="color:#e11d48;font-weight:700;">25 000 / oy</small>
              </div>
              <div style="border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;background:#f8fafc;">
                <div style="font-size:12px;font-weight:700;color:#64748b;">6 OY (6 MONTHS)</div>
                <div style="font-size:20px;font-weight:800;color:#0f172a;margin:6px 0;">135 000 UZS</div>
                <small style="color:#64748b;">Eng foydali</small>
              </div>
            </div>

            <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin-bottom:20px;">
              <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">HAVE AN ACTIVATION PROMO CODE?</label>
              <div style="display:flex;gap:8px;">
                <input id="modalPromoCodeInput" type="text" placeholder="e.g. IELTS9, CORE2026" style="flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;font-weight:700;text-transform:uppercase;">
                <button id="modalApplyCodeBtn" style="padding:8px 16px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Activate</button>
              </div>
              <p id="modalPromoMessage" style="margin:6px 0 0 0;font-size:12px;"></p>
            </div>

            <div style="text-align:center;">
              <a href="https://t.me/ieltscoreadmin" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;background:#e11d48;color:#fff;border-radius:10px;font-weight:700;text-decoration:none;font-size:14.5px;">
                <span>Get Instant Access via Telegram (@ieltscoreadmin)</span>
                <span>→</span>
              </a>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeUpgrade = () => {
        modal.style.display = 'none';
      };

      modal.querySelector('#closeUpgradeModal')?.addEventListener('click', closeUpgrade);
      modal.addEventListener('click', e => {
        if (e.target.classList.contains('upgrade-modal-backdrop') || e.target === modal) closeUpgrade();
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.style.display !== 'none') closeUpgrade();
      });

      const applyPromo = async () => {
        const token = localStorage.getItem('vortex-english-token');
        if (!token) {
          alert('Please log in first to redeem a promo code.');
          return location.href = '/english/login?next=' + encodeURIComponent(location.pathname);
        }
        const codeInput = modal.querySelector('#modalPromoCodeInput');
        const msgEl = modal.querySelector('#modalPromoMessage');
        const code = (codeInput.value || '').trim().toUpperCase();
        if (!code) return;
        msgEl.textContent = 'Checking code...';
        msgEl.style.color = '#64748b';
        try {
          const res = await fetch('/api/student/redeem-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('vortex-english-token')}` },
            body: JSON.stringify({ code })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Invalid code');
          msgEl.textContent = data.message || 'Premium activated successfully.';
          msgEl.style.color = '#059669';
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          msgEl.textContent = err.message;
          msgEl.style.color = '#dc2626';
        }
      };

      modal.querySelector('#modalApplyCodeBtn')?.addEventListener('click', applyPromo);
      modal.querySelector('#modalPromoCodeInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyPromo();
        }
      });
    }
    modal.style.display = 'block';
  };

  fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      const publicLanding = location.pathname === '/english' || location.pathname === '/english/';
      if (publicLanding) {
        location.replace('/english/materials');
        return;
      }
        mountMemberSidebar(data.user);
        if (data.user.plan === 'premium') {
          document.body.classList.add('user-is-premium');
          document.documentElement.classList.add('user-is-premium');
          document.querySelectorAll('.vx-top-notification-banner, #vxHeroBanner, .vx-hero-banner-card, .upgrade-banner, .member-sidebar-pro-card').forEach(el => {
            el.style.display = 'none';
          });
        }
        
        const guestActions = document.querySelector('[data-guest]');
        const memberActions = document.querySelector('[data-member]');
        if (guestActions && memberActions) {
          guestActions.hidden = true;
          memberActions.hidden = false;
          const name = document.querySelector('#memberName');
          if (name) name.textContent = ((data.user?.name || data.user?.username || 'Account').trim()).split(' ')[0] || 'Account';
        } else {
          const actions = document.querySelector('.app-actions');
          if (actions) {
            actions.replaceChildren();
            const account = document.createElement('a');
            account.className = 'plain-link'; account.href = '/english/account'; account.textContent = ((data.user?.name || data.user?.username || 'Account').trim()).split(' ')[0] || 'Account';
            actions.append(account);
            if (data.user.role === 'teacher') {
              const teacherLink = document.createElement('a');
              teacherLink.className = 'button secondary'; teacherLink.href = '/english/teacher'; teacherLink.textContent = 'Teacher Desk';
              teacherLink.style.marginLeft = '8px';
              actions.append(teacherLink);
            }
            if (location.pathname !== '/english/account' && location.pathname !== '/english/teacher') {
              const continueLink = document.createElement('a');
              continueLink.className = 'button primary'; continueLink.href = data.user.role === 'teacher' ? '/english/teacher' : '/english/account'; continueLink.textContent = data.user.role === 'teacher' ? 'Workspace' : 'My progress';
              actions.append(continueLink);
            }
          }
        }
      })
      .catch(() => {
        localStorage.removeItem('vortex-english-token');
        localStorage.removeItem('vortex-english-student');
      });
})();
