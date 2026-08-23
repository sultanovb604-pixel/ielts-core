// IELTS Computer-Delivered Mock Exam Simulation Engine
(function () {
  'use strict';

  const token = localStorage.getItem('vortex-english-token');
  const urlParams = new URLSearchParams(location.search);
  const mockId = urlParams.get('id') || 'mock-test-01';
  const isReviewMode = urlParams.get('review') === '1';

  // DOM Elements
  const headerTitle = document.getElementById('mockExamHeaderTitle');
  const stepListening = document.getElementById('stageStepListening');
  const stepReading = document.getElementById('stageStepReading');
  const stepWriting = document.getElementById('stageStepWriting');
  const timerDisplay = document.getElementById('cdiTimerDisplay');
  const finishStageBtn = document.getElementById('cdiFinishStageBtn');
  const viewport = document.getElementById('cdiViewport');
  const intermissionModal = document.getElementById('cdiIntermissionModal');
  const intermissionTitle = document.getElementById('intermissionTitle');
  const intermissionDesc = document.getElementById('intermissionDesc');
  const intermissionStatsBox = document.getElementById('intermissionStatsBox');
  const intermissionScoreVal = document.getElementById('intermissionScoreVal');
  const intermissionBandVal = document.getElementById('intermissionBandVal');
  const intermissionProceedBtn = document.getElementById('intermissionProceedBtn');

  // Exam State
  let mockData = null;
  let currentStage = 'listening'; // 'listening' | 'reading' | 'writing' | 'results'
  let timerInterval = null;
  let remainingSeconds = 35 * 60;
  let totalTimeSpent = 0;

  // Staged Answers
  let listeningAnswers = [];
  let readingAnswers = [];
  let writingTask1 = '';
  let writingTask2 = '';
  let activeWritingTab = 'task1';

  async function init() {
    try {
      const response = await fetch(`/api/mock-test-data?id=${encodeURIComponent(mockId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to load mock exam data');
      }

      mockData = await response.json();
      if (headerTitle && mockData.mock) {
        headerTitle.textContent = mockData.mock.title;
      }

      if (isReviewMode) {
        loadPastAttemptAndShowResults();
        return;
      }

      startListeningStage();
    } catch (err) {
      console.error('Initialization error:', err);
      if (viewport) {
        viewport.innerHTML = `
          <div class="cdi-loading-screen">
            <span class="material-symbols-outlined" style="font-size:48px;color:#ef4444;margin-bottom:16px;">error</span>
            <h2>Failed to load examination</h2>
            <p style="color:#64748b;max-width:400px;margin:0 0 20px;">Could not connect to mock server. Please verify your connection.</p>
            <a href="/english/mock-tests" class="button primary" style="text-decoration:none;padding:10px 20px;border-radius:10px;">Back to Mock Tests</a>
          </div>`;
      }
    }
  }

  // --- STAGE 1: LISTENING ---
  function startListeningStage() {
    currentStage = 'listening';
    updateStageHeader(1, '35:00', 'Complete Listening');
    startTimer(35 * 60);

    const lMaterial = mockData.mock.listening;
    const lUrl = `/english/listening-exam?id=${encodeURIComponent(lMaterial.id)}&mode=mock`;

    viewport.innerHTML = `<iframe class="cdi-stage-frame" id="listeningIframe" src="${lUrl}" title="IELTS Listening Stage"></iframe>`;

    finishStageBtn.onclick = finishListeningStage;
  }

  function finishListeningStage() {
    const iframe = document.getElementById('listeningIframe');
    if (iframe && iframe.contentWindow) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        listeningAnswers = collectAnswersFromDoc(doc);
      } catch (e) {
        console.warn('Could not read iframe contents directly:', e);
      }
    }

    clearInterval(timerInterval);
    showIntermission(
      'Listening Stage Completed',
      'Your Listening responses have been recorded. Take a breath and get ready for the 60-minute Reading Section (3 passages, 40 questions).',
      'Start Reading Section',
      () => {
        hideIntermission();
        startReadingStage();
      }
    );
  }

  // --- STAGE 2: READING ---
  function startReadingStage() {
    currentStage = 'reading';
    updateStageHeader(2, '60:00', 'Complete Reading');
    startTimer(60 * 60);

    const rMaterial = mockData.mock.reading;
    const rUrl = `/english/reading-exam?id=${encodeURIComponent(rMaterial.id || 'reading-full-test-01')}&mode=mock`;

    viewport.innerHTML = `<iframe class="cdi-stage-frame" id="readingIframe" src="${rUrl}" title="IELTS Reading Stage"></iframe>`;

    finishStageBtn.onclick = finishReadingStage;
  }

  function finishReadingStage() {
    const iframe = document.getElementById('readingIframe');
    if (iframe && iframe.contentWindow) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        readingAnswers = collectAnswersFromDoc(doc);
      } catch (e) {
        console.warn('Could not read iframe contents directly:', e);
      }
    }

    clearInterval(timerInterval);
    showIntermission(
      'Reading Stage Completed',
      'Your Reading responses have been recorded. You are now entering the final stage: Academic Writing (Task 1 & Task 2 · 60 minutes).',
      'Start Writing Section',
      () => {
        hideIntermission();
        startWritingStage();
      }
    );
  }

  // --- STAGE 3: WRITING ---
  function startWritingStage() {
    currentStage = 'writing';
    updateStageHeader(3, '60:00', 'Submit Full Mock');
    startTimer(60 * 60);

    const wData = mockData.writing || mockData.mock.writing;
    renderWritingInterface(wData);

    finishStageBtn.onclick = submitFullMockExam;
  }

  function renderWritingInterface(wData) {
    const task1 = wData.task1;
    const task2 = wData.task2;

    viewport.innerHTML = `
      <div class="cdi-writing-wrapper">
        <div class="cdi-writing-left">
          <div class="cdi-writing-tabs">
            <button type="button" class="cdi-writing-tab-btn ${activeWritingTab === 'task1' ? 'active' : ''}" id="writingTab1Btn">
              Task 1 (Report · 150 words)
            </button>
            <button type="button" class="cdi-writing-tab-btn ${activeWritingTab === 'task2' ? 'active' : ''}" id="writingTab2Btn">
              Task 2 (Essay · 250 words)
            </button>
          </div>

          <div class="cdi-task-box" id="task1PromptBox" style="display:${activeWritingTab === 'task1' ? 'block' : 'none'};">
            <h3>${escapeHtml(task1.title || 'Writing Task 1')}</h3>
            <div class="cdi-task-prompt">${escapeHtml(task1.prompt)}</div>
          </div>

          <div class="cdi-task-box" id="task2PromptBox" style="display:${activeWritingTab === 'task2' ? 'block' : 'none'};">
            <h3>${escapeHtml(task2.title || 'Writing Task 2')}</h3>
            <div class="cdi-task-prompt">${escapeHtml(task2.prompt)}</div>
          </div>
        </div>

        <div class="cdi-writing-right">
          <div class="cdi-editor-top-bar">
            <span class="cdi-word-count-badge">
              <span class="material-symbols-outlined" style="font-size:16px;color:#1468f3;">text_fields</span>
              <span>Words: <strong id="cdiWordCount">0</strong></span>
            </span>
          </div>

          <textarea class="cdi-writing-textarea" id="cdiWritingEditor" placeholder="Type your response here... Live word count is active." spellcheck="false"></textarea>
        </div>
      </div>`;

    const editor = document.getElementById('cdiWritingEditor');
    const wordCountEl = document.getElementById('cdiWordCount');
    const tab1Btn = document.getElementById('writingTab1Btn');
    const tab2Btn = document.getElementById('writingTab2Btn');
    const prompt1 = document.getElementById('task1PromptBox');
    const prompt2 = document.getElementById('task2PromptBox');

    // Restore text for current active tab
    editor.value = activeWritingTab === 'task1' ? writingTask1 : writingTask2;
    updateWordCount();

    editor.addEventListener('input', () => {
      if (activeWritingTab === 'task1') {
        writingTask1 = editor.value;
      } else {
        writingTask2 = editor.value;
      }
      updateWordCount();
    });

    function updateWordCount() {
      const text = editor.value.trim();
      const count = text ? text.split(/\s+/).length : 0;
      if (wordCountEl) wordCountEl.textContent = count;
    }

    tab1Btn.onclick = () => {
      if (activeWritingTab === 'task1') return;
      activeWritingTab = 'task1';
      tab1Btn.classList.add('active');
      tab2Btn.classList.remove('active');
      prompt1.style.display = 'block';
      prompt2.style.display = 'none';
      editor.value = writingTask1;
      updateWordCount();
    };

    tab2Btn.onclick = () => {
      if (activeWritingTab === 'task2') return;
      activeWritingTab = 'task2';
      tab2Btn.classList.add('active');
      tab1Btn.classList.remove('active');
      prompt2.style.display = 'block';
      prompt1.style.display = 'none';
      editor.value = writingTask2;
      updateWordCount();
    };
  }

  // --- SUBMIT FULL MOCK EXAM ---
  async function submitFullMockExam() {
    if (!confirm('Are you sure you want to submit your Full Mock Exam? All sections will be finalized and evaluated.')) {
      return;
    }

    clearInterval(timerInterval);
    viewport.innerHTML = `
      <div class="cdi-loading-screen">
        <div class="cdi-spinner"></div>
        <h2>Calculating Cambridge Band Scores...</h2>
        <p>Evaluating Listening, Reading accuracy and analyzing Writing criteria.</p>
      </div>`;

    try {
      const payload = {
        mockId,
        listeningAnswers,
        readingAnswers,
        writingTask1,
        writingTask2,
        durationSeconds: totalTimeSpent
      };

      const response = await fetch('/api/mock-attempts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit mock exam');
      }

      renderResultsScreen(result.attempt);
    } catch (err) {
      console.error('Submission error:', err);
      alert('Error submitting mock exam: ' + err.message);
    }
  }

  async function loadPastAttemptAndShowResults() {
    try {
      const res = await fetch('/api/mock-attempts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const attempts = res.ok ? await res.json() : [];
      const attempt = attempts.find(a => a.mockId === mockId) || attempts[0];
      if (attempt) {
        renderResultsScreen(attempt);
      } else {
        startListeningStage();
      }
    } catch (e) {
      startListeningStage();
    }
  }

  // --- STAGE 4: RESULTS SCREEN ---
  function renderResultsScreen(attempt) {
    currentStage = 'results';
    if (timerDisplay) timerDisplay.parentElement.style.display = 'none';
    if (finishStageBtn) finishStageBtn.style.display = 'none';

    stepListening.className = 'cdi-stage-step completed';
    stepReading.className = 'cdi-stage-step completed';
    stepWriting.className = 'cdi-stage-step completed';

    viewport.innerHTML = `
      <div class="cdi-results-wrapper">
        <div class="cdi-results-card">
          <div class="cdi-certificate-header">
            <div class="cdi-cert-brand">IELTS CORE · CAMBRIDGE CDI REPORT</div>
            <h1 class="cdi-cert-title">${escapeHtml(attempt.mockTitle || 'IELTS Academic Full Mock Exam')}</h1>
            <p style="margin:0;color:#64748b;font-size:13.5px;">Complete Multi-Skill Diagnostic Performance Certificate</p>
          </div>

          <div class="cdi-overall-band-box">
            <div class="cdi-band-circle">
              <small>OVERALL</small>
              <strong>${Number(attempt.overallBand || 0).toFixed(1)}</strong>
            </div>
            <div>
              <h2 style="margin:0 0 6px;font-size:22px;color:#ffffff;">IELTS Band Score: ${Number(attempt.overallBand || 0).toFixed(1)}</h2>
              <p style="margin:0;color:#93c5fd;font-size:13.5px;">Candidate Performance Level: ${getBandDescriptor(attempt.overallBand)}</p>
            </div>
          </div>

          <div class="cdi-skills-breakdown-grid">
            <div class="cdi-skill-score-card">
              <span class="skill-name"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">headphones</span> Listening</span>
              <div class="skill-band">Band ${Number(attempt.listeningBand || 0).toFixed(1)}</div>
              <div class="skill-detail">${attempt.listening?.score || 0} / 40 correct</div>
            </div>

            <div class="cdi-skill-score-card">
              <span class="skill-name"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">menu_book</span> Reading</span>
              <div class="skill-band">Band ${Number(attempt.readingBand || 0).toFixed(1)}</div>
              <div class="skill-detail">${attempt.reading?.score || 0} / 40 correct</div>
            </div>

            <div class="cdi-skill-score-card">
              <span class="skill-name"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit_note</span> Writing</span>
              <div class="skill-band">Band ${Number(attempt.writingBand || 0).toFixed(1)}</div>
              <div class="skill-detail">T1: ${attempt.writing?.task1Words || 0}w · T2: ${attempt.writing?.task2Words || 0}w</div>
            </div>
          </div>

          <div style="display:flex;gap:12px;justify-content:center;margin-top:28px;">
            <a href="/english/mock-tests" class="button secondary" style="padding:0 22px;height:42px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
              <span class="material-symbols-outlined">quiz</span>
              <span>All Mock Exams</span>
            </a>
            <a href="/english/account" class="button primary" style="padding:0 24px;height:42px;border-radius:10px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
              <span class="material-symbols-outlined">dashboard</span>
              <span>Go to Dashboard</span>
            </a>
          </div>
        </div>
      </div>`;
  }

  function getBandDescriptor(band) {
    const b = Number(band) || 0;
    if (b >= 8.5) return 'Expert User (Band 8.5–9.0)';
    if (b >= 7.5) return 'Very Good User (Band 7.5–8.0)';
    if (b >= 6.5) return 'Competent User (Band 6.5–7.0)';
    if (b >= 5.5) return 'Modest User (Band 5.5–6.0)';
    return 'Developing User';
  }

  // --- HELPERS ---
  function updateStageHeader(stepNumber, defaultTime, actionBtnText) {
    stepListening.className = 'cdi-stage-step' + (stepNumber === 1 ? ' active' : stepNumber > 1 ? ' completed' : '');
    stepReading.className = 'cdi-stage-step' + (stepNumber === 2 ? ' active' : stepNumber > 2 ? ' completed' : '');
    stepWriting.className = 'cdi-stage-step' + (stepNumber === 3 ? ' active' : stepNumber > 3 ? ' completed' : '');

    if (timerDisplay) timerDisplay.textContent = defaultTime;
    if (finishStageBtn) {
      finishStageBtn.querySelector('span').textContent = actionBtnText;
    }
  }

  function startTimer(seconds) {
    clearInterval(timerInterval);
    remainingSeconds = seconds;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      remainingSeconds--;
      totalTimeSpent++;
      updateTimerDisplay();

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        if (currentStage === 'listening') finishListeningStage();
        else if (currentStage === 'reading') finishReadingStage();
        else if (currentStage === 'writing') submitFullMockExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!timerDisplay) return;
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remainingSeconds <= 300) {
      timerDisplay.parentElement.classList.add('warning');
    } else {
      timerDisplay.parentElement.classList.remove('warning');
    }
  }

  function showIntermission(title, desc, btnText, onProceed) {
    if (!intermissionModal) return;
    intermissionTitle.textContent = title;
    intermissionDesc.textContent = desc;
    intermissionProceedBtn.querySelector('span').textContent = btnText;
    intermissionProceedBtn.onclick = onProceed;
    intermissionModal.style.display = 'flex';
  }

  function hideIntermission() {
    if (intermissionModal) intermissionModal.style.display = 'none';
  }

  function collectAnswersFromDoc(doc) {
    if (!doc) return [];
    const answers = [];
    const inputs = doc.querySelectorAll('input, select, textarea');
    inputs.forEach(el => {
      const key = el.name || el.id || el.getAttribute('data-q');
      if (!key) return;
      if (el.type === 'radio' || el.type === 'checkbox') {
        if (el.checked) answers.push({ key, value: el.value, type: el.type, checked: true });
      } else if (el.value) {
        answers.push({ key, value: el.value, type: el.type });
      }
    });
    return answers;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  init();
})();
