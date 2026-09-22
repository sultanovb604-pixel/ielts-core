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
      const statusBadge = '<span class="mock-status-pill soon"><span class="material-symbols-outlined" style="font-size:13px;">hourglass_top</span>Coming Soon</span>';

      const actionButton = `
        <div class="card-action-group">
          <button type="button" class="vx-card-btn vx-btn-disabled full-width" disabled title="Full Mock testlar hozirda tayyorlanmoqda">
            <span class="material-symbols-outlined">hourglass_top</span>
            <span>Coming Soon • In Preparation</span>
          </button>
        </div>`;

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
                <span class="mock-section-meta">${escapeHtml(item.listening?.format || '4 Parts &bull; 40 Qs')} (~35 min)</span>
              </div>
              <div class="mock-section-row">
                <span class="mock-section-name"><span class="material-symbols-outlined">menu_book</span> Reading</span>
                <span class="mock-section-meta">${escapeHtml(item.reading?.format || '3 Passages &bull; 40 Qs')} (60 min)</span>
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
    if (window.showToast) {
      window.showToast('Full Mock testlar hozirda tayyorlanmoqda. Tez kunda ishga tushiriladi!', 'info');
    } else {
      alert('Full Mock testlar hozirda tayyorlanmoqda. Tez kunda ishga tushiriladi!');
    }
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
