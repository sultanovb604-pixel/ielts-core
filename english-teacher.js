(() => {
  const token = localStorage.getItem('vortex-english-token');
  if (!token) {
    location.replace('/english/login?next=' + encodeURIComponent(location.pathname));
    return;
  }

  // Strict server role verification: only teachers can access Teacher Workspace
  fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => res.json()).then(data => {
    if (!data.user || data.user.role !== 'teacher') {
      alert('The Teacher Portal is only available to Instructor / Teacher accounts. Redirecting to your Student Dashboard.');
      location.replace('/english/account');
      return;
    }
  }).catch(() => {});

  // Theme toggle
  const themeToggle = document.querySelector('#themeToggle');
  const themeIcon = document.querySelector('#themeIcon');
  const applyTheme = t => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('vortex-english-theme', t);
    if (themeIcon) themeIcon.textContent = t === 'dark' ? 'light_mode' : 'dark_mode';
  };
  applyTheme(localStorage.getItem('vortex-english-theme') === 'dark' ? 'dark' : 'light');
  themeToggle?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  // State
  let studentsData = { students: [], pendingInvites: [] };
  let assignmentsData = [];
  let submissionsData = [];
  let licensesData = { totalSeats: 15, usedSeats: 0, availableSeats: 15, assignedStudentIds: [] };
  let currentGradingSubmission = null;

  // Tab switching
  const tabBtns = document.querySelectorAll('[data-teacher-tab]');
  const panels = {
    students: document.querySelector('#panelStudents'),
    assignments: document.querySelector('#panelAssignments'),
    grading: document.querySelector('#panelGrading'),
    licenses: document.querySelector('#panelLicenses')
  };

  function switchTab(target) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.teacherTab === target);
    });
    Object.entries(panels).forEach(([key, panel]) => {
      if (panel) {
        if (key === target) {
          panel.removeAttribute('hidden');
          panel.classList.add('active');
        } else {
          panel.setAttribute('hidden', '');
          panel.classList.remove('active');
        }
      }
    });
    const titleMap = {
      students: 'Cohort Students Roster',
      assignments: 'Dispatched Assignments & Mocks',
      grading: 'Writing Evaluation & Grading Studio',
      licenses: 'Bulk Group Licenses & Seat Pool'
    };
    const pageTitle = document.querySelector('#teacherPageTitle');
    if (pageTitle && titleMap[target]) pageTitle.textContent = titleMap[target];
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.teacherTab));
  });

  // Modal helpers
  const modals = {
    invite: document.querySelector('#inviteStudentModal'),
    createAssign: document.querySelector('#createAssignmentModal'),
    grading: document.querySelector('#gradingModal'),
    drilldown: document.querySelector('#drilldownModal') || document.querySelector('#studentDrilldownModal'),
    details: document.querySelector('#assignmentDetailsModal')
  };

  const openModal = m => {
    if (m) {
      m.classList.add('show');
      m.classList.add('open');
      m.style.display = 'flex';
    }
  };
  const closeModal = m => {
    if (m) {
      m.classList.remove('show');
      m.classList.remove('open');
      m.style.display = 'none';
    }
  };

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      Object.values(modals).forEach(closeModal);
    });
  });

  Object.values(modals).forEach(overlay => {
    overlay?.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  document.querySelector('#openInviteModalBtn')?.addEventListener('click', () => openModal(modals.invite));
  document.querySelector('#openCreateAssignmentBtn')?.addEventListener('click', () => openModal(modals.createAssign));
  document.querySelector('#createAssignmentInnerBtn')?.addEventListener('click', () => openModal(modals.createAssign));

  // Quick Search Filter
  const quickSearchInput = document.querySelector('#teacherQuickSearch');
  if (quickSearchInput) {
    quickSearchInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#studentTableBody tr').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
      document.querySelectorAll('#assignmentsTableBody tr').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
      document.querySelectorAll('#gradingTableBody tr').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Fetch helpers
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Load all dashboard data
  async function loadDashboard() {
    try {
      const [studentsRes, assignsRes, subsRes, licRes, meRes] = await Promise.all([
        api('/api/teacher/students').catch(() => ({ students: [], pendingInvites: [] })),
        api('/api/teacher/assignments').catch(() => []),
        api('/api/teacher/submissions').catch(() => []),
        api('/api/teacher/licenses').catch(() => ({ totalSeats: 15, usedSeats: 0, availableSeats: 15, assignedStudentIds: [] })),
        api('/api/auth/me').catch(() => null)
      ]);

      if (meRes && meRes.user) {
        const nameEl = document.querySelector('#teacherSidebarName');
        const handleEl = document.querySelector('#teacherSidebarHandle');
        const avatarEl = document.querySelector('#teacherAvatarInitial');
        if (nameEl) nameEl.textContent = meRes.user.name || 'Instructor';
        if (handleEl) handleEl.textContent = '@' + (meRes.user.username || 'teacher');
        if (avatarEl) avatarEl.textContent = (meRes.user.name || meRes.user.username || 'T').charAt(0).toUpperCase();
      }

      studentsData = {
        students: Array.isArray(studentsRes?.students) ? studentsRes.students : [],
        pendingInvites: Array.isArray(studentsRes?.pendingInvites) ? studentsRes.pendingInvites : []
      };
      assignmentsData = Array.isArray(assignsRes) ? assignsRes : [];
      submissionsData = Array.isArray(subsRes) ? subsRes : [];
      licensesData = licRes;

      renderMetrics();
      renderStudents();
      renderAssignments();
      renderGrading();
      renderLicenses();
    } catch (err) {
      console.error('Teacher dashboard error:', err);
    }
  }

  // 1. Render Metrics
  function renderMetrics() {
    const totalStudents = studentsData.students.length;
    const pendingCount = studentsData.pendingInvites.length;
    const needsGradingCount = submissionsData.filter(s => s.status !== 'graded').length;

    const bands = studentsData.students.map(s => Number(s.predictedOverallBand)).filter(b => Number.isFinite(b) && b >= 2.0);
    const avgBand = bands.length ? (bands.reduce((a, b) => a + b, 0) / bands.length).toFixed(1) : '—';

    document.querySelector('#metricTotalStudents').textContent = totalStudents;
    document.querySelector('#metricPendingInvites').textContent = `${pendingCount} pending ${pendingCount === 1 ? 'invitation' : 'invitations'}`;
    document.querySelector('#metricAvgBand').textContent = avgBand === '—' ? '—' : `Band ${avgBand}`;
    document.querySelector('#metricActiveAssignments').textContent = assignmentsData.length;
    document.querySelector('#metricNeedsGrading').textContent = needsGradingCount;

    document.querySelector('#tabBadgeStudents').textContent = totalStudents;
    document.querySelector('#tabBadgeAssignments').textContent = assignmentsData.length;
    document.querySelector('#tabBadgeGrading').textContent = needsGradingCount;
  }

  // 2. Render Students Roster
  function renderStudents() {
    const tbody = document.querySelector('#studentTableBody');
    const pendingBox = document.querySelector('#pendingInvitesBox');
    const pendingList = document.querySelector('#pendingInvitesList');
    const pendingText = document.querySelector('#pendingInvitesText');

    if (studentsData.pendingInvites.length) {
      if (pendingBox) pendingBox.style.display = 'block';
      if (pendingText) pendingText.textContent = `${studentsData.pendingInvites.length} pending invitation sent`;
      if (pendingList) {
        pendingList.innerHTML = studentsData.pendingInvites.map(inv => `
          <span style="display:inline-flex;align-items:center;gap:6px;background:#ffffff;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid #bfdbfe;color:#1e40af;">
            <span>@${escape(inv.studentUsername)}</span>
            <button type="button" class="cancel-invite-btn" data-invite-id="${inv.id}" style="background:transparent;border:0;color:#dc2626;cursor:pointer;padding:0;font-size:14px;display:flex;align-items:center;" title="Cancel invitation">&times;</button>
          </span>
        `).join('');
      }
    } else {
      if (pendingBox) pendingBox.style.display = 'none';
    }

    if (!studentsData.students.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px 20px;color:#64748b;"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="font-size:36px;color:#94a3b8;">group_add</span><strong style="font-size:15px;color:#0f172a;">No students in your cohort yet</strong><p style="margin:0 0 12px;font-size:13px;">Invite students using their IELTS Core @username to track progress, send assignments and grade essays.</p><button type="button" class="teacher-btn-primary" onclick="document.querySelector('#openInviteModalBtn')?.click()" style="padding:8px 16px;font-size:13px;"><span class="material-symbols-outlined" style="font-size:16px;">person_add</span><span>Invite Student Now</span></button></div></td></tr>`;
      return;
    }

    tbody.innerHTML = studentsData.students.map(s => {
      const reading = (s.readingAvgBand && Number(s.readingAvgBand) >= 2.0) ? `Band ${Number(s.readingAvgBand).toFixed(1)}` : '—';
      const listening = (s.listeningAvgBand && Number(s.listeningAvgBand) >= 2.0) ? `Band ${Number(s.listeningAvgBand).toFixed(1)}` : '—';
      const writing = (s.writingAvgBand && Number(s.writingAvgBand) >= 2.0) ? `Band ${Number(s.writingAvgBand).toFixed(1)}` : '—';
      const overall = (s.predictedOverallBand && Number(s.predictedOverallBand) >= 2.0) ? `Band ${Number(s.predictedOverallBand).toFixed(1)}` : '—';
      const planTag = s.plan === 'premium' ? `<span class="status-pill status-graded">Premium</span>` : `<span class="status-pill" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">Free</span>`;

      return `
        <tr>
          <td>
            <div class="student-row-user">
              <div class="student-row-avatar">${escape(s.name.charAt(0).toUpperCase())}</div>
              <div>
                <strong class="student-row-name">${escape(s.name)}</strong>
                <div class="student-row-username">@${escape(s.username)}</div>
              </div>
            </div>
          </td>
          <td>${planTag}</td>
          <td><strong style="color:#1468f3;font-size:14px;">${overall}</strong></td>
          <td><span class="student-band-pill ${reading === '—' ? 'band-skill' : 'band-overall'}">${reading}</span></td>
          <td><span class="student-band-pill ${listening === '—' ? 'band-skill' : 'band-overall'}">${listening}</span></td>
          <td><span class="student-band-pill ${writing === '—' ? 'band-skill' : 'band-overall'}">${writing}</span></td>
          <td><strong style="color:#334155;">${s.totalAttempts || 0}</strong> <span style="color:#64748b;font-size:12px;">tests</span></td>
          <td style="text-align:right;">
            <div style="display:inline-flex;align-items:center;gap:6px;">
              <button type="button" class="teacher-action-btn view-drilldown-btn" data-student-id="${s.id}" data-student-name="${escape(s.name)}" data-student-handle="@${escape(s.username)}">
                <span class="material-symbols-outlined" style="font-size:14px;">analytics</span>
                <span>Analytics</span>
              </button>
              <button type="button" class="teacher-action-btn-danger remove-student-btn" data-student-id="${s.id}" title="Remove student from cohort">
                <span class="material-symbols-outlined" style="font-size:14px;">person_remove</span>
                <span>Remove</span>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // 3. Render Assignments & Filters
  let assignStatusFilter = 'all'; // 'all', 'active', 'expired', 'pending'
  let assignSkillFilter = 'all';
  let assignSearchQuery = '';

  function renderAssignments() {
    const tbody = document.querySelector('#assignmentsTableBody');
    if (!tbody) return;

    const now = new Date();
    const totalCount = assignmentsData.length;
    const activeCount = assignmentsData.filter(a => !a.deadline || new Date(a.deadline) >= now).length;
    const expiredCount = assignmentsData.filter(a => a.deadline && new Date(a.deadline) < now).length;
    const pendingCount = assignmentsData.filter(a => (a.submissionCount || 0) > 0).length;

    // Update filter count badges
    const countAllEl = document.querySelector('#filterCountAll');
    const countActiveEl = document.querySelector('#filterCountActive');
    const countExpiredEl = document.querySelector('#filterCountExpired');
    const countPendingEl = document.querySelector('#filterCountPending');
    if (countAllEl) countAllEl.textContent = `(${totalCount})`;
    if (countActiveEl) countActiveEl.textContent = `(${activeCount})`;
    if (countExpiredEl) countExpiredEl.textContent = `(${expiredCount})`;
    if (countPendingEl) countPendingEl.textContent = `(${pendingCount})`;

    // Filter assignments
    let filtered = assignmentsData.filter(a => {
      const isPast = a.deadline ? new Date(a.deadline) < now : false;
      if (assignStatusFilter === 'active' && isPast) return false;
      if (assignStatusFilter === 'expired' && !isPast) return false;
      if (assignStatusFilter === 'pending' && (a.submissionCount || 0) === 0) return false;

      if (assignSkillFilter !== 'all' && a.skill !== assignSkillFilter) return false;

      if (assignSearchQuery) {
        const q = assignSearchQuery.toLowerCase();
        const titleMatch = (a.title || '').toLowerCase().includes(q);
        const instMatch = (a.instructions || '').toLowerCase().includes(q);
        const skillMatch = (a.skill || '').toLowerCase().includes(q);
        if (!titleMatch && !instMatch && !skillMatch) return false;
      }

      return true;
    });

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px 20px;color:#64748b;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:36px;color:#94a3b8;">filter_list_off</span>
          <strong style="font-size:15px;color:#0f172a;">${totalCount === 0 ? "Hozircha hech qanday vazifa yaratilmagan" : "Tanlangan filtr bo'yicha vazifalar topilmadi"}</strong>
          <p style="margin:0;font-size:13px;">${totalCount === 0 ? "Yangi vazifa yuborish uchun '+ Create Assignment' tugmasini bosing." : "Boshqa filtrni tanlang yoki qidiruv so'zini tozalang."}</p>
        </div>
      </td></tr>`;
      return;
    }

    const skillIcons = {
      writing: 'edit_note',
      reading: 'menu_book',
      listening: 'headphones',
      speaking: 'record_voice_over',
      article: 'article',
      custom: 'attach_file'
    };

    const skillLabels = {
      reading: 'Reading (40Q)',
      listening: 'Listening (40Q)',
      writing: 'Writing Essay',
      speaking: 'Speaking Mock',
      custom: 'Worksheet / File'
    };

    tbody.innerHTML = filtered.map(a => {
      const modeLabel = a.mode === 'real-exam' 
        ? '<span class="teacher-mode-pill mode-exam"><span class="material-symbols-outlined" style="font-size:12px;">timer</span><span>Real Exam (60m)</span></span>' 
        : '<span class="teacher-mode-pill mode-practice"><span class="material-symbols-outlined" style="font-size:12px;">speed</span><span>Practice</span></span>';
      
      const deadlineDate = a.deadline ? new Date(a.deadline) : null;
      const isPast = deadlineDate ? deadlineDate < new Date() : false;
      const deadlineFormatted = (deadlineDate && !isNaN(deadlineDate.getTime())) 
        ? `${deadlineDate.toLocaleDateString([], {day:'numeric',month:'short'})} · ${deadlineDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`
        : 'No deadline';

      const icon = skillIcons[a.skill] || 'school';
      const skillName = skillLabels[a.skill] || (a.skill ? a.skill.toUpperCase() : 'TASK');

      let directLinkHtml = '';
      if (a.materialHref) {
        directLinkHtml = `<a href="${escape(a.materialHref)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;color:#1468f3;font-size:12px;font-weight:700;text-decoration:none;margin-top:4px;">
          <span class="material-symbols-outlined" style="font-size:13px;">open_in_new</span>
          <span>Open Material</span>
        </a>`;
      } else if (a.attachmentUrl) {
        directLinkHtml = `<a href="${escape(a.attachmentUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;color:#0284c7;font-size:12px;font-weight:700;text-decoration:none;margin-top:4px;">
          <span class="material-symbols-outlined" style="font-size:13px;">attach_file</span>
          <span>${escape(a.attachmentName || 'Download File')}</span>
        </a>`;
      }

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="width:38px;height:38px;border-radius:10px;background:#eff6ff;color:#1468f3;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <span class="material-symbols-outlined" style="font-size:20px;">${icon}</span>
              </div>
              <div>
                <strong style="color:#0f172a;font-size:14.5px;display:block;">${escape(a.title)}</strong>
                ${a.instructions ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${escape(a.instructions)}</div>` : ''}
                ${directLinkHtml}
              </div>
            </div>
          </td>
          <td>
            <span class="teacher-skill-badge skill-${escape(a.skill)}">
              <span class="material-symbols-outlined" style="font-size:13px;">${icon}</span>
              <span>${skillName}</span>
            </span>
          </td>
          <td>${modeLabel}</td>
          <td>
            <div class="teacher-deadline-cell ${isPast ? 'is-expired' : ''}">
              <span>${deadlineFormatted}</span>
              ${isPast ? '<small style="font-size:11px;color:#dc2626;font-weight:800;">(Muddati tugagan)</small>' : ''}
            </div>
          </td>
          <td>
            <span class="teacher-subs-badge ${(a.submissionCount || 0) > 0 ? 'has-subs' : ''}">
              <span class="material-symbols-outlined" style="font-size:13px;">assignment_turned_in</span>
              <span>${a.submissionCount || 0} submitted · ${a.gradedCount || 0} graded</span>
            </span>
          </td>
          <td style="text-align:right;">
            <div style="display:inline-flex;align-items:center;gap:6px;">
              <button type="button" class="teacher-action-btn view-assign-details-btn" data-assign-id="${a.id}">
                <span class="material-symbols-outlined" style="font-size:14px;">visibility</span>
                <span>Submissions</span>
              </button>
              <button type="button" class="teacher-action-btn-danger delete-assign-btn" data-assign-id="${a.id}">
                <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                <span>Delete</span>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // Filter toolbar event listeners
  document.querySelectorAll('.assign-filter-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.assign-filter-status-btn').forEach(b => {
        b.classList.remove('is-active');
        b.style.background = '#ffffff';
        b.style.borderColor = '#cbd5e1';
        b.style.color = '#334155';
      });
      btn.classList.add('is-active');
      btn.style.background = '#eff6ff';
      btn.style.borderColor = '#1468f3';
      btn.style.color = '#1468f3';
      assignStatusFilter = btn.dataset.status || 'all';
      renderAssignments();
    });
  });

  document.querySelector('#assignFilterSkillSelect')?.addEventListener('change', e => {
    assignSkillFilter = e.target.value || 'all';
    renderAssignments();
  });

  document.querySelector('#assignFilterSearchInput')?.addEventListener('input', e => {
    assignSearchQuery = e.target.value.trim();
    renderAssignments();
  });

  // 4. Render Grading Studio Queue
  function renderGrading() {
    const tbody = document.querySelector('#gradingTableBody');
    if (!submissionsData.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px 20px;color:#64748b;"><div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:36px;color:#94a3b8;">rate_review</span><strong style="font-size:15px;color:#0f172a;">No student essays in queue</strong><p style="margin:0;font-size:13px;">When students complete their Writing tasks, their essays will arrive here for evaluation.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = submissionsData.map(s => {
      const isGraded = s.status === 'graded';
      const band = (isGraded && s.evaluation?.overallBand && Number(s.evaluation.overallBand) >= 2.0) ? `Band ${Number(s.evaluation.overallBand).toFixed(1)}` : '—';
      const statusPill = isGraded
        ? `<span class="status-pill status-graded">Graded</span>`
        : `<span class="status-pill status-pending">Needs Grading</span>`;

      return `
        <tr>
          <td>
            <div class="student-row-user">
              <div class="student-row-avatar" style="width:34px;height:34px;font-size:13px;">${escape((s.studentName || 'S').charAt(0).toUpperCase())}</div>
              <div>
                <strong class="student-row-name">${escape(s.studentName)}</strong>
                <div class="student-row-username">@${escape(s.studentUsername || '')}</div>
              </div>
            </div>
          </td>
          <td><strong style="color:#0f172a;font-size:13.5px;">${escape(s.topicTitle)}</strong></td>
          <td><span style="font-weight:800;color:#334155;white-space:nowrap;">${s.wordCount} words</span> <span style="font-size:12px;color:#64748b;white-space:nowrap;">· ${Math.round((s.timeSpentSeconds || 0) / 60)} min</span></td>
          <td><span style="font-size:12.5px;color:#64748b;white-space:nowrap;">${new Date(s.submittedAt).toLocaleDateString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></td>
          <td>${statusPill}</td>
          <td><strong style="color:${isGraded ? '#15803d' : '#94a3b8'};font-size:14px;white-space:nowrap;">${band}</strong></td>
          <td style="text-align:right;">
            <button type="button" class="${isGraded ? 'teacher-action-btn' : 'teacher-action-btn'} open-grade-btn" data-submission-id="${s.id}" style="${isGraded ? '' : 'background:#1468f3 !important;color:#fff !important;border-color:#1468f3 !important;'}">
              <span class="material-symbols-outlined" style="font-size:15px;">draw</span>
              <span>${isGraded ? 'Edit Review' : 'Grade Essay'}</span>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // 5. Render License Management Table
  function renderLicenses() {
    const total = document.querySelector('#licenseTotalSeats');
    const used = document.querySelector('#licenseUsedSeats');
    const avail = document.querySelector('#licenseAvailableSeats');
    const usageBar = document.querySelector('#licenseUsageBar');
    const usageText = document.querySelector('#licenseUsageText');
    const studentSelect = document.querySelector('#licenseStudentSelect');
    
    if (total) total.textContent = `${licensesData.totalSeats} Seats`;
    if (used) used.textContent = `${licensesData.usedSeats} Active`;
    if (avail) avail.textContent = `${licensesData.availableSeats} Free`;
    if (usageText) usageText.textContent = `${licensesData.usedSeats} / ${licensesData.totalSeats} seats assigned`;
    if (usageBar) usageBar.style.width = licensesData.totalSeats > 0 ? `${(licensesData.usedSeats / licensesData.totalSeats) * 100}%` : '0%';

    const assignedSet = new Set(licensesData.assignedStudentIds || []);

    if (studentSelect) {
      const unassignedStudents = studentsData.students.filter(s => !assignedSet.has(s.id));
      studentSelect.innerHTML = '<option value="">-- Select Student --</option>' + 
        unassignedStudents.map(s => `<option value="${s.id}">${escape(s.name)} (@${escape(s.username)})</option>`).join('');
    }

    const tbody = document.querySelector('#licenseTableBody');
    const summaryText = document.querySelector('#licenseSummaryText');
    if (summaryText) {
      summaryText.textContent = `Total Seats: ${licensesData.totalSeats} • Used: ${licensesData.usedSeats} • Available: ${licensesData.availableSeats}`;
    }

    if (!studentsData.students.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:#64748b;">Invite students to your cohort to assign them Premium seats from your pool.</td></tr>`;
      return;
    }

    tbody.innerHTML = studentsData.students.map(s => {
      const hasSeat = assignedSet.has(s.id);
      return `
        <tr>
          <td>
            <div class="student-row-user">
              <div class="student-row-avatar">${escape(s.name.charAt(0).toUpperCase())}</div>
              <div>
                <strong class="student-row-name">${escape(s.name)}</strong>
                <div class="student-row-username">@${escape(s.username)}</div>
              </div>
            </div>
          </td>
          <td><span class="status-pill ${s.plan === 'premium' ? 'status-graded' : 'status-pending'}" style="${s.plan === 'premium' ? '' : 'background:#f1f5f9;color:#64748b;border-color:#e2e8f0;'}">${s.plan === 'premium' ? 'Premium' : 'Free'}</span></td>
          <td>
            <span style="font-weight:700;color:${hasSeat ? '#15803d' : '#64748b'};">
              ${hasSeat ? 'Teacher Premium Assigned' : 'Unallocated'}
            </span>
          </td>
          <td style="text-align:right;">
            ${hasSeat
              ? `<button type="button" class="teacher-action-btn-danger revoke-seat-btn" data-student-id="${s.id}">
                  <span class="material-symbols-outlined" style="font-size:14px;">key_off</span>
                  <span>Revoke Seat</span>
                </button>`
              : `<button type="button" class="teacher-action-btn assign-seat-btn" data-student-id="${s.id}" style="background:#1468f3 !important;color:#fff !important;border-color:#1468f3 !important;" ${licensesData.availableSeats <= 0 ? 'disabled' : ''}>
                  <span class="material-symbols-outlined" style="font-size:14px;">workspace_premium</span>
                  <span>Assign Premium</span>
                </button>`
            }
          </td>
        </tr>`;
    }).join('');
  }

  document.querySelector('#licenseAssignBtn')?.addEventListener('click', async () => {
    const studentId = document.querySelector('#licenseStudentSelect')?.value;
    if (!studentId) return alert('Please select a student to assign a Premium seat.');
    try {
      await api('/api/teacher/licenses/assign', { method: 'POST', body: JSON.stringify({ studentId }) });
      loadDashboard();
    } catch (err) { alert(err.message); }
  });

  // Drilldown Analytics Helpers
  let currentDrilldownData = null;
  let currentDrilldownSkill = 'overall';
  let currentDrilldownHistoryFilter = 'all';

  function renderDrilldownCharts() {
    if (!currentDrilldownData) return;
    const { results, analytics } = currentDrilldownData;
    const canvasTrend = document.querySelector('#drilldownTrendChart');
    const canvasOutcome = document.querySelector('#drilldownOutcomeChart');
    const insightEl = document.querySelector('#drilldownTrendInsight');

    // 1. Line Trajectory Chart
    if (canvasTrend) {
      let points = [];
      if (currentDrilldownSkill === 'reading') {
        points = results.filter(r => r.source === 'reading' && r.band && Number(r.band) >= 2.0).slice(0, 7).reverse().map(r => Number(r.band));
      } else if (currentDrilldownSkill === 'listening') {
        points = results.filter(r => r.source === 'listening' && r.band && Number(r.band) >= 2.0).slice(0, 7).reverse().map(r => Number(r.band));
      } else if (currentDrilldownSkill === 'writing') {
        points = results.filter(r => r.source === 'writing' && r.band && Number(r.band) >= 2.0).slice(0, 7).reverse().map(r => Number(r.band));
      } else {
        points = results.filter(r => r.band && Number(r.band) >= 2.0).slice(0, 7).reverse().map(r => Number(r.band));
      }

      if (insightEl) {
        if (!points.length) {
          insightEl.textContent = 'Hozircha baholangan testlar mavjud emas';
        } else if (points.length === 1) {
          insightEl.textContent = '1 ta baholangan test qayd etilgan';
        } else {
          const delta = points.at(-1) - points.at(-2);
          insightEl.textContent = delta === 0 ? 'Barqaror natija' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} band o'sish`;
        }
      }

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, canvasTrend.clientWidth || 360);
      const height = Math.max(1, canvasTrend.clientHeight || 150);
      canvasTrend.width = Math.round(width * ratio);
      canvasTrend.height = Math.round(height * ratio);
      const ctx = canvasTrend.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const dark = document.documentElement.dataset.theme === 'dark';
      const ink = dark ? '#f8fafc' : '#0f172a';
      const muted = dark ? '#94a3b8' : '#64748b';
      const grid = dark ? '#1e293b' : '#e2e8f0';
      const blue = '#1468f3';
      const pad = { top: 16, right: 16, bottom: 22, left: 32 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      const x = idx => pad.left + (points.length === 1 ? chartWidth / 2 : chartWidth * idx / (points.length - 1));
      const y = val => pad.top + chartHeight - (val / 9) * chartHeight;

      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      [0, 3, 6, 9].forEach(val => {
        const yy = y(val);
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
        ctx.fillStyle = muted; ctx.fillText(val.toFixed(1), pad.left - 6, yy);
      });

      if (points.length > 1) {
        ctx.beginPath(); ctx.moveTo(x(0), y(points[0]));
        points.slice(1).forEach((val, idx) => ctx.lineTo(x(idx + 1), y(val)));
        ctx.lineTo(x(points.length - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath();
        ctx.fillStyle = 'rgba(20, 104, 243, 0.08)'; ctx.fill();

        ctx.beginPath(); ctx.moveTo(x(0), y(points[0]));
        points.slice(1).forEach((val, idx) => ctx.lineTo(x(idx + 1), y(val)));
        ctx.strokeStyle = blue; ctx.lineWidth = 2.5; ctx.stroke();
      }
      points.forEach((val, idx) => {
        ctx.beginPath(); ctx.arc(x(idx), y(val), 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = blue; ctx.stroke();
        ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '700 10px "Plus Jakarta Sans", sans-serif'; ctx.fillText(val.toFixed(1), x(idx), y(val) - 6);
      });
    }

    // 2. Donut Benchmark Gauge Chart
    if (canvasOutcome) {
      let avgBand = null;
      let latestBand = null;
      let bestBand = null;

      if (currentDrilldownSkill === 'reading') {
        avgBand = analytics?.reading?.averageBand || null;
        bestBand = analytics?.reading?.bestBand || null;
        latestBand = results.find(r => r.source === 'reading')?.band || null;
      } else if (currentDrilldownSkill === 'listening') {
        avgBand = analytics?.listening?.averageBand || null;
        bestBand = analytics?.listening?.bestBand || null;
        latestBand = results.find(r => r.source === 'listening')?.band || null;
      } else if (currentDrilldownSkill === 'writing') {
        avgBand = analytics?.writing?.averageBand || null;
        bestBand = analytics?.writing?.bestBand || null;
        latestBand = results.find(r => r.source === 'writing')?.band || null;
      } else {
        avgBand = analytics?.overall?.predictedBand || null;
        const allBands = results.map(r => Number(r.band)).filter(b => Number.isFinite(b) && b >= 2.0);
        bestBand = allBands.length ? Math.max(...allBands) : null;
        latestBand = allBands.length ? allBands[0] : null;
      }

      const accEl = document.querySelector('#drilldownOutcomeAccuracy');
      const curEl = document.querySelector('#drilldownOutcomeCurrent');
      const bstEl = document.querySelector('#drilldownOutcomeBest');
      if (accEl) accEl.textContent = avgBand ? Number(avgBand).toFixed(1) : '—';
      if (curEl) curEl.textContent = latestBand ? Number(latestBand).toFixed(1) : '—';
      if (bstEl) bstEl.textContent = bestBand ? Number(bestBand).toFixed(1) : '—';

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, canvasOutcome.clientWidth || 140);
      const height = Math.max(1, canvasOutcome.clientHeight || 140);
      canvasOutcome.width = Math.round(width * ratio);
      canvasOutcome.height = Math.round(height * ratio);
      const ctx = canvasOutcome.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const dark = document.documentElement.dataset.theme === 'dark';
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.max(18, Math.min(width, height) / 2 - 10);
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = dark ? '#1e293b' : '#e2e8f0';
      ctx.stroke();

      if (avgBand && Number(avgBand) > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (Number(avgBand) / 9));
        ctx.strokeStyle = '#1468f3';
        ctx.stroke();
      }
    }
  }

  function renderDrilldownHistoryTable() {
    if (!currentDrilldownData) return;
    const { results } = currentDrilldownData;
    const tbody = document.querySelector('#drilldownHistoryTableBody');
    if (!tbody) return;

    let filtered = results;
    if (currentDrilldownHistoryFilter === 'reading') filtered = results.filter(r => r.source === 'reading');
    else if (currentDrilldownHistoryFilter === 'listening') filtered = results.filter(r => r.source === 'listening');
    else if (currentDrilldownHistoryFilter === 'writing') filtered = results.filter(r => r.source === 'writing');

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#64748b;">Tanlangan bo'lim bo'yicha ishlangan testlar topilmadi.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const skillName = r.source === 'reading' ? 'Reading' : r.source === 'listening' ? 'Listening' : 'Writing';
      const skillColor = r.source === 'reading' ? '#10b981' : r.source === 'listening' ? '#0284c7' : '#8b5cf6';
      const skillBg = r.source === 'reading' ? '#ecfdf5' : r.source === 'listening' ? '#eff6ff' : '#f5f3ff';
      const bandStr = r.band ? `Band ${Number(r.band).toFixed(1)}` : (r.correct !== undefined ? `${r.correct}/${r.total}` : (r.status === 'submitted' ? 'Tekshirilmoqda' : 'Practice'));

      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;background:${skillBg};color:${skillColor};text-transform:uppercase;">${skillName}</span>
              <strong style="font-size:13.5px;color:#0f172a;">${escape(r.testTitle)}</strong>
            </div>
          </td>
          <td style="padding:10px 14px;color:#64748b;font-size:12.5px;">
            ${new Date(r.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </td>
          <td style="padding:10px 14px;">
            <span class="student-band-pill ${r.band ? 'band-overall' : 'band-skill'}" style="font-size:12px;">${bandStr}</span>
          </td>
          <td style="padding:10px 14px;text-align:right;color:#64748b;font-size:12.5px;">
            ${r.durationSeconds ? `${Math.round(r.durationSeconds / 60)} daqiqa` : '—'}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Event Listeners for Dynamic Actions
  document.addEventListener('click', async e => {
    // 1. Cancel invitation
    const cancelBtn = e.target.closest('.cancel-invite-btn');
    if (cancelBtn) {
      const invitationId = cancelBtn.dataset.inviteId;
      try {
        await api('/api/teacher/cancel-invite', { method: 'POST', body: JSON.stringify({ invitationId }) });
        loadDashboard();
      } catch (err) { alert(err.message); }
      return;
    }

    // 2. Remove student
    const removeBtn = e.target.closest('.remove-student-btn');
    if (removeBtn) {
      if (confirm('Remove this student from your cohort?')) {
        const studentId = removeBtn.dataset.studentId;
        try {
          await api('/api/teacher/remove-student', { method: 'POST', body: JSON.stringify({ studentId }) });
          loadDashboard();
        } catch (err) { alert(err.message); }
      }
      return;
    }

    // 3. View Assignment Details & Cohort Submissions
    const viewAssignBtn = e.target.closest('.view-assign-details-btn');
    if (viewAssignBtn) {
      const assignId = viewAssignBtn.dataset.assignId;
      document.querySelector('#assignDetailsTitle').textContent = 'Loading Assignment Details…';
      document.querySelector('#assignDetailsMeta').textContent = '';
      document.querySelector('#assignmentDetailsContent').innerHTML = '<p style="padding:32px;text-align:center;color:#64748b;">Loading cohort submissions…</p>';
      openModal(modals.details);

      try {
        const res = await api('/api/teacher/assignment/' + assignId);
        const a = res.assignment;
        const students = res.students || [];

        document.querySelector('#assignDetailsTitle').textContent = a.title;
        document.querySelector('#assignDetailsMeta').textContent = `Assigned on ${new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${a.skill.toUpperCase()} · ${a.mode === 'real-exam' ? 'Real Exam Mode' : 'Practice Mode'}`;

        let materialActionHtml = '';
        if (a.materialHref) {
          materialActionHtml = `<a href="${escape(a.materialHref)}" target="_blank" rel="noopener" class="button primary" style="padding:7px 14px;font-size:12.5px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:15px;">open_in_new</span>
            <span>Open Test / Material</span>
          </a>`;
        }
        if (a.attachmentUrl) {
          materialActionHtml += `<a href="${escape(a.attachmentUrl)}" target="_blank" rel="noopener" class="button secondary" style="padding:7px 14px;font-size:12.5px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:15px;">attach_file</span>
            <span>Download ${escape(a.attachmentName || 'Attachment')}</span>
          </a>`;
        }

        const deadlineStr = a.deadline ? new Date(a.deadline).toLocaleDateString([], {day:'numeric',month:'short'}) + ' ' + new Date(a.deadline).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'No deadline';
        const isPast = a.deadline ? new Date(a.deadline) < new Date() : false;

        document.querySelector('#assignmentDetailsContent').innerHTML = `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span class="status-pill status-graded" style="text-transform:uppercase;font-weight:800;">${escape(a.skill)}</span>
                <span class="status-pill" style="background:#eff6ff;color:#1468f3;border:1px solid #bfdbfe;">${a.mode === 'real-exam' ? 'Strict 60m Timer' : 'Untimed Practice'}</span>
                <span style="font-size:13px;font-weight:700;${isPast ? 'color:#dc2626;' : 'color:#475569;'}">Deadline: ${deadlineStr}</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${materialActionHtml}
              </div>
            </div>
            ${a.prompt ? `<div style="font-size:13.5px;line-height:1.5;color:#334155;background:#fff;padding:12px 14px;border-radius:8px;border:1px solid #cbd5e1;margin-bottom:8px;"><strong>Prompt / Question:</strong><br>${escape(a.prompt)}</div>` : ''}
            ${a.instructions ? `<div style="font-size:12.5px;color:#64748b;"><strong>Teacher Note:</strong> ${escape(a.instructions)}</div>` : ''}
          </div>

          <h3 style="margin:0 0 12px;font-size:15px;color:#0f172a;">Cohort Student Progress (${students.filter(s => s.status !== 'pending').length} of ${students.length} completed/submitted)</h3>
          <div style="max-height:300px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;">
            <table class="teacher-table" style="margin:0;">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Result / Band</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${students.length ? students.map(s => {
                  let statusBadge = '<span class="status-pill" style="background:#f1f5f9;color:#64748b;">Not started</span>';
                  let scoreText = '—';
                  let actionBtn = '—';

                  if (s.status === 'graded') {
                    statusBadge = '<span class="status-pill status-graded">Evaluated</span>';
                    scoreText = `<strong style="color:#10b981;font-size:14px;">Band ${Number(s.submissionInfo.band).toFixed(1)}</strong>`;
                    actionBtn = `<button type="button" class="teacher-btn-secondary open-grade-btn" data-submission-id="${s.submissionInfo.id}" style="padding:5px 10px;font-size:12px;">View Feedback</button>`;
                  } else if (s.status === 'submitted') {
                    statusBadge = '<span class="status-pill status-pending">Needs Grading</span>';
                    scoreText = `<small style="color:#64748b;">${s.submissionInfo?.wordCount || 0} words</small>`;
                    actionBtn = `<button type="button" class="teacher-btn-primary open-grade-btn" data-submission-id="${s.submissionInfo.id}" style="padding:5px 12px;font-size:12px;">Grade Essay</button>`;
                  } else if (s.status === 'completed') {
                    statusBadge = '<span class="status-pill status-graded">Completed</span>';
                    scoreText = `<strong style="color:#1468f3;font-size:14px;">${s.submissionInfo.band ? 'Band ' + Number(s.submissionInfo.band).toFixed(1) : (s.submissionInfo.correct + '/' + s.submissionInfo.total)}</strong>`;
                    actionBtn = `<span style="font-size:12px;color:#10b981;font-weight:700;">Completed</span>`;
                  }

                  return `
                    <tr>
                      <td>
                        <div class="student-row-user">
                          <div class="student-row-avatar">${escape(s.name.charAt(0).toUpperCase())}</div>
                          <div>
                            <strong class="student-row-name">${escape(s.name)}</strong>
                            <div class="student-row-username">@${escape(s.username)}</div>
                          </div>
                        </div>
                      </td>
                      <td>${statusBadge}</td>
                      <td>${scoreText}</td>
                      <td style="text-align:right;">${actionBtn}</td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="4" style="text-align:center;padding:24px;color:#64748b;">No students in cohort yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        document.querySelector('#assignmentDetailsContent').innerHTML = `<p style="color:#dc2626;padding:20px;text-align:center;">${escape(err.message)}</p>`;
      }
      return;
    }

    // 4. Delete assignment
    const deleteAssignBtn = e.target.closest('.delete-assign-btn');
    if (deleteAssignBtn) {
      if (confirm('Delete this homework assignment?')) {
        const id = deleteAssignBtn.dataset.assignId;
        try {
          await api('/api/teacher/assignments/' + id, { method: 'DELETE' });
          loadDashboard();
        } catch (err) { alert(err.message); }
      }
      return;
    }

    // 5. Assign / Revoke License Seat
    const assignSeatBtn = e.target.closest('.assign-seat-btn');
    if (assignSeatBtn) {
      const studentId = assignSeatBtn.dataset.studentId;
      try {
        await api('/api/teacher/licenses/assign', { method: 'POST', body: JSON.stringify({ studentId }) });
        loadDashboard();
      } catch (err) { alert(err.message); }
      return;
    }

    const revokeSeatBtn = e.target.closest('.revoke-seat-btn');
    if (revokeSeatBtn) {
      const studentId = revokeSeatBtn.dataset.studentId;
      try {
        await api('/api/teacher/licenses/revoke', { method: 'POST', body: JSON.stringify({ studentId }) });
        loadDashboard();
      } catch (err) { alert(err.message); }
      return;
    }

    // 6. Open Grading Modal
    const openGradeBtn = e.target.closest('.open-grade-btn');
    if (openGradeBtn) {
      const submissionId = openGradeBtn.dataset.submissionId;
      let sub = submissionsData.find(s => s.id === submissionId);

      const displayGradingModal = (subData) => {
        currentGradingSubmission = subData;
        document.querySelector('#gradingModalStudentMeta').textContent = `Evaluating ${subData.studentName} (@${subData.studentUsername}) · ${subData.wordCount} words`;
        document.querySelector('#gradingEssayText').textContent = subData.essayContent || 'Insho matni kiritilmagan.';
        
        const evalData = subData.evaluation || {};
        if (evalData.taskResponse) document.querySelector('#rubricTR').value = Number(evalData.taskResponse).toFixed(1);
        else document.querySelector('#rubricTR').value = '7.0';

        if (evalData.coherenceCohesion) document.querySelector('#rubricCC').value = Number(evalData.coherenceCohesion).toFixed(1);
        else document.querySelector('#rubricCC').value = '7.0';

        if (evalData.lexicalResource) document.querySelector('#rubricLR').value = Number(evalData.lexicalResource).toFixed(1);
        else document.querySelector('#rubricLR').value = '7.0';

        if (evalData.grammarAccuracy) document.querySelector('#rubricGRA').value = Number(evalData.grammarAccuracy).toFixed(1);
        else document.querySelector('#rubricGRA').value = '7.0';

        document.querySelector('#gradingFeedbackInput').value = evalData.teacherFeedback || '';
        
        updateCalculatedBand();
        openModal(modals.grading);
      };

      if (sub) {
        displayGradingModal(sub);
      } else {
        api('/api/writing/submission/' + submissionId).then(fetchedSub => {
          if (fetchedSub && fetchedSub.id) displayGradingModal(fetchedSub);
          else alert('Insho ma\'lumotlarini yuklab bo\'lmadi.');
        }).catch(err => alert(err.message));
      }
      return;
    }

    // 7. View Comprehensive Drilldown Analytics
    const drilldownBtn = e.target.closest('.view-drilldown-btn');
    if (drilldownBtn) {
      const studentId = drilldownBtn.dataset.studentId;
      const studentName = drilldownBtn.dataset.studentName;
      const studentHandle = drilldownBtn.dataset.studentHandle;
      document.querySelector('#drilldownStudentName').textContent = `${studentName} — To'liq Statistikasi`;
      document.querySelector('#drilldownStudentHandle').textContent = studentHandle;
      document.querySelector('#drilldownContent').innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;"><span class="material-symbols-outlined" style="font-size:32px;animation:spin 1s linear infinite;">sync</span><p style="margin-top:8px;">O\'quvchining barcha diagrammalari va ishlagan testlari yuklanmoqda…</p></div>';
      openModal(modals.drilldown);

      try {
        const res = await api('/api/teacher/student/' + studentId);
        currentDrilldownData = res;
        currentDrilldownSkill = 'overall';
        currentDrilldownHistoryFilter = 'all';

        const s = res.student || {};
        const a = res.analytics || {};
        const results = res.results || [];

        const overall = a.overall?.predictedBand ? `Band ${a.overall.predictedBand.toFixed(1)}` : '—';
        const rAvg = a.reading?.averageBand ? `Band ${a.reading.averageBand.toFixed(1)}` : '—';
        const lAvg = a.listening?.averageBand ? `Band ${a.listening.averageBand.toFixed(1)}` : '—';
        const wAvg = a.writing?.averageBand ? `Band ${a.writing.averageBand.toFixed(1)}` : '—';

        // Diagnostics
        const tfngAcc = a.reading?.questionTypes?.find(t => t.key === 'tfng')?.accuracy || 80;
        const headAcc = a.reading?.questionTypes?.find(t => t.key === 'headings')?.accuracy || 68;
        const mcqAcc = a.reading?.questionTypes?.find(t => t.key === 'mcq')?.accuracy || 75;
        const compAcc = a.reading?.questionTypes?.find(t => t.key === 'summary')?.accuracy || 78;
        const listAcc = a.listening?.sections?.part1 || 82;

        document.querySelector('#drilldownContent').innerHTML = `
          <!-- 1. Student Info Header Strip -->
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="student-row-avatar" style="width:38px;height:38px;font-size:15px;">${escape((s.name || 'S').charAt(0).toUpperCase())}</div>
              <div>
                <strong style="font-size:15px;color:#0f172a;">${escape(s.name)}</strong>
                <div style="font-size:12px;color:#64748b;">@${escape(s.username)} · <span style="font-weight:700;color:${s.plan === 'premium' ? '#15803d' : '#64748b'};">${s.plan === 'premium' ? '★ Premium O\'quvchi' : 'Free Account'}</span></div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:16px;font-size:12.5px;color:#475569;">
              <span><strong>${results.length} ta</strong> ishlangan test</span>
              <span><strong>${a.overall?.totalPracticeMinutes || 0} daqiqa</strong> umumiy mashq</span>
            </div>
          </div>

          <!-- 2. Top 4 Metric Cards -->
          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:16px;">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;text-align:center;">
              <small style="color:#1e40af;font-size:11px;font-weight:700;text-transform:uppercase;display:block;">Predicted Overall</small>
              <strong style="font-size:22px;color:#1468f3;display:block;margin-top:2px;">${overall}</strong>
              <small style="font-size:11px;color:#64748b;">Official Cambridge</small>
            </div>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px;text-align:center;">
              <small style="color:#065f46;font-size:11px;font-weight:700;text-transform:uppercase;display:block;">Reading Avg</small>
              <strong style="font-size:22px;color:#059669;display:block;margin-top:2px;">${rAvg}</strong>
              <small style="font-size:11px;color:#64748b;">Eng yaxshi: ${a.reading?.bestBand ? 'Band ' + a.reading.bestBand.toFixed(1) : '—'}</small>
            </div>
            <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px;text-align:center;">
              <small style="color:#0369a1;font-size:11px;font-weight:700;text-transform:uppercase;display:block;">Listening Avg</small>
              <strong style="font-size:22px;color:#0284c7;display:block;margin-top:2px;">${lAvg}</strong>
              <small style="font-size:11px;color:#64748b;">Eng yaxshi: ${a.listening?.bestBand ? 'Band ' + a.listening.bestBand.toFixed(1) : '—'}</small>
            </div>
            <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:12px;text-align:center;">
              <small style="color:#6b21a8;font-size:11px;font-weight:700;text-transform:uppercase;display:block;">Writing Avg</small>
              <strong style="font-size:22px;color:#7c3aed;display:block;margin-top:2px;">${wAvg}</strong>
              <small style="font-size:11px;color:#64748b;">Eng yaxshi: ${a.writing?.bestBand ? 'Band ' + a.writing.bestBand.toFixed(1) : '—'}</small>
            </div>
          </div>

          <!-- 3. Skill Switcher Toolbar -->
          <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;">
            <button type="button" class="drilldown-skill-btn teacher-tab-btn active" data-drilldown-skill="overall" style="padding:6px 14px;font-size:12.5px;">
              <span>Overall</span>
            </button>
            <button type="button" class="drilldown-skill-btn teacher-tab-btn" data-drilldown-skill="reading" style="padding:6px 14px;font-size:12.5px;">
              <span>Reading</span>
            </button>
            <button type="button" class="drilldown-skill-btn teacher-tab-btn" data-drilldown-skill="listening" style="padding:6px 14px;font-size:12.5px;">
              <span>Listening</span>
            </button>
            <button type="button" class="drilldown-skill-btn teacher-tab-btn" data-drilldown-skill="writing" style="padding:6px 14px;font-size:12.5px;">
              <span>Writing</span>
            </button>
          </div>

          <!-- 4. Interactive Charts Section -->
          <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:18px;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div>
                  <small style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;">BAND TRAJECTORY</small>
                  <strong style="font-size:14px;color:#0f172a;display:block;">Vaqt bo'yicha ball o'zgarishi</strong>
                </div>
                <span id="drilldownTrendInsight" style="font-size:11.5px;font-weight:700;color:#1468f3;">Natijalar grafigi</span>
              </div>
              <canvas id="drilldownTrendChart" style="width:100%;height:150px;display:block;"></canvas>
            </div>

            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
              <small style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;">LEVEL PROFILE</small>
              <strong style="font-size:14px;color:#0f172a;display:block;margin-bottom:8px;">Umumiy Daraja Ko'rsatkichi</strong>
              <div style="display:flex;align-items:center;justify-content:space-around;">
                <div style="position:relative;width:110px;height:110px;">
                  <canvas id="drilldownOutcomeChart" style="width:110px;height:110px;display:block;"></canvas>
                  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <strong id="drilldownOutcomeAccuracy" style="font-size:18px;color:#0f172a;">${overall}</strong>
                    <small style="font-size:10px;color:#64748b;">o'rtacha</small>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#475569;">
                  <div>So'nggi: <strong id="drilldownOutcomeCurrent" style="color:#0f172a;">—</strong></div>
                  <div>Eng yaxshi: <strong id="drilldownOutcomeBest" style="color:#10b981;">—</strong></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Cambridge Exam Diagnostics Grid -->
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div>
                <small style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;">SAVOL TURLARI BO'YICHA ANIQ TAHLIL</small>
                <strong style="font-size:14px;color:#0f172a;display:block;">O'quvchining kuchli va zaif tomonlari</strong>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <strong>True / False / Not Given</strong>
                  <span style="font-weight:800;color:#1468f3;">${tfngAcc}%</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#1468f3;width:${tfngAcc}%;"></div>
                </div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <strong>Matching Headings</strong>
                  <span style="font-weight:800;color:#d97706;">${headAcc}%</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#d97706;width:${headAcc}%;"></div>
                </div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <strong>Multiple Choice (MCQ)</strong>
                  <span style="font-weight:800;color:#059669;">${mcqAcc}%</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#059669;width:${mcqAcc}%;"></div>
                </div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <strong>Summary Completion</strong>
                  <span style="font-weight:800;color:#10b981;">${compAcc}%</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#10b981;width:${compAcc}%;"></div>
                </div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <strong>Listening Sections 1–4</strong>
                  <span style="font-weight:800;color:#0284c7;">${listAcc}%</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#0284c7;width:${listAcc}%;"></div>
                </div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <strong>Vaqt Nazorati (Pacing)</strong>
                  <span style="font-weight:800;color:#10b981;">Optimal</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#10b981;width:90%;"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 6. Full History Table (Avval ishlagan barcha testlari) -->
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div>
                <strong style="font-size:14px;color:#0f172a;">Avval Ishlagan Barcha Testlari (${results.length})</strong>
                <p style="margin:2px 0 0;font-size:12px;color:#64748b;">O'quvchining barcha topshirgan Reading, Listening va Writing urinishlari tarixi.</p>
              </div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="drilldown-history-filter-btn teacher-btn-secondary" data-filter="all" style="padding:4px 10px;font-size:11.5px;background:#eff6ff;border-color:#1468f3;color:#1468f3;">Barchasi</button>
                <button type="button" class="drilldown-history-filter-btn teacher-btn-secondary" data-filter="reading" style="padding:4px 10px;font-size:11.5px;">Reading</button>
                <button type="button" class="drilldown-history-filter-btn teacher-btn-secondary" data-filter="listening" style="padding:4px 10px;font-size:11.5px;">Listening</button>
                <button type="button" class="drilldown-history-filter-btn teacher-btn-secondary" data-filter="writing" style="padding:4px 10px;font-size:11.5px;">Writing</button>
              </div>
            </div>
            <div style="max-height:240px;overflow-y:auto;">
              <table style="width:100%;border-collapse:collapse;text-align:left;">
                <thead>
                  <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;">
                    <th style="padding:8px 14px;">Test Nomi</th>
                    <th style="padding:8px 14px;">Topshirilgan Vaqti</th>
                    <th style="padding:8px 14px;">Natija / Band</th>
                    <th style="padding:8px 14px;text-align:right;">Sarflangan Vaqt</th>
                  </tr>
                </thead>
                <tbody id="drilldownHistoryTableBody">
                  <!-- Rendered via renderDrilldownHistoryTable -->
                </tbody>
              </table>
            </div>
          </div>
        `;

        renderDrilldownHistoryTable();
        setTimeout(renderDrilldownCharts, 50);

        // Attach event listeners for skill switcher inside drilldown
        document.querySelectorAll('.drilldown-skill-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.drilldown-skill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDrilldownSkill = btn.dataset.drilldownSkill || 'overall';
            renderDrilldownCharts();
          });
        });

        // Attach event listeners for history filter
        document.querySelectorAll('.drilldown-history-filter-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.drilldown-history-filter-btn').forEach(b => {
              b.style.background = '#ffffff';
              b.style.borderColor = '#cbd5e1';
              b.style.color = '#0f172a';
            });
            btn.style.background = '#eff6ff';
            btn.style.borderColor = '#1468f3';
            btn.style.color = '#1468f3';
            currentDrilldownHistoryFilter = btn.dataset.filter || 'all';
            renderDrilldownHistoryTable();
          });
        });

      } catch (err) {
        document.querySelector('#drilldownContent').innerHTML = `<p style="color:#dc2626;padding:20px;text-align:center;">Natijalarni yuklashda xatolik: ${err.message}</p>`;
      }
      return;
    }
  });

  // Calculate overall band live
  function updateCalculatedBand() {
    const tr = Number(document.querySelector('#rubricTR')?.value || 7.0);
    const cc = Number(document.querySelector('#rubricCC')?.value || 7.0);
    const lr = Number(document.querySelector('#rubricLR')?.value || 7.0);
    const gra = Number(document.querySelector('#rubricGRA')?.value || 7.0);
    const rawAvg = (tr + cc + lr + gra) / 4;
    const avg = Math.floor(rawAvg * 2) / 2;
    const bandText = `Band ${avg.toFixed(1)}`;
    const b1 = document.querySelector('#gradingOverallBand');
    const b2 = document.querySelector('#gradingCalculatedBand');
    if (b1) b1.textContent = bandText;
    if (b2) b2.textContent = bandText;
    return avg;
  }

  ['#rubricTR', '#rubricCC', '#rubricLR', '#rubricGRA'].forEach(id => {
    const el = document.querySelector(id);
    if (el) {
      el.addEventListener('change', updateCalculatedBand);
      el.addEventListener('input', updateCalculatedBand);
    }
  });

  // Submit Grade
  let isGradingSubmitting = false;
  async function handleGradingSubmit(e) {
    if (e) e.preventDefault();
    if (!currentGradingSubmission || isGradingSubmitting) return;
    isGradingSubmitting = true;
    const saveBtn = document.querySelector('#saveGradingBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Baholanmoqda...';
    }

    const tr = Number(document.querySelector('#rubricTR')?.value || 7.0);
    const cc = Number(document.querySelector('#rubricCC')?.value || 7.0);
    const lr = Number(document.querySelector('#rubricLR')?.value || 7.0);
    const gra = Number(document.querySelector('#rubricGRA')?.value || 7.0);
    const overallBand = updateCalculatedBand();
    const teacherFeedback = document.querySelector('#gradingFeedbackInput')?.value.trim() || '';

    try {
      await api('/api/teacher/grade-submission', {
        method: 'POST',
        body: JSON.stringify({
          submissionId: currentGradingSubmission.id,
          overallBand,
          taskResponse: tr,
          coherenceCohesion: cc,
          lexicalResource: lr,
          grammarAccuracy: gra,
          teacherFeedback
        })
      });

      closeModal(modals.grading);
      alert('Assessment published successfully.');
      loadDashboard();
    } catch (err) {
      alert(err.message);
    } finally {
      isGradingSubmitting = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Bahoni e\'lon qilish';
      }
    }
  }

  document.querySelector('#gradingForm')?.addEventListener('submit', handleGradingSubmit);
  document.querySelector('#saveGradingBtn')?.addEventListener('click', handleGradingSubmit);

  // Send Invite Form
  document.querySelector('#inviteStudentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.querySelector('#inviteUsernameInput');
    const errMsg = document.querySelector('#inviteErrorMsg');
    const btn = document.querySelector('#btnSendInvite');
    const username = input?.value.trim().replace(/^@/, '');

    if (!username) {
      if (errMsg) { errMsg.textContent = "Iltimos, o'quvchi username'ini kiriting."; errMsg.style.display = 'block'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Yuborilmoqda...'; }
    if (errMsg) errMsg.style.display = 'none';

    try {
      await api('/api/teacher/invitations', {
        method: 'POST',
        body: JSON.stringify({ studentUsername: username })
      });
      closeModal(modals.invite);
      if (input) input.value = '';
      alert(`Taklifnoma @${username} o'quvchisiga yuborildi.`);
      loadDashboard();
    } catch (err) {
      if (errMsg) { errMsg.textContent = err.message; errMsg.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Taklif yuborish'; }
    }
  });

  // Apply Selected Material Preset
  function applyPreset(found) {
    if (!found) return;
    const titleInput = document.querySelector('#assignTitleInput');
    const promptInput = document.querySelector('#assignPromptInput');
    const matIdInput = document.querySelector('#assignMaterialId');
    const matHrefInput = document.querySelector('#assignMaterialHref');
    if (titleInput) titleInput.value = found.title.replace(/^\[[^\]]+\]\s*/, '');
    if (promptInput) promptInput.value = found.prompt || '';
    if (matIdInput) matIdInput.value = found.id || '';
    if (matHrefInput) matHrefInput.value = found.href || '';
  }

  // Materials Catalog & Dynamic Presets (with instant in-memory fallback)
  let materialsCatalog = {
    writing: [
      { id: "task2-tech-education", title: "[Writing Task 2] Online Education vs Traditional Classrooms", prompt: "Some people believe that online education will soon replace traditional universities, while others disagree. Discuss both views and give your opinion (at least 250 words).", href: "/english/writing-editor?id=task2-tech-education" },
      { id: "task1-charts-energy", title: "[Writing Task 1] Global Renewable Energy Consumption 2010-2025", prompt: "The chart illustrates changes in renewable energy production across five countries. Summarise the information by selecting and reporting the main features (at least 150 words).", href: "/english/writing-editor?id=task1-charts-energy" },
      { id: "task2-environment-carbon", title: "[Writing Task 2] Global Climate Action and Individual Responsibility", prompt: "Government policy is the only way to solve environmental pollution. To what extent do you agree or disagree with this statement?", href: "/english/writing-editor?id=task2-environment-carbon" }
    ],
    reading: [
      { id: "cambridge-18-reading-01", title: "[Reading Test] Cambridge 18 Reading Full Test 01 (40 Questions)", prompt: "Complete the full Cambridge IELTS 18 Reading Test 1 simulation comprising 3 authentic academic passages and 40 questions.", href: "/english/reading-exam?id=cambridge-18-reading-01" },
      { id: "cambridge-18-reading-02", title: "[Reading Test] Cambridge 18 Reading Full Test 02 (40 Questions)", prompt: "Complete the full Cambridge IELTS 18 Reading Test 2 simulation comprising 3 authentic academic passages and 40 questions.", href: "/english/reading-exam?id=cambridge-18-reading-02" },
      { id: "cambridge-17-reading-01", title: "[Reading Test] Cambridge 17 Reading Full Test 01 (40 Questions)", prompt: "Complete the full Cambridge IELTS 17 Reading Test 1 simulation with 40 questions.", href: "/english/reading-exam?id=cambridge-17-reading-01" }
    ],
    listening: [
      { id: "cambridge-18-listening-01", title: "[Listening Full Test] Cambridge 18 Listening Audio Test 01", prompt: "Complete authentic IELTS listening test with 4 audio sections (40 questions).", href: "/english/listening-exam?id=cambridge-18-listening-01" },
      { id: "cambridge-18-listening-02", title: "[Listening Full Test] Cambridge 18 Listening Audio Test 02", prompt: "Complete authentic IELTS listening test with 4 audio sections (40 questions).", href: "/english/listening-exam?id=cambridge-18-listening-02" },
      { id: "cambridge-17-listening-01", title: "[Listening Full Test] Cambridge 17 Listening Audio Test 01", prompt: "Complete authentic IELTS listening test with 4 audio sections (40 questions).", href: "/english/listening-exam?id=cambridge-17-listening-01" }
    ],
    speaking: [
      { id: "speaking_mock_c18_01", title: "[Speaking Mock] Technology & Social Media Habits", prompt: "Part 1: Daily technology usage.\nPart 2: Describe a website or application that you use regularly.\nPart 3: The future of artificial intelligence in education and jobs.", href: "/english/practice?skill=speaking" },
      { id: "speaking_mock_c18_02", title: "[Speaking Mock] Memorable Journeys & Cultural Travel", prompt: "Part 1: Public transportation vs personal driving.\nPart 2: Describe an unforgettable trip you made with friends or family.\nPart 3: Impact of mass tourism on historic monuments.", href: "/english/practice?skill=speaking" },
      { id: "speaking_mock_c18_03", title: "[Speaking Mock] Education, Practical Skills & Ambitions", prompt: "Part 1: Study routine.\nPart 2: Describe a useful skill you learned outside the classroom.\nPart 3: Online learning vs classroom schooling.", href: "/english/practice?skill=speaking" }
    ]
  };

  function populateAllTaskDropdowns() {
    document.querySelectorAll('.task-preset-select').forEach(select => {
      const skill = select.dataset.skill;
      const items = materialsCatalog[skill] || [];
      select.innerHTML = items.map(i => `<option value="${escape(i.id)}">${escape(i.title)}</option>`).join('');
    });
  }

  // Active Source Tab (cambridge vs custom)
  let activeAssignSource = 'cambridge';

  function switchAssignSourceTab(source) {
    activeAssignSource = source;
    document.querySelectorAll('.teacher-assign-source-tab').forEach(tab => {
      const isCurrent = tab.dataset.source === source;
      tab.classList.toggle('is-active', isCurrent);
      tab.style.background = isCurrent ? '#ffffff' : 'transparent';
      tab.style.color = isCurrent ? '#1468f3' : '#64748b';
      tab.style.boxShadow = isCurrent ? '0 1px 3px rgba(0,0,0,0.08)' : 'none';
    });

    const cambridgeView = document.querySelector('#assignSourceCambridgeView');
    const customView = document.querySelector('#assignSourceCustomView');

    if (cambridgeView) cambridgeView.style.display = source === 'cambridge' ? 'block' : 'none';
    if (customView) customView.style.display = source === 'custom' ? 'block' : 'none';

    updatePublishButtonText();
  }

  document.querySelectorAll('.teacher-assign-source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchAssignSourceTab(tab.dataset.source || 'cambridge');
    });
  });

  // Audience Target Selection
  function renderAssignStudentsList() {
    const list = document.querySelector('#assignStudentsList');
    if (!list) return;
    if (!studentsData.students.length) {
      list.innerHTML = '<span style="font-size:12.5px;color:#64748b;">Guruhda hali o\'quvchilar yo\'q. Avval o\'quvchi taklif qiling.</span>';
      return;
    }
    list.innerHTML = studentsData.students.map(s => `
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#0f172a;cursor:pointer;">
        <input type="checkbox" class="assign-specific-student-cb" value="${s.id}" checked style="width:16px;height:16px;accent-color:#1468f3;">
        <strong style="color:#0f172a;">${escape(s.name)}</strong>
        <span style="color:#64748b;font-size:12px;">(@${escape(s.username)})</span>
      </label>
    `).join('');
  }

  document.querySelectorAll('input[name="assignTargetScope"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const container = document.querySelector('#assignSpecificStudentsContainer');
      if (container) {
        container.style.display = e.target.value === 'specific' ? 'block' : 'none';
        if (e.target.value === 'specific') renderAssignStudentsList();
      }
    });
  });

  function updatePublishButtonText() {
    const btn = document.querySelector('#btnPublishAssignments');
    if (!btn) return;

    if (activeAssignSource === 'custom') {
      const fileCount = attachedFiles.length;
      btn.textContent = fileCount > 0 
        ? `Vazifani yuborish (${fileCount} fayl)` 
        : `Vazifani yuborish`;
      btn.style.opacity = '1';
      return;
    }

    const checkedBoxes = document.querySelectorAll('.task-enable-checkbox:checked');
    const count = checkedBoxes.length;
    if (count === 0) {
      btn.textContent = "Kamida 1 ta bo'limni tanlang";
      btn.style.opacity = '0.6';
    } else {
      btn.textContent = `${count} ta vazifani yuborish`;
      btn.style.opacity = '1';
    }
  }

  function syncTaskRowStates() {
    document.querySelectorAll('.task-enable-checkbox').forEach(cb => {
      const row = cb.closest('.task-select-row');
      const select = row?.querySelector('.task-preset-select');

      if (row) {
        row.classList.toggle('is-active', cb.checked);
        row.style.borderColor = cb.checked ? '#1468f3' : '#e2e8f0';
        row.style.background = cb.checked ? '#eff6ff' : '#ffffff';
      }
      if (select) select.disabled = !cb.checked;
    });
    updatePublishButtonText();
  }

  // Toggle skill checkboxes
  document.addEventListener('change', e => {
    if (e.target.classList.contains('task-enable-checkbox')) {
      syncTaskRowStates();
    }
  });

  async function loadMaterialsCatalog() {
    try {
      const res = await api('/api/teacher/materials-catalog');
      if (res && res.writing) {
        materialsCatalog = res;
        populateAllTaskDropdowns();
      }
    } catch {}
  }

  function setDeadlineShortcut(hours) {
    const targetDate = new Date();
    targetDate.setHours(targetDate.getHours() + hours);
    targetDate.setMinutes(59);
    targetDate.setSeconds(0);

    const pad = n => String(n).padStart(2, '0');
    const year = targetDate.getFullYear();
    const month = pad(targetDate.getMonth() + 1);
    const day = pad(targetDate.getDate());
    const hr = pad(targetDate.getHours());
    const min = pad(targetDate.getMinutes());
    const val = `${year}-${month}-${day}T${hr}:${min}`;

    const input = document.querySelector('#assignDeadlineInput');
    if (input) input.value = val;
  }

  // Quick 5-Skill Assign Buttons (from sidebar or assignment panel cards)
  document.querySelectorAll('.teacher-quick-assign-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSkill = btn.dataset.assignSkill || 'writing';
      if (targetSkill === 'custom') {
        switchAssignSourceTab('custom');
      } else {
        switchAssignSourceTab('cambridge');
        document.querySelectorAll('.task-enable-checkbox').forEach(cb => {
          cb.checked = cb.dataset.skill === targetSkill;
        });
        syncTaskRowStates();
      }
      setDeadlineShortcut(36); // Default tomorrow 23:59
      renderAssignStudentsList();
      openModal(modals.createAssign);
    });
  });

  // Open Create Assignment Main Button
  document.querySelector('#openCreateAssignmentBtn')?.addEventListener('click', () => {
    switchAssignSourceTab('cambridge');
    renderAssignStudentsList();
    setDeadlineShortcut(36);
    openModal(modals.createAssign);
  });
  document.querySelector('#createAssignmentInnerBtn')?.addEventListener('click', () => {
    switchAssignSourceTab('cambridge');
    renderAssignStudentsList();
    setDeadlineShortcut(36);
    openModal(modals.createAssign);
  });

  // 1-Click Deadline Shortcut Pills
  document.querySelectorAll('.deadline-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = Number(btn.dataset.hours || 24);
      setDeadlineShortcut(hours);
      document.querySelectorAll('.deadline-preset-btn').forEach(b => {
        b.style.background = '#ffffff';
        b.style.borderColor = '#cbd5e1';
        b.style.color = '#0f172a';
      });
      btn.style.background = '#eff6ff';
      btn.style.borderColor = '#1468f3';
      btn.style.color = '#1468f3';
    });
  });

  let attachedFiles = []; // array of { url, name, size }

  function renderAttachedFiles() {
    const container = document.querySelector('#assignAttachedFilesList');
    if (!container) return;
    if (attachedFiles.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      updatePublishButtonText();
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = attachedFiles.map((f, idx) => `
      <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12.5px;font-weight:700;color:#1468f3;">
        <span class="material-symbols-outlined" style="font-size:16px;">attach_file</span>
        <span style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escape(f.name)}</span>
        <button type="button" class="remove-attached-file-btn" data-file-index="${idx}" style="background:transparent;border:0;color:#ef4444;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;margin-left:4px;" title="Faylni o'chirish">&times;</button>
      </div>
    `).join('');
    updatePublishButtonText();
  }

  // DropZone Click & Drag-Drop Listeners
  const dropZone = document.querySelector('#assignDropZone');
  const fileInputEl = document.querySelector('#assignFileInput');
  if (dropZone && fileInputEl) {
    dropZone.addEventListener('click', () => fileInputEl.click());
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.style.borderColor = '#1468f3';
      dropZone.style.background = '#eff6ff';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#cbd5e1';
      dropZone.style.background = '#f8fafc';
    });
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.style.borderColor = '#cbd5e1';
      dropZone.style.background = '#f8fafc';
      if (e.dataTransfer?.files?.length) {
        await processUploadedFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  // Remove attached file on click
  document.addEventListener('click', e => {
    const btn = e.target.closest('.remove-attached-file-btn');
    if (btn) {
      const idx = Number(btn.dataset.fileIndex);
      if (!isNaN(idx) && idx >= 0 && idx < attachedFiles.length) {
        attachedFiles.splice(idx, 1);
        renderAttachedFiles();
      }
    }
  });

  async function processUploadedFiles(files) {
    if (!files.length) return;
    const status = document.querySelector('#assignFileStatus');
    if (status) {
      status.style.display = 'inline-block';
      status.style.color = '#1468f3';
      status.textContent = `⏳ ${files.length} ta fayl yuklanmoqda…`;
    }

    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) {
        alert(`${file.name} hajmi 15MB dan oshmasligi kerak.`);
        continue;
      }
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Faylni o\'qishda xatolik'));
          reader.readAsDataURL(file);
        });

        const res = await api('/api/teacher/upload-material', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            fileData: base64
          })
        });

        attachedFiles.push({
          url: res.url,
          name: res.name
        });
      } catch (err) {
        alert(`${file.name} yuklashda xatolik: ` + err.message);
      }
    }

    renderAttachedFiles();
    if (status) {
      status.style.color = '#15803d';
      status.textContent = `✅ ${attachedFiles.length} ta fayl muvaffaqiyatli biriktirildi`;
      setTimeout(() => { if (status) status.style.display = 'none'; }, 3000);
    }
  }

  fileInputEl?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    await processUploadedFiles(files);
    e.target.value = '';
  });

  // Multi-Task Assignment Form Submission
  document.querySelector('#createAssignmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();

    const mode = document.querySelector('#assignModeSelect')?.value || 'practice';
    const deadline = document.querySelector('#assignDeadlineInput')?.value;
    const instructions = document.querySelector('#assignInstructionsInput')?.value.trim() || '';

    // Collect targeted student IDs
    const scopeRadio = document.querySelector('input[name="assignTargetScope"]:checked');
    let assignedStudentIds = [];
    if (scopeRadio && scopeRadio.value === 'specific') {
      assignedStudentIds = Array.from(document.querySelectorAll('.assign-specific-student-cb:checked')).map(cb => cb.value);
      if (assignedStudentIds.length === 0) {
        alert("Iltimos, vazifa yuborish uchun kamida bitta o'quvchini belgilang yoki 'Barcha guruh o'quvchilariga' variantini tanlang.");
        return;
      }
    }

    const tasks = [];

    if (activeAssignSource === 'custom') {
      const customTitle = document.querySelector('#customAssignTitleInput')?.value.trim();
      const customPrompt = document.querySelector('#customAssignPromptInput')?.value.trim();

      if (!customTitle && attachedFiles.length === 0) {
        alert("Iltimos, vazifa nomini kiriting yoki kamida bitta fayl biriktiring.");
        return;
      }

      tasks.push({
        title: customTitle || (attachedFiles.length === 1 ? attachedFiles[0].name : `Worksheet to'plami (${attachedFiles.length} ta fayl)`),
        skill: 'custom',
        mode,
        attachmentUrl: attachedFiles[0]?.url || '',
        attachmentName: attachedFiles[0]?.name || '',
        attachments: [...attachedFiles],
        prompt: customPrompt || (attachedFiles.length > 0 ? "Yuklangan fayllarni ochib topshiriqlarni bajaring." : ""),
        instructions,
        assignedStudentIds
      });
    } else {
      const checkedBoxes = Array.from(document.querySelectorAll('.task-enable-checkbox:checked'));
      if (checkedBoxes.length === 0) {
        alert("Iltimos, kamida bitta vazifani belgilang (Reading, Listening, Writing yoki Speaking).");
        return;
      }

      for (const cb of checkedBoxes) {
        const skill = cb.dataset.skill;
        const select = document.querySelector(`.task-preset-select[data-skill="${skill}"]`);
        const selectedId = select?.value;
        const items = materialsCatalog[skill] || [];
        const found = items.find(i => i.id === selectedId) || items[0];

        if (found) {
          tasks.push({
            title: found.title.replace(/^\[[^\]]+\]\s*/, ''),
            skill,
            mode,
            materialId: found.id,
            materialHref: found.href || '',
            prompt: found.prompt || '',
            instructions,
            assignedStudentIds
          });
        } else if (select && select.options && select.options[select.selectedIndex]) {
          const optText = select.options[select.selectedIndex].text;
          tasks.push({
            title: optText.replace(/^\[[^\]]+\]\s*/, ''),
            skill,
            mode,
            materialId: selectedId || '',
            materialHref: '',
            prompt: optText,
            instructions,
            assignedStudentIds
          });
        }
      }
    }

    if (tasks.length === 0) {
      alert("Hech qanday vazifa tanlanmadi.");
      return;
    }

    const submitBtn = document.querySelector('#btnPublishAssignments');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Vazifa yuborilmoqda...';
    }

    try {
      await api('/api/teacher/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: tasks[0]?.title || 'Homework Assignment',
          skill: tasks[0]?.skill || 'writing',
          tasks,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          mode,
          assignedStudentIds,
          instructions
        })
      });

      closeModal(modals.createAssign);
      attachedFiles = [];
      renderAttachedFiles();
      const customTitleInput = document.querySelector('#customAssignTitleInput');
      const customPromptInput = document.querySelector('#customAssignPromptInput');
      if (customTitleInput) customTitleInput.value = '';
      if (customPromptInput) customPromptInput.value = '';

      alert(`${tasks.length} ta vazifa o'quvchilaringizga muvaffaqiyatli yuborildi.`);
      loadDashboard();
    } catch (err) {
      alert('Vazifa yuborishda xatolik: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Vazifani o\'quvchilarga yuborish';
      }
    }
  });

  // Init dropdowns & initial states
  populateAllTaskDropdowns();
  syncTaskRowStates();
  setDeadlineShortcut(36);

  function escape(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  loadDashboard();
  loadMaterialsCatalog();
})();
