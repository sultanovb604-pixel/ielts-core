(() => {
  const params = new URLSearchParams(location.search);
  const token = localStorage.getItem('vortex-english-token') || params.get('token') || '';
  const assignmentId = params.get('assignment') || params.get('assignmentId') || '';
  let materialId = params.get('id') || '';
  let mode = params.get('mode') === 'practice' ? 'practice' : 'real-exam';

  // Elements
  const textarea = document.querySelector('#cdiTextarea');
  const liveWordCount = document.querySelector('#cdiLiveWordCount');
  const timerRemaining = document.querySelector('#cdiTimerRemaining');
  const timerBox = document.querySelector('#cdiTimerBox');
  const testTitleText = document.querySelector('#cdiTestTitleText');
  const partTitle = document.querySelector('#cdiPartTitle');
  const partGuide = document.querySelector('#cdiPartGuide');
  const promptContent = document.querySelector('#cdiPromptContent');
  const chartContainer = document.querySelector('#cdiChartContainer');
  const leftPane = document.querySelector('#cdiLeftPane');
  const resizer = document.querySelector('#cdiResizer');
  const rightPane = document.querySelector('#cdiRightPane');
  const btnPart1 = document.querySelector('#btnPart1Tab');
  const btnPart2 = document.querySelector('#btnPart2Tab');
  const prevArrow = document.querySelector('#cdiPrevArrow');
  const nextArrow = document.querySelector('#cdiNextArrow');
  const part1StatusBox = document.querySelector('#part1StatusBox');
  const part2StatusText = document.querySelector('#part2StatusText');
  const submitBtn = document.querySelector('#cdiHeaderSubmitBtn');
  const submitModal = document.querySelector('#cdiSubmitModal');
  const cancelModalBtn = document.querySelector('#cdiCancelModalBtn');
  const confirmSubmitBtn = document.querySelector('#cdiConfirmSubmitBtn');
  const modalPart1Words = document.querySelector('#modalPart1WordCount');
  const modalPart2Words = document.querySelector('#modalPart2WordCount');
  const fullscreenBtn = document.querySelector('#cdiFullscreenBtn');
  const menuBtn = document.querySelector('#cdiMenuBtn');

  let currentPart = 1; // 1 or 2
  let drafts = {
    1: localStorage.getItem(`cdi_draft_${assignmentId || 'exam'}_part1`) || '',
    2: localStorage.getItem(`cdi_draft_${assignmentId || 'exam'}_part2`) || ''
  };

  // Authentic Test Data (Part 1 Bar Chart matching screenshot + Part 2 Essay)
  const testData = {
    title: '[04_05-11_05] Test 1',
    part1: {
      title: 'Part 1',
      guide: 'You should spend about 20 minutes on this task. Write at least 150 words.',
      minWords: 150,
      promptHtml: `
        <p>The bar chart shows the percentage of the total world population in four countries in 1950 and 2003, with projections for 2050.</p>
        <p>Summarise the information by selecting and reporting the main features, and make comparisons where relevant.</p>
      `,
      chartSvg: `
        <svg viewBox="0 0 540 330" width="100%" height="280" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif;font-size:12px;background:#ffffff;">
          <!-- Grid & Axes -->
          <line x1="50" y1="20" x2="50" y2="250" stroke="#374151" stroke-width="1.5" />
          <line x1="50" y1="250" x2="430" y2="250" stroke="#374151" stroke-width="1.5" />
          
          <!-- Y-Axis Ticks & Labels -->
          <line x1="45" y1="20" x2="50" y2="20" stroke="#374151" />
          <text x="40" y="24" text-anchor="end" font-weight="700">30</text>
          <line x1="45" y1="58" x2="50" y2="58" stroke="#374151" />
          <text x="40" y="62" text-anchor="end" font-weight="700">25</text>
          <line x1="45" y1="96" x2="50" y2="96" stroke="#374151" />
          <text x="40" y="100" text-anchor="end" font-weight="700">20</text>
          <line x1="45" y1="135" x2="50" y2="135" stroke="#374151" />
          <text x="40" y="139" text-anchor="end" font-weight="700">15</text>
          <text x="40" y="155" text-anchor="end" font-weight="700">%</text>
          <line x1="45" y1="173" x2="50" y2="173" stroke="#374151" />
          <text x="40" y="177" text-anchor="end" font-weight="700">10</text>
          <line x1="45" y1="211" x2="50" y2="211" stroke="#374151" />
          <text x="40" y="215" text-anchor="end" font-weight="700">5</text>
          <text x="40" y="254" text-anchor="end" font-weight="700">0</text>

          <!-- Horizontal Gridlines -->
          <line x1="50" y1="20" x2="430" y2="20" stroke="#e5e7eb" stroke-dasharray="2,2" />
          <line x1="50" y1="58" x2="430" y2="58" stroke="#e5e7eb" stroke-dasharray="2,2" />
          <line x1="50" y1="96" x2="430" y2="96" stroke="#e5e7eb" stroke-dasharray="2,2" />
          <line x1="50" y1="135" x2="430" y2="135" stroke="#e5e7eb" stroke-dasharray="2,2" />
          <line x1="50" y1="173" x2="430" y2="173" stroke="#e5e7eb" stroke-dasharray="2,2" />
          <line x1="50" y1="211" x2="430" y2="211" stroke="#e5e7eb" stroke-dasharray="2,2" />

          <!-- Bars: India (x ~ 80) -->
          <rect x="75" y="135" width="22" height="115" fill="#f3f4f6" stroke="#374151" stroke-dasharray="2,2" />
          <rect x="99" y="104" width="22" height="146" fill="#9ca3af" stroke="#374151" />
          <rect x="123" y="88" width="22" height="162" fill="#111827" stroke="#111827" />
          <text x="110" y="270" text-anchor="middle" font-weight="700">India</text>

          <!-- Bars: China (x ~ 170) -->
          <rect x="165" y="50" width="22" height="200" fill="#f3f4f6" stroke="#374151" stroke-dasharray="2,2" />
          <rect x="189" y="70" width="22" height="180" fill="#9ca3af" stroke="#374151" />
          <rect x="213" y="104" width="22" height="146" fill="#111827" stroke="#111827" />
          <text x="200" y="270" text-anchor="middle" font-weight="700">China</text>

          <!-- Bars: USA (x ~ 260) -->
          <rect x="255" y="173" width="22" height="77" fill="#f3f4f6" stroke="#374151" stroke-dasharray="2,2" />
          <rect x="279" y="188" width="22" height="62" fill="#9ca3af" stroke="#374151" />
          <rect x="303" y="188" width="22" height="62" fill="#111827" stroke="#111827" />
          <text x="290" y="270" text-anchor="middle" font-weight="700">USA</text>

          <!-- Bars: Japan (x ~ 350) -->
          <rect x="345" y="211" width="22" height="39" fill="#f3f4f6" stroke="#374151" stroke-dasharray="2,2" />
          <rect x="369" y="222" width="22" height="28" fill="#9ca3af" stroke="#374151" />
          <rect x="393" y="228" width="22" height="22" fill="#111827" stroke="#111827" />
          <text x="380" y="270" text-anchor="middle" font-weight="700">Japan</text>

          <!-- Legend -->
          <rect x="435" y="130" width="16" height="12" fill="#f3f4f6" stroke="#374151" stroke-dasharray="2,2" />
          <text x="458" y="141" font-size="12" font-weight="600">1950</text>
          
          <rect x="435" y="160" width="16" height="12" fill="#9ca3af" stroke="#374151" />
          <text x="458" y="171" font-size="12" font-weight="600">2003</text>
          
          <rect x="435" y="190" width="16" height="12" fill="#111827" stroke="#111827" />
          <text x="458" y="201" font-size="12" font-weight="600">2050</text>
        </svg>
      `
    },
    part2: {
      title: 'Part 2',
      guide: 'You should spend about 40 minutes on this task. Write at least 250 words.',
      minWords: 250,
      promptHtml: `
        <p>Some people believe that personal perseverance and hard work are the only prerequisites for achieving success in life, while others argue that external factors such as financial background, connections, and good fortune play a far more decisive role.</p>
        <p><strong>Discuss both views and give your own opinion.</strong></p>
        <p style="color:#6b7280;font-size:13px;margin-top:16px;">Give reasons for your answer and include any relevant examples from your own knowledge or experience.</p>
      `,
      chartSvg: ''
    }
  };

  let allWritingTopics = [];
  const rerollBtn = document.querySelector('#rerollTopicsBtn');
  const startModalT1Title = document.querySelector('#startModalT1Title');
  const startModalT1Category = document.querySelector('#startModalT1Category');
  const startModalT2Title = document.querySelector('#startModalT2Title');
  const startModalT2Category = document.querySelector('#startModalT2Category');

  // Chart SVGs dictionary for Task 1 topics
  const chartSvgs = {
    'default-bar': testData.part1.chartSvg,
    'writing-topic-task1-bamboo-process': `
      <svg viewBox="0 0 540 280" width="100%" height="260" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif;font-size:11.5px;background:#ffffff;">
        <rect x="10" y="10" width="520" height="260" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="270" y="34" text-anchor="middle" font-weight="800" fill="#0f172a" font-size="13">Process: Bamboo Fiber Textile Manufacturing</text>
        <rect x="25" y="60" width="95" height="70" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="72" y="85" text-anchor="middle" font-weight="700" fill="#1e40af">1. Harvesting</text>
        <text x="72" y="105" text-anchor="middle" fill="#475569" font-size="10">Mature stalks cut</text>
        <path d="M125 95 H150" stroke="#3b82f6" stroke-width="2"/>
        <rect x="155" y="60" width="95" height="70" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="202" y="85" text-anchor="middle" font-weight="700" fill="#1e40af">2. Crushing</text>
        <text x="202" y="105" text-anchor="middle" fill="#475569" font-size="10">Mechanical pulping</text>
        <path d="M255 95 H280" stroke="#3b82f6" stroke-width="2"/>
        <rect x="285" y="60" width="95" height="70" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="332" y="85" text-anchor="middle" font-weight="700" fill="#1e40af">3. Enzyme Soak</text>
        <text x="332" y="105" text-anchor="middle" fill="#475569" font-size="10">Natural breakdown</text>
        <path d="M385 95 H410" stroke="#3b82f6" stroke-width="2"/>
        <rect x="415" y="60" width="95" height="70" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="462" y="85" text-anchor="middle" font-weight="700" fill="#1e40af">4. Spinning</text>
        <text x="462" y="105" text-anchor="middle" fill="#475569" font-size="10">Yarn production</text>
        <rect x="170" y="165" width="200" height="70" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="1.5"/>
        <text x="270" y="195" text-anchor="middle" font-weight="700" fill="#065f46">5. Eco-Textile Weaving</text>
        <text x="270" y="215" text-anchor="middle" fill="#047857" font-size="10.5">Finished Garments & Fabrics</text>
      </svg>
    `,
    'writing-topic-task1-sports-table': `
      <svg viewBox="0 0 540 260" width="100%" height="240" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif;font-size:12px;background:#ffffff;">
        <rect x="20" y="15" width="500" height="230" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
        <rect x="20" y="15" width="500" height="40" rx="8" fill="#f1f5f9"/>
        <text x="40" y="40" font-weight="800" fill="#0f172a">Sport</text>
        <text x="170" y="40" font-weight="800" fill="#0f172a">Boys 2010</text>
        <text x="260" y="40" font-weight="800" fill="#0f172a">Boys 2020</text>
        <text x="350" y="40" font-weight="800" fill="#0f172a">Girls 2010</text>
        <text x="440" y="40" font-weight="800" fill="#0f172a">Girls 2020</text>
        <line x1="20" y1="55" x2="520" y2="55" stroke="#cbd5e1"/>
        <text x="40" y="90" fill="#1e293b" font-weight="600">Football</text>
        <text x="185" y="90" fill="#334155">38%</text>
        <text x="275" y="90" fill="#334155">42%</text>
        <text x="365" y="90" fill="#334155">14%</text>
        <text x="455" y="90" fill="#334155">22%</text>
        <line x1="20" y1="105" x2="520" y2="105" stroke="#f1f5f9"/>
        <text x="40" y="135" fill="#1e293b" font-weight="600">Swimming</text>
        <text x="185" y="135" fill="#334155">24%</text>
        <text x="275" y="135" fill="#334155">20%</text>
        <text x="365" y="135" fill="#334155">31%</text>
        <text x="455" y="135" fill="#334155">35%</text>
        <line x1="20" y1="150" x2="520" y2="150" stroke="#f1f5f9"/>
        <text x="40" y="180" fill="#1e293b" font-weight="600">Basketball</text>
        <text x="185" y="180" fill="#334155">18%</text>
        <text x="275" y="180" fill="#334155">25%</text>
        <text x="365" y="180" fill="#334155">9%</text>
        <text x="455" y="180" fill="#334155">16%</text>
        <line x1="20" y1="195" x2="520" y2="195" stroke="#f1f5f9"/>
        <text x="40" y="225" fill="#1e293b" font-weight="600">Tennis</text>
        <text x="185" y="225" fill="#334155">12%</text>
        <text x="275" y="225" fill="#334155">10%</text>
        <text x="365" y="225" fill="#334155">15%</text>
        <text x="455" y="225" fill="#334155">18%</text>
      </svg>
    `,
    'writing-topic-task1-zoo-map': `
      <svg viewBox="0 0 540 260" width="100%" height="240" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif;font-size:11px;background:#ffffff;">
        <rect x="20" y="20" width="230" height="210" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="135" y="42" text-anchor="middle" font-weight="800" fill="#0f172a" font-size="12.5">Year 2000 Layout</text>
        <rect x="35" y="60" width="90" height="60" rx="4" fill="#dbeafe" stroke="#93c5fd"/>
        <text x="80" y="95" text-anchor="middle" font-weight="600" fill="#1e40af">Main Cages</text>
        <rect x="145" y="60" width="90" height="60" rx="4" fill="#fef3c7" stroke="#fde68a"/>
        <text x="190" y="95" text-anchor="middle" font-weight="600" fill="#92400e">Car Park</text>
        <rect x="35" y="140" width="200" height="70" rx="4" fill="#ecfdf5" stroke="#a7f3d0"/>
        <text x="135" y="180" text-anchor="middle" font-weight="600" fill="#065f46">Grassland Habitat</text>
        <rect x="290" y="20" width="230" height="210" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="405" y="42" text-anchor="middle" font-weight="800" fill="#0f172a" font-size="12.5">Planned 2025 Layout</text>
        <rect x="305" y="60" width="90" height="60" rx="4" fill="#ecfdf5" stroke="#a7f3d0"/>
        <text x="350" y="95" text-anchor="middle" font-weight="600" fill="#065f46">Bio-Domes</text>
        <rect x="415" y="60" width="90" height="60" rx="4" fill="#ede9fe" stroke="#ddd6fe"/>
        <text x="460" y="95" text-anchor="middle" font-weight="600" fill="#5b21b6">Education Ctr</text>
        <rect x="305" y="140" width="200" height="70" rx="4" fill="#dbeafe" stroke="#93c5fd"/>
        <text x="405" y="180" text-anchor="middle" font-weight="600" fill="#1e40af">Expanded Open Reserve</text>
      </svg>
    `
  };

  function randomizeTopics() {
    if (!allWritingTopics.length) return;
    const task1s = allWritingTopics.filter(t => t.type === 'task1');
    const task2s = allWritingTopics.filter(t => t.type === 'task2');

    const t1 = task1s.length ? task1s[Math.floor(Math.random() * task1s.length)] : null;
    const t2 = task2s.length ? task2s[Math.floor(Math.random() * task2s.length)] : null;

    if (t1) {
      testData.part1.title = `Part 1: ${t1.title}`;
      testData.part1.guide = `You should spend about 20 minutes on this task. Write at least 150 words.`;
      testData.part1.promptHtml = `<p style="font-size:15px;line-height:1.6;color:#1e293b;">${escape(t1.prompt).replace(/\\n/g, '<br>')}</p>`;
      testData.part1.chartSvg = chartSvgs[t1.id] || chartSvgs['default-bar'];

      if (startModalT1Title) startModalT1Title.textContent = t1.title;
      if (startModalT1Category) startModalT1Category.textContent = `${t1.category || 'Task 1'} · ~20 mins`;
    }

    if (t2) {
      testData.part2.title = `Part 2: ${t2.title}`;
      testData.part2.guide = `You should spend about 40 minutes on this task. Write at least 250 words.`;
      testData.part2.promptHtml = `<p style="font-size:15px;line-height:1.6;color:#1e293b;">${escape(t2.prompt).replace(/\\n/g, '<br>')}</p><p style="color:#6b7280;font-size:13px;margin-top:16px;">Give reasons for your answer and include any relevant examples from your own knowledge or experience.</p>`;

      if (startModalT2Title) startModalT2Title.textContent = t2.title;
      if (startModalT2Category) startModalT2Category.textContent = `${t2.category || 'Essay'} · ~40 mins`;
    }

    testData.title = `🎲 Random Mock: ${t1 ? t1.title : 'Task 1'} + ${t2 ? t2.title : 'Task 2'}`;
    renderCurrentPart();
  }

  // Fetch topics and randomize
  if (!assignmentId) {
    fetch('/api/writing/topics')
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list) && list.length) {
          allWritingTopics = list;
          randomizeTopics();
        }
      })
      .catch(() => {});
  }

  rerollBtn?.addEventListener('click', () => {
    randomizeTopics();
  });

  // If custom assignment assigned by teacher, customize prompt
  if (assignmentId && token) {
    fetch('/api/student/assignment/' + assignmentId, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json()).then(found => {
      if (found && !found.error) {
        if (found.title) {
          testData.title = found.title;
          testData.part2.title = found.title;
          if (testTitleText) testTitleText.textContent = found.title;
          if (startModalTestTitle) startModalTestTitle.textContent = found.title;
        }
        if (found.prompt) {
          testData.part2.promptHtml = `<p style="font-size:15px;line-height:1.6;color:#1e293b;">${escape(found.prompt).replace(/\n/g, '<br>')}</p>${found.instructions ? `<p style="margin-top:16px;padding:10px 14px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:13px;font-weight:600;"><strong>Ustoz eslatmasi:</strong> ${escape(found.instructions)}</p>` : ''}`;
        }
        if (found.mode) {
          mode = found.mode;
        }
        setPart(2);
      }
    }).catch(() => {});
  }

  // Switch between Part 1 and Part 2
  function setPart(num) {
    if (num !== 1 && num !== 2) return;
    
    // Save current textarea content to draft
    if (textarea) {
      drafts[currentPart] = textarea.value;
      localStorage.setItem(`cdi_draft_${assignmentId || 'exam'}_part${currentPart}`, textarea.value);
    }

    currentPart = num;
    renderCurrentPart();
  }

  function renderCurrentPart() {
    const data = currentPart === 1 ? testData.part1 : testData.part2;

    if (testTitleText) testTitleText.textContent = testData.title;
    if (partTitle) partTitle.textContent = data.title;
    if (partGuide) partGuide.textContent = data.guide;
    if (promptContent) promptContent.innerHTML = data.promptHtml;

    if (chartContainer) {
      if (data.chartSvg) {
        chartContainer.style.display = 'flex';
        chartContainer.innerHTML = data.chartSvg;
      } else {
        chartContainer.style.display = 'none';
        chartContainer.innerHTML = '';
      }
    }

    // Set textarea value from current draft
    if (textarea) {
      textarea.value = drafts[currentPart] || '';
      updateWordCount();
    }

    // Update Bottom Navigation Styling
    if (currentPart === 1) {
      btnPart1?.classList.add('active');
      btnPart2?.classList.remove('active');
      if (prevArrow) prevArrow.disabled = true;
      if (nextArrow) nextArrow.disabled = false;
    } else {
      btnPart1?.classList.remove('active');
      btnPart2?.classList.add('active');
      if (prevArrow) prevArrow.disabled = false;
      if (nextArrow) nextArrow.disabled = true;
    }

    updateNavigationStatus();
  }

  function updateWordCount() {
    const text = textarea ? textarea.value.trim() : '';
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (liveWordCount) liveWordCount.textContent = String(words);
    return words;
  }

  function updateNavigationStatus() {
    const p1Text = (drafts[1] || (currentPart === 1 && textarea ? textarea.value : '')).trim();
    const p1Words = p1Text ? p1Text.split(/\s+/).filter(Boolean).length : 0;

    const p2Text = (drafts[2] || (currentPart === 2 && textarea ? textarea.value : '')).trim();
    const p2Words = p2Text ? p2Text.split(/\s+/).filter(Boolean).length : 0;

    if (part1StatusBox) {
      part1StatusBox.textContent = '1';
      part1StatusBox.style.borderColor = p1Words >= 10 ? '#10b981' : '#2563eb';
      part1StatusBox.style.color = p1Words >= 10 ? '#10b981' : '#2563eb';
    }

    if (part2StatusText) {
      part2StatusText.textContent = p2Words >= 10 ? '1/1' : '0/1';
      part2StatusText.style.color = p2Words >= 10 ? '#10b981' : '#6b7280';
    }
  }

  textarea?.addEventListener('input', () => {
    drafts[currentPart] = textarea.value;
    localStorage.setItem(`cdi_draft_${assignmentId || 'exam'}_part${currentPart}`, textarea.value);
    updateWordCount();
    updateNavigationStatus();
  });

  btnPart1?.addEventListener('click', () => setPart(1));
  btnPart2?.addEventListener('click', () => setPart(2));
  prevArrow?.addEventListener('click', () => setPart(1));
  nextArrow?.addEventListener('click', () => setPart(2));

  // Resizer logic
  let isDragging = false;
  resizer?.addEventListener('mousedown', e => {
    e.preventDefault();
    isDragging = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const workspace = document.querySelector('#cdiWorkspace');
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const containerWidth = rect.width;
    const offsetX = e.clientX - rect.left;
    const newLeftWidth = Math.max(280, Math.min(containerWidth - 320, offsetX));
    if (leftPane) leftPane.style.width = newLeftWidth + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    }
  });

  // Fullscreen button
  fullscreenBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Menu button
  menuBtn?.addEventListener('click', () => {
    if (confirm('Do you want to exit and return to your Candidate Dashboard? Your drafts will be saved locally.')) {
      location.assign('/english/account');
    }
  });

  // Countdown timer logic (Only starts when student clicks Start Exam)
  const startModal = document.querySelector('#cdiStartModal');
  const startExamBtn = document.querySelector('#cdiStartExamBtn');
  const startModalTestTitle = document.querySelector('#startModalTestTitle');
  let examStarted = false;
  let timerInterval = null;
  let totalRemainingSeconds = mode === 'real-exam' ? 60 * 60 : 0;
  let elapsedSeconds = 0;

  function startExamSession() {
    examStarted = true;
    if (startModal) startModal.style.display = 'none';

    const selectedMode = document.querySelector('input[name="examModeChoice"]:checked')?.value || mode;
    mode = selectedMode;
    totalRemainingSeconds = mode === 'real-exam' ? 60 * 60 : 0;
    elapsedSeconds = 0;

    if (timerRemaining) {
      timerRemaining.textContent = mode === 'real-exam' ? '60 minutes remaining' : 'Practice: 00:00';
    }

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (mode === 'real-exam') {
        totalRemainingSeconds--;
        if (totalRemainingSeconds <= 0) {
          totalRemainingSeconds = 0;
          clearInterval(timerInterval);
          alert('⏰ Time is up! In real exam mode, your answers are automatically submitted.');
          executeSubmit();
          return;
        }
        const mins = Math.max(0, Math.floor(totalRemainingSeconds / 60));
        if (timerRemaining) {
          timerRemaining.textContent = `${mins} minutes remaining`;
        }
        if (totalRemainingSeconds <= 600) {
          timerBox?.classList.add('warning-red');
        }
      } else {
        elapsedSeconds++;
        const mins = Math.floor(elapsedSeconds / 60);
        const secs = elapsedSeconds % 60;
        if (timerRemaining) {
          timerRemaining.textContent = `Practice: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
      }
    }, 1000);

    if (textarea) textarea.focus();
  }

  startExamBtn?.addEventListener('click', startExamSession);

  // If testData.title is updated later via API, also sync with start modal
  if (startModalTestTitle && testData.title) {
    startModalTestTitle.textContent = testData.title;
  }

  // Submit Modal & Submission
  submitBtn?.addEventListener('click', () => {
    drafts[currentPart] = textarea ? textarea.value : '';
    const p1Words = (drafts[1] || '').trim().split(/\s+/).filter(Boolean).length;
    const p2Words = (drafts[2] || '').trim().split(/\s+/).filter(Boolean).length;

    if (modalPart1Words) modalPart1Words.textContent = `${p1Words} words`;
    if (modalPart2Words) modalPart2Words.textContent = `${p2Words} words`;

    if (submitModal) submitModal.style.display = 'flex';
  });

  cancelModalBtn?.addEventListener('click', () => {
    if (submitModal) submitModal.style.display = 'none';
  });

  confirmSubmitBtn?.addEventListener('click', () => {
    if (submitModal) submitModal.style.display = 'none';
    executeSubmit();
  });

  let isSubmitting = false;
  async function executeSubmit() {
    if (isSubmitting) return;
    isSubmitting = true;
    if (confirmSubmitBtn) confirmSubmitBtn.disabled = true;

    drafts[currentPart] = textarea ? textarea.value : '';
    const p1Text = drafts[1] || '';
    const p2Text = drafts[2] || '';
    const fullContent = `--- PART 1 (TASK 1) ---\n${p1Text}\n\n--- PART 2 (TASK 2) ---\n${p2Text}`;
    const p1Words = p1Text.trim() ? p1Text.trim().split(/\s+/).filter(Boolean).length : 0;
    const p2Words = p2Text.trim() ? p2Text.trim().split(/\s+/).filter(Boolean).length : 0;
    const totalWords = p1Words + p2Words;

    if (totalWords < 25) {
      alert('Your response is too short to submit. Please write at least 25 words.');
      isSubmitting = false;
      if (confirmSubmitBtn) confirmSubmitBtn.disabled = false;
      return;
    }

    if (!token) {
      alert('Please log in to submit your response.');
      location.assign('/english/login?next=' + encodeURIComponent(location.pathname + location.search));
      isSubmitting = false;
      if (confirmSubmitBtn) confirmSubmitBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch('/api/writing/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          assignmentId: assignmentId || null,
          topicTitle: testData.title,
          prompt: `${testData.part1.guide}\n${testData.part2.guide}`,
          essayContent: fullContent,
          wordCount: totalWords,
          timeSpentSeconds: 3600 - totalRemainingSeconds,
          mode
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      localStorage.removeItem(`cdi_draft_${assignmentId || 'exam'}_part1`);
      localStorage.removeItem(`cdi_draft_${assignmentId || 'exam'}_part2`);

      alert(`IELTS Writing response submitted (${totalWords} words total). Your teacher will review and grade your test.`);
      location.assign('/english/account?tab=homework');
    } catch (err) {
      alert('Submission error: ' + err.message);
      isSubmitting = false;
      if (confirmSubmitBtn) confirmSubmitBtn.disabled = false;
    }
  }

  function escape(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Initial render
  setPart(1);
})();
