(() => {
  const token = localStorage.getItem('vortex-english-token');
  const tabs = document.querySelectorAll('.billing-tab');
  const cards = document.querySelectorAll('[data-plan-card]');

  // Tab Cycle Switcher
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const cycle = tab.dataset.cycle;
      cards.forEach(card => {
        if (card.dataset.planCard === cycle) {
          card.classList.add('featured');
        } else {
          card.classList.remove('featured');
        }
      });
    });
  });

  // Select Pricing Tier
  window.selectPricingTier = (cycle, price) => {
    if (typeof window.showUpgradeModal === 'function') {
      window.showUpgradeModal();
    } else {
      location.href = `https://t.me/ieltscoreadmin?text=${encodeURIComponent(`Salom! IELTS Core platformasida ${cycle} oylik (${price.toLocaleString()} UZS) Premium tarifini sotib olmoqchiman.`)}`;
    }
  };

  // Promo Code Redemption Form
  const promoForm = document.getElementById('pricingPromoForm');
  const promoInput = document.getElementById('pricingPromoInput');
  const promoFeedback = document.getElementById('pricingPromoFeedback');
  const promoBtn = document.getElementById('pricingPromoBtn');

  if (promoForm && promoInput && promoFeedback) {
    promoForm.addEventListener('submit', async event => {
      event.preventDefault();
      const code = promoInput.value.trim();
      if (!code) return;

      if (!token) {
        promoFeedback.hidden = false;
        promoFeedback.className = 'promo-feedback error';
        promoFeedback.innerHTML = 'Promo-kodni faollashtirish uchun avval <a href="/english/login?next=/english/pricing" style="color:inherit;text-decoration:underline;font-weight:800;">tizimga kiring</a> yoki <a href="/english/signup?next=/english/pricing" style="color:inherit;text-decoration:underline;font-weight:800;">roʻyxatdan oʻting</a>.';
        return;
      }

      promoBtn.disabled = true;
      promoBtn.textContent = 'Tekshirilmoqda…';

      try {
        const response = await fetch('/api/student/redeem-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ code })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Ushbu promo-kod notoʻgʻri yoki muddati tugagan.');
        }

        promoFeedback.hidden = false;
        promoFeedback.className = 'promo-feedback success';
        promoFeedback.innerHTML = `🎉 <strong>Tabriklaymiz!</strong> ${escapeHtml(data.message || 'Premium muvaffaqiyatli faollashtirildi!')} <a href="/english/account" style="color:inherit;text-decoration:underline;margin-left:8px;font-weight:800;">Dashboardga oʻtish →</a>`;
        promoInput.value = '';
      } catch (error) {
        promoFeedback.hidden = false;
        promoFeedback.className = 'promo-feedback error';
        promoFeedback.textContent = error.message;
      } finally {
        promoBtn.disabled = false;
        promoBtn.innerHTML = '<span>Faollashtirish</span> <span aria-hidden="true">→</span>';
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
