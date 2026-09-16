// IELTS Core Predictions Hub JS
(function () {
  'use strict';

  const token = localStorage.getItem('vortex-english-token');
  const cardsGrid = document.getElementById('predictionsCardsGrid');
  const catalogTitle = document.getElementById('predCatalogTitle');
  const tabsContainer = document.getElementById('predictionTabs');

  let allPredictions = [];
  let currentFilter = 'all';

  async function loadPredictions() {
    try {
      const res = await fetch('/api/predictions-catalog', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        throw new Error('Failed to fetch predictions catalog: ' + res.status);
      }

      allPredictions = await res.json();
      updateTabCounts(allPredictions);
      renderGrid();
    } catch (err) {
      console.error('Error loading predictions:', err);
      if (cardsGrid) {
        cardsGrid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:48px 20px;">
            <span class="material-symbols-outlined" style="font-size:48px;color:#ef4444;margin-bottom:12px;">error</span>
            <h3 style="font-size:18px;margin-bottom:8px;">Could not load Prediction Tests</h3>
            <p style="color:#64748b;font-size:14px;max-width:400px;margin:0 auto 20px;">Please check your connection or reload the page.</p>
            <button class="button primary" onclick="location.reload()">Retry</button>
          </div>`;
      }
    }
  }

  function updateTabCounts(list) {
    const counts = { all: list.length, '1': 0, '2': 0, '3': 0, '4': 0 };
    list.forEach(p => {
      const pKey = String(p.part);
      if (counts[pKey] !== undefined) counts[pKey]++;
    });

    const setBadge = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setBadge('tabCountAll', counts.all);
    setBadge('tabCountP1', counts['1']);
    setBadge('tabCountP2', counts['2']);
    setBadge('tabCountP3', counts['3']);
    setBadge('tabCountP4', counts['4']);
  }

  function renderGrid() {
    if (!cardsGrid) return;

    let filtered = allPredictions;
    if (currentFilter !== 'all') {
      filtered = allPredictions.filter(p => String(p.part) === currentFilter);
    }

    if (catalogTitle) {
      if (currentFilter === 'all') {
        catalogTitle.textContent = `All Listening Prediction Tests (${filtered.length})`;
      } else {
        catalogTitle.textContent = `Part ${currentFilter} Prediction Tests (${filtered.length})`;
      }
    }

    if (filtered.length === 0) {
      cardsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:48px 20px;">
          <span class="material-symbols-outlined" style="font-size:48px;color:#94a3b8;margin-bottom:12px;">info</span>
          <h3 style="font-size:18px;margin-bottom:8px;">No predictions in this section</h3>
          <p style="color:#64748b;font-size:14px;">Select another part from the filters above.</p>
        </div>`;
      return;
    }

    cardsGrid.innerHTML = filtered.map(item => {
      const crownIcon = `<svg style="display:inline-block;vertical-align:-2px;margin-left:4px;" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.735H5.81a1 1 0 0 1-.957-.735L2.02 6.02a.5.5 0 0 1 .798-.52l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`;
      const examUrl = `/english/prediction-exam?id=${encodeURIComponent(item.id)}`;

      return `
        <article class="mock-card">
          <div class="mock-card-top">
            <span class="mock-code-tag">
              <span class="material-symbols-outlined" style="font-size:14px;">headphones</span>
              PART ${item.part}
            </span>
            <span class="mock-status-pill premium">
              PREMIUM ${crownIcon}
            </span>
          </div>

          <div class="mock-card-body">
            <h3 class="mock-card-title">${escapeHtml(item.title)}</h3>
            <p class="pred-card-topic">${escapeHtml(item.topic || 'Authentic Exam Sitting')}</p>

            <div class="pred-card-features">
              <div class="pred-feat-item">
                <span class="material-symbols-outlined">format_list_numbered</span>
                <span><strong>${item.questionCount || 10} Questions</strong> (CDI Formats)</span>
              </div>
              <div class="pred-feat-item">
                <span class="material-symbols-outlined">schedule</span>
                <span><strong>~${item.durationMinutes || 10} min</strong> timed practice</span>
              </div>
              <div class="pred-feat-item">
                <span class="material-symbols-outlined">fact_check</span>
                <span>Auto-checked with instant answers &amp; script</span>
              </div>
            </div>
          </div>

          <div class="mock-card-actions">
            <a href="${examUrl}" class="pred-btn-start">
              <span>Start Prediction Test</span>
              <span class="material-symbols-outlined" style="font-size:18px;">arrow_forward</span>
            </a>
          </div>
        </article>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initTabs() {
    if (!tabsContainer) return;
    tabsContainer.addEventListener('click', e => {
      const btn = e.target.closest('.pred-tab-btn');
      if (!btn) return;

      tabsContainer.querySelectorAll('.pred-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentFilter = btn.getAttribute('data-part') || 'all';
      renderGrid();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadPredictions();
  });
})();
