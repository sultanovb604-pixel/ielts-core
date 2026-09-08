(() => {
  const token = localStorage.getItem('vortex-english-token');
  // Select Pricing Tier
  window.selectPricingTier = (cycle, price) => {
    const message = `Hello! I would like the ${cycle}-month IELTS Core Premium plan (${price.toLocaleString('en-US')} UZS). Please confirm payment details.`;
    location.href = `https://t.me/ieltscoreadmin?text=${encodeURIComponent(message)}`;
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
        promoFeedback.innerHTML = 'To apply a promo code, <a href="/english/login?next=/english/pricing" style="color:inherit;text-decoration:underline;font-weight:800;">sign in</a> or <a href="/english/signup?next=/english/pricing" style="color:inherit;text-decoration:underline;font-weight:800;">create an account</a>.';
        return;
      }

      promoBtn.disabled = true;
      promoBtn.textContent = 'Checking…';

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
          throw new Error(data.error || 'This promo code is invalid or has expired.');
        }

        promoFeedback.hidden = false;
        promoFeedback.className = 'promo-feedback success';
        promoFeedback.innerHTML = `<strong>Code applied.</strong> ${escapeHtml(data.message || 'Premium access is ready.')} <a href="/english/account" style="color:inherit;text-decoration:underline;margin-left:8px;font-weight:800;">Open dashboard →</a>`;
        promoInput.value = '';
      } catch (error) {
        promoFeedback.hidden = false;
        promoFeedback.className = 'promo-feedback error';
        promoFeedback.textContent = error.message;
      } finally {
        promoBtn.disabled = false;
        promoBtn.innerHTML = '<span>Apply code</span> <span aria-hidden="true">→</span>';
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
