(() => {
  const form = document.querySelector('#authForm');
  const message = document.querySelector('#authMessage');
  const mode = document.body.dataset.authMode;
  const tokenKey = 'vortex-english-token';
  const studentKey = 'vortex-english-student';
  const query = new URLSearchParams(location.search);
  const next = query.get('next');
  const destination = next && next.startsWith('/english/') ? next : '/english/account';
  const googleTicket = query.get('google_ticket');
  const googleError = query.get('google_error');
  const existingToken = localStorage.getItem(tokenKey);
  const setMessage = (text, success = false) => { message.textContent = text; message.classList.toggle('success', success); };
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem('vortex-english-onboarding') || '{}'); } catch {}

  const googleLink = document.querySelector('[data-google-auth]');
  const googleDivider = googleLink?.nextElementSibling?.classList.contains('auth-divider') ? googleLink.nextElementSibling : null;

  async function handleFirebaseGoogleAuth(e) {
    if (e) e.preventDefault();
    if (typeof firebase === 'undefined' || !firebase.auth) {
      window.location.href = '/api/auth/google';
      return;
    }
    setMessage('Opening Google Sign-In...');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;
      const idToken = await user.getIdToken();
      setMessage('Connecting your Google account...');

      const selectedRole = document.querySelector('input[name="role"]:checked')?.value || 'student';
      const res = await fetch('/api/auth/firebase-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          email: user.email,
          name: user.displayName || user.email.split('@')[0],
          avatarUrl: user.photoURL || '',
          uid: user.uid,
          role: selectedRole,
          learning: preferences.learning || '',
          goal: preferences.goal || ''
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google sign-in failed.');

      localStorage.setItem('vortex_student_token', data.token);
      setMessage('Sign-in successful! Opening your workspace...', true);
      setTimeout(() => {
        window.location.href = destination || '/english/account';
      }, 500);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        setMessage('');
      } else {
        setMessage(err.message || 'Google sign-in failed.');
      }
    }
  }

  if (googleLink) {
    googleLink.hidden = false;
    if (googleDivider) googleDivider.hidden = false;
    googleLink.addEventListener('click', handleFirebaseGoogleAuth);
  }

  if (googleError) setMessage(googleError);

  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.dataset.passwordToggle}`);
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
    button.setAttribute('aria-pressed', String(!visible));
    button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  }));

  if (mode === 'signup') {
    const summary = document.querySelector('#authChoiceSummary');
    const learningLabels = { foundation: 'English foundations', speaking: 'Confident speaking', ielts: 'IELTS preparation' };
    const goalLabels = { confidence: 'Speak with confidence', school: 'School and exams', future: 'Future IELTS goal' };
    if (summary && (learningLabels[preferences.learning] || goalLabels[preferences.goal])) {
      summary.textContent = `Your path: ${learningLabels[preferences.learning] || 'English'} · ${goalLabels[preferences.goal] || 'Personal goal'}`;
      summary.classList.add('visible');
    }
    const roleRadios = document.querySelectorAll('input[name="role"]');
    roleRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.auth-role-card').forEach(card => {
          const isSelected = card.querySelector('input').checked;
          card.classList.toggle('selected', isSelected);
          card.style.borderColor = isSelected ? '#1468f3' : '#cbd5e1';
          card.style.background = isSelected ? '#eff6ff' : '#ffffff';
        });
      });
    });
  }

  if (!googleTicket && existingToken) fetch('/api/auth/me', { headers: { Authorization: `Bearer ${existingToken}` } }).then(response => {
    if (response.ok) location.replace(destination);
    else { localStorage.removeItem(tokenKey); localStorage.removeItem(studentKey); }
  }).catch(() => {});

  const completeGoogleSignIn = async () => {
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setMessage('Completing Google sign-in...');
    try {
      const response = await fetch('/api/auth/google/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: googleTicket }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Google sign-in could not be completed.');
      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem(studentKey, JSON.stringify(data.user));
      localStorage.removeItem('vortex-english-onboarding');
      history.replaceState(null, '', location.pathname);
      setMessage('Google account connected. Opening your dashboard.', true);
      const userDest = data.user?.role === 'teacher' ? '/english/teacher' : destination;
      window.setTimeout(() => location.replace(data.next && data.next.startsWith('/english/') ? data.next : userDest), 180);
    } catch (error) {
      setMessage(error.message);
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      history.replaceState(null, '', location.pathname);
    }
  };
  if (googleTicket) completeGoogleSignIn();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setMessage('');
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    if (mode === 'signup' && fields.get('password') !== fields.get('confirmPassword')) {
      setMessage('Passwords do not match.'); form.elements.confirmPassword.focus(); return;
    }
    const submit = form.querySelector('[type="submit"]');
    const defaultText = submit.innerHTML;
    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';
    form.setAttribute('aria-busy', 'true');
    const username = String(fields.get('username') || '').trim().toLowerCase();
    const password = String(fields.get('password') || '');
    const name = String(fields.get('name') || '').trim();
    const role = fields.get('role') === 'teacher' ? 'teacher' : 'student';
    const payload = mode === 'signup'
      ? { name, username, password, role, learning: preferences.learning || '', goal: preferences.goal || '' }
      : { username, password };
    try {
      const response = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem(studentKey, JSON.stringify(data.user));
      localStorage.removeItem('vortex-english-onboarding');
      setMessage(mode === 'signup' ? 'Account created. Opening your dashboard.' : 'Welcome back. Opening your dashboard.', true);
      const defaultDest = data.user?.role === 'teacher' ? '/english/teacher' : destination;
      const finalDest = next && next.startsWith('/english/') ? next : defaultDest;
      window.setTimeout(() => location.assign(finalDest), 250);
    } catch (error) {
      setMessage(error.message);
      submit.disabled = false;
      submit.innerHTML = defaultText;
      form.removeAttribute('aria-busy');
    }
  });
})();
