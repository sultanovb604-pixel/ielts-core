// IELTS Core Speaking Club (1-on-1 Live Practice)
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

  let selectedMode = 'video'; // 'video' | 'audio'
  let selectedLevel = 'any';
  let activeQueueId = null;
  let pollInterval = null;
  let searchTimerInterval = null;
  let searchStartTime = null;

  let allTopics = [];
  let currentTopicIndex = 0;
  let activePart = 1;
  let sessionTimerInterval = null;
  let sessionSecondsRemaining = 600; // 10 minutes
  let prepTimerInterval = null;
  let prepSecondsRemaining = 60;

  let currentPartner = null;
  let isMicMuted = false;
  let isCamOff = false;

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

  const chatMessagesEl = document.getElementById('scChatMessages');
  const chatForm = document.getElementById('scChatForm');
  const chatInput = document.getElementById('scChatInput');

  const feedbackPartnerName = document.getElementById('scFeedbackPartnerName');
  const feedbackCloseBtn = document.getElementById('scFeedbackCloseBtn');
  const feedbackFindAgainBtn = document.getElementById('scFeedbackFindAgainBtn');
  const starRow = document.getElementById('scStarRow');

  // User Profile
  let currentUser = {
    name: 'Student',
    avatarUrl: ''
  };

  // --- Initialization ---
  async function init() {
    loadUser();
    setupEventListeners();
    fetchStats();
    await loadTopics();
    await initLocalMedia();
    initPeer();
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
        // Fallback to audio only if video failed
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
        micAnimId = requestAnimationFrame(updateMeter);
      }
      updateMeter();
    } catch (e) {
      console.warn('Audio meter init error:', e);
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
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        },
        debug: 1
      });

      myPeer.on('open', id => {
        myPeerId = id;
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
      // Send our current mode to partner
      conn.send({
        type: 'MODE_SYNC',
        mode: selectedMode,
        name: currentUser.name
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
        case 'START_PREP':
          startPrepCountdown(false);
          break;
        case 'CHAT_MSG':
          appendChatMessage(data.name || 'Partner', data.text, false);
          break;
        case 'MODE_SYNC':
          if (data.mode === 'audio') {
            remoteVideo.style.display = 'none';
            remoteAudioPlaceholder.style.display = 'flex';
          } else {
            remoteVideo.style.display = 'block';
            remoteAudioPlaceholder.style.display = 'none';
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

  // --- Matchmaking System ---
  async function startMatchmaking() {
    if (!myPeerId) {
      alert('Connecting to network. Please wait a moment and try again.');
      return;
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
          avatarUrl: currentUser.avatarUrl
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
          cancelMatchmaking();
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
  }

  function stopSearchTimer() {
    if (searchTimerInterval) clearInterval(searchTimerInterval);
    searchTimerInterval = null;
    searchStartTime = null;
  }

  // --- Connect with Matched Partner ---
  function connectToPartner(matchData) {
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
      currentTopicIndex = idx !== -1 ? idx : 0;
    }
    renderTopic();

    // Start in-call timers
    startSessionTimer();

    // If we are initiator, initiate WebRTC call and DataConnection
    if (matchData.role === 'initiator') {
      const call = myPeer.call(currentPartner.peerId, localStream);
      activeCall = call;
      call.on('stream', remoteStream => {
        attachRemoteStream(remoteStream);
      });
      call.on('close', () => {
        handlePartnerDisconnected();
      });

      const conn = myPeer.connect(currentPartner.peerId);
      activeDataConn = conn;
      setupDataConn(conn);
    }
  }

  function attachRemoteStream(stream) {
    remoteVideo.srcObject = stream;
    if (currentPartner && currentPartner.mode === 'audio') {
      remoteVideo.style.display = 'none';
      remoteAudioPlaceholder.style.display = 'flex';
    } else {
      remoteVideo.style.display = 'block';
      remoteAudioPlaceholder.style.display = 'none';
    }
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
      if (sessionSecondsRemaining <= 0) {
        clearInterval(sessionTimerInterval);
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
        prepBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check_circle</span><span>Prep Finished! Begin Speaking</span>';
        prepBtn.style.background = '#10b981';
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
        <button type="button" class="sc-prep-btn" id="scPrepTimerBtn">
          <span class="material-symbols-outlined" style="font-size:16px;">timer</span>
          <span>Start 1-Min Prep Countdown</span>
        </button>
      `;

      document.getElementById('scPrepTimerBtn')?.addEventListener('click', () => {
        startPrepCountdown(true);
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

    feedbackModal.style.display = 'flex';
  }

  function resetToLobby() {
    feedbackModal.style.display = 'none';
    roomView.style.display = 'none';
    searchView.style.display = 'none';
    lobbyView.style.display = 'block';

    // Re-verify local preview
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

    // Cancel search button
    cancelSearchBtn?.addEventListener('click', cancelMatchmaking);

    // Call controls
    toggleMicBtn?.addEventListener('click', toggleMic);
    toggleCamBtn?.addEventListener('click', toggleCam);
    nextTopicBtn?.addEventListener('click', nextTopic);
    endCallBtn?.addEventListener('click', endCall);

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

    // Feedback modal actions
    feedbackCloseBtn?.addEventListener('click', resetToLobby);
    feedbackFindAgainBtn?.addEventListener('click', () => {
      resetToLobby();
      startMatchmaking();
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
