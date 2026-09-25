/**
 * IELTS Core — Interactive Pricing Reveal & Celebration Engine
 * Completely Free Platform Showcase
 */
(() => {
  // Elements
  const card = document.getElementById('pricingInteractiveCard');
  const canvas = document.getElementById('celebrationCanvas');
  const stepDots = document.querySelectorAll('[data-step-dot]');
  const stepConnectors = document.querySelectorAll('.step-connector');
  const replayBtn = document.getElementById('replayBtn');
  const token = localStorage.getItem('vortex-english-token');

  if (!card) return;

  let currentStage = 0;
  const maxStage = 5;

  // Web Audio Context for pleasant tactile sound feedback
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Play gentle rejection cue
  function playRejectionSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (_) {}
  }

  // Play joyful celebratory fanfare chime
  function playCelebrationFanfare() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.50]; // C5, E5, G5, B5, C6
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.1);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.1 + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + index * 0.1);
        osc.stop(ctx.currentTime + index * 0.1 + 0.9);
      });
    } catch (_) {}
  }

  // =========================================================================
  // Canvas Fireworks & Confetti Physics System
  // =========================================================================
  class CelebrationEngine {
    constructor(canvasEl) {
      this.canvas = canvasEl;
      this.ctx = canvasEl ? canvasEl.getContext('2d') : null;
      this.particles = [];
      this.rockets = [];
      this.animId = null;
      this.active = false;
      this.palette = [
        '#f59e0b', '#fbbf24', '#fde68a', // Gold
        '#1d4ed8', '#2563eb', '#60a5fa', // Royal Blue
        '#059669', '#10b981', '#34d399', // Emerald
        '#ef4444', '#f87171',             // Coral/Ruby
        '#ffffff'                         // Starlight White
      ];

      if (this.canvas) {
        this.resize();
        window.addEventListener('resize', () => this.resize());
      }
    }

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      if (this.ctx) {
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    launchRocket() {
      const startX = this.width * (0.2 + Math.random() * 0.6);
      const destX = this.width * (0.15 + Math.random() * 0.7);
      const destY = this.height * (0.12 + Math.random() * 0.35);
      const color = this.palette[Math.floor(Math.random() * this.palette.length)];
      
      this.rockets.push({
        x: startX,
        y: this.height + 20,
        destX,
        destY,
        vx: (destX - startX) / 32,
        vy: (destY - (this.height + 20)) / 32,
        color,
        life: 32
      });
    }

    burst(x, y, color) {
      const count = 60 + Math.floor(Math.random() * 30);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 6.5;
        const c = Math.random() > 0.3 ? color : this.palette[Math.floor(Math.random() * this.palette.length)];
        const isConfetti = Math.random() > 0.45;

        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: isConfetti ? (4 + Math.random() * 4) : (2 + Math.random() * 2.5),
          color: c,
          alpha: 1,
          decay: 0.011 + Math.random() * 0.015,
          gravity: isConfetti ? 0.1 : 0.14,
          drag: 0.965,
          isConfetti,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 14
        });
      }
    }

    start() {
      if (!this.canvas || !this.ctx) return;
      this.active = true;
      this.resize();

      // Launch an initial wave of rockets
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          if (this.active) this.launchRocket();
        }, i * 280);
      }

      // Sustained bursts for 6 seconds
      const interval = setInterval(() => {
        if (!this.active) {
          clearInterval(interval);
          return;
        }
        this.launchRocket();
      }, 550);

      setTimeout(() => {
        clearInterval(interval);
      }, 6500);

      this.loop();
    }

    loop() {
      if (!this.active && this.particles.length === 0 && this.rockets.length === 0) {
        if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
        cancelAnimationFrame(this.animId);
        return;
      }

      this.ctx.clearRect(0, 0, this.width, this.height);

      // Update rockets
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.life--;

        // Draw rocket head & sparkle
        this.ctx.fillStyle = r.color;
        this.ctx.beginPath();
        this.ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
        this.ctx.fill();

        if (r.life <= 0) {
          this.burst(r.x, r.y, r.color);
          this.rockets.splice(i, 1);
        }
      }

      // Update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        p.rotation += p.rotationSpeed;

        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
          continue;
        }

        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.alpha);
        this.ctx.fillStyle = p.color;
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.isConfetti) {
          this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      }

      this.animId = requestAnimationFrame(() => this.loop());
    }

    stop() {
      this.active = false;
      this.particles = [];
      this.rockets = [];
      if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
      if (this.animId) cancelAnimationFrame(this.animId);
    }
  }

  const celebration = new CelebrationEngine(canvas);

  // =========================================================================
  // Stage Switching & User Interaction
  // =========================================================================
  function renderStage(stage) {
    currentStage = stage;
    card.setAttribute('data-stage', stage);

    // Update views
    for (let i = 0; i <= maxStage; i++) {
      const view = card.querySelector(`.stage-${i}-view`);
      if (view) {
        view.hidden = (i !== stage);
      }
    }

    // Update Stepper
    stepDots.forEach(dot => {
      const stepIdx = parseInt(dot.getAttribute('data-step-dot'), 10);
      dot.classList.remove('active', 'passed');
      if (stepIdx === stage || (stage === 5 && stepIdx === 4)) {
        dot.classList.add('active');
      } else if (stepIdx < stage) {
        dot.classList.add('passed');
      }
    });

    stepConnectors.forEach((conn, idx) => {
      conn.classList.toggle('passed', idx < stage);
    });

    // Sound and animation effects per stage
    if (stage === 1) {
      // First guess
      card.classList.remove('card-shake-anim');
    } else if (stage === 2 || stage === 3 || stage === 4) {
      // Rejection shakes
      playRejectionSound();
      card.classList.remove('card-shake-anim');
      void card.offsetWidth; // Force reflow
      card.classList.add('card-shake-anim');
    } else if (stage === 5) {
      // THE GRAND CELEBRATION!
      card.classList.remove('card-shake-anim');
      playCelebrationFanfare();
      celebration.start();

      // Smooth scroll so the grand reveal is centered comfortably
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function advanceStage() {
    if (currentStage < maxStage) {
      renderStage(currentStage + 1);
    }
  }

  // Click on the interactive card advances to next stage
  card.addEventListener('click', event => {
    // If in stage 5, don't advance further, let buttons handle clicks
    if (currentStage >= maxStage) return;

    // Advance
    advanceStage();
  });

  // Keyboard accessibility: Enter or Space triggers card action
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (currentStage < maxStage) {
        event.preventDefault();
        advanceStage();
      }
    }
  });

  // Replay Game Button
  if (replayBtn) {
    replayBtn.addEventListener('click', event => {
      event.stopPropagation();
      celebration.stop();
      renderStage(0);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // =========================================================================
  // Promo Code Form (Discreet Bottom Box)
  // =========================================================================
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
        promoFeedback.innerHTML = `🎉 <strong>Tabriklaymiz!</strong> ${escapeHtml(data.message || 'Muvaffaqiyatli faollashtirildi!')} <a href="/english/account" style="color:inherit;text-decoration:underline;margin-left:8px;font-weight:800;">Dashboardga oʻtish →</a>`;
        promoInput.value = '';
      } catch (error) {
        promoFeedback.hidden = false;
        promoFeedback.className = 'promo-feedback error';
        promoFeedback.textContent = error.message;
      } finally {
        promoBtn.disabled = false;
        promoBtn.textContent = 'Faollashtirish';
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  // Initialize
  renderStage(0);
})();
