// IELTS Core Full Mock Exams Hub JS
(function () {
  'use strict';

  const token = localStorage.getItem('vortex-english-token');
  const cardsGrid = document.getElementById('mockCardsGrid');
  const historySection = document.getElementById('mockHistorySection');
  const historyGrid = document.getElementById('mockHistoryGrid');

  async function loadData() {
    try {
      const [catalogRes, attemptsRes] = await Promise.all([
        fetch('/api/mock-catalog', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }),
        fetch('/api/mock-attempts', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
      ]);

      const catalog = catalogRes.ok ? await catalogRes.json() : [];
      const attempts = attemptsRes.ok ? await attemptsRes.json() : [];

      renderHistory(attempts);
      renderCatalog(catalog);
    } catch (e) {
      console.error('Failed to load mock catalog:', e);
      if (cardsGrid) {
        cardsGrid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:40px;">
            <span class="material-symbols-outlined" style="font-size:48px;color:#ef4444;">error</span>
            <h3>Could not load Mock Exams</h3>
            <p>Please check your internet connection and reload the page.</p>
          </div>`;
      }
    }
  }

  function renderHistory(attempts) {
    if (!historySection || !historyGrid) return;
    if (!attempts || attempts.length === 0) {
      historySection.style.display = 'none';
      return;
    }

    historySection.style.display = 'block';
    historyGrid.innerHTML = attempts.map(att => {
      const dateStr = att.createdAt ? new Date(att.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
      return `
        <article class="mock-attempt-card">
          <div class="mock-attempt-top">
            <span class="mock-attempt-code">${att.mockId?.toUpperCase() || 'MOCK'}</span>
            <span class="mock-attempt-date">${dateStr}</span>
          </div>
          <div class="mock-attempt-main">
            <div class="mock-band-badge-lg">
              <span class="score-label">OVERALL</span>
              <span class="band-number">${Number(att.overallBand || 0).toFixed(1)}</span>
            </div>
            <div class="mock-attempt-info">
              <h3>${escapeHtml(att.mockTitle || 'IELTS Full Mock Test')}</h3>
              <div class="mock-scores-mini-row">
                <span class="mock-score-pill">L: Band ${Number(att.listeningBand || 0).toFixed(1)}</span>
                <span class="mock-score-pill">R: Band ${Number(att.readingBand || 0).toFixed(1)}</span>
                <span class="mock-score-pill">W: Band ${Number(att.writingBand || 0).toFixed(1)}</span>
              </div>
            </div>
          </div>
          <div class="card-action-group" style="margin-top:auto;">
            <a class="vx-card-btn vx-btn-review full-width" href="/english/mock-exam?id=${encodeURIComponent(att.mockId)}&review=1">
              <span class="material-symbols-outlined">analytics</span>
              <span>Review Detailed Breakdown</span>
            </a>
          </div>
        </article>`;
    }).join('');
  }

  function renderCatalog(catalog) {
    if (!cardsGrid) return;
    if (!catalog || catalog.length === 0) {
      cardsGrid.innerHTML = '<div class="empty-state"><p>No Mock tests available at the moment.</p></div>';
      return;
    }

    cardsGrid.innerHTML = catalog.map(item => {
      let statusBadge = item.free
        ? '<span class="mock-status-pill free">Free Mock</span>'
        : '<span class="mock-status-pill premium">Premium</span>';

      if (item.completed) {
        statusBadge = `<span class="mock-status-pill completed">Completed · Band ${Number(item.latestBand || 0).toFixed(1)}</span>`;
      }

      let actionButton = '';
      if (item.locked) {
        actionButton = `
          <div class="card-action-group">
            <button type="button" class="vx-card-btn vx-btn-unlock full-width" onclick="window.showUpgradeModal ? window.showUpgradeModal() : location.href='/english/pricing'">
              <span class="material-symbols-outlined">lock</span>
              <span>Unlock with Premium (30 000 UZS / oy)</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>`;
      } else if (item.completed) {
        actionButton = `
          <div class="card-action-group">
            <a class="vx-card-btn vx-btn-primary" href="/english/mock-exam?id=${encodeURIComponent(item.id)}">
              <span class="material-symbols-outlined">replay</span>
              <span>Retake Mock</span>
            </a>
            <a class="vx-card-btn vx-btn-review" href="/english/mock-exam?id=${encodeURIComponent(item.id)}&review=1">
              <span class="material-symbols-outlined">analytics</span>
              <span>Review</span>
            </a>
          </div>`;
      } else {
        actionButton = `
          <div class="card-action-group">
            <button type="button" class="vx-card-btn vx-btn-primary full-width" onclick="window.launchMockPreFlight('${escapeHtml(item.id)}', '${escapeHtml(item.title)}')">
              <span class="material-symbols-outlined">play_arrow</span>
              <span>Start Full Mock Exam</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>`;
      }

      return `
        <article class="mock-card">
          <div>
            <div class="mock-card-top">
              <span class="mock-code-tag"><span class="material-symbols-outlined">school</span> ${escapeHtml(item.code || 'MOCK')}</span>
              ${statusBadge}
            </div>
            <h2 class="mock-card-title">${escapeHtml(item.title)}</h2>
            <p class="mock-card-sub">${escapeHtml(item.subtitle || 'Official Computer-Delivered Simulation')}</p>

            <div class="mock-sections-list">
              <div class="mock-section-row">
                <span class="mock-section-name"><span class="material-symbols-outlined">headphones</span> Listening</span>
                <span class="mock-section-meta">${escapeHtml(item.listening?.format || '4 Parts · 40 Qs')} (~35 min)</span>
              </div>
              <div class="mock-section-row">
                <span class="mock-section-name"><span class="material-symbols-outlined">menu_book</span> Reading</span>
                <span class="mock-section-meta">${escapeHtml(item.reading?.format || '3 Passages · 40 Qs')} (60 min)</span>
              </div>
              <div class="mock-section-row">
                <span class="mock-section-name"><span class="material-symbols-outlined">edit_note</span> Writing</span>
                <span class="mock-section-meta">Task 1 &amp; Task 2 (60 min)</span>
              </div>
            </div>
          </div>
          ${actionButton}
        </article>`;
    }).join('');
  }

  window.launchMockPreFlight = function (mockId, title) {
    let modal = document.getElementById('mockPreFlightModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mockPreFlightModal';
      modal.className = 'test-launch-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="test-launch-card">
        <div class="test-launch-header">
          <div>
            <span class="eyebrow" style="font-size:11px;font-weight:800;letter-spacing:0.08em;color:var(--v4-blue);text-transform:uppercase;">EXAM INITIATION</span>
            <h2>${escapeHtml(title)}</h2>
            <p style="margin:0;font-size:13px;color:var(--v4-muted);">Authentic Cambridge Computer-Delivered IELTS Simulation</p>
          </div>
          <button type="button" class="test-launch-close" onclick="document.getElementById('mockPreFlightModal').classList.remove('active')">&times;</button>
        </div>

        <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;gap:12px;padding:14px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;font-size:13px;line-height:1.5;">
            <span class="material-symbols-outlined" style="font-size:24px;color:#1468f3;flex-shrink:0;">headphones</span>
            <div>
              <strong>Headphones & Sound Check:</strong>
              <p style="margin:2px 0 0;color:#64748b;">The Listening section will play authentic audio automatically. Please adjust your computer volume to a comfortable level.</p>
            </div>
          </div>

          <div style="display:flex;gap:12px;padding:14px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;font-size:13px;line-height:1.5;">
            <span class="material-symbols-outlined" style="font-size:24px;color:#059669;flex-shrink:0;">timer</span>
            <div>
              <strong>Exam Timing & Flow:</strong>
              <p style="margin:2px 0 0;color:#64748b;">Total exam time is approximately 2 hours and 35 minutes across 3 uninterrupted stages (Listening ➔ Reading ➔ Writing).</p>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:12px;padding:16px 24px 22px;justify-content:flex-end;border-top:1px solid #e2e8f0;">
          <button type="button" class="button secondary" style="padding:0 20px;height:42px;border-radius:10px;font-weight:700;" onclick="document.getElementById('mockPreFlightModal').classList.remove('active')">Cancel</button>
          <a href="/english/mock-exam?id=${encodeURIComponent(mockId)}" class="button primary" style="padding:0 24px;height:42px;border-radius:10px;font-weight:800;display:inline-flex;align-items:center;gap:6px;text-decoration:none;">
            <span>Begin Full Mock Exam</span>
            <span class="material-symbols-outlined" style="font-size:18px;">arrow_forward</span>
          </a>
        </div>
      </div>`;

    modal.classList.add('active');
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  loadData();
})();
