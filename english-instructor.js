/* ==========================================================================
   IELTS CORE AI INSTRUCTOR — CLIENT LOGIC
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'ielts_instructor_chat_history_v1';
  let chatHistory = [];
  let isSending = false;
  let recognition = null;
  let isVoiceActive = false;

  // DOM Elements
  const messagesContainer = document.getElementById('chatMessagesContainer');
  const inputForm = document.getElementById('chatInputForm');
  const messageInput = document.getElementById('chatMessageInput');
  const btnSend = document.getElementById('btnSendChat');
  const btnVoice = document.getElementById('btnVoiceInput');
  const btnClear = document.getElementById('btnClearChat');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const sidebarPanel = document.getElementById('instructorSidebarPanel');
  const quickChipsTrack = document.getElementById('quickChipsTrack');

  // Diagnostic DOM Elements
  const diagEstBand = document.getElementById('diagEstBand');
  const readingBar = document.getElementById('readingBar');
  const readingVal = document.getElementById('readingVal');
  const listeningBar = document.getElementById('listeningBar');
  const listeningVal = document.getElementById('listeningVal');
  const writingBar = document.getElementById('writingBar');
  const writingVal = document.getElementById('writingVal');
  const diagWeakList = document.getElementById('diagWeakList');

  // --- SAFE HTML ESCAPE ---
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // --- SIMPLE HIGH-FIDELITY MARKDOWN RENDERER ---
  function renderMarkdown(md) {
    if (!md) return '';
    let text = String(md);

    // Escape raw HTML except allowed safe structures
    text = escapeHtml(text);

    // Headings
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3>$1</h3>');

    // Bold & Italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Horizontal Rules
    text = text.replace(/^---$/gim, '<hr>');

    // Alerts / Blockquotes
    text = text.replace(/^&gt;\s*\[!(IMPORTANT|NOTE|TIP|WARNING)\]\s*(.*$)/gim, '<blockquote class="alert-$1"><strong>$1:</strong> $2');
    text = text.replace(/^&gt;\s*(.*$)/gim, '<blockquote>$1</blockquote>');

    // Unordered lists
    text = text.replace(/^\s*\*\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    // Consolidate adjacent </ul><ul>
    text = text.replace(/<\/ul>\s*<ul>/g, '');

    // Paragraphs
    const lines = text.split(/\n\n+/);
    text = lines.map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h3|h4|ul|ol|blockquote|hr)/i.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return text;
  }

  // --- WELCOME MESSAGE BUILDER ---
  function getWelcomeMessage(studentName) {
    const name = studentName ? `, ${studentName}` : '';
    return {
      role: 'model',
      text: `### Assalomu alaykum${name}! Men sizning shaxsiy IELTS AI Murabbiyingizman 🎓\n\nMen sizga Cambridge IELTS standartlari bo'yicha **Band 7.5 - 9.0** natijasiga erishishingizda 24/7 yordam beraman:\n\n* 🎯 **Zaif nuqtalaringizni tahlil qilaman:** Test natijalaringizni chuqur tahlil qilib, xatolaringiz sababini ko'rsataman;\n* 📖 **Reading & Listening:** True/False/Not Given, Matching Headings va distractorlarni yechish sirlarini o'rgataman;\n* ✍️ **Writing Task 1 & 2:** Band 7+ shablonlar, PEEL usuli va akademik lug'atlar beraman;\n* 🎙️ **Speaking:** Part 1, 2, 3 uchun ravon nutq va boy idiomalar bilan shug'ullanamiz.\n\n**Hozir qaysi bo'lim yoki savol turi bo'yicha qiynalyapsiz?** Quyidagi mavzulardan birini tanlang yoki savolingizni yozing:`,
      suggestedPrompts: [
        "Reading: TFNG sirlari",
        "Writing Task 2: Band 7.5+ PEEL",
        "Listening: Section 3 Distractorlar",
        "Speaking: Cue Card 1-minut rejasi",
        "Mening natijalarimni tahlil qiling"
      ],
      recommendedAction: {
        title: "IELTS Full Reading Test 01",
        url: "/english/materials?skill=reading&collection=full-test"
      }
    };
  }

  // --- LOAD SAVED HISTORY OR WELCOME ---
  function loadChatHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          chatHistory = parsed;
          renderAllMessages();
          return;
        }
      }
    } catch (e) {}

    // Initial default welcome message
    chatHistory = [getWelcomeMessage()];
    renderAllMessages();
  }

  function saveChatHistory() {
    try {
      // Keep up to last 25 messages to maintain storage efficiency
      const sliced = chatHistory.slice(-25);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sliced));
    } catch (e) {}
  }

  // --- RENDER ALL MESSAGES ---
  function renderAllMessages() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    chatHistory.forEach(msg => appendMessageElement(msg, false));
    scrollToBottom();
  }

  // --- APPEND SINGLE MESSAGE TO STREAM ---
  function appendMessageElement(msg, scroll = true) {
    const isModel = msg.role === 'model';
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isModel ? 'msg-instructor' : 'msg-user'}`;

    const avatarHtml = isModel
      ? `<div class="msg-avatar"><img src="/assets/ielts-core-mark.png" alt="IELTS Core"></div>`
      : `<div class="msg-avatar"><span class="user-initial material-symbols-outlined">person</span></div>`;

    let bodyHtml = renderMarkdown(msg.text);

    // Optional Recommended Action Card
    if (isModel && msg.recommendedAction && msg.recommendedAction.url) {
      bodyHtml += `
        <div class="test-action-card">
          <div class="action-card-text">
            <strong>🎯 Tavsiya etiladigan amaliyot: ${escapeHtml(msg.recommendedAction.title || 'IELTS Practice Test')}</strong>
            <span>Ushbu test orqali o'rganilgan strategiyani amalda mustahkamlang</span>
          </div>
          <a href="${escapeHtml(msg.recommendedAction.url)}" class="btn-action-card">
            <span>Testga o'tish</span>
            <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span>
          </a>
        </div>
      `;
    }

    msgEl.innerHTML = `
      ${avatarHtml}
      <div class="msg-body">${bodyHtml}</div>
    `;

    messagesContainer.appendChild(msgEl);
    if (scroll) scrollToBottom();
  }

  // --- SHOW TYPING INDICATOR ---
  function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'instructorTypingIndicator';
    indicator.className = 'chat-msg msg-instructor';
    indicator.innerHTML = `
      <div class="msg-avatar"><img src="/assets/ielts-core-mark.png" alt="IELTS Core"></div>
      <div class="msg-body" style="padding: 10px 14px;">
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    `;
    messagesContainer.appendChild(indicator);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('instructorTypingIndicator');
    if (el) el.remove();
  }

  function scrollToBottom() {
    if (!messagesContainer) return;
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  // --- UPDATE QUICK PROMPT CHIPS ---
  function updateQuickChips(prompts) {
    if (!quickChipsTrack || !Array.isArray(prompts) || prompts.length === 0) return;
    quickChipsTrack.innerHTML = '';
    prompts.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-item';
      btn.textContent = p;
      btn.setAttribute('data-prompt', p);
      btn.addEventListener('click', () => sendPrompt(p));
      quickChipsTrack.appendChild(btn);
    });
  }

  // --- SEND PROMPT ACTION ---
  async function sendPrompt(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText || isSending) return;

    isSending = true;
    if (btnSend) btnSend.disabled = true;

    // 1. Add User Message
    const userMsg = { role: 'user', text: cleanText };
    chatHistory.push(userMsg);
    appendMessageElement(userMsg, true);
    saveChatHistory();

    // Clear input & reset height
    if (messageInput) {
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }

    // 2. Show Typing Indicator
    showTypingIndicator();

    try {
      // Prepare history payload for context (last 6 items)
      const contextHistory = chatHistory.slice(-7, -1).map(m => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch('/api/instructor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanText,
          history: contextHistory
        })
      });

      removeTypingIndicator();

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const replyText = data.reply || "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.";

      const modelMsg = {
        role: 'model',
        text: replyText,
        recommendedAction: data.recommendedAction || null
      };

      chatHistory.push(modelMsg);
      appendMessageElement(modelMsg, true);
      saveChatHistory();

      // Update prompt chips if server returned new suggested prompts
      if (Array.isArray(data.suggestedPrompts) && data.suggestedPrompts.length > 0) {
        updateQuickChips(data.suggestedPrompts);
      }

      // Update student diagnostic if provided
      if (data.studentSummary) {
        applyDiagnosticData(data.studentSummary);
      }

    } catch (err) {
      removeTypingIndicator();
      const errorMsg = {
        role: 'model',
        text: `> [!WARNING]\n> **Xatolik:** Server bilan aloqada uzilish yuz berdi (${escapeHtml(err.message)}). Qayta urinib ko'ring yoki quyidagi tayyor mavzulardan birini tanlang.`,
        suggestedPrompts: [
          "Reading: TFNG strategiyasini tushuntiring",
          "Writing Task 2 uchun Band 7.5 shablon bering",
          "Listening Section 3 bo'yicha maslahat"
        ]
      };
      chatHistory.push(errorMsg);
      appendMessageElement(errorMsg, true);
    } finally {
      isSending = false;
      if (btnSend) btnSend.disabled = false;
      if (messageInput) messageInput.focus();
    }
  }

  // --- FETCH & APPLY DIAGNOSTIC METRICS ---
  async function loadStudentDiagnostic() {
    try {
      const res = await fetch('/api/instructor/diagnostic');
      if (res.ok) {
        const data = await res.json();
        applyDiagnosticData(data);
      }
    } catch (e) {
      console.warn("Could not load diagnostic:", e.message);
    }
  }

  function applyDiagnosticData(data) {
    if (!data) return;

    if (diagEstBand) {
      diagEstBand.textContent = data.predictedOverallBand || data.predictedBand || '6.5';
    }

    if (readingVal && readingBar) {
      const rBand = data.readingBand || data.readingAvgBand || 6.5;
      readingVal.textContent = rBand;
      const pct = Math.min(100, Math.max(30, (rBand / 9.0) * 100));
      readingBar.style.width = `${pct}%`;
    }

    if (listeningVal && listeningBar) {
      const lBand = data.listeningBand || data.listeningAvgBand || 7.0;
      listeningVal.textContent = lBand;
      const pct = Math.min(100, Math.max(30, (lBand / 9.0) * 100));
      listeningBar.style.width = `${pct}%`;
    }

    if (writingVal && writingBar) {
      const wBand = data.writingBand || data.writingAvgBand || 6.5;
      writingVal.textContent = wBand;
      const pct = Math.min(100, Math.max(30, (wBand / 9.0) * 100));
      writingBar.style.width = `${pct}%`;
    }

    // Dynamic Weak Spots list
    if (diagWeakList) {
      const weakReading = Array.isArray(data.weakReadingTypes) ? data.weakReadingTypes : [];
      const weakListening = Array.isArray(data.weakListeningSections) ? data.weakListeningSections : [];
      const allWeaks = [...weakReading, ...weakListening];

      if (allWeaks.length > 0) {
        diagWeakList.innerHTML = '';
        allWeaks.slice(0, 4).forEach(item => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'weak-chip';
          const prompt = `${item.name} bo'yicha xatolarim ko'p. Buni Cambridge qoidalari bo'yicha qanday to'g'irlasam bo'ladi?`;
          btn.setAttribute('data-prompt', prompt);
          btn.innerHTML = `
            <span class="weak-name">${escapeHtml(item.name)}</span>
            <span class="weak-action">Ask Mentor &rarr;</span>
          `;
          btn.addEventListener('click', () => sendPrompt(prompt));
          diagWeakList.appendChild(btn);
        });
      }
    }
  }

  // --- VOICE SPEECH RECOGNITION ---
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (btnVoice) btnVoice.style.display = 'none';
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'uz-UZ'; // Can fallback or auto-detect

    recognition.onstart = () => {
      isVoiceActive = true;
      if (btnVoice) btnVoice.classList.add('listening');
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      if (messageInput) {
        messageInput.value = (messageInput.value + ' ' + transcript).trim();
        messageInput.dispatchEvent(new Event('input'));
      }
    };

    recognition.onerror = () => {
      isVoiceActive = false;
      if (btnVoice) btnVoice.classList.remove('listening');
    };

    recognition.onend = () => {
      isVoiceActive = false;
      if (btnVoice) btnVoice.classList.remove('listening');
    };

    if (btnVoice) {
      btnVoice.addEventListener('click', () => {
        if (!recognition) return;
        if (isVoiceActive) {
          recognition.stop();
        } else {
          try { recognition.start(); } catch (e) {}
        }
      });
    }
  }

  // --- INITIALIZATION ---
  function init() {
    loadChatHistory();
    loadStudentDiagnostic();
    initSpeechRecognition();

    // Auto-resizing textarea
    if (messageInput) {
      messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
      });

      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendPrompt(messageInput.value);
        }
      });
    }

    // Form submit
    if (inputForm) {
      inputForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendPrompt(messageInput.value);
      });
    }

    // Reset Chat
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm("Haqiqatan ham suhbat tarixini tozalab, boshidan boshlamoqchimisiz?")) {
          chatHistory = [getWelcomeMessage()];
          saveChatHistory();
          renderAllMessages();
          if (window.showToast) window.showToast("Suhbat yangilandi", "info");
        }
      });
    }

    // Mobile Sidebar Toggle
    if (btnToggleSidebar && sidebarPanel) {
      btnToggleSidebar.addEventListener('click', () => {
        sidebarPanel.classList.toggle('is-open');
      });

      // Close sidebar if clicking outside
      sidebarPanel.addEventListener('click', (e) => {
        if (e.target === sidebarPanel && sidebarPanel.classList.contains('is-open')) {
          sidebarPanel.classList.remove('is-open');
        }
      });
    }

    // Attach click listeners to static chips & shortcuts
    document.querySelectorAll('[data-prompt]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prompt = e.currentTarget.getAttribute('data-prompt');
        if (prompt) {
          sendPrompt(prompt);
          if (sidebarPanel && sidebarPanel.classList.contains('is-open')) {
            sidebarPanel.classList.remove('is-open');
          }
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
