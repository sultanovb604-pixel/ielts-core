(() => {
  const form = document.querySelector('#authForm');
  const message = document.querySelector('#authMessage');
  const mode = document.body.dataset.authMode;
  const tokenKey = 'vortex-english-token';
  const studentKey = 'vortex-english-student';
  const query = new URLSearchParams(location.search);
  const next = query.get('next');
  const destination = next && next.startsWith('/english/') ? next : '/english/account';
  const existingToken = localStorage.getItem(tokenKey);

  const setMessage = (text, success = false) => {
    if (!message) return;
    message.textContent = text || '';
    message.classList.toggle('success', success);
    if (!text) message.className = 'form-message';
  };

  // If already logged in, redirect
  if (existingToken) {
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${existingToken}` } })
      .then(response => {
        if (response.ok) window.location.replace(destination);
        else { localStorage.removeItem(tokenKey); localStorage.removeItem(studentKey); }
      })
      .catch(() => {});
  }

  async function ensureFirebaseAuth() {
    if (window.firebase && window.firebase.auth) {
      if (!firebase.apps.length && window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);
      }
      return window.firebase;
    }
    const loadScript = src => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
    }
    if (!window.firebase?.auth) {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
    }
    if (window.firebase && !firebase.apps.length && window.firebaseConfig) {
      firebase.initializeApp(window.firebaseConfig);
    }
    return window.firebase;
  }

  // Handle Google Sign-In / Sign-Up in 1 Click
  const googleButtons = document.querySelectorAll('[data-google-auth]');

  async function startGoogleAuth(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setMessage('Google bilan ulanmoqda...');

    try {
      const fb = await ensureFirebaseAuth();
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;
      const idToken = await user.getIdToken();

      setMessage('Google hisobi ulandi. Kabinetingizga yo‘naltirilmoqda...', true);

      const res = await fetch('/api/auth/firebase-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          email: user.email,
          name: user.displayName || user.email.split('@')[0],
          avatarUrl: user.photoURL || '',
          uid: user.uid,
          role: 'student'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google sign-in xatoligi yuz berdi.');

      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem('vortex_student_token', data.token);
      localStorage.setItem(studentKey, JSON.stringify(data.user));

      setMessage('Muvaffaqiyatli kirdingiz! Ochilmoqda...', true);
      setTimeout(() => {
        window.location.replace(destination);
      }, 300);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        setMessage('');
      } else {
        setMessage(err.message || 'Google sign-in xatoligi.');
      }
    }
  }

  googleButtons.forEach(btn => {
    btn.addEventListener('click', startGoogleAuth);
  });

  // Password toggle
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.dataset.passwordToggle}`);
    if (!input) return;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
    button.setAttribute('aria-pressed', String(!visible));
    button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  }));

  // Standard Username / Password submit
  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      setMessage('');
      if (!form.reportValidity()) return;
      const fields = new FormData(form);
      if (mode === 'signup' && fields.get('password') !== fields.get('confirmPassword')) {
        setMessage('Kiritilgan parollar bir-biriga mos kelmadi.');
        form.elements.confirmPassword?.focus();
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      const defaultText = submit.innerHTML;
      submit.disabled = true;
      submit.textContent = mode === 'signup' ? 'Hisob ochilmoqda...' : 'Kirilmoqda...';
      form.setAttribute('aria-busy', 'true');

      const username = String(fields.get('username') || '').trim().toLowerCase();
      const password = String(fields.get('password') || '');
      const name = String(fields.get('name') || '').trim();
      const payload = mode === 'signup'
        ? { name, username, password, role: 'student' }
        : { username, password };

      try {
        const response = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Xatolik yuz berdi.');

        localStorage.setItem(tokenKey, data.token);
        localStorage.setItem('vortex_student_token', data.token);
        localStorage.setItem(studentKey, JSON.stringify(data.user));

        setMessage(mode === 'signup' ? 'Hisob yaratildi! Kabinetga o‘tilmoqda...' : 'Xush kelibsiz! Ochilmoqda...', true);
        window.setTimeout(() => window.location.replace(destination), 250);
      } catch (error) {
        setMessage(error.message);
        submit.disabled = false;
        submit.innerHTML = defaultText;
        form.removeAttribute('aria-busy');
      }
    });
  }
})();
