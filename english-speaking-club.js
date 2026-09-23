// IELTS Core Speaking Club (1-on-1 Live Practice)
// Episoden-Grade Cambridge IELTS Speaking Partner Engine
(function () {
  'use strict';

  // --- State Variables ---
  let myPeer = null;
  let myPeerId = null;
  let activeCall = null;
  let activeDataConn = null;
  let localStream = null;
  let audioContext = null;
  let micAnalyser = null;
  let micAnimId = null;
  let remoteAudioAnalyser = null;
  let vadAnimId = null;

  let selectedMode = 'video'; // 'video' | 'audio'
  let selectedLevel = 'any';
  let activeQueueId = null;
  let pollInterval = null;
  let searchTimerInterval = null;
  let searchStartTime = null;
  let currentRoomCode = '';

  let allTopics = [];
  let currentTopicIndex = 0;
  let activePart = 1;
  let activeSessionStage = 1; // 1: Warm-up, 2: Part 1, 3: Part 2, 4: Part 3
  let myRole = 'candidate'; // 'candidate' | 'examiner'
  let sessionTimerInterval = null;
  let sessionSecondsRemaining = 600; // 10 minutes
  let prepTimerInterval = null;
  let prepSecondsRemaining = 60;
  let speechTimerInterval = null;
  let speechSecondsElapsed = 0;

  let currentPartner = null;
  let isMicMuted = false;
  let isCamOff = false;
  let awardedPraiseBadges = new Set();

  // DOM Elements
  const lobbyView = document.getElementById('scLobbyView');
  const searchView = document.getElementById('scSearchView');
  const roomView = document.getElementById('scRoomView');
  const feedbackModal = document.getElementById('scFeedbackModal');

  const lobbyVideo = document.getElementById('scLobbyVideo');
  const lobbyAudioPlaceholder = document.getElementById('scLobbyAudioPlaceholder');
  const lobbyAvatarLetter = document.getElementById('scLobbyAvatarLetter');
  const cameraBadge = document.getElementById('scCameraBadge');
  const micMeterFill = document.getElementById('scMicMeterFill');

  const modeVideoBtn = document.getElementById('scModeVideoBtn');
  const modeAudioBtn = document.getElementById('scModeAudioBtn');
  const startMatchBtn = document.getElementById('scStartMatchBtn');
  const cancelSearchBtn = document.getElementById('scCancelSearchBtn');
  const searchElapsedEl = document.getElementById('scSearchElapsed');
  const onlineCountEl = document.getElementById('scOnlineCount');

  const remoteVideo = document.getElementById('scRemoteVideo');
  const remoteAudioPlaceholder = document.getElementById('scRemoteAudioPlaceholder');
  const remoteAvatarLetter = document.getElementById('scRemoteAvatarLetter');
  const remoteAudioName = document.getElementById('scRemoteAudioName');
  const partnerNameTag = document.getElementById('scPartnerNameTag');
  const localVideo = document.getElementById('scLocalVideo');
  const localAudioPip = document.getElementById('scLocalAudioPip');

  const toggleMicBtn = document.getElementById('scToggleMicBtn');
  const toggleCamBtn = document.getElementById('scToggleCamBtn');
  const nextTopicBtn = document.getElementById('scNextTopicBtn');
  const endCallBtn = document.getElementById('scEndCallBtn');

  const topicCategoryEl = document.getElementById('scTopicCategory');
  const topicTitleEl = document.getElementById('scTopicTitle');
  const timerDisplayEl = document.getElementById('scTimerDisplay');
  const sessionTimerWrap = document.getElementById('scSessionTimer');
  const partContentEl = document.getElementById('scPartContent');
  const tabPart1 = document.getElementById('scTabPart1');
  const tabPart2 = document.getElementById('scTabPart2');
  const tabPart3 = document.getElementById('scTabPart3');

  const roleCandidateBtn = document.getElementById('scRoleCandidateBtn');
  const roleExaminerBtn = document.getElementById('scRoleExaminerBtn');
  const partnerRoleBadge = document.getElementById('scPartnerRoleBadge');

  const chatMessagesEl = document.getElementById('scChatMessages');
  const chatForm = document.getElementById('scChatForm');
  const chatInput = document.getElementById('scChatInput');

  const feedbackPartnerName = document.getElementById('scFeedbackPartnerName');
  const feedbackCloseBtn = document.getElementById('scFeedbackCloseBtn');
  const feedbackFindAgainBtn = document.getElementById('scFeedbackFindAgainBtn');
  const starRow = document.getElementById('scStarRow');
  const reportBtn = document.getElementById('scReportBtn');

  // User Profile
  let currentUser = {
    name: 'Student',
    avatarUrl: ''
  };

  // --- Web Audio Sound Synthesizer (Zero External MP3s) ---
  function playChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const now = audioContext.currentTime;

      if (type === 'matchFound') {
        // Melodic 2-tone ping: C5 (523Hz) -> G5 (784Hz)
        [523.25, 783.99].forEach((freq, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.16);
          gain.gain.setValueAtTime(0, now + i * 0.16);
          gain.gain.linearRampToValueAtTime(0.22, now + i * 0.16 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.55);
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.start(now + i * 0.16);
          osc.stop(now + i * 0.16 + 0.6);
        });
      } else if (type === 'prepEnd') {
        // Bell chime: G5 (784Hz) -> C6 (1046Hz)
        [783.99, 1046.50].forEach((freq, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.18);
          gain.gain.setValueAtTime(0, now + i * 0.18);
          gain.gain.linearRampToValueAtTime(0.24, now + i * 0.18 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.65);
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.start(now + i * 0.18);
          osc.stop(now + i * 0.18 + 0.7);
        });
      } else if (type === 'warning') {
        // Gentle 1-minute warning ping
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.85);
      }
    } catch (e) {
      console.warn('Audio synthesis notice:', e);
    }
  }

  // --- Speaking Stats & Badges Persistence ---
  function loadSpeakingStats() {
    let stats = { sessions: 0, totalMinutes: 0, badges: {}, streak: 1, lastDate: '' };
    try {
      const saved = localStorage.getItem('vortex-speaking-stats');
      if (saved) stats = Object.assign(stats, JSON.parse(saved));
    } catch (e) {}

    const today = new Date().toISOString().slice(0, 10);
    if (stats.lastDate && stats.lastDate !== today) {
      const last = new Date(stats.lastDate);
      const diffDays = Math.floor((new Date(today) - last) / (86400000));
      if (diffDays > 1) {
        stats.streak = 1;
      }
    }

    const streakEl = document.getElementById('scUserStreak');
    const sessionsEl = document.getElementById('scUserSessionsCount');
    const minutesEl = document.getElementById('scUserMinutesCount');
    const badgesEl = document.getElementById('scUserBadgesCount');

    if (streakEl) streakEl.textContent = stats.streak || 1;
    if (sessionsEl) sessionsEl.textContent = stats.sessions || 0;
    if (minutesEl) minutesEl.textContent = stats.totalMinutes || 0;
    const badgeTotal = Object.values(stats.badges || {}).reduce((a, b) => a + b, 0);
    if (badgesEl) badgesEl.textContent = badgeTotal;

    return stats;
  }

  function recordSessionCompleted(awardedBadges = []) {
    const stats = loadSpeakingStats();
    stats.sessions = (stats.sessions || 0) + 1;
    stats.totalMinutes = (stats.totalMinutes || 0) + 10;
    const today = new Date().toISOString().slice(0, 10);
    if (stats.lastDate !== today) {
      stats.streak = (stats.streak || 0) + 1;
      stats.lastDate = today;
    }
    stats.badges = stats.badges || {};
    awardedBadges.forEach(b => {
      stats.badges[b] = (stats.badges[b] || 0) + 1;
    });

    try {
      localStorage.setItem('vortex-speaking-stats', JSON.stringify(stats));
    } catch (e) {}

    loadSpeakingStats();
  }

  // --- Initialization ---
  async function init() {
    loadUser();
    checkRoomUrl();
    loadSpeakingStats();
    setupEventListeners();
    fetchStats();
    initPeer();
    loadTopics();
    initLocalMedia();
  }

  function checkRoomUrl() {
    const params = new URLSearchParams(window.location.search);
    const room = (params.get('room') || '').trim().toLowerCase().slice(0, 32);
    const banner = document.getElementById('scRoomBanner');
    const codeEl = document.getElementById('scRoomBannerCode');
    const leaveBtn = document.getElementById('scLeaveRoomLinkBtn');

    if (room) {
      currentRoomCode = room;
      if (banner && codeEl) {
        codeEl.textContent = room;
        banner.style.display = 'flex';
      }
    } else {
      currentRoomCode = '';
      if (banner) banner.style.display = 'none';
    }

    if (leaveBtn) {
      leaveBtn.onclick = () => {
        currentRoomCode = '';
        history.replaceState(null, '', window.location.pathname);
        if (banner) banner.style.display = 'none';
      };
    }
  }

  function loadUser() {
    try {
      const stored = localStorage.getItem('vortex-english-user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.name || parsed.username) {
          currentUser.name = parsed.name || parsed.username;
        }
        if (parsed.avatarUrl) {
          currentUser.avatarUrl = parsed.avatarUrl;
        }
      }
    } catch (e) {}

    const initial = (currentUser.name || 'S').charAt(0).toUpperCase();
    if (lobbyAvatarLetter) lobbyAvatarLetter.textContent = initial;
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/speaking-club/stats');
      if (res.ok) {
        const data = await res.json();
        if (onlineCountEl && data.onlineStudents) {
          onlineCountEl.textContent = data.onlineStudents;
        }
      }
    } catch (e) {}
  }

  async function loadTopics() {
    try {
      const res = await fetch('/api/speaking-club/topics');
      if (res.ok) {
        allTopics = await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch topics, using fallback');
    }
    if (!allTopics || allTopics.length === 0) {
      allTopics = [
        {
          id: 'topic-default',
          title: 'Hometown & Studies',
          category: 'General Life',
          part1: {
            title: 'Part 1: Introduction & Warm-up',
            instructions: 'Take turns asking questions. Give 2-3 sentence answers.',
            questions: [
              'Where is your hometown located, and what is special about it?',
              'Do you study or work right now, and what do you enjoy most about it?',
              'What do you usually like to do in your free time on weekends?'
            ]
          },
          part2: {
            title: 'Part 2: Cue Card (1-2 mins speech)',
            instructions: 'One person speaks for 1-2 minutes. Click prep timer before starting.',
            cueCard: {
              topic: 'Describe a skill you learned that you found challenging at first.',
              points: [
                'What the skill was and why you wanted to learn it',
                'How you learned it and who helped you',
                'What difficulties you encountered',
                'And explain how learning this skill has benefited you.'
              ]
            }
          },
          part3: {
            title: 'Part 3: In-depth Discussion',
            instructions: 'Discuss these broader issues together.',
            questions: [
              'Why is it important for children to learn practical life skills early?',
              'How is modern technology changing the way people acquire new skills?'
            ]
          }
        }
      ];
    }
  }

  // --- Local Media & Microphone Level Meter ---
  async function initLocalMedia() {
    try {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      if (micAnimId) cancelAnimationFrame(micAnimId);

      const constraints = {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: selectedMode === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
      };

      localStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (selectedMode === 'video') {
        lobbyVideo.style.display = 'block';
        lobbyAudioPlaceholder.style.display = 'none';
        lobbyVideo.srcObject = localStream;
        cameraBadge.style.display = 'inline-flex';
        cameraBadge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;color:#10b981;">videocam</span><span>Camera Ready</span>';
      } else {
        lobbyVideo.style.display = 'none';
        lobbyAudioPlaceholder.style.display = 'flex';
        cameraBadge.style.display = 'inline-flex';
        cameraBadge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;color:#94a3b8;">videocam_off</span><span>Audio Only</span>';
      }

      startMicMeter(localStream);
    } catch (err) {
      console.warn('Media access warning:', err);
      cameraBadge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;color:#ef4444;">error</span><span>Check mic permissions</span>';
      if (selectedMode === 'video') {
        selectedMode = 'audio';
        modeAudioBtn?.classList.add('active');
        modeVideoBtn?.classList.remove('active');
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          lobbyVideo.style.display = 'none';
          lobbyAudioPlaceholder.style.display = 'flex';
          startMicMeter(localStream);
        } catch (audioErr) {
          console.error('Microphone also failed:', audioErr);
        }
      }
    }
  }

  function startMicMeter(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContextClass();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const micSource = audioContext.createMediaStreamSource(stream);
      micAnalyser = audioContext.createAnalyser();
      micAnalyser.fftSize = 64;
      micSource.connect(micAnalyser);

      const bufferLength = micAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function updateMeter() {
        micAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const percent = Math.min(100, Math.round((average / 128) * 100));
        if (micMeterFill) {
          micMeterFill.style.width = percent + '%';
        }

        // Active Speaking Glow for local user
        const isSpeaking = average > 18;
        if (localVideo) localVideo.parentElement?.classList.toggle('is-speaking', isSpeaking);
        if (localAudioPip) localAudioPip.classList.toggle('is-speaking', isSpeaking);

        micAnimId = requestAnimationFrame(updateMeter);
      }
      updateMeter();
    } catch (e) {
      console.warn('Audio meter init error:', e);
    }
  }

  // --- Remote Stream Voice Activity Detection ---
  function initRemoteVoiceDetection(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !stream) return;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const remoteSource = audioContext.createMediaStreamSource(stream);
      remoteAudioAnalyser = audioContext.createAnalyser();
      remoteAudioAnalyser.fftSize = 64;
      remoteSource.connect(remoteAudioAnalyser);

      const buf = new Uint8Array(remoteAudioAnalyser.frequencyBinCount);
      function checkRemoteSpeech() {
        if (!remoteAudioAnalyser) return;
        remoteAudioAnalyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const avg = sum / buf.length;
        const isSpeaking = avg > 18;

        const remoteViewBox = document.querySelector('.sc-remote-view');
        const remoteAvatar = document.getElementById('scRemoteAvatarLetter');
        if (remoteViewBox) remoteViewBox.classList.toggle('is-speaking', isSpeaking);
        if (remoteAvatar) remoteAvatar.classList.toggle('is-speaking', isSpeaking);

        vadAnimId = requestAnimationFrame(checkRemoteSpeech);
      }
      checkRemoteSpeech();
    } catch (e) {
      console.warn('Remote VAD error:', e);
    }
  }

  // --- PeerJS WebRTC Setup ---
  function initPeer() {
    try {
      if (typeof Peer === 'undefined') {
        console.error('PeerJS library not loaded.');
        return;
      }
      myPeer = new Peer(undefined, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelay',
              credential: 'openrelay'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelay',
              credential: 'openrelay'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelay',
              credential: 'openrelay'
            }
          ]
        },
        debug: 1
      });

      myPeer.on('open', id => {
        myPeerId = id;
        const netBadge = document.getElementById('scNetworkBadge');
        if (netBadge) {
          netBadge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;color:#10b981;">sensors</span><span>Network Ready</span>';
        }
      });

      // Handle Incoming Call from matched partner
      myPeer.on('call', incomingCall => {
        activeCall = incomingCall;
        incomingCall.answer(localStream);
        incomingCall.on('stream', remoteStream => {
          attachRemoteStream(remoteStream);
        });
        incomingCall.on('close', () => {
          handlePartnerDisconnected();
        });
        incomingCall.on('error', err => {
          console.error('Call error:', err);
        });

        // Fast-path: If still in search view, poll immediately to enter room without waiting
        if (searchView && searchView.style.display === 'block' && activeQueueId) {
          fetch('/api/speaking-club/poll?queueId=' + encodeURIComponent(activeQueueId))
            .then(r => r.json())
            .then(data => {
              if (data.status === 'matched') {
                if (pollInterval) clearInterval(pollInterval);
                pollInterval = null;
                stopSearchTimer();
                connectToPartner(data);
              }
            }).catch(() => {});
        }
      });

      // Handle Incoming DataChannel connection
      myPeer.on('connection', conn => {
        activeDataConn = conn;
        setupDataConn(conn);
      });

      myPeer.on('error', err => {
        console.warn('Peer error:', err);
      });
    } catch (e) {
      console.error('Failed to initialize PeerJS:', e);
    }
  }

  function setupDataConn(conn) {
    conn.on('open', () => {
      // Send our current mode and role to partner
      conn.send({
        type: 'MODE_SYNC',
        mode: selectedMode,
        name: currentUser.name,
        role: myRole
      });
    });

    conn.on('data', data => {
      if (!data || typeof data !== 'object') return;
      switch (data.type) {
        case 'SYNC_PART':
          setActivePart(data.part, false);
          break;
        case 'SYNC_TOPIC':
          setTopicByIndex(data.topicIndex, false);
          break;
        case 'SYNC_STAGE':
          setSessionStage(data.stage, false);
          break;
        case 'SYNC_ROLE':
          setRole(data.role === 'candidate' ? 'examiner' : 'candidate', false);
          break;
        case 'START_PREP':
          startPrepCountdown(false);
          break;
        case 'START_SPEECH_CLOCK':
          startSpeechClock(false);
          break;
        case 'CHAT_MSG':
          appendChatMessage(data.name || 'Partner', data.text, false);
          break;
        case 'AWARD_BADGE':
          if (data.badge) {
            recordSessionCompleted([data.badge]);
          }
          break;
        case 'MODE_SYNC':
          if (data.mode === 'audio') {
            remoteVideo.classList.add('sc-audio-mode-hidden');
            remoteAudioPlaceholder.style.display = 'flex';
          } else {
            remoteVideo.classList.remove('sc-audio-mode-hidden');
            remoteVideo.style.display = 'block';
            remoteAudioPlaceholder.style.display = 'none';
          }
          if (data.role) {
            setRole(data.role === 'candidate' ? 'examiner' : 'candidate', false);
          }
          if (data.name && partnerNameTag) {
            partnerNameTag.textContent = data.name;
          }
          break;
        case 'LEAVE_CALL':
          handlePartnerDisconnected();
          break;
      }
    });

    conn.on('close', () => {
      handlePartnerDisconnected();
    });
  }

  // --- Session Stages Roadmap (Episoden style) ---
  function setSessionStage(stageNum, broadcast = true) {
    activeSessionStage = stageNum;
    for (let s = 1; s <= 4; s++) {
      const stepBtn = document.getElementById(`scRoadmapStep${s}`);
      if (stepBtn) {
        stepBtn.classList.toggle('active', s === stageNum);
        stepBtn.classList.toggle('completed', s < stageNum);
      }
    }

    // Auto-align IELTS Part tab
    if (stageNum === 1 || stageNum === 2) {
      setActivePart(1, false);
    } else if (stageNum === 3) {
      setActivePart(2, false);
    } else if (stageNum === 4) {
      setActivePart(3, false);
    }

    if (broadcast && activeDataConn && activeDataConn.open) {
      activeDataConn.send({ type: 'SYNC_STAGE', stage: stageNum });
    }
  }

  // --- Role Switcher (Candidate vs Examiner) ---
  function setRole(role, broadcast = true) {
    myRole = role;
    if (roleCandidateBtn && roleExaminerBtn) {
      roleCandidateBtn.classList.toggle('active', role === 'candidate');
      roleExaminerBtn.classList.toggle('active', role === 'examiner');
    }
    if (partnerRoleBadge) {
      const partnerRole = role === 'candidate' ? 'Examiner' : 'Candidate';
      const icon = role === 'candidate' ? 'school' : 'person';
      partnerRoleBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px;color:#2563eb;">${icon}</span><span>Partner: ${partnerRole}</span>`;
    }

    if (broadcast && activeDataConn && activeDataConn.open) {
      activeDataConn.send({ type: 'SYNC_ROLE', role: role });
    }
  }

  // --- Matchmaking System ---
  async function startMatchmaking() {
    const originalBtnContent = startMatchBtn.innerHTML;

    if (!myPeerId) {
      startMatchBtn.disabled = true;
      startMatchBtn.innerHTML = '<span class="material-symbols-outlined sc-spin" style="font-size:20px;">sync</span><span>Connecting to network...</span>';

      let waited = 0;
      while (!myPeerId && waited < 30) {
        await new Promise(r => setTimeout(r, 200));
        waited++;
      }
      startMatchBtn.disabled = false;
      startMatchBtn.innerHTML = originalBtnContent;

      if (!myPeerId) {
        alert('Network connection is taking longer than usual. Please refresh the page and try again.');
        return;
      }
    }

    if (!localStream) {
      startMatchBtn.disabled = true;
      startMatchBtn.innerHTML = '<span class="material-symbols-outlined sc-spin" style="font-size:20px;">mic</span><span>Starting microphone...</span>';
      try {
        await initLocalMedia();
      } catch (e) {}
      startMatchBtn.disabled = false;
      startMatchBtn.innerHTML = originalBtnContent;

      if (!localStream) {
        alert('Microphone access is required for Speaking Club. Please enable microphone permissions in your browser.');
        return;
      }
    }

    // Switch view to searching
    lobbyView.style.display = 'none';
    searchView.style.display = 'block';
    roomView.style.display = 'none';
    feedbackModal.style.display = 'none';

    searchStartTime = Date.now();
    updateSearchTimer();
    searchTimerInterval = setInterval(updateSearchTimer, 1000);

    try {
      const res = await fetch('/api/speaking-club/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId: myPeerId,
          mode: selectedMode,
          level: selectedLevel,
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          roomCode: currentRoomCode || undefined
        })
      });

      if (!res.ok) throw new Error('Queue request failed');
      const data = await res.json();

      if (data.status === 'matched') {
        stopSearchTimer();
        connectToPartner(data);
      } else if (data.status === 'waiting') {
        activeQueueId = data.queueId;
        startPolling();
      }
    } catch (err) {
      console.error('Matchmaking error:', err);
      alert('Could not connect to matchmaking queue. Please try again.');
      cancelMatchmaking();
    }
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!activeQueueId) return;
      try {
        const res = await fetch('/api/speaking-club/poll?queueId=' + encodeURIComponent(activeQueueId));
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'matched') {
          clearInterval(pollInterval);
          pollInterval = null;
          stopSearchTimer();
          connectToPartner(data);
        } else if (data.status === 'expired') {
          // Seamlessly re-enqueue so user's search session continues uninterrupted
          try {
            const reRes = await fetch('/api/speaking-club/queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                peerId: myPeerId,
                mode: selectedMode,
                level: selectedLevel,
                name: currentUser.name,
                avatarUrl: currentUser.avatarUrl,
                roomCode: currentRoomCode || undefined
              })
            });
            if (reRes.ok) {
              const reData = await reRes.json();
              if (reData.status === 'matched') {
                clearInterval(pollInterval);
                pollInterval = null;
                stopSearchTimer();
                connectToPartner(reData);
              } else if (reData.status === 'waiting') {
                activeQueueId = reData.queueId;
              }
            }
          } catch (reErr) {}
        }
      } catch (e) {}
    }, 1500);
  }

  function cancelMatchmaking() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = null;
    stopSearchTimer();

    if (activeQueueId) {
      fetch('/api/speaking-club/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId: activeQueueId })
      }).catch(() => {});
      activeQueueId = null;
    }

    searchView.style.display = 'none';
    lobbyView.style.display = 'block';
  }

  function updateSearchTimer() {
    if (!searchStartTime) return;
    const elapsed = Math.floor((Date.now() - searchStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (searchElapsedEl) {
      searchElapsedEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    const tipEl = document.getElementById('scSearchTip');
    if (tipEl) {
      if (currentRoomCode) {
        tipEl.innerHTML = `Waiting for your partner to join private room: <strong style="color:#2563eb;font-family:monospace;">${escapeHtml(currentRoomCode)}</strong>`;
      } else if (elapsed > 25) {
        tipEl.innerHTML = `Still looking for an available partner... <br><span style="font-size:12px;color:#2563eb;font-weight:600;">Tip: You can invite a friend directly with "Invite Friend (Direct Room)"!</span>`;
      }
    }
  }

  function stopSearchTimer() {
    if (searchTimerInterval) clearInterval(searchTimerInterval);
    searchTimerInterval = null;
    searchStartTime = null;
  }

  // --- Connect with Matched Partner ---
  function connectToPartner(matchData) {
    // Sound chime alert!
    playChime('matchFound');

    activeQueueId = null;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    currentPartner = {
      peerId: matchData.partnerPeerId,
      name: matchData.partnerName || 'Speaking Partner',
      mode: matchData.partnerMode || 'video',
      avatarUrl: matchData.partnerAvatarUrl || ''
    };

    partnerNameTag.textContent = currentPartner.name;
    remoteAudioName.textContent = currentPartner.name;
    remoteAvatarLetter.textContent = currentPartner.name.charAt(0).toUpperCase();

    // Switch view to room
    searchView.style.display = 'none';
    lobbyView.style.display = 'none';
    roomView.style.display = 'block';

    // Setup local video inside PiP
    if (selectedMode === 'video') {
      localVideo.srcObject = localStream;
      localVideo.style.display = 'block';
      localAudioPip.style.display = 'none';
    } else {
      localVideo.style.display = 'none';
      localAudioPip.style.display = 'flex';
    }

    // Set topic from server match or pick first
    if (matchData.topic) {
      const idx = allTopics.findIndex(t => t.id === matchData.topic.id);
      if (idx !== -1) {
        currentTopicIndex = idx;
      } else {
        allTopics.unshift(matchData.topic);
        currentTopicIndex = 0;
      }
    }
    renderTopic();

    // Initialize roadmap & roles
    setSessionStage(1, false);
    setRole(matchData.role === 'initiator' ? 'candidate' : 'examiner', false);

    // Start in-call timers
    startSessionTimer();

    // If we are initiator, initiate WebRTC call and DataConnection
    if (matchData.role === 'initiator') {
      function initiateMediaCall() {
        if (!myPeer || !currentPartner?.peerId || !localStream) return;
        const call = myPeer.call(currentPartner.peerId, localStream);
        activeCall = call;
        call.on('stream', remoteStream => {
          attachRemoteStream(remoteStream);
        });
        call.on('close', () => {
          handlePartnerDisconnected();
        });
        call.on('error', err => {
          console.warn('Call error:', err);
        });
      }

      initiateMediaCall();

      const conn = myPeer.connect(currentPartner.peerId);
      activeDataConn = conn;
      setupDataConn(conn);

      // Auto-retry media call after 3 seconds if remote stream is not yet established
      setTimeout(() => {
        if (roomView.style.display === 'block' && (!remoteVideo.srcObject || remoteVideo.paused)) {
          console.log('Retrying WebRTC media connection to partner...');
          initiateMediaCall();
        }
      }, 3000);
    }
  }

  function attachRemoteStream(stream) {
    remoteVideo.srcObject = stream;
    remoteVideo.play().catch(() => {});
    if (currentPartner && currentPartner.mode === 'audio') {
      remoteVideo.classList.add('sc-audio-mode-hidden');
      remoteAudioPlaceholder.style.display = 'flex';
    } else {
      remoteVideo.classList.remove('sc-audio-mode-hidden');
      remoteVideo.style.display = 'block';
      remoteAudioPlaceholder.style.display = 'none';
    }
    initRemoteVoiceDetection(stream);
  }

  function handlePartnerDisconnected() {
    if (roomView.style.display === 'block') {
      alert('Your partner has disconnected or left the session.');
      openFeedbackModal();
    }
  }

  // --- In-Call Timers ---
  function startSessionTimer() {
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    sessionSecondsRemaining = 600; // 10 minutes
    updateSessionTimerDisplay();

    sessionTimerInterval = setInterval(() => {
      sessionSecondsRemaining--;
      updateSessionTimerDisplay();

      // Stage progression recommendation based on elapsed time:
      const elapsed = 600 - sessionSecondsRemaining;
      if (elapsed === 120 && activeSessionStage === 1) { // 2 mins elapsed
        setSessionStage(2, true);
      } else if (elapsed === 300 && activeSessionStage === 2) { // 5 mins elapsed
        setSessionStage(3, true);
      } else if (elapsed === 480 && activeSessionStage === 3) { // 8 mins elapsed
        setSessionStage(4, true);
      }

      if (sessionSecondsRemaining === 60) {
        playChime('warning');
      }

      if (sessionSecondsRemaining <= 0) {
        clearInterval(sessionTimerInterval);
        playChime('warning');
        alert('Time is up for this 10-minute session! Take a moment to give feedback.');
        openFeedbackModal();
      }
    }, 1000);
  }

  function updateSessionTimerDisplay() {
    const mins = Math.floor(sessionSecondsRemaining / 60);
    const secs = sessionSecondsRemaining % 60;
    const str = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (timerDisplayEl) timerDisplayEl.textContent = str;

    if (sessionSecondsRemaining <= 60) {
      sessionTimerWrap.classList.add('warning');
    } else {
      sessionTimerWrap.classList.remove('warning');
    }
  }

  // --- Part 2 1-Min Prep & 2-Min Speech Countdown ---
  function startPrepCountdown(broadcast = true) {
    const prepBtn = document.getElementById('scPrepTimerBtn');
    if (!prepBtn) return;
    prepBtn.disabled = true;

    prepSecondsRemaining = 60;
    if (prepTimerInterval) clearInterval(prepTimerInterval);

    if (broadcast && activeDataConn && activeDataConn.open) {
      activeDataConn.send({ type: 'START_PREP' });
    }

    prepTimerInterval = setInterval(() => {
      prepSecondsRemaining--;
      prepBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">timer</span><span>Prep Time: 0:${prepSecondsRemaining < 10 ? '0' : ''}${prepSecondsRemaining}</span>`;
      if (prepSecondsRemaining <= 0) {
        clearInterval(prepTimerInterval);
        playChime('prepEnd');
        prepBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check_circle</span><span>Prep Finished! Speech Clock Started</span>';
        prepBtn.style.background = '#10b981';
        startSpeechClock(true);
      }
    }, 1000);
  }

  function startSpeechClock(broadcast = true) {
    const wrap = document.getElementById('scSpeechClockWrap');
    const bar = document.getElementById('scSpeechProgressBar');
    const display = document.getElementById('scSpeechTimeDisplay');
    const hint = document.getElementById('scSpeechHint');
    if (!wrap) return;

    wrap.style.display = 'block';
    speechSecondsElapsed = 0;
    if (speechTimerInterval) clearInterval(speechTimerInterval);

    if (broadcast && activeDataConn && activeDataConn.open) {
      activeDataConn.send({ type: 'START_SPEECH_CLOCK' });
    }

    function updateSpeechUI() {
      const mins = Math.floor(speechSecondsElapsed / 60);
      const secs = speechSecondsElapsed % 60;
      if (display) display.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      const pct = Math.min(100, (speechSecondsElapsed / 120) * 100);
      if (bar) {
        bar.style.width = pct + '%';
        bar.classList.toggle('zone-optimal', speechSecondsElapsed >= 90 && speechSecondsElapsed < 110);
        bar.classList.toggle('zone-finish', speechSecondsElapsed >= 110);
      }

      if (hint) {
        if (speechSecondsElapsed < 60) {
          hint.textContent = 'Keep developing your points and explaining details.';
        } else if (speechSecondsElapsed < 90) {
          hint.textContent = 'Good momentum! Approaching the optimal 1:30 - 2:00 zone.';
        } else if (speechSecondsElapsed < 115) {
          hint.textContent = '🌟 Optimal speech duration reached (Band 7+ length).';
        } else {
          hint.textContent = '⏰ 2 minutes completed. Wrap up your concluding sentence.';
        }
      }
    }

    updateSpeechUI();
    speechTimerInterval = setInterval(() => {
      speechSecondsElapsed++;
      updateSpeechUI();
      if (speechSecondsElapsed >= 120) {
        clearInterval(speechTimerInterval);
        playChime('warning');
      }
    }, 1000);
  }

  // --- Topics & IELTS Cue Card Rendering ---
  function renderTopic() {
    const topic = allTopics[currentTopicIndex] || allTopics[0];
    if (!topic) return;

    if (topicCategoryEl) topicCategoryEl.textContent = topic.category || 'CAMBRIDGE IELTS';
    if (topicTitleEl) topicTitleEl.textContent = topic.title || 'Speaking Topic';

    renderPartContent();
  }

  function renderPartContent() {
    const topic = allTopics[currentTopicIndex] || allTopics[0];
    if (!topic || !partContentEl) return;

    if (activePart === 1) {
      const part1 = topic.part1 || {};
      const questionsHtml = (part1.questions || []).map((q, idx) => `
        <div class="sc-question-item">
          <strong>Q${idx + 1}:</strong> ${escapeHtml(q)}
        </div>
      `).join('');

      partContentEl.innerHTML = `
        <div style="font-size:13px;color:#64748b;margin-bottom:12px;">${escapeHtml(part1.instructions || 'Ask each other these questions.')}</div>
        <div class="sc-questions-list">${questionsHtml}</div>
      `;
    } else if (activePart === 2) {
      const part2 = topic.part2 || {};
      const cue = part2.cueCard || {};
      const pointsHtml = (cue.points || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');

      partContentEl.innerHTML = `
        <div style="font-size:13px;color:#64748b;margin-bottom:8px;">${escapeHtml(part2.instructions || 'One person speaks for 1-2 minutes.')}</div>
        <div class="sc-cue-card">
          <div class="sc-cue-topic">${escapeHtml(cue.topic || 'Describe an experience')}</div>
          <p style="font-size:12.5px;color:#78350f;margin:0 0 6px;font-weight:700;">You should say:</p>
          <ul class="sc-cue-points">${pointsHtml}</ul>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button type="button" class="sc-prep-btn" id="scPrepTimerBtn" style="flex:1;">
            <span class="material-symbols-outlined" style="font-size:16px;">timer</span>
            <span>Start 1-Min Prep Countdown</span>
          </button>
          <button type="button" class="button secondary" id="scManualSpeechClockBtn" style="border-radius:12px;font-weight:700;font-size:12.5px;">
            <span class="material-symbols-outlined" style="font-size:16px;color:#2563eb;">mic</span>
            <span>Speech Clock</span>
          </button>
        </div>

        <div class="sc-speech-clock-wrap" id="scSpeechClockWrap" style="display:none;">
          <div class="sc-speech-clock-header">
            <span>2-Minute Speech Clock (Target: 1:30 - 2:00)</span>
            <strong id="scSpeechTimeDisplay">0:00</strong>
          </div>
          <div class="sc-speech-progress-track">
            <div class="sc-speech-progress-bar" id="scSpeechProgressBar"></div>
          </div>
          <p class="sc-speech-hint" id="scSpeechHint">Keep speaking! Aim for 1:30 to 2:00 minutes.</p>
        </div>
      `;

      document.getElementById('scPrepTimerBtn')?.addEventListener('click', () => {
        startPrepCountdown(true);
      });
      document.getElementById('scManualSpeechClockBtn')?.addEventListener('click', () => {
        startSpeechClock(true);
      });
    } else if (activePart === 3) {
      const part3 = topic.part3 || {};
      const questionsHtml = (part3.questions || []).map((q, idx) => `
        <div class="sc-question-item">
          <strong>Discussion ${idx + 1}:</strong> ${escapeHtml(q)}
        </div>
      `).join('');

      partContentEl.innerHTML = `
        <div style="font-size:13px;color:#64748b;margin-bottom:12px;">${escapeHtml(part3.instructions || 'Discuss these broader issues together.')}</div>
        <div class="sc-questions-list">${questionsHtml}</div>
      `;
    }
  }

  function setActivePart(partNum, broadcast = true) {
    activePart = partNum;
    [tabPart1, tabPart2, tabPart3].forEach((tab, idx) => {
      if (tab) tab.classList.toggle('active', idx + 1 === partNum);
    });
    renderPartContent();

    if (broadcast && activeDataConn && activeDataConn.open) {
      activeDataConn.send({ type: 'SYNC_PART', part: partNum });
    }
  }

  function setTopicByIndex(idx, broadcast = true) {
    currentTopicIndex = (idx + allTopics.length) % allTopics.length;
    renderTopic();

    if (broadcast && activeDataConn && activeDataConn.open) {
      activeDataConn.send({ type: 'SYNC_TOPIC', topicIndex: currentTopicIndex });
    }
  }

  function nextTopic() {
    setTopicByIndex(currentTopicIndex + 1, true);
  }

  // --- Mini Vocab Chat ---
  function appendChatMessage(sender, text, isSelf) {
    if (!chatMessagesEl) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'sc-chat-msg';
    msgDiv.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}`;
    if (isSelf) {
      msgDiv.style.background = '#eff6ff';
      msgDiv.style.color = '#1d4ed8';
    }
    chatMessagesEl.appendChild(msgDiv);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  // --- In-Call Media Toggles ---
  function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    isMicMuted = !isMicMuted;
    audioTrack.enabled = !isMicMuted;

    toggleMicBtn.classList.toggle('is-off', isMicMuted);
    toggleMicBtn.innerHTML = `<span class="material-symbols-outlined">${isMicMuted ? 'mic_off' : 'mic'}</span>`;
  }

  function toggleCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];

    isCamOff = !isCamOff;
    if (videoTrack) {
      videoTrack.enabled = !isCamOff;
    }

    if (isCamOff) {
      localVideo.style.display = 'none';
      localAudioPip.style.display = 'flex';
      toggleCamBtn.classList.add('is-off');
      toggleCamBtn.innerHTML = '<span class="material-symbols-outlined">videocam_off</span>';
    } else {
      localVideo.style.display = 'block';
      localAudioPip.style.display = 'none';
      toggleCamBtn.classList.remove('is-off');
      toggleCamBtn.innerHTML = '<span class="material-symbols-outlined">videocam</span>';
    }

    if (activeDataConn && activeDataConn.open) {
      activeDataConn.send({
        type: 'MODE_SYNC',
        mode: isCamOff ? 'audio' : 'video',
        name: currentUser.name
      });
    }
  }

  function endCall() {
    if (confirm('Are you sure you want to end this speaking session?')) {
      if (activeDataConn && activeDataConn.open) {
        activeDataConn.send({ type: 'LEAVE_CALL' });
      }
      openFeedbackModal();
    }
  }

  // --- Post-Call Feedback Modal ---
  function openFeedbackModal() {
    // Stop timers
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    if (prepTimerInterval) clearInterval(prepTimerInterval);
    if (speechTimerInterval) clearInterval(speechTimerInterval);
    if (vadAnimId) cancelAnimationFrame(vadAnimId);

    // Stop active peer call
    if (activeCall) {
      activeCall.close();
      activeCall = null;
    }
    if (activeDataConn) {
      activeDataConn.close();
      activeDataConn = null;
    }

    if (currentPartner && feedbackPartnerName) {
      feedbackPartnerName.textContent = currentPartner.name;
    }

    awardedPraiseBadges.clear();
    document.querySelectorAll('.sc-praise-btn').forEach(btn => btn.classList.remove('selected'));

    feedbackModal.style.display = 'flex';
  }

  function submitFeedbackAndReturn(findNext = false) {
    const band = document.getElementById('scFeedbackBand')?.value || '6.5';
    const activeStar = document.querySelectorAll('.sc-star-btn.active').length || 5;
    const badgesArray = Array.from(awardedPraiseBadges);

    // Send praise badge via activeDataConn if open
    if (activeDataConn && activeDataConn.open && badgesArray.length) {
      badgesArray.forEach(b => activeDataConn.send({ type: 'AWARD_BADGE', badge: b }));
    }

    // Post feedback to server
    fetch('/api/speaking-club/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerName: currentPartner?.name,
        stars: activeStar,
        band: band,
        badges: badgesArray
      })
    }).catch(() => {});

    // Record our own stats
    recordSessionCompleted(badgesArray);

    resetToLobby();
    if (findNext) {
      startMatchmaking();
    }
  }

  function resetToLobby() {
    feedbackModal.style.display = 'none';
    roomView.style.display = 'none';
    searchView.style.display = 'none';
    lobbyView.style.display = 'block';

    initLocalMedia();
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Mode switcher in lobby
    modeVideoBtn?.addEventListener('click', () => {
      selectedMode = 'video';
      modeVideoBtn.classList.add('active');
      modeAudioBtn.classList.remove('active');
      initLocalMedia();
    });

    modeAudioBtn?.addEventListener('click', () => {
      selectedMode = 'audio';
      modeAudioBtn.classList.add('active');
      modeVideoBtn.classList.remove('active');
      initLocalMedia();
    });

    // Level selector pills
    document.querySelectorAll('.sc-level-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.sc-level-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedLevel = pill.dataset.level || 'any';
      });
    });

    // Start matching button
    startMatchBtn?.addEventListener('click', startMatchmaking);

    // Invite friend button (Direct Room link)
    const inviteBtn = document.getElementById('scInviteFriendBtn');
    inviteBtn?.addEventListener('click', () => {
      const code = 'ielts-' + Math.random().toString(36).substring(2, 8);
      const url = `${window.location.origin}/english/speaking-club?room=${code}`;
      currentRoomCode = code;
      history.replaceState(null, '', `?room=${code}`);
      checkRoomUrl();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          alert(`Private Room created!\n\nDirect link copied to clipboard:\n${url}\n\nSend this link to your partner or friend. When you both click "Find Speaking Partner", you will instantly connect to each other!`);
        }).catch(() => {
          prompt('Private Room created! Copy this link and send to your friend:', url);
        });
      } else {
        prompt('Private Room created! Copy this link and send to your friend:', url);
      }
    });

    // Cancel search button
    cancelSearchBtn?.addEventListener('click', cancelMatchmaking);

    // Call controls
    toggleMicBtn?.addEventListener('click', toggleMic);
    toggleCamBtn?.addEventListener('click', toggleCam);
    nextTopicBtn?.addEventListener('click', nextTopic);
    endCallBtn?.addEventListener('click', endCall);

    // Roadmap stages clicks
    for (let s = 1; s <= 4; s++) {
      document.getElementById(`scRoadmapStep${s}`)?.addEventListener('click', () => {
        setSessionStage(s, true);
      });
    }

    // Role switcher buttons
    roleCandidateBtn?.addEventListener('click', () => setRole('candidate', true));
    roleExaminerBtn?.addEventListener('click', () => setRole('examiner', true));

    // Part tabs
    tabPart1?.addEventListener('click', () => setActivePart(1, true));
    tabPart2?.addEventListener('click', () => setActivePart(2, true));
    tabPart3?.addEventListener('click', () => setActivePart(3, true));

    // Chat form submit
    chatForm?.addEventListener('submit', e => {
      e.preventDefault();
      const text = String(chatInput?.value || '').trim();
      if (!text) return;
      appendChatMessage('You', text, true);
      chatInput.value = '';

      if (activeDataConn && activeDataConn.open) {
        activeDataConn.send({
          type: 'CHAT_MSG',
          name: currentUser.name,
          text: text
        });
      }
    });

    // Star rating
    starRow?.querySelectorAll('.sc-star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = Number(btn.dataset.star || 5);
        starRow.querySelectorAll('.sc-star-btn').forEach(s => {
          s.classList.toggle('active', Number(s.dataset.star || 0) <= rating);
        });
      });
    });

    // Praise badges selection
    document.querySelectorAll('.sc-praise-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('selected');
        const badge = btn.dataset.badge;
        if (btn.classList.contains('selected')) {
          awardedPraiseBadges.add(badge);
        } else {
          awardedPraiseBadges.delete(badge);
        }
      });
    });

    // Feedback modal actions
    feedbackCloseBtn?.addEventListener('click', () => submitFeedbackAndReturn(false));
    feedbackFindAgainBtn?.addEventListener('click', () => submitFeedbackAndReturn(true));

    // Report partner button
    reportBtn?.addEventListener('click', () => {
      const reason = prompt('Please describe why you are reporting this session (e.g. Inappropriate behavior, user was absent/AFK, technical issue):');
      if (reason && reason.trim()) {
        fetch('/api/speaking-club/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerName: currentPartner?.name,
            reason: reason.trim()
          })
        }).catch(() => {});
        alert('Thank you. Your report has been submitted to moderation.');
      }
    });

    // Cleanup on beforeunload
    window.addEventListener('beforeunload', () => {
      if (activeQueueId) {
        navigator.sendBeacon('/api/speaking-club/leave', JSON.stringify({ queueId: activeQueueId }));
      }
      if (activeDataConn && activeDataConn.open) {
        activeDataConn.send({ type: 'LEAVE_CALL' });
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
