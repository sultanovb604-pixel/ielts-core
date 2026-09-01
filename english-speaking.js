// IELTS Core AI Speaking Studio Controller — Zoom Video Call Integration
(function () {
  'use strict';

  let avatar = null;
  let recorder = null;
  let recognition = null;
  let speakingBank = null;

  // State
  let activeMode = 'exam'; // 'exam' | 'practice' | 'solo'
  let examStage = 1; // 1 = Part 1, 2 = Part 2, 3 = Part 3
  let currentQuestionIdx = 0;
  let activePart1Topic = null;
  let activePart2Card = null;
  let currentQuestionText = '';
  let fullSessionTranscript = [];
  let currentTurnTranscript = '';
  let isRecording = false;

  // DOM Elements
  const modeBtnExam = document.getElementById('modeBtnExam');
  const modeBtnPractice = document.getElementById('modeBtnPractice');
  const modeBtnSolo = document.getElementById('modeBtnSolo');
  const stageIndicator = document.getElementById('speakingStageIndicator');
  const stagePill1 = document.getElementById('stagePill1');
  const stagePill2 = document.getElementById('stagePill2');
  const stagePill3 = document.getElementById('stagePill3');
  const practiceFeedbackBox = document.getElementById('practiceFeedbackBox');
  const practiceTipText = document.getElementById('practiceTipText');
  const practiceVocabTags = document.getElementById('practiceVocabTags');
  const audioManager = document.getElementById('speakingAudioManager');
  const recordedAudioPlayer = document.getElementById('recordedAudioPlayer');
  const recordedDurationTag = document.getElementById('recordedDurationTag');
  const downloadAudioBtn = document.getElementById('downloadAudioBtn');
  const submitTeacherBtn = document.getElementById('submitTeacherBtn');

  async function init() {
    // 1. Initialize Examiner Avatar & Zoom Conference Stage
    avatar = new window.SpeakingExaminerAvatar('examinerAvatarMount');

    // 2. Initialize Audio Recorder
    recorder = new window.SpeakingAudioRecorder();

    // 3. Initialize Web Speech Recognition
    setupSpeechRecognition();

    // 4. Fetch Speaking Question Bank
    try {
      const res = await fetch('/api/speaking-bank');
      speakingBank = res.ok ? await res.json() : { part1: [], part2: [] };
    } catch (e) {
      console.warn('Using fallback speaking bank');
      speakingBank = { part1: [], part2: [] };
    }

    // 5. Setup UI Event Listeners
    setupEvents();

    // 6. Show Start Call Waiting Room Overlay
    switchMode('exam');
  }

  let silenceTimer = null;

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        if (avatar) avatar.showCandidateLiveSpeech('Listening to your voice... Speak anytime!');
      };

      recognition.onresult = event => {
        let finalStr = '';
        let interimStr = '';
        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && item[0] && item[0].transcript) {
            if (item.isFinal) {
              finalStr += item[0].transcript + ' ';
            } else {
              interimStr += item[0].transcript;
            }
          }
        }
        const combined = (finalStr + interimStr).trim();
        if (combined) {
          currentTurnTranscript = combined;
          if (avatar) {
            avatar.showCandidateLiveSpeech(currentTurnTranscript);
            if (avatar.chatTextInput) avatar.chatTextInput.value = currentTurnTranscript;
          }
        }

        // Hands-Free Auto Silence Detection (Casual AI Chat)
        if (activeMode === 'practice' && isRecording && currentTurnTranscript.length >= 3) {
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            if (isRecording && activeMode === 'practice' && currentTurnTranscript.length >= 3) {
              toggleMicrophone();
            }
          }, 1800); // 1.8s natural pause submits speech
        }
      };

      recognition.onerror = event => {
        console.warn('Speech recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          if (avatar) avatar.showCandidateLiveSpeech('Microphone permission blocked. Please allow mic in browser settings.');
        }
      };

      recognition.onend = () => {
        if (isRecording) {
          try { recognition.start(); } catch(e) {}
        }
      };
    }
  }

  function setupEvents() {
    modeBtnExam.onclick = () => switchMode('exam');
    modeBtnPractice.onclick = () => switchMode('practice');
    modeBtnSolo.onclick = () => switchMode('solo');

    if (avatar.micToggleBtn) {
      avatar.micToggleBtn.onclick = toggleMicrophone;
    }

    if (avatar.chatSendBtn && avatar.chatTextInput) {
      const submitChatText = () => {
        const text = avatar.chatTextInput.value.trim();
        if (text) {
          avatar.chatTextInput.value = '';
          currentTurnTranscript = text;
          if (isRecording) {
            if (silenceTimer) clearTimeout(silenceTimer);
            isRecording = false;
            if (recognition) try { recognition.stop(); } catch(e) {}
            avatar.setState('thinking');
            if (avatar.micToggleBtn) avatar.micToggleBtn.classList.remove('recording');
          }
          evaluateTurnResponse(text);
        }
      };

      avatar.chatSendBtn.onclick = submitChatText;
      avatar.chatTextInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitChatText();
        }
      };
    }

    if (avatar.nextTurnBtn) {
      avatar.nextTurnBtn.onclick = proceedToNextQuestion;
    }

    if (avatar.repeatBtn) {
      avatar.repeatBtn.onclick = () => {
        if (currentQuestionText) {
          avatar.speakText(currentQuestionText);
        }
      };
    }

    downloadAudioBtn.onclick = () => {
      recorder.downloadRecording(`ielts_speaking_${activeMode}_${Date.now()}.webm`);
    };

    submitTeacherBtn.onclick = async () => {
      try {
        submitTeacherBtn.disabled = true;
        submitTeacherBtn.textContent = 'Submitting...';
        await recorder.uploadToTeacher(null, `Speaking: ${currentQuestionText.slice(0, 40)}`);
        alert('Audio recording submitted successfully to your Teacher workspace!');
        submitTeacherBtn.textContent = 'Submitted ✓';
      } catch (err) {
        alert(err.message);
        submitTeacherBtn.disabled = false;
        submitTeacherBtn.textContent = 'Send to Teacher';
      }
    };
  }

  function switchMode(mode) {
    activeMode = mode;
    modeBtnExam.classList.toggle('active', mode === 'exam');
    modeBtnPractice.classList.toggle('active', mode === 'practice');
    modeBtnSolo.classList.toggle('active', mode === 'solo');

    if (avatar) avatar.setPersona(mode);
    if (silenceTimer) clearTimeout(silenceTimer);

    if (mode === 'solo') {
      stageIndicator.style.display = 'none';
      if (avatar.slideOverlay) avatar.slideOverlay.style.display = 'flex';
      if (avatar.startOverlay) avatar.startOverlay.style.display = 'none';
      practiceFeedbackBox.style.display = 'none';
      loadRandomCueCard();
    } else if (mode === 'practice') {
      // Practice AI Partner
      stageIndicator.style.display = 'none';
      if (avatar.slideOverlay) avatar.slideOverlay.style.display = 'none';
      practiceFeedbackBox.style.display = 'none';
      fullSessionTranscript = [];
      currentTurnTranscript = '';
      currentQuestionIdx = 0;
      audioManager.style.display = 'none';
      if (avatar.nextTurnBtn) avatar.nextTurnBtn.style.display = 'none';

      avatar.showStartOverlay({
        title: 'Start Practice Assistant Session',
        desc: 'Connect with your <strong>Practice AI Assistant</strong>.<br/>Speak naturally about any topic in real time.',
        btnLabel: 'Start Practice Call',
        onStart: () => {
          beginCasualChat();
        }
      });
    } else {
      // Real Cambridge Exam Mode
      stageIndicator.style.display = 'flex';
      if (avatar.slideOverlay) avatar.slideOverlay.style.display = 'none';
      practiceFeedbackBox.style.display = 'none';
      
      avatar.showStartOverlay({
        title: 'Join Official Video Assessment',
        desc: 'The <strong>Virtual AI Examiner</strong> is waiting in the secure virtual room.<br/>Click to start the live video interview.',
        btnLabel: 'Start Examination',
        onStart: () => {
          beginExamInterview();
        }
      });
    }
  }

  function beginCasualChat() {
    const greeting = "Hey there! I'm your AI Assistant. So great to connect with you! What's on your mind today?";
    currentQuestionText = greeting;
    practiceFeedbackBox.style.display = 'block';
    practiceTipText.textContent = '🟢 Hands-Free Voice Chat Active (Speak naturally, AI listens and responds)';
    practiceVocabTags.innerHTML = '';

    avatar.speakText(greeting, () => {
      if (activeMode === 'practice' && !isRecording) {
        toggleMicrophone();
      }
    });
  }

  async function beginExamInterview() {
    examStage = 1;
    currentQuestionIdx = 0;
    fullSessionTranscript = [];
    currentTurnTranscript = '';

    updateStagePills();
    if (avatar.slideOverlay) avatar.slideOverlay.style.display = 'none';

    // Fetch dynamic Part 1 Question from Gemini AI
    try {
      const res = await fetch('/api/speaking/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'part1' })
      });
      const json = await res.json();
      if (json.data && json.data.question) {
        currentQuestionText = json.data.question;
        avatar.speakText(currentQuestionText);
        resetTurnUI();
        return;
      }
    } catch(e) {}

    // Fallback to speaking bank
    if (speakingBank.part1 && speakingBank.part1.length > 0) {
      activePart1Topic = speakingBank.part1[Math.floor(Math.random() * speakingBank.part1.length)];
      currentQuestionText = activePart1Topic.questions[0] || "What is the first thing you usually do after you wake up in the morning?";
    } else {
      currentQuestionText = "Welcome to the IELTS Speaking test. What is your full name, and where are you from?";
    }
    avatar.speakText(currentQuestionText);
    resetTurnUI();
  }

  function askPart1Question() {
    const questions = activePart1Topic?.questions || [
      "Let's talk about where you live. What do you like most about your hometown?",
      "How do you usually spend your weekends?",
      "Do you think your daily routine will change in the coming months?"
    ];

    currentQuestionText = questions[currentQuestionIdx] || questions[0];
    avatar.speakText(currentQuestionText);

    resetTurnUI();
  }

  async function askPart2CueCard() {
    examStage = 2;
    updateStagePills();

    let card = activePart2Card || {
      title: 'Describe a memorable journey you have taken',
      bullets: ['Where you went', 'Who you went with', 'What you did', 'And why it was memorable']
    };

    // Try dynamic Gemini Cue Card generation
    try {
      const res = await fetch('/api/speaking/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'part2' })
      });
      const json = await res.json();
      if (json.data && json.data.title) {
        card = json.data;
        activePart2Card = card;
      }
    } catch(e) {}

    if (avatar.slideOverlay) {
      const titleEl = avatar.slideOverlay.querySelector('#slideTopicTitle');
      const bulletsEl = avatar.slideOverlay.querySelector('#slideBulletsList');
      if (titleEl) titleEl.textContent = card.title;
      if (bulletsEl) bulletsEl.innerHTML = `<ul>${card.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`;
      avatar.slideOverlay.style.display = 'flex';
    }

    const intro = "Now, I'm going to give you a topic and I'd like you to talk about it for one to two minutes. You have one minute to think about what you are going to say.";
    currentQuestionText = intro;
    avatar.speakText(intro, () => {
      startPrepCountdown(60);
    });

    resetTurnUI();
  }

  function startPrepCountdown(seconds) {
    let left = seconds;
    const timerPill = avatar.slideOverlay ? avatar.slideOverlay.querySelector('#slideTimerPill') : null;
    const timer = setInterval(() => {
      left--;
      const mins = Math.floor(left / 60);
      const secs = left % 60;
      if (timerPill) timerPill.textContent = `Prep: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (left <= 0) {
        clearInterval(timer);
        avatar.speakText("All right, your preparation time is up. Please begin speaking now.");
      }
    }, 1000);
  }

  function askPart3Question() {
    examStage = 3;
    updateStagePills();
    if (avatar.slideOverlay) avatar.slideOverlay.style.display = 'none';

    const part3Qs = activePart2Card?.part3 || [
      "Why do you think travel has become so popular in modern society?",
      "How might artificial intelligence impact international tourism in the coming decades?"
    ];

    currentQuestionText = part3Qs[currentQuestionIdx] || part3Qs[0];
    avatar.speakText(currentQuestionText);

    resetTurnUI();
  }

  async function toggleMicrophone() {
    if (!isRecording) {
      // Start Recording / Listening
      try {
        currentTurnTranscript = '';
        if (avatar) {
          avatar.showCandidateLiveSpeech('Listening... Speak anytime!');
          if (avatar.chatTextInput) avatar.chatTextInput.value = '';
          avatar.startAudioVolumeMonitor();
        }

        if (activeMode === 'solo') {
          await recorder.startRecording((blob, url, duration) => {
            recordedAudioPlayer.src = url;
            recordedDurationTag.textContent = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
            audioManager.style.display = 'block';
          });
        }

        if (recognition) {
          try { recognition.abort(); } catch(e) {}
          setTimeout(() => {
            try { recognition.start(); } catch(e) {}
          }, 80);
        }

        isRecording = true;
        avatar.setState('listening');
        if (avatar.micToggleBtn) {
          avatar.micToggleBtn.classList.add('recording');
          if (avatar.micLabel) avatar.micLabel.textContent = activeMode === 'practice' ? 'Listening 🎙️' : 'Finish Answer ⏹';
        }
      } catch (err) {
        console.warn('Mic start error:', err.message);
      }
    } else {
      // Stop Recording
      if (silenceTimer) clearTimeout(silenceTimer);
      if (activeMode === 'solo') {
        recorder.stopRecording();
      }
      isRecording = false;

      if (recognition) {
        try { recognition.stop(); } catch(e) {}
      }

      avatar.setState('thinking');
      if (avatar.micToggleBtn) {
        avatar.micToggleBtn.classList.remove('recording');
        if (avatar.micLabel) avatar.micLabel.textContent = activeMode === 'practice' ? 'Processing...' : 'Record Again 🎙️';
      }

      // If user hasn't spoken anything yet, keep waiting without sending dummy text
      if (!currentTurnTranscript || currentTurnTranscript.trim().length < 2) {
        avatar.setState('idle');
        if (avatar.micLabel) avatar.micLabel.textContent = activeMode === 'practice' ? 'Click to Speak 🎙️' : 'Click to Answer 🎙️';
        if (avatar) avatar.showCandidateLiveSpeech('Listening to your voice... Speak anytime!');
        if (activeMode === 'practice') {
          setTimeout(() => {
            if (activeMode === 'practice' && !isRecording) {
              toggleMicrophone();
            }
          }, 800);
        }
        return;
      }

      evaluateTurnResponse();
    }
  }

  async function evaluateTurnResponse(overrideText) {
    const finalTurnSpeech = (overrideText || currentTurnTranscript || "I shared my thoughts with you.").trim();
    if (avatar && avatar.chatTextInput) avatar.chatTextInput.value = '';
    fullSessionTranscript.push({
      role: 'user',
      text: finalTurnSpeech,
      question: currentQuestionText,
      transcript: finalTurnSpeech
    });

    try {
      const res = await fetch('/api/speaking/ai-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: activeMode,
          stage: `part${examStage}`,
          questionIndex: currentQuestionIdx,
          currentQuestion: currentQuestionText,
          userTranscript: finalTurnSpeech,
          history: fullSessionTranscript
        })
      });

      const data = await res.json();
      if (avatar) avatar.hideCandidateLiveSpeech();

      if (activeMode === 'exam') {
        setTimeout(() => {
          avatar.setState('idle');
          currentQuestionIdx++;
          if (examStage === 1 && currentQuestionIdx < 3) {
            const nextQ = data.generatedFollowUp || activePart1Topic?.questions[currentQuestionIdx] || "How do you feel about that in your daily routine?";
            const conversationalSpeech = (data.naturalMarker ? data.naturalMarker + ' ' : '') + nextQ;
            currentQuestionText = nextQ;
            avatar.speakText(conversationalSpeech);
          } else if (examStage === 1 && currentQuestionIdx >= 3) {
            currentQuestionIdx = 0;
            askPart2CueCard();
          } else if (examStage === 2) {
            currentQuestionIdx = 0;
            askPart3Question();
          } else if (examStage === 3 && currentQuestionIdx < 2) {
            const nextQ = data.generatedFollowUp || activePart2Card?.part3[currentQuestionIdx] || "Why is that significant for modern society?";
            const conversationalSpeech = (data.naturalMarker ? data.naturalMarker + ' ' : '') + nextQ;
            currentQuestionText = nextQ;
            avatar.speakText(conversationalSpeech);
          } else {
            finishSpeakingExam();
          }
        }, 500);
      } else if (activeMode === 'practice') {
        // Pure Casual Hands-Free AI Chat Response (100% User Topic)
        const reply = data.replyText || "That's really interesting! Tell me more about what you think.";
        currentQuestionText = reply;
        fullSessionTranscript.push({ role: 'model', text: reply });

        if (data.cleanedTranscript && avatar) {
          avatar.showCandidateLiveSpeech(data.cleanedTranscript);
        }

        // Speak back immediately with perfect lip sync and then automatically listen again
        avatar.speakText(reply, () => {
          if (activeMode === 'practice' && !isRecording) {
            setTimeout(() => {
              toggleMicrophone();
            }, 300);
          }
        });

        practiceFeedbackBox.style.display = 'block';
        practiceTipText.innerHTML = `<strong>🗣️ Heard:</strong> <em>"${data.cleanedTranscript || finalTurnSpeech}"</em>`;
        practiceVocabTags.innerHTML = (data.vocabTips || []).map(v => `<span class="practice-vocab-tag">${v}</span>`).join('');
        if (avatar.nextTurnBtn) avatar.nextTurnBtn.style.display = 'none';
      }
    } catch (e) {
      avatar.setState('idle');
      if (avatar) avatar.hideCandidateLiveSpeech();
    }
  }

  function proceedToNextQuestion() {
    currentQuestionIdx++;

    if (examStage === 1) {
      if (currentQuestionIdx >= 3) {
        currentQuestionIdx = 0;
        askPart2CueCard();
      } else {
        askPart1Question();
      }
    } else if (examStage === 2) {
      currentQuestionIdx = 0;
      askPart3Question();
    } else if (examStage === 3) {
      if (currentQuestionIdx >= 2) {
        finishSpeakingExam();
      } else {
        askPart3Question();
      }
    }
  }

  async function finishSpeakingExam() {
    if (avatar.micToggleBtn) avatar.micToggleBtn.style.display = 'none';
    if (avatar.nextTurnBtn) avatar.nextTurnBtn.style.display = 'none';
    if (avatar.slideOverlay) avatar.slideOverlay.style.display = 'none';

    avatar.showCandidateLiveSpeech('Grading speaking performance across all criteria...');

    let evaluation = null;
    try {
      const res = await fetch('/api/speaking/grade-full-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: activeMode,
          topic: activePart2Card?.title || activePart1Topic?.title || 'IELTS Speaking Full Mock',
          transcripts: fullSessionTranscript
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.evaluation) {
          evaluation = json.evaluation;
        }
      }
    } catch(e) {
      console.warn('Grading error:', e);
    }

    if (!evaluation) {
      const userUtterances = fullSessionTranscript.filter(t => t.role === 'user').map(t => t.text);
      const totalWords = userUtterances.reduce((acc, u) => acc + (u ? u.split(/\s+/).length : 0), 0);
      let calculatedBand = 5.0;
      if (totalWords >= 220) calculatedBand = 6.5;
      else if (totalWords >= 120) calculatedBand = 6.0;
      else if (totalWords >= 50) calculatedBand = 5.5;

      evaluation = {
        overallBand: calculatedBand,
        fluency: calculatedBand,
        fluencyFeedback: totalWords >= 100 ? 'Maintained speech flow across multiple questions.' : 'Responses were brief; practice expanding your points with reasons and examples.',
        lexical: calculatedBand,
        lexicalFeedback: 'Adequate vocabulary for familiar topics.',
        grammar: calculatedBand,
        grammarFeedback: 'Mix of basic and compound sentence structures.',
        pronunciation: calculatedBand >= 6.0 ? 6.0 : 5.5,
        pronunciationFeedback: 'Clear phonological delivery.',
        examinerSummary: `Overall estimated performance: Band ${calculatedBand.toFixed(1)} based on recorded discourse length and communicative coherence.`,
        strengths: ['Responded to examiner prompts', 'Clear communicative intent'],
        improvements: ['Elaborate responses with specific examples', 'Incorporate a wider range of grammatical structures']
      };
    }

    if (avatar) avatar.hideCandidateLiveSpeech();

    const bandStr = Number(evaluation.overallBand).toFixed(1);
    const spokenVerdict = `That concludes the speaking examination. Based on your performance across all criteria, your estimated score is Band ${bandStr}. Please review your official score breakdown on the screen.`;

    avatar.speakText(spokenVerdict);

    avatar.showScoreModal(evaluation, {
      onRetake: () => {
        switchMode('exam');
      },
      onReview: () => {
        practiceFeedbackBox.style.display = 'block';
        practiceTipText.innerHTML = `<strong>Session Transcript Summary (${fullSessionTranscript.length} turns recorded):</strong>`;
        practiceVocabTags.innerHTML = fullSessionTranscript.map((t, idx) => `<div style="margin:4px 0;font-size:12px;color:#cbd5e1;"><strong>${t.role === 'model' ? 'Examiner' : 'You'}:</strong> ${t.text}</div>`).join('');
      }
    });

    // Submit Complete Speaking Result to student records
    const token = localStorage.getItem('vortex-english-token');
    if (token) {
      fetch('/api/speaking/submit-attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mode: activeMode,
          topicTitle: activePart2Card?.title || 'IELTS Speaking Full Mock',
          overallBand: evaluation.overallBand,
          fluencyScore: evaluation.fluency,
          lexicalScore: evaluation.lexical,
          grammarScore: evaluation.grammar,
          pronunciationScore: evaluation.pronunciation,
          transcripts: fullSessionTranscript
        })
      }).catch(e => console.error(e));
    }
  }

  function resetTurnUI() {
    currentTurnTranscript = '';
    if (avatar.nextTurnBtn) avatar.nextTurnBtn.style.display = 'none';
    practiceFeedbackBox.style.display = 'none';
    audioManager.style.display = 'none';
  }

  function updateStagePills() {
    stagePill1.className = 'stage-pill' + (examStage === 1 ? ' active' : '');
    stagePill2.className = 'stage-pill' + (examStage === 2 ? ' active' : '');
    stagePill3.className = 'stage-pill' + (examStage === 3 ? ' active' : '');
  }

  function loadRandomCueCard() {
    const card = (speakingBank.part2 && speakingBank.part2[0]) || {
      title: 'Describe a useful skill you learned recently',
      bullets: ['What the skill is', 'How you learned it', 'Why it is useful']
    };
    if (avatar.slideOverlay) {
      const titleEl = avatar.slideOverlay.querySelector('#slideTopicTitle');
      const bulletsEl = avatar.slideOverlay.querySelector('#slideBulletsList');
      if (titleEl) titleEl.textContent = card.title;
      if (bulletsEl) bulletsEl.innerHTML = `<ul>${card.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`;
    }
  }

  init();
})();
