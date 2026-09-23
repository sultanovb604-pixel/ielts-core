/* ==========================================================================
   IELTS CORE AI MENTOR — CLIENT CONTROLLER
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'ielts_core_mentor_chat_v2';
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
  const diagStatusBadge = document.getElementById('diagStatusBadge');
  const diagZeroState = document.getElementById('diagZeroState');
  const diagSkillsBreakdown = document.getElementById('diagSkillsBreakdown');
  const diagWeakHeading = document.getElementById('diagWeakHeading');
  const readingBar = document.getElementById('readingBar');
  const readingVal = document.getElementById('readingVal');
  const listeningBar = document.getElementById('listeningBar');
  const listeningVal = document.getElementById('listeningVal');
  const writingBar = document.getElementById('writingBar');
  const writingVal = document.getElementById('writingVal');
  const speakingBar = document.getElementById('speakingBar');
  const speakingVal = document.getElementById('speakingVal');
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

    // Escape raw HTML
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

    // Markdown Links: [label](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const isExternal = /^https?:\/\//i.test(url);
      const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${url}" class="chat-inline-link"${target}>${label}</a>`;
    });

    // Unordered lists
    text = text.replace(/^\s*\*\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
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
      text: `### Assalomu alaykum${name}! Men IELTS Core AI Murabbiyingizman 🎓\n\nMen sizga rasmiy IELTS baholash standartlari (Band Descriptors) asosida **Band 7.5 - 9.0** natijasiga erishishingizda 24/7 yordam beraman:\n\n* ✍️ **Writing Task 1 & 2:** 4-paragrafli PEEL shablonlar, Overview yozish formulasi va Band 8+ akademik lug'atlar;\n* 📖 **Reading:** True/False/Not Given, Matching Headings va vaqtni to'g'ri taqsimlash;\n* 🎧 **Listening:** Section 3-4 distractorlari va xarita savollari;\n* 🎙️ **Speaking:** Part 2 Cue card uchun 1 daqiqalik PPF rejasi va tabiiy ravonlik.\n\n**Hozir qaysi mavzu yoki savol turi bo'yicha yordam kerak?** Quyidagi tezkor tugmalardan birini tanlang yoki savolingizni yozing:`,
      suggestedPrompts: [
        "Writing Task 2 uchun Band 7.5+ 4-paragrafli PEEL shablonini bering",
        "Reading: True/False/Not Given da qanday xato qilmaslik mumkin?",
        "Matching Headings savollarini tez va to'g'ri ishlash qoidalari qanday?",
        "Listening Section 3 tuzoqlaridan qanday o'taman?",
        "Menga 30 kunlik intensiv IELTS tayyorgarlik rejasi tuzib bering"
      ]
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

    // Default honest welcome
    chatHistory = [getWelcomeMessage()];
    renderAllMessages();
  }

  function saveChatHistory() {
    try {
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

    const bodyHtml = renderMarkdown(msg.text);

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
        throw new Error(`Server xatosi (HTTP ${res.status})`);
      }

      const data = await res.json();
      const replyText = data.reply || "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.";

      const modelMsg = {
        role: 'model',
        text: replyText
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
        text: `> [!WARNING]\n> **Aloqa xatoligi:** Server bilan bog'lanishda muammo yuz berdi (${escapeHtml(err.message)}). Qayta urinib ko'ring yoki quyidagi tayyor mavzulardan birini tanlang.`,
        suggestedPrompts: [
          "Writing Task 2 uchun Band 7.5+ 4-paragrafli PEEL shablonini bering",
          "Reading: TFNG strategiyasini tushuntiring",
          "Matching Headings savollarini tez yechish usuli"
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
    const hasAttempts = data && data.isLoggedIn && Number(data.totalAttempts) > 0;

    if (!hasAttempts) {
      if (diagStatusBadge) {
        diagStatusBadge.textContent = "Boshlang'ich";
        diagStatusBadge.className = "badge-status-dot neutral";
      }
      if (diagEstBand) diagEstBand.textContent = "—";
      if (diagZeroState) diagZeroState.style.display = "block";
      if (diagSkillsBreakdown) diagSkillsBreakdown.style.display = "none";
      if (diagWeakHeading) diagWeakHeading.textContent = "Dolzarb Savol Turlari";
      return;
    }

    // Student has test attempts
    if (diagStatusBadge) {
      diagStatusBadge.textContent = `Faol (${data.totalAttempts} ta test)`;
      diagStatusBadge.className = "badge-status-dot active";
    }

    if (diagZeroState) diagZeroState.style.display = "none";
    if (diagSkillsBreakdown) diagSkillsBreakdown.style.display = "flex";

    if (diagEstBand) {
      diagEstBand.textContent = data.predictedOverallBand || data.predictedBand || '—';
    }

    if (readingVal && readingBar) {
      const rBand = data.readingBand || null;
      if (rBand) {
        readingVal.textContent = rBand;
        const pct = Math.min(100, Math.max(15, (rBand / 9.0) * 100));
        readingBar.style.width = `${pct}%`;
      } else {
        readingVal.textContent = "—";
        readingBar.style.width = "0%";
      }
    }

    if (listeningVal && listeningBar) {
      const lBand = data.listeningBand || null;
      if (lBand) {
        listeningVal.textContent = lBand;
        const pct = Math.min(100, Math.max(15, (lBand / 9.0) * 100));
        listeningBar.style.width = `${pct}%`;
      } else {
        listeningVal.textContent = "—";
        listeningBar.style.width = "0%";
      }
    }

    if (writingVal && writingBar) {
      const wBand = data.writingBand || null;
      if (wBand) {
        writingVal.textContent = wBand;
        const pct = Math.min(100, Math.max(15, (wBand / 9.0) * 100));
        writingBar.style.width = `${pct}%`;
      } else {
        writingVal.textContent = "—";
        writingBar.style.width = "0%";
      }
    }

    if (speakingVal && speakingBar) {
      const sBand = data.speakingBand || null;
      if (sBand) {
        speakingVal.textContent = sBand;
        const pct = Math.min(100, Math.max(15, (sBand / 9.0) * 100));
        speakingBar.style.width = `${pct}%`;
      } else {
        speakingVal.textContent = "—";
        speakingBar.style.width = "0%";
      }
    }

    // Dynamic Weak Spots list
    if (diagWeakList) {
      const weakReading = Array.isArray(data.weakReadingTypes) ? data.weakReadingTypes : [];
      const weakListening = Array.isArray(data.weakListeningSections) ? data.weakListeningSections : [];
      const allWeaks = [...weakReading, ...weakListening];

      if (allWeaks.length > 0) {
        if (diagWeakHeading) diagWeakHeading.textContent = "Aniqlangan Zaif Nuqtalar";
        diagWeakList.innerHTML = '';
        allWeaks.slice(0, 4).forEach(item => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'weak-chip';
          const prompt = `${item.name} bo'yicha xatolarim ko'p. Buni rasmiy mezonlar bo'yicha qanday to'g'irlasam bo'ladi?`;
          btn.setAttribute('data-prompt', prompt);
          btn.innerHTML = `
            <span class="weak-dot warning"></span>
            <span class="weak-name">${escapeHtml(item.name)}</span>
            <span class="weak-badge">${item.accuracy ? item.accuracy + '%' : 'Zaif'}</span>
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
    recognition.lang = 'uz-UZ';

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

    // Clear history button
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm("Suhbat tarixini tozalashni xohlaysizmi?")) {
          localStorage.removeItem(STORAGE_KEY);
          chatHistory = [getWelcomeMessage()];
          renderAllMessages();
        }
      });
    }

    // Toggle sidebar on mobile / compact view
    if (btnToggleSidebar && sidebarPanel) {
      btnToggleSidebar.addEventListener('click', () => {
        sidebarPanel.classList.toggle('panel-open');
      });
    }

    // Delegate static prompt clicks across sidebar and track
    document.querySelectorAll('[data-prompt]').forEach(el => {
      el.addEventListener('click', () => {
        const prompt = el.getAttribute('data-prompt');
        if (prompt) sendPrompt(prompt);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
