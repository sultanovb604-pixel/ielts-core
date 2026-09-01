// IELTS Core 100% Animated Cambridge Examiner & Live Speech Engine
(function () {
  'use strict';

  class SpeakingExaminerAvatar {
    constructor(containerId) {
      this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      this.isSpeaking = false;
      this.isListening = false;
      this.animInterval = null;
      this.blinkInterval = null;
      this.userVideoStream = null;
      this.cameraEnabled = true;
      this.subtitlesEnabled = true;
      this.isFullscreen = false;
      this.viewMode = 'photo'; // 'animated' | 'photo'
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          try { window._cachedVoices = window.speechSynthesis.getVoices(); } catch(e) {}
        };
        try { window._cachedVoices = window.speechSynthesis.getVoices(); } catch(e) {}
      }
      this.init();
    }

    init() {
      if (!this.container) return;
      this.container.innerHTML = `
        <div class="zoom-conference-stage" id="zoomConferenceStage">
          <!-- Zoom Top Title Bar -->
          <div class="zoom-top-bar">
            <div class="zoom-live-tag">
              <span class="live-blink-dot"></span>
              <span>REC · LIVE</span>
            </div>
            <div class="zoom-center-info">
              <span class="zoom-room-title">IELTS Online Official Video Call Examination</span>
              <span class="zoom-room-sub">Room #842 · Cambridge CDI Assessment Session</span>
            </div>
            <div class="zoom-right-badges">
              <button type="button" class="zoom-badge-btn gemini-btn" id="openGeminiModalBtn" title="Google Gemini Real AI Engine">
                <span class="material-symbols-outlined" style="font-size:14px;color:#38bdf8;">auto_awesome</span>
                <span id="geminiStatusLabel">Gemini AI</span>
              </button>
              <button type="button" class="zoom-badge-btn" id="toggleAvatarStyleBtn" title="Switch Avatar Style">
                <span class="material-symbols-outlined" style="font-size:14px;">style</span>
                <span id="avatarStyleLabel">Style: Cartoon</span>
              </button>
              <span class="zoom-badge-pill">1080p 60fps</span>
              <span class="zoom-badge-pill secure"><span class="material-symbols-outlined" style="font-size:14px;">lock</span> Encrypted</span>
            </div>
          </div>

          <!-- Main Zoom Stage Video Frame -->
          <div class="zoom-video-screen" id="zoomVideoScreen">
            <!-- 2. PHOTO VIEW -->
            <div class="examiner-photo-view" id="examinerPhotoView" style="display:flex; width:100%; height:100%;">
              <img src="/assets/examiner_video_call.jpg" alt="Dr. Alan Sterling" class="examiner-photo-feed" style="width:100%; height:100%; object-fit:cover;" />
            </div>

            <!-- Active Audio Waveform -->
            <div class="zoom-speaker-wave" id="zoomSpeakerWave">
              <span class="v-bar"></span>
              <span class="v-bar"></span>
              <span class="v-bar"></span>
              <span class="v-bar"></span>
              <span class="v-bar"></span>
            </div>

            <!-- Examiner Name Tag Overlay -->
            <div class="zoom-examiner-tag">
              <span class="material-symbols-outlined" id="examinerSpeakerIcon" style="font-size:16px;color:#38bdf8;">volume_up</span>
              <span class="examiner-name">Virtual AI Examiner (IELTS Core)</span>
            </div>

            <!-- Picture-in-Picture Candidate Self Webcam -->
            <div class="zoom-pip-box" id="zoomPipBox">
              <video class="pip-video-feed" id="pipVideoFeed" autoplay muted playsinline></video>
              <div class="pip-fallback-avatar" id="pipFallbackAvatar">
                <span class="material-symbols-outlined" style="font-size:32px;color:#94a3b8;">person</span>
                <span>YOU</span>
              </div>
              <div class="pip-tag">
                <span class="material-symbols-outlined" id="pipMicStatusIcon" style="font-size:13px;color:#10b981;">mic</span>
                <span>Candidate (You)</span>
              </div>
            </div>

            <!-- Live Candidate Speech Bubble (Shows AI actively listening to you!) -->
            <div class="zoom-candidate-live-hud" id="zoomCandidateLiveHud" style="display:none;">
              <div class="candidate-hud-header">
                <span class="live-mic-pulse"></span>
                <strong>AI LISTENING TO YOUR VOICE...</strong>
                <div class="candidate-wave-meter" id="candidateVoiceWaveBars">
                  <span class="wave-bar w1"></span>
                  <span class="wave-bar w2"></span>
                  <span class="wave-bar w3"></span>
                  <span class="wave-bar w4"></span>
                </div>
              </div>
              <p class="candidate-live-transcript" id="candidateLiveTranscriptText">Listening to your voice... Speak anytime!</p>
            </div>

            <!-- Cue Card Slide Presentation Overlay (Part 2) -->
            <div class="zoom-presentation-slide" id="zoomPresentationSlide" style="display:none;">
              <div class="slide-header">
                <span class="material-symbols-outlined" style="color:#1468f3;">assignment</span>
                <strong>IELTS SPEAKING PART 2 · CUE CARD</strong>
                <span class="slide-timer-pill" id="slideTimerPill">Prep: 01:00</span>
              </div>
              <h3 id="slideTopicTitle">Describe a memorable journey you have taken</h3>
              <div id="slideBulletsList" class="slide-bullets"></div>
            </div>

            <!-- Subtitle / Closed Caption HUD Bar -->
            <div class="zoom-subtitles-hud" id="zoomSubtitlesHud">
              <span class="cc-badge">EXAMINER</span>
              <p class="cc-text" id="zoomSubtitleText">"Welcome to the IELTS Speaking Examination. Please state your full name."</p>
            </div>

            <!-- Interactive Live Speech / Text Input Bar -->
            <div class="zoom-chat-input-bar" id="zoomChatInputBar">
              <div class="input-mic-indicator">
                <span class="pulse-dot"></span>
              </div>
              <input type="text" class="zoom-chat-text-input" id="zoomChatTextInput" placeholder="Speak into mic or type message here..." autocomplete="off" />
              <button type="button" class="zoom-chat-send-btn" id="zoomChatSendBtn" title="Send (Enter)">
                <span class="material-symbols-outlined">send</span>
              </button>
            </div>

            <!-- Start Call Blur Overlay (Call Waiting Room) -->
            <div class="zoom-start-overlay" id="zoomStartOverlay">
              <div class="start-overlay-card">
                <div class="start-avatar-pulse">
                  <div class="pulse-ring r1"></div>
                  <div class="pulse-ring r2"></div>
                  <button type="button" class="start-call-play-btn" id="startCallPlayBtn" title="Start Call">
                    <span class="material-symbols-outlined start-icon">videocam</span>
                  </button>
                </div>
                <h3 class="start-title" id="startOverlayTitle">Join Official Video Examination</h3>
                <p class="start-desc" id="startOverlayDesc">The Virtual AI Examiner is waiting in the secure virtual room.<br/>Click to start the live automated assessment.</p>
                <button type="button" class="start-action-btn" id="startActionBtn">
                  <span class="material-symbols-outlined">play_circle</span>
                  <span id="startActionBtnLabel">Start Examination</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Zoom Bottom Control Toolbar -->
          <div class="zoom-bottom-toolbar">
            <div class="toolbar-group left">
              <button type="button" class="zoom-tool-btn mic-btn" id="zoomMicToggleBtn">
                <span class="material-symbols-outlined mic-icon" id="zoomMicIcon">mic</span>
                <span id="zoomMicLabel">Click to Answer</span>
              </button>
            </div>

            <div class="toolbar-group center">
              <button type="button" class="zoom-tool-btn" id="zoomCameraToggleBtn" title="Toggle Webcam">
                <span class="material-symbols-outlined">videocam</span>
                <span>Camera</span>
              </button>
              <button type="button" class="zoom-tool-btn active" id="zoomCcToggleBtn" title="Toggle Captions">
                <span class="material-symbols-outlined">closed_caption</span>
                <span>Subtitles</span>
              </button>
              <button type="button" class="zoom-tool-btn" id="zoomFullscreenBtn" title="Full Screen (⛶)">
                <span class="material-symbols-outlined">fullscreen</span>
                <span>Full Screen</span>
              </button>
              <button type="button" class="zoom-tool-btn" id="zoomRepeatBtn" title="Repeat Question">
                <span class="material-symbols-outlined">replay</span>
                <span>Repeat</span>
              </button>
            </div>

            <div class="toolbar-group right">
              <button type="button" class="zoom-tool-btn next-q-btn" id="zoomNextTurnBtn" style="display:none;">
                <span>Next Question</span>
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>

          <!-- Google Gemini AI Token Modal -->
          <div class="zoom-gemini-modal" id="zoomGeminiModal" style="display:none;">
            <div class="gemini-modal-box">
              <div class="gemini-modal-header">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="material-symbols-outlined" style="color:#38bdf8;font-size:22px;">settings_suggest</span>
                  <strong>Assessment Engine Configuration</strong>
                </div>
                <button type="button" class="modal-close-x" id="closeGeminiModalBtn">✕</button>
              </div>
              <div class="gemini-modal-body">
                <p>To activate the real-time AI Assessment Engine for your speaking test, please connect your authorized processing key:</p>
                <div class="gemini-input-row">
                  <input type="password" id="geminiKeyInput" placeholder="Paste your API key here..." autocomplete="off" />
                  <button type="button" class="button primary" id="saveGeminiKeyBtn">Connect Engine</button>
                </div>
                <div id="geminiFeedbackMsg" class="gemini-feedback-msg" style="display:none;"></div>
                <div class="gemini-modal-footer">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">
                    <span>Obtain an Authorized Processing Key</span>
                    <span class="material-symbols-outlined" style="font-size:13px;">open_in_new</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Cambridge Official Speaking Band Score Card Modal -->
          <div class="zoom-score-modal" id="zoomExamScoreModal" style="display:none;">
            <div class="score-card-container">
              <div class="score-card-header">
                <div class="score-card-brand">
                  <span class="material-symbols-outlined score-brand-icon">military_tech</span>
                  <div>
                    <h3 class="score-main-title">IELTS Speaking Official Evaluation</h3>
                    <p class="score-sub-title">Cambridge English Assessment · Senior Examiner Report</p>
                  </div>
                </div>
                <button type="button" class="score-close-btn" id="closeScoreModalBtn">✕</button>
              </div>

              <div class="score-card-body">
                <!-- Overall Band Banner -->
                <div class="overall-band-banner">
                  <div class="band-number-wrap">
                    <span class="band-label">ESTIMATED BAND SCORE</span>
                    <span class="band-huge" id="scoreOverallBand">7.5</span>
                  </div>
                  <div class="examiner-verdict-box">
                    <div class="examiner-avatar-chip">
                      <span class="material-symbols-outlined">person</span>
                      <strong>AI Examiner Verdict</strong>
                    </div>
                    <p class="examiner-summary-text" id="scoreExaminerSummary">"A highly articulate and competent performance demonstrating natural coherence and strong lexical variety throughout all 3 parts of the examination."</p>
                  </div>
                </div>

                <!-- 4 Criteria Breakdown Grid -->
                <div class="criteria-score-grid">
                  <div class="criterion-card">
                    <div class="crit-head">
                      <span>Fluency &amp; Coherence</span>
                      <span class="crit-badge" id="scoreFcBadge">Band 7.5</span>
                    </div>
                    <div class="crit-bar-track"><div class="crit-bar-fill" id="scoreFcBar" style="width: 83%;"></div></div>
                    <p class="crit-desc" id="scoreFcFeedback">Natural speaking flow with smooth topic progression.</p>
                  </div>

                  <div class="criterion-card">
                    <div class="crit-head">
                      <span>Lexical Resource</span>
                      <span class="crit-badge" id="scoreLrBadge">Band 8.0</span>
                    </div>
                    <div class="crit-bar-track"><div class="crit-bar-fill" id="scoreLrBar" style="width: 88%;"></div></div>
                    <p class="crit-desc" id="scoreLrFeedback">Rich range of idiomatic and topic-specific vocabulary.</p>
                  </div>

                  <div class="criterion-card">
                    <div class="crit-head">
                      <span>Grammar Range &amp; Accuracy</span>
                      <span class="crit-badge" id="scoreGraBadge">Band 7.0</span>
                    </div>
                    <div class="crit-bar-track"><div class="crit-bar-fill" id="scoreGraBar" style="width: 77%;"></div></div>
                    <p class="crit-desc" id="scoreGraFeedback">Good mix of complex sentence structures with minor slips.</p>
                  </div>

                  <div class="criterion-card">
                    <div class="crit-head">
                      <span>Pronunciation &amp; Delivery</span>
                      <span class="crit-badge" id="scorePrBadge">Band 7.5</span>
                    </div>
                    <div class="crit-bar-track"><div class="crit-bar-fill" id="scorePrBar" style="width: 83%;"></div></div>
                    <p class="crit-desc" id="scorePrFeedback">Clear articulation and natural intonation rhythm.</p>
                  </div>
                </div>

                <!-- Strengths & Recommendations -->
                <div class="feedback-columns-row">
                  <div class="feedback-col col-strengths">
                    <h4><span class="material-symbols-outlined">check_circle</span> Key Strengths</h4>
                    <ul id="scoreStrengthsList">
                      <li>Maintained natural conversation rhythm</li>
                      <li>Clear direct answers with good elaboration</li>
                    </ul>
                  </div>
                  <div class="feedback-col col-improvements">
                    <h4><span class="material-symbols-outlined">lightbulb</span> Recommendations</h4>
                    <ul id="scoreImprovementsList">
                      <li>Use more advanced discourse markers in Part 3</li>
                      <li>Extend Cue Card monologues up to full 2 minutes</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="score-card-footer">
                <button type="button" class="button secondary" id="scoreReviewTranscriptsBtn">
                  <span class="material-symbols-outlined">description</span>
                  <span>Review Transcripts</span>
                </button>
                <button type="button" class="button primary" id="scoreRetakeExamBtn">
                  <span class="material-symbols-outlined">replay</span>
                  <span>Retake Examination</span>
                </button>
              </div>
            </div>
          </div>
        </div>`;

      this.stage = this.container.querySelector('#zoomConferenceStage');
      this.vectorView = this.container.querySelector('#examinerVectorView');
      this.photoView = this.container.querySelector('#examinerPhotoView');
      this.styleToggleBtn = this.container.querySelector('#toggleAvatarStyleBtn');
      this.styleLabel = this.container.querySelector('#avatarStyleLabel');
      this.geminiBtn = this.container.querySelector('#openGeminiModalBtn');
      this.geminiStatusLabel = this.container.querySelector('#geminiStatusLabel');
      this.geminiModal = this.container.querySelector('#zoomGeminiModal');
      this.closeGeminiBtn = this.container.querySelector('#closeGeminiModalBtn');
      this.geminiInput = this.container.querySelector('#geminiKeyInput');
      this.saveGeminiBtn = this.container.querySelector('#saveGeminiKeyBtn');
      this.geminiFeedback = this.container.querySelector('#geminiFeedbackMsg');

      // Score Card Elements
      this.scoreModal = this.container.querySelector('#zoomExamScoreModal');
      this.closeScoreBtn = this.container.querySelector('#closeScoreModalBtn');
      this.scoreOverallBand = this.container.querySelector('#scoreOverallBand');
      this.scoreExaminerSummary = this.container.querySelector('#scoreExaminerSummary');
      this.scoreFcBadge = this.container.querySelector('#scoreFcBadge');
      this.scoreFcBar = this.container.querySelector('#scoreFcBar');
      this.scoreFcFeedback = this.container.querySelector('#scoreFcFeedback');
      this.scoreLrBadge = this.container.querySelector('#scoreLrBadge');
      this.scoreLrBar = this.container.querySelector('#scoreLrBar');
      this.scoreLrFeedback = this.container.querySelector('#scoreLrFeedback');
      this.scoreGraBadge = this.container.querySelector('#scoreGraBadge');
      this.scoreGraBar = this.container.querySelector('#scoreGraBar');
      this.scoreGraFeedback = this.container.querySelector('#scoreGraFeedback');
      this.scorePrBadge = this.container.querySelector('#scorePrBadge');
      this.scorePrBar = this.container.querySelector('#scorePrBar');
      this.scorePrFeedback = this.container.querySelector('#scorePrFeedback');
      this.scoreStrengthsList = this.container.querySelector('#scoreStrengthsList');
      this.scoreImprovementsList = this.container.querySelector('#scoreImprovementsList');
      this.scoreRetakeBtn = this.container.querySelector('#scoreRetakeExamBtn');
      this.scoreReviewBtn = this.container.querySelector('#scoreReviewTranscriptsBtn');

      this.currentPersona = 'exam';
      this.sceneExam = this.container.querySelector('#sceneExam');
      this.sceneCasual = this.container.querySelector('#sceneCasual');
      this.examinerNameTag = this.container.querySelector('.zoom-examiner-tag .examiner-name');
      this.roomTitleEl = this.container.querySelector('.zoom-room-title');
      this.roomSubEl = this.container.querySelector('.zoom-room-sub');
      this.ccBadgeEl = this.container.querySelector('.cc-badge');

      // Exam Persona elements
      this.mouthResting = this.container.querySelector('#examinerMouthResting');
      this.mouthTalking = this.container.querySelector('#examinerMouthTalking');
      this.vocalCavity = this.container.querySelector('#vocalCavity');
      this.vocalUpperLip = this.container.querySelector('#vocalUpperLip');
      this.vocalLowerLip = this.container.querySelector('#vocalLowerLip');
      this.examinerHead = this.container.querySelector('#examinerHead');
      this.eyesOpen = this.container.querySelector('#examinerEyes');
      this.eyesClosed = this.container.querySelector('#examinerEyesClosed');

      // Casual Persona elements
      this.casualMouthResting = this.container.querySelector('#casualMouthResting');
      this.casualMouthTalking = this.container.querySelector('#casualMouthTalking');
      this.casualVocalCavity = this.container.querySelector('#casualVocalCavity');
      this.casualVocalUpperLip = this.container.querySelector('#casualVocalUpperLip');
      this.casualVocalLowerLip = this.container.querySelector('#casualVocalLowerLip');
      this.casualHead = this.container.querySelector('#casualHead');
      this.casualEyesOpen = this.container.querySelector('#casualEyes');
      this.casualEyesClosed = this.container.querySelector('#casualEyesClosed');

      this.subtitleText = this.container.querySelector('#zoomSubtitleText');
      this.subtitlesHud = this.container.querySelector('#zoomSubtitlesHud');
      this.speakerWave = this.container.querySelector('#zoomSpeakerWave');
      this.candidateLiveHud = this.container.querySelector('#zoomCandidateLiveHud');
      this.candidateLiveText = this.container.querySelector('#candidateLiveTranscriptText');

      this.pipVideo = this.container.querySelector('#pipVideoFeed');
      this.pipFallback = this.container.querySelector('#pipFallbackAvatar');
      this.pipMicStatusIcon = this.container.querySelector('#pipMicStatusIcon');
      this.micToggleBtn = this.container.querySelector('#zoomMicToggleBtn');
      this.micIcon = this.container.querySelector('#zoomMicIcon');
      this.micLabel = this.container.querySelector('#zoomMicLabel');
      this.nextTurnBtn = this.container.querySelector('#zoomNextTurnBtn');
      this.repeatBtn = this.container.querySelector('#zoomRepeatBtn');
      this.cameraToggleBtn = this.container.querySelector('#zoomCameraToggleBtn');
      this.ccToggleBtn = this.container.querySelector('#zoomCcToggleBtn');
      this.fullscreenBtn = this.container.querySelector('#zoomFullscreenBtn');
      this.slideOverlay = this.container.querySelector('#zoomPresentationSlide');

      this.chatInputBar = this.container.querySelector('#zoomChatInputBar');
      this.chatTextInput = this.container.querySelector('#zoomChatTextInput');
      this.chatSendBtn = this.container.querySelector('#zoomChatSendBtn');
      this.voiceWaveBars = this.container.querySelector('#candidateVoiceWaveBars');

      this.startOverlay = this.container.querySelector('#zoomStartOverlay');
      this.startPlayBtn = this.container.querySelector('#startCallPlayBtn');
      this.startActionBtn = this.container.querySelector('#startActionBtn');
      this.startTitle = this.container.querySelector('#startOverlayTitle');
      this.startDesc = this.container.querySelector('#startOverlayDesc');
      this.startActionBtnLabel = this.container.querySelector('#startActionBtnLabel');

      this.initWebcam();
      this.startAudioVolumeMonitor();
      this.initToolbarEvents();
      this.startNaturalBlinking();
      this.stopMouthAnimation();
    }

    setPersona(mode) {
      this.currentPersona = mode === 'practice' ? 'practice' : 'exam';
      if (this.sceneExam) this.sceneExam.style.display = this.currentPersona === 'exam' ? 'inline' : 'none';
      if (this.sceneCasual) this.sceneCasual.style.display = this.currentPersona === 'practice' ? 'inline' : 'none';

      if (this.examinerNameTag) {
        this.examinerNameTag.textContent = this.currentPersona === 'practice' 
          ? 'Virtual AI Partner (IELTS Core)' 
          : 'Virtual AI Examiner (IELTS Core)';
      }
      if (this.roomTitleEl) {
        this.roomTitleEl.textContent = this.currentPersona === 'practice'
          ? 'Casual English AI Voice Lounge · Free Topic Chat'
          : 'IELTS Online Official Video Call Examination';
      }
      if (this.roomSubEl) {
        this.roomSubEl.textContent = this.currentPersona === 'practice'
          ? 'Real-Time Spoken Conversation Powered by Gemini AI'
          : 'Room #842 · Cambridge CDI Assessment Session';
      }
      if (this.ccBadgeEl) {
        this.ccBadgeEl.textContent = this.currentPersona === 'practice' ? 'AI PARTNER' : 'EXAMINER';
      }
      this.stopMouthAnimation();
    }

    showStartOverlay({ title, desc, btnLabel, onStart }) {
      if (!this.startOverlay) return;
      if (title && this.startTitle) this.startTitle.textContent = title;
      if (desc && this.startDesc) this.startDesc.innerHTML = desc;
      if (btnLabel && this.startActionBtnLabel) this.startActionBtnLabel.textContent = btnLabel;

      if (this.subtitleText) this.subtitleText.textContent = '"Click the Start button to begin."';

      this.startOverlay.style.display = 'flex';
      this.startOverlay.classList.remove('fade-out');

      const triggerStart = () => {
        this.hideStartOverlay();
        if (onStart) onStart();
      };

      if (this.startPlayBtn) this.startPlayBtn.onclick = triggerStart;
      if (this.startActionBtn) this.startActionBtn.onclick = triggerStart;
    }

    hideStartOverlay() {
      if (!this.startOverlay) return;
      this.startOverlay.classList.add('fade-out');
      setTimeout(() => {
        if (this.startOverlay) this.startOverlay.style.display = 'none';
      }, 350);
    }

    showScoreModal(evaluation, { onRetake, onReview } = {}) {
      if (!this.scoreModal) return;
      
      const evalData = evaluation || {};
      const overall = evalData.overallBand != null ? Number(evalData.overallBand).toFixed(1) : '7.0';
      const fc = evalData.fluency != null ? Number(evalData.fluency).toFixed(1) : '7.0';
      const lr = evalData.lexical != null ? Number(evalData.lexical).toFixed(1) : '7.0';
      const gra = evalData.grammar != null ? Number(evalData.grammar).toFixed(1) : '7.0';
      const pr = evalData.pronunciation != null ? Number(evalData.pronunciation).toFixed(1) : '7.0';

      if (this.scoreOverallBand) this.scoreOverallBand.textContent = overall;
      if (this.scoreExaminerSummary) {
        this.scoreExaminerSummary.textContent = `"${evalData.examinerSummary || 'A competent performance demonstrating solid communicative capability and willingness to speak throughout all three examination stages.'}"`;
      }

      if (this.scoreFcBadge) this.scoreFcBadge.textContent = `Band ${fc}`;
      if (this.scoreFcBar) this.scoreFcBar.style.width = `${Math.min(100, Math.max(10, (fc / 9.0) * 100))}%`;
      if (this.scoreFcFeedback) this.scoreFcFeedback.textContent = evalData.fluencyFeedback || 'Good fluency and topic progression.';

      if (this.scoreLrBadge) this.scoreLrBadge.textContent = `Band ${lr}`;
      if (this.scoreLrBar) this.scoreLrBar.style.width = `${Math.min(100, Math.max(10, (lr / 9.0) * 100))}%`;
      if (this.scoreLrFeedback) this.scoreLrFeedback.textContent = evalData.lexicalFeedback || 'Good vocabulary with appropriate terms.';

      if (this.scoreGraBadge) this.scoreGraBadge.textContent = `Band ${gra}`;
      if (this.scoreGraBar) this.scoreGraBar.style.width = `${Math.min(100, Math.max(10, (gra / 9.0) * 100))}%`;
      if (this.scoreGraFeedback) this.scoreGraFeedback.textContent = evalData.grammarFeedback || 'Demonstrates control of grammar structures.';

      if (this.scorePrBadge) this.scorePrBadge.textContent = `Band ${pr}`;
      if (this.scorePrBar) this.scorePrBar.style.width = `${Math.min(100, Math.max(10, (pr / 9.0) * 100))}%`;
      if (this.scorePrFeedback) this.scorePrFeedback.textContent = evalData.pronunciationFeedback || 'Clear phonological articulation.';

      if (this.scoreStrengthsList) {
        const list = evalData.strengths && evalData.strengths.length > 0 ? evalData.strengths : ['Maintained active communication', 'Clear relevance to questions'];
        this.scoreStrengthsList.innerHTML = list.map(s => `<li>${s}</li>`).join('');
      }

      if (this.scoreImprovementsList) {
        const list = evalData.improvements && evalData.improvements.length > 0 ? evalData.improvements : ['Expand answers with more specific personal examples', 'Incorporate higher-band collocations'];
        this.scoreImprovementsList.innerHTML = list.map(s => `<li>${s}</li>`).join('');
      }

      this.scoreModal.style.display = 'flex';

      if (this.closeScoreBtn) {
        this.closeScoreBtn.onclick = () => {
          this.scoreModal.style.display = 'none';
        };
      }
      if (this.scoreRetakeBtn) {
        this.scoreRetakeBtn.onclick = () => {
          this.scoreModal.style.display = 'none';
          if (onRetake) onRetake();
        };
      }
      if (this.scoreReviewBtn) {
        this.scoreReviewBtn.onclick = () => {
          this.scoreModal.style.display = 'none';
          if (onReview) onReview();
        };
      }
    }

    hideScoreModal() {
      if (this.scoreModal) this.scoreModal.style.display = 'none';
    }

    async startAudioVolumeMonitor() {
      if (this.audioCtx) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
        const source = this.audioCtx.createMediaStreamSource(stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        source.connect(this.analyser);

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const loop = () => {
          if (!this.analyser) return;
          this.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          if (this.voiceWaveBars) {
            this.voiceWaveBars.classList.toggle('speaking-active', avg > 10);
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch(e) {}
    }

    startNaturalBlinking() {
      clearInterval(this.blinkInterval);
      this.blinkInterval = setInterval(() => {
        if (this.eyesOpen && this.eyesClosed) {
          this.eyesOpen.style.display = 'none';
          this.eyesClosed.style.display = 'inline';
          setTimeout(() => {
            if (this.eyesOpen && this.eyesClosed) {
              this.eyesOpen.style.display = 'inline';
              this.eyesClosed.style.display = 'none';
            }
          }, 180);
        }
      }, 3500);
    }

    async initWebcam() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      try {
        this.userVideoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (this.pipVideo) {
          this.pipVideo.srcObject = this.userVideoStream;
          this.pipVideo.style.display = 'block';
          if (this.pipFallback) this.pipFallback.style.display = 'none';
        }
      } catch (e) {
        if (this.pipVideo) this.pipVideo.style.display = 'none';
        if (this.pipFallback) this.pipFallback.style.display = 'flex';
      }
    }

    initToolbarEvents() {
      if (this.cameraToggleBtn) {
        this.cameraToggleBtn.onclick = () => {
          this.cameraEnabled = !this.cameraEnabled;
          this.cameraToggleBtn.classList.toggle('active', this.cameraEnabled);
          if (this.userVideoStream) {
            this.userVideoStream.getVideoTracks().forEach(t => t.enabled = this.cameraEnabled);
          }
          if (this.pipVideo) this.pipVideo.style.display = this.cameraEnabled ? 'block' : 'none';
          if (this.pipFallback) this.pipFallback.style.display = this.cameraEnabled ? 'none' : 'flex';
        };
      }

      if (this.ccToggleBtn) {
        this.ccToggleBtn.onclick = () => {
          this.subtitlesEnabled = !this.subtitlesEnabled;
          this.ccToggleBtn.classList.toggle('active', this.subtitlesEnabled);
          if (this.subtitlesHud) {
            this.subtitlesHud.style.display = this.subtitlesEnabled ? 'flex' : 'none';
          }
        };
      }

      if (this.fullscreenBtn) {
        this.fullscreenBtn.onclick = () => {
          this.toggleFullscreen();
        };
      }

      if (this.styleToggleBtn) {
        `;
        };
      }

      this.checkGeminiStatus();

      if (this.geminiBtn) {
        this.geminiBtn.onclick = () => {
          if (this.geminiModal) this.geminiModal.style.display = 'flex';
        };
      }

      if (this.closeGeminiBtn) {
        this.closeGeminiBtn.onclick = () => {
          if (this.geminiModal) this.geminiModal.style.display = 'none';
        };
      }

      if (this.saveGeminiBtn) {
        this.saveGeminiBtn.onclick = async () => {
          const key = this.geminiInput ? this.geminiInput.value.trim() : '';
          if (!key) {
            alert('Please paste a valid Gemini API key.');
            return;
          }
          this.saveGeminiBtn.disabled = true;
          this.saveGeminiBtn.textContent = 'Connecting...';
          try {
            const res = await fetch('/api/speaking/set-gemini-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: key })
            });
            const data = await res.json();
            if (res.ok) {
              if (this.geminiFeedback) {
                this.geminiFeedback.className = 'gemini-feedback-msg success';
                this.geminiFeedback.textContent = 'Connected successfully! Real-time AI Assessment Engine is now active.';
                this.geminiFeedback.style.display = 'block';
              }
              if (this.geminiStatusLabel) this.geminiStatusLabel.textContent = 'Gemini Active 🟢';
              if (this.geminiBtn) this.geminiBtn.classList.add('connected');
              setTimeout(() => {
                if (this.geminiModal) this.geminiModal.style.display = 'none';
              }, 1500);
            } else {
              alert(data.error || 'Failed to save key');
            }
          } catch(e) {
            alert('Network error connecting to Gemini API.');
          } finally {
            this.saveGeminiBtn.disabled = false;
            this.saveGeminiBtn.textContent = 'Save & Connect';
          }
        };
      }
    }

    async checkGeminiStatus() {
      try {
        const res = await fetch('/api/speaking/gemini-status');
        if (res.ok) {
          const d = await res.json();
          if (d.configured) {
            if (this.geminiStatusLabel) this.geminiStatusLabel.textContent = 'Gemini Active 🟢';
            if (this.geminiBtn) this.geminiBtn.classList.add('connected');
          } else {
            if (this.geminiStatusLabel) this.geminiStatusLabel.textContent = 'Connect Gemini 🟡';
          }
        }
      } catch (e) {}
    }

    toggleFullscreen() {
      if (!document.fullscreenElement && !this.stage.classList.contains('fullscreen-mode')) {
        if (this.stage.requestFullscreen) {
          this.stage.requestFullscreen().catch(() => {
            this.stage.classList.add('fullscreen-mode');
          });
        } else {
          this.stage.classList.add('fullscreen-mode');
        }
        this.isFullscreen = true;
        if (this.fullscreenBtn) this.fullscreenBtn.classList.add('active');
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        this.stage.classList.remove('fullscreen-mode');
        this.isFullscreen = false;
        if (this.fullscreenBtn) this.fullscreenBtn.classList.remove('active');
      }
    }

    // Set State: 'speaking' | 'listening' | 'idle' | 'thinking'
    setState(state) {
      if (!this.stage) return;
      this.stage.className = 'zoom-conference-stage ' + state + (this.isFullscreen ? ' fullscreen-mode' : '');

      if (state === 'speaking') {
        this.isSpeaking = true;
        this.isListening = false;
        if (this.speakerWave) this.speakerWave.className = 'zoom-speaker-wave active speaking';
        if (this.pipMicStatusIcon) this.pipMicStatusIcon.style.color = '#94a3b8';
        this.startMouthAnimation();
      } else if (state === 'listening') {
        this.isSpeaking = false;
        this.isListening = true;
        if (this.speakerWave) this.speakerWave.className = 'zoom-speaker-wave active listening';
        if (this.pipMicStatusIcon) this.pipMicStatusIcon.style.color = '#10b981';
        this.stopMouthAnimation();
      } else {
        this.isSpeaking = false;
        this.isListening = false;
        if (this.speakerWave) this.speakerWave.className = 'zoom-speaker-wave';
        if (this.pipMicStatusIcon) this.pipMicStatusIcon.style.color = '#94a3b8';
        this.stopMouthAnimation();
      }
    }

    startMouthAnimation() {
      clearInterval(this.animInterval);
      const isPractice = this.currentPersona === 'practice';
      const mouthResting = isPractice ? this.casualMouthResting : this.mouthResting;
      const mouthTalking = isPractice ? this.casualMouthTalking : this.mouthTalking;
      const vocalCavity = isPractice ? this.casualVocalCavity : this.vocalCavity;
      const vocalUpperLip = isPractice ? this.casualVocalUpperLip : this.vocalUpperLip;
      const vocalLowerLip = isPractice ? this.casualVocalLowerLip : this.vocalLowerLip;
      const headEl = isPractice ? this.casualHead : this.examinerHead;

      if (mouthResting) mouthResting.style.display = 'none';
      if (mouthTalking) mouthTalking.style.display = 'inline';

      let step = 0;
      // Viseme aperture frames (rx, ry, upperLip, lowerLip, headBob)
      const frames = [
        { rx: 14, ry: 7, ul: 'M 380,224 Q 390,217 400,218 Q 410,217 420,224 Q 400,220 380,224 Z', ll: 'M 380,224 Q 400,236 420,224 Q 400,229 380,224 Z', bob: 0 },
        { rx: 18, ry: 13, ul: 'M 378,224 Q 390,213 400,214 Q 410,213 422,224 Q 400,218 378,224 Z', ll: 'M 378,224 Q 400,244 422,224 Q 400,235 378,224 Z', bob: 2 },
        { rx: 12, ry: 11, ul: 'M 382,224 Q 390,215 400,216 Q 410,215 418,224 Q 400,219 382,224 Z', ll: 'M 382,224 Q 400,240 418,224 Q 400,232 382,224 Z', bob: -1 },
        { rx: 19, ry: 9, ul: 'M 376,224 Q 390,216 400,217 Q 410,216 424,224 Q 400,219 376,224 Z', ll: 'M 376,224 Q 400,238 424,224 Q 400,230 376,224 Z', bob: 1 },
        { rx: 10, ry: 5, ul: 'M 384,224 Q 390,220 400,221 Q 410,220 416,224 Q 400,222 384,224 Z', ll: 'M 384,224 Q 400,231 416,224 Q 400,227 384,224 Z', bob: 0 }
      ];

      this.animInterval = setInterval(() => {
        if (!this.isSpeaking) return;
        step = (step + 1) % frames.length;
        const f = frames[step];

        if (vocalCavity) {
          vocalCavity.setAttribute('rx', String(f.rx));
          vocalCavity.setAttribute('ry', String(f.ry));
        }
        if (vocalUpperLip) vocalUpperLip.setAttribute('d', f.ul);
        if (vocalLowerLip) vocalLowerLip.setAttribute('d', f.ll);
        if (headEl) headEl.style.transform = `translateY(${f.bob}px)`;
      }, 90);
    }

    stopMouthAnimation() {
      clearInterval(this.animInterval);
      this.isSpeaking = false;
      if (this.mouthResting) this.mouthResting.style.display = 'inline';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.examinerHead) this.examinerHead.style.transform = 'translateY(0)';
      if (this.casualMouthResting) this.casualMouthResting.style.display = 'inline';
      if (this.casualMouthTalking) this.casualMouthTalking.style.display = 'none';
      if (this.casualHead) this.casualHead.style.transform = 'translateY(0)';
    }

    setSubtitle(text) {
      if (this.subtitleText) {
        this.subtitleText.textContent = `"${text}"`;
      }
    }

    showCandidateLiveSpeech(text) {
      if (!this.candidateLiveHud) return;
      this.candidateLiveHud.style.display = 'block';
      if (this.candidateLiveText) {
        this.candidateLiveText.textContent = text || 'Listening to your voice...';
      }
    }

    hideCandidateLiveSpeech() {
      if (this.candidateLiveHud) {
        this.candidateLiveHud.style.display = 'none';
      }
    }

    speakText(text, onComplete) {
      this.setSubtitle(text);
      if (!text) {
        this.stopMouthAnimation();
        this.setState('idle');
        if (onComplete) onComplete();
        return;
      }

      if (!window.speechSynthesis) {
        this.setState('speaking');
        setTimeout(() => {
          this.setState('idle');
          if (onComplete) onComplete();
        }, Math.max(2500, text.length * 60));
        return;
      }

      if (window.speechSynthesis.paused) {
        try { window.speechSynthesis.resume(); } catch(e) {}
      }
      try { window.speechSynthesis.cancel(); } catch(e) {}

      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        const isPractice = this.currentPersona === 'practice';
        utterance.rate = isPractice ? 1.02 : 0.95;
        utterance.pitch = isPractice ? 1.15 : 1.0;

        const voices = (window._cachedVoices && window._cachedVoices.length > 0)
          ? window._cachedVoices
          : (window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
        if (voices && voices.length > 0) {
          let chosenVoice = null;
          if (isPractice) {
            chosenVoice = voices.find(v => (v.name.includes('Emma') || v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('Samantha') || (v.lang && v.lang.startsWith('en') && v.name.toLowerCase().includes('female')))) || voices.find(v => v.lang && v.lang.startsWith('en'));
          } else {
            chosenVoice = voices.find(v => (v.lang && (v.lang.includes('en-GB') || v.lang.includes('en_GB'))) || v.name.includes('UK') || v.name.includes('British') || v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Daniel')) || voices.find(v => v.lang && v.lang.startsWith('en'));
          }
          if (chosenVoice) utterance.voice = chosenVoice;
        }

        window._activeUtterance = utterance;

        let finished = false;
        let timeoutId = null;

        const finalize = () => {
          if (finished) return;
          finished = true;
          if (timeoutId) clearTimeout(timeoutId);
          window._activeUtterance = null;
          this.stopMouthAnimation();
          this.setState('idle');
          if (onComplete) onComplete();
        };

        utterance.onstart = () => {
          this.setState('speaking');
        };

        const estimatedDurationMs = Math.max(3000, (text.split(/\s+/).length / 2.2) * 1000 + 2500);
        timeoutId = setTimeout(finalize, estimatedDurationMs);

        utterance.onend = finalize;
        utterance.onerror = (e) => {
          console.warn('SpeechSynthesis error:', e);
          finalize();
        };

        window.speechSynthesis.speak(utterance);
      }, 80);
    }
  }

  window.SpeakingExaminerAvatar = SpeakingExaminerAvatar;
})();


