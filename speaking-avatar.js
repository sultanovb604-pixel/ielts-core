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
      this.viewMode = 'animated'; // 'animated' | 'photo'
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
            <!-- 1. ANIMATED VECTOR EXAMINER (100% Guaranteed Lip-Sync, Blinking, Head Movement) -->
            <div class="examiner-vector-view" id="examinerVectorView">
              <svg class="examiner-scene-svg" viewBox="0 0 800 450" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#f8fafc" />
                    <stop offset="100%" stop-color="#e2e8f0" />
                  </linearGradient>
                  <linearGradient id="deskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ca8a04" />
                    <stop offset="100%" stop-color="#854d0e" />
                  </linearGradient>
                  <linearGradient id="suitGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#1e293b" />
                    <stop offset="100%" stop-color="#0f172a" />
                  </linearGradient>
                  <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#fde047" stop-opacity="0.2" />
                    <stop offset="0%" stop-color="#fed7aa" />
                    <stop offset="100%" stop-color="#fba471" />
                  </linearGradient>
                  <linearGradient id="hairGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#94a3b8" />
                    <stop offset="50%" stop-color="#cbd5e1" />
                    <stop offset="100%" stop-color="#64748b" />
                  </linearGradient>
                </defs>

                <!-- 1. EXAM PERSONA SCENE (Dr. Alan Sterling - Cambridge Room) -->
                <g id="sceneExam">
                  <!-- Background Office & Bookshelf -->
                  <rect width="800" height="450" fill="url(#wallGrad)" />

                  <!-- Bookshelf Left/Right -->
                  <rect x="20" y="40" width="160" height="340" fill="#334155" rx="4" />
                  <line x1="20" y1="120" x2="180" y2="120" stroke="#475569" stroke-width="6" />
                  <line x1="20" y1="200" x2="180" y2="200" stroke="#475569" stroke-width="6" />
                  <line x1="20" y1="280" x2="180" y2="280" stroke="#475569" stroke-width="6" />
                  <!-- Books -->
                  <rect x="30" y="55" width="18" height="65" fill="#ef4444" rx="2" />
                  <rect x="52" y="60" width="22" height="60" fill="#3b82f6" rx="2" />
                  <rect x="78" y="50" width="16" height="70" fill="#10b981" rx="2" />
                  <rect x="98" y="65" width="24" height="55" fill="#f59e0b" rx="2" />
                  <rect x="126" y="52" width="20" height="68" fill="#8b5cf6" rx="2" />
                  <rect x="150" y="58" width="18" height="62" fill="#ec4899" rx="2" />

                  <!-- Bookshelf Right -->
                  <rect x="620" y="40" width="160" height="340" fill="#334155" rx="4" />
                  <line x1="620" y1="120" x2="780" y2="120" stroke="#475569" stroke-width="6" />
                  <line x1="620" y1="200" x2="780" y2="200" stroke="#475569" stroke-width="6" />
                  <line x1="620" y1="280" x2="780" y2="280" stroke="#475569" stroke-width="6" />
                  <rect x="635" y="55" width="20" height="65" fill="#06b6d4" rx="2" />
                  <rect x="660" y="50" width="25" height="70" fill="#1468f3" rx="2" />
                  <rect x="690" y="62" width="18" height="58" fill="#e11d48" rx="2" />
                  <rect x="712" y="54" width="22" height="66" fill="#84cc16" rx="2" />
                  <rect x="738" y="58" width="24" height="62" fill="#f97316" rx="2" />

                  <!-- Certificate on Wall -->
                  <rect x="220" y="60" width="100" height="80" fill="#ffffff" stroke="#94a3b8" stroke-width="3" rx="2" />
                  <rect x="230" y="70" width="80" height="60" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
                  <circle cx="270" cy="95" r="12" fill="#eab308" />

                  <!-- British Flag Crest -->
                  <rect x="520" y="60" width="60" height="40" fill="#1e3a8a" rx="2" />
                  <path d="M 520,60 L 580,100 M 520,100 L 580,60" stroke="#ffffff" stroke-width="6" />
                  <path d="M 520,60 L 580,100 M 520,100 L 580,60" stroke="#ef4444" stroke-width="3" />
                  <path d="M 550,60 L 550,100 M 520,80 L 580,80" stroke="#ffffff" stroke-width="10" />
                  <path d="M 550,60 L 550,100 M 520,80 L 580,80" stroke="#ef4444" stroke-width="6" />

                  <!-- Examiner Character Group -->
                  <g class="examiner-full-body" id="examinerFullBody">
                    <!-- Body & Suit -->
                    <path d="M 270 450 L 310 280 Q 400 300 490 280 L 530 450 Z" fill="url(#suitGrad)" />
                    <!-- Shirt Collar -->
                    <polygon points="370,280 400,340 430,280 400,295" fill="#ffffff" />
                    <!-- Tie -->
                    <polygon points="392,295 408,295 414,400 400,420 386,400" fill="#dc2626" />
                    <line x1="392" y1="320" x2="408" y2="325" stroke="#fbbf24" stroke-width="3" />
                    <line x1="390" y1="350" x2="410" y2="355" stroke="#fbbf24" stroke-width="3" />
                    <line x1="388" y1="380" x2="412" y2="385" stroke="#fbbf24" stroke-width="3" />
                    <!-- Examiner ID Badge -->
                    <rect x="445" y="320" width="45" height="24" rx="3" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />
                    <text x="450" y="335" font-size="8" font-weight="bold" fill="#0f172a">EXAMINER</text>

                    <!-- Neck -->
                    <rect x="375" y="240" width="50" height="50" rx="6" fill="url(#skinGrad)" />

                    <!-- Head Group (Animated with subtle bobs) -->
                    <g class="examiner-head" id="examinerHead">
                      <!-- Face Contour -->
                      <ellipse cx="400" cy="190" rx="65" ry="78" fill="url(#skinGrad)" />
                      <!-- Beard & Chin Outline -->
                      <path d="M 345,190 Q 345,260 400,268 Q 455,260 455,190 Q 445,245 400,252 Q 355,245 345,190 Z" fill="#94a3b8" opacity="0.45" />

                      <!-- Hair -->
                      <path d="M 330,180 Q 330,110 400,110 Q 470,110 470,180 Q 450,130 400,130 Q 350,130 330,180 Z" fill="url(#hairGrad)" />

                      <!-- Eyebrows -->
                      <path d="M 360,162 Q 375,156 390,162" stroke="#475569" stroke-width="4" stroke-linecap="round" fill="none" />
                      <path d="M 410,162 Q 425,156 440,162" stroke="#475569" stroke-width="4" stroke-linecap="round" fill="none" />

                      <!-- Eyes (With Blinking Animation) -->
                      <g id="examinerEyes">
                        <ellipse cx="375" cy="175" rx="9" ry="7" fill="#ffffff" />
                        <circle cx="376" cy="175" r="4.5" fill="#1e3a8a" />
                        <circle cx="377.5" cy="173.5" r="1.5" fill="#ffffff" />

                        <ellipse cx="425" cy="175" rx="9" ry="7" fill="#ffffff" />
                        <circle cx="424" cy="175" r="4.5" fill="#1e3a8a" />
                        <circle cx="425.5" cy="173.5" r="1.5" fill="#ffffff" />
                      </g>
                      <!-- Closed Eye Lids (for blink) -->
                      <g id="examinerEyesClosed" style="display:none;">
                        <path d="M 365,176 Q 375,182 385,176" stroke="#0f172a" stroke-width="3" fill="none" />
                        <path d="M 415,176 Q 425,182 435,176" stroke="#0f172a" stroke-width="3" fill="none" />
                      </g>

                      <!-- Glasses -->
                      <rect x="360" y="165" width="30" height="20" rx="5" fill="none" stroke="#0f172a" stroke-width="2.5" />
                      <rect x="410" y="165" width="30" height="20" rx="5" fill="none" stroke="#0f172a" stroke-width="2.5" />
                      <line x1="390" y1="174" x2="410" y2="174" stroke="#0f172a" stroke-width="2.5" />
                      <line x1="360" y1="172" x2="340" y2="170" stroke="#0f172a" stroke-width="2" />
                      <line x1="440" y1="172" x2="460" y2="170" stroke="#0f172a" stroke-width="2" />

                      <!-- Nose -->
                      <path d="M 400,174 L 396,204 L 404,204 Z" fill="#fba471" opacity="0.7" />

                      <!-- DYNAMIC MOUTH WITH 100% WORKING LIP-SYNC -->
                      <!-- Resting Closed Smile (when not speaking) -->
                      <g id="examinerMouthResting">
                        <path d="M 382,225 Q 400,234 418,225" stroke="#991b1b" stroke-width="3.5" stroke-linecap="round" fill="none" />
                      </g>

                      <!-- Active Talking Mouth (Morphs dynamically during speech) -->
                      <g id="examinerMouthTalking" style="display:none;">
                        <!-- Dark Oral Cavity -->
                        <ellipse id="vocalCavity" cx="400" cy="227" rx="16" ry="9" fill="#24070e" />
                        <!-- Upper Teeth -->
                        <path id="vocalUpperTeeth" d="M 388,220 Q 400,217 412,220 L 410,224 Q 400,222 390,224 Z" fill="#ffffff" />
                        <!-- Tongue -->
                        <path id="vocalTongue" d="M 392,232 Q 400,226 408,232 Q 400,235 392,232 Z" fill="#ef4444" opacity="0.8" />
                        <!-- Upper Lip -->
                        <path id="vocalUpperLip" d="M 380,224 Q 390,217 400,218 Q 410,217 420,224 Q 400,220 380,224 Z" fill="#b06558" />
                        <!-- Lower Lip -->
                        <path id="vocalLowerLip" d="M 380,224 Q 400,238 420,224 Q 400,231 380,224 Z" fill="#c4786a" />
                      </g>
                    </g>
                  </g>

                  <!-- Desk in Foreground -->
                  <rect x="0" y="390" width="800" height="60" fill="url(#deskGrad)" />
                  <line x1="0" y1="390" x2="800" y2="390" stroke="#fde047" stroke-width="2" opacity="0.3" />

                  <!-- Desk Items: Laptop & Podcast Mic -->
                  <polygon points="120,440 240,440 220,380 140,380" fill="#94a3b8" />
                  <polygon points="140,380 220,380 230,340 130,340" fill="#0f172a" stroke="#cbd5e1" stroke-width="2" />
                  <circle cx="180" cy="360" r="4" fill="#ffffff" />

                  <rect x="320" y="360" width="16" height="35" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
                  <line x1="328" y1="395" x2="328" y2="420" stroke="#0f172a" stroke-width="4" />
                  <polygon points="315,420 341,420 335,430 321,430" fill="#334155" />
                </g>

                <!-- 2. CASUAL AI PARTNER SCENE (Emma Roberts - Modern Creative Studio & Casual Outfit) -->
                <g id="sceneCasual" style="display:none;">
                  <defs>
                    <linearGradient id="casualWallGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#1e1b4b" />
                      <stop offset="50%" stop-color="#312e81" />
                      <stop offset="100%" stop-color="#0f172a" />
                    </linearGradient>
                    <linearGradient id="casualDeskGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#334155" />
                      <stop offset="100%" stop-color="#1e293b" />
                    </linearGradient>
                    <linearGradient id="hoodieGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#0284c7" />
                      <stop offset="100%" stop-color="#0369a1" />
                    </linearGradient>
                    <linearGradient id="emmaHairGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#78350f" />
                      <stop offset="50%" stop-color="#92400e" />
                      <stop offset="100%" stop-color="#b45309" />
                    </linearGradient>
                    <linearGradient id="emmaSkinGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#fed7aa" />
                      <stop offset="100%" stop-color="#fca5a5" />
                    </linearGradient>
                  </defs>

                  <!-- Modern Loft Background -->
                  <rect width="800" height="450" fill="url(#casualWallGrad)" />

                  <!-- Warm Ambient Studio Neon & Art -->
                  <circle cx="200" cy="120" r="140" fill="#6366f1" opacity="0.15" />
                  <circle cx="620" cy="100" r="160" fill="#ec4899" opacity="0.12" />

                  <!-- Modern Abstract Art on Wall -->
                  <rect x="80" y="50" width="130" height="90" fill="#1e293b" stroke="#475569" stroke-width="2" rx="8" />
                  <circle cx="130" cy="90" r="22" fill="#f43f5e" opacity="0.8" />
                  <polygon points="120,120 180,120 150,70" fill="#38bdf8" opacity="0.7" />

                  <!-- Modern Studio Bookshelf & Plant -->
                  <rect x="630" y="40" width="130" height="340" fill="#1e293b" rx="6" />
                  <line x1="630" y1="130" x2="760" y2="130" stroke="#334155" stroke-width="4" />
                  <line x1="630" y1="220" x2="760" y2="220" stroke="#334155" stroke-width="4" />
                  <!-- Indoor Plant Pot -->
                  <rect x="665" y="95" width="30" height="35" rx="3" fill="#e2e8f0" />
                  <path d="M 680,95 Q 660,60 650,75 Q 675,85 680,95 Z" fill="#22c55e" />
                  <path d="M 680,95 Q 700,55 710,70 Q 690,85 680,95 Z" fill="#16a34a" />
                  <path d="M 680,95 Q 680,50 675,65" stroke="#4ade80" stroke-width="3" fill="none" />

                  <!-- Emma Character Body -->
                  <g class="casual-full-body">
                    <!-- Modern Hoodie / Casual Outfit -->
                    <path d="M 280 450 L 320 280 Q 400 300 480 280 L 520 450 Z" fill="url(#hoodieGrad)" />
                    <!-- Hoodie Drawstrings & Neck -->
                    <path d="M 360 280 Q 400 310 440 280" fill="none" stroke="#38bdf8" stroke-width="4" />
                    <line x1="380" y1="295" x2="380" y2="350" stroke="#e0f2fe" stroke-width="3" stroke-linecap="round" />
                    <line x1="420" y1="295" x2="420" y2="350" stroke="#e0f2fe" stroke-width="3" stroke-linecap="round" />

                    <!-- Neck -->
                    <rect x="380" y="240" width="40" height="45" rx="6" fill="url(#emmaSkinGrad)" />

                    <!-- Head Group -->
                    <g class="casual-head" id="casualHead">
                      <!-- Long Flowing Hair (Back) -->
                      <path d="M 325 180 Q 310 270 330 330 Q 355 330 350 250 Z" fill="url(#emmaHairGrad)" />
                      <path d="M 475 180 Q 490 270 470 330 Q 445 330 450 250 Z" fill="url(#emmaHairGrad)" />

                      <!-- Face -->
                      <ellipse cx="400" cy="190" rx="55" ry="68" fill="url(#emmaSkinGrad)" />

                      <!-- Hair (Front & Bangs) -->
                      <path d="M 335 170 Q 330 110 400 110 Q 470 110 465 170 Q 440 135 400 135 Q 360 135 335 170 Z" fill="url(#emmaHairGrad)" />
                      <path d="M 340 150 Q 375 140 395 155 Q 370 165 340 150 Z" fill="url(#emmaHairGrad)" />

                      <!-- Eyebrows -->
                      <path d="M 365 162 Q 378 156 390 162" stroke="#78350f" stroke-width="3" stroke-linecap="round" fill="none" />
                      <path d="M 410 162 Q 422 156 435 162" stroke="#78350f" stroke-width="3" stroke-linecap="round" fill="none" />

                      <!-- Eyes (Friendly Brown Eyes) -->
                      <g id="casualEyes">
                        <ellipse cx="378" cy="174" rx="8.5" ry="6.5" fill="#ffffff" />
                        <circle cx="379" cy="174" r="4.2" fill="#451a03" />
                        <circle cx="380.5" cy="172.5" r="1.5" fill="#ffffff" />

                        <ellipse cx="422" cy="174" rx="8.5" ry="6.5" fill="#ffffff" />
                        <circle cx="421" cy="174" r="4.2" fill="#451a03" />
                        <circle cx="422.5" cy="172.5" r="1.5" fill="#ffffff" />
                      </g>
                      <!-- Closed Eyes (Blinking) -->
                      <g id="casualEyesClosed" style="display:none;">
                        <path d="M 370 175 Q 378 181 386 175" stroke="#451a03" stroke-width="2.5" fill="none" />
                        <path d="M 414 175 Q 422 181 430 175" stroke="#451a03" stroke-width="2.5" fill="none" />
                      </g>

                      <!-- Cute Nose -->
                      <path d="M 400 174 Q 397 196 401 198" stroke="#f87171" stroke-width="2" stroke-linecap="round" fill="none" />

                      <!-- Studio Headset Headphones -->
                      <path d="M 335 180 Q 330 100 400 95 Q 470 100 465 180" fill="none" stroke="#0f172a" stroke-width="8" stroke-linecap="round" />
                      <!-- Left Ear Cup -->
                      <rect x="325" y="165" width="16" height="32" rx="8" fill="#38bdf8" stroke="#0f172a" stroke-width="2" />
                      <!-- Right Ear Cup -->
                      <rect x="459" y="165" width="16" height="32" rx="8" fill="#38bdf8" stroke="#0f172a" stroke-width="2" />
                      <!-- Boom Microphone -->
                      <path d="M 335 185 Q 345 220 375 225" fill="none" stroke="#0f172a" stroke-width="3" />
                      <circle cx="377" cy="225" r="5" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" />

                      <!-- Resting Smile -->
                      <g id="casualMouthResting">
                        <path d="M 385 220 Q 400 230 415 220" stroke="#e11d48" stroke-width="3.5" stroke-linecap="round" fill="none" />
                      </g>

                      <!-- Talking Lip-Sync Mouth -->
                      <g id="casualMouthTalking" style="display:none;">
                        <ellipse id="casualVocalCavity" cx="400" cy="223" rx="14" ry="8" fill="#24070e" />
                        <path id="casualVocalUpperTeeth" d="M 390 217 Q 400 214 410 217 L 409 220 Q 400 218 391 220 Z" fill="#ffffff" />
                        <path id="casualVocalTongue" d="M 393 227 Q 400 222 407 227 Q 400 230 393 227 Z" fill="#fb7185" />
                        <path id="casualVocalUpperLip" d="M 384 220 Q 400 215 416 220 Q 400 218 384 220 Z" fill="#e11d48" />
                        <path id="casualVocalLowerLip" d="M 384 220 Q 400 232 416 220 Q 400 226 384 220 Z" fill="#f43f5e" />
                      </g>
                    </g>
                  </g>

                  <!-- Modern Creative Desk -->
                  <rect x="0" y="390" width="800" height="60" fill="url(#casualDeskGrad)" />
                  <line x1="0" y1="390" x2="800" y2="390" stroke="#38bdf8" stroke-width="2" opacity="0.4" />

                  <!-- Modern Coffee Mug on Desk -->
                  <rect x="220" y="375" width="22" height="28" rx="4" fill="#38bdf8" />
                  <path d="M 242 380 Q 252 389 242 398" fill="none" stroke="#38bdf8" stroke-width="3" />
                  <!-- Steam -->
                  <path d="M 226 370 Q 223 360 228 350" fill="none" stroke="#94a3b8" stroke-width="1.5" opacity="0.6" />
                  <path d="M 234 370 Q 237 360 232 350" fill="none" stroke="#94a3b8" stroke-width="1.5" opacity="0.6" />
                </g>
              </svg>
            </div>

            <!-- 2. PHOTO VIEW (Alternative) -->
            <div class="examiner-photo-view" id="examinerPhotoView" style="display:none;">
              <img src="/assets/examiner_video_call.jpg" alt="Dr. Alan Sterling" class="examiner-photo-feed" />
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
              <span class="examiner-name">Dr. Alan Sterling (Senior Cambridge Examiner)</span>
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
                <p class="start-desc" id="startOverlayDesc">Dr. Alan Sterling is waiting in the Cambridge exam room.<br/>Click to start the live video interview.</p>
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
                  <span class="material-symbols-outlined" style="color:#38bdf8;font-size:22px;">auto_awesome</span>
                  <strong>Google Gemini Real AI Engine</strong>
                </div>
                <button type="button" class="modal-close-x" id="closeGeminiModalBtn">✕</button>
              </div>
              <div class="gemini-modal-body">
                <p>Connect your free <strong>Google Gemini API Key</strong> for 100% natural, authentic Oxford IELTS examiner conversations:</p>
                <div class="gemini-input-row">
                  <input type="password" id="geminiKeyInput" placeholder="Paste your Gemini API key (AIzaSy...)" autocomplete="off" />
                  <button type="button" class="button primary" id="saveGeminiKeyBtn">Save &amp; Connect</button>
                </div>
                <div id="geminiFeedbackMsg" class="gemini-feedback-msg" style="display:none;"></div>
                <div class="gemini-modal-footer">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">
                    <span>Get a Free Key at Google AI Studio</span>
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
                      <strong>Dr. Alan Sterling (Examiner Verdict)</strong>
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
          ? 'Emma Roberts (AI Speaking Partner)' 
          : 'Dr. Alan Sterling (Senior Cambridge Examiner)';
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
        this.styleToggleBtn.onclick = () => {
          this.viewMode = this.viewMode === 'animated' ? 'photo' : 'animated';
          if (this.vectorView) this.vectorView.style.display = this.viewMode === 'animated' ? 'block' : 'none';
          if (this.photoView) this.photoView.style.display = this.viewMode === 'photo' ? 'block' : 'none';
          if (this.styleLabel) this.styleLabel.textContent = `Style: ${this.viewMode === 'animated' ? 'Cartoon' : 'Photo'}`;
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
                this.geminiFeedback.style.display = 'block';
                this.geminiFeedback.className = 'gemini-feedback-msg success';
                this.geminiFeedback.textContent = 'Connected successfully! Google Gemini Real AI is now active.';
              }
              if (this.geminiStatusLabel) this.geminiStatusLabel.textContent = 'Gemini Active 🟢';
              if (this.geminiBtn) this.geminiBtn.classList.add('connected');
              setTimeout(() => {
                if (this.geminiModal) this.geminiModal.style.display = 'none';
              }, 1200);
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

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          let chosenVoice = null;
          if (isPractice) {
            chosenVoice = voices.find(v => (v.name.includes('Emma') || v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('Samantha') || (v.lang.startsWith('en') && v.name.toLowerCase().includes('female')))) || voices.find(v => v.lang.startsWith('en'));
          } else {
            chosenVoice = voices.find(v => (v.lang.includes('en-GB') || v.lang.includes('en_GB')) || v.name.includes('UK') || v.name.includes('British') || v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Daniel')) || voices.find(v => v.lang.startsWith('en'));
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
