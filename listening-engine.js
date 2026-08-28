const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const LISTENING_MATERIALS_DIR = path.join(ROOT, "english-listening-materials");
const LISTENING_AUDIO_DIR = path.join(ROOT, "data", "listening-audio");
const LISTENING_CATALOG_FILE = path.join(ROOT, "data", "listening-catalog.json");
const LISTENING_TRANSCRIPTS_FILE = path.join(ROOT, "data", "listening-transcripts.json");

let cachedListeningCatalog = null;
let listeningCatalogCachedAt = 0;
let cachedTranscripts = null;

function readListeningTranscripts() {
  if (cachedTranscripts) return cachedTranscripts;
  if (!fs.existsSync(LISTENING_TRANSCRIPTS_FILE)) return {};
  try {
    cachedTranscripts = JSON.parse(fs.readFileSync(LISTENING_TRANSCRIPTS_FILE, "utf8"));
    return cachedTranscripts;
  } catch {
    return {};
  }
}

function readListeningCatalog(forceRefresh = false) {
  const now = Date.now();
  if (cachedListeningCatalog && !forceRefresh && (now - listeningCatalogCachedAt < 300000)) {
    return cachedListeningCatalog;
  }
  if (!fs.existsSync(LISTENING_CATALOG_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(LISTENING_CATALOG_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    const catalog = raw.map(item => ({
      ...item,
      href: `/english/listening-exam?id=${encodeURIComponent(item.id)}`
    }));
    cachedListeningCatalog = catalog;
    listeningCatalogCachedAt = now;
    return catalog;
  } catch (e) {
    console.error("Error reading listening catalog:", e);
    return [];
  }
}

function listeningBand(correct, total) {
  if (total !== 40) return null;
  const c = Math.max(0, Math.min(40, parseInt(correct, 10) || 0));
  if (c >= 39) return 9.0;
  if (c >= 37) return 8.5;
  if (c >= 35) return 8.0;
  if (c >= 32) return 7.5;
  if (c >= 30) return 7.0;
  if (c >= 26) return 6.5;
  if (c >= 23) return 6.0;
  if (c >= 18) return 5.5;
  if (c >= 16) return 5.0;
  if (c >= 13) return 4.5;
  if (c >= 10) return 4.0;
  if (c >= 8) return 3.5;
  if (c >= 6) return 3.0;
  if (c >= 4) return 2.5;
  if (c >= 2) return 2.0;
  if (c === 1) return 1.0;
  return 0.0;
}

function normalizeListeningText(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreListeningAnswers(material, answers = [], detailed = true) {
  const answerKey = material.answerKey || {};
  const totalQuestions = Number(material.questionCount) || 40;
  const answerMap = new Map();

  if (Array.isArray(answers)) {
    answers.forEach(a => {
      const key = String(a?.key || "").toLowerCase().replace(/^q/, "");
      const num = parseInt(key, 10);
      if (Number.isFinite(num)) {
        answerMap.set(num, String(a.value || ""));
      }
    });
  } else if (answers && typeof answers === "object") {
    Object.keys(answers).forEach(k => {
      const key = String(k).toLowerCase().replace(/^q/, "");
      const num = parseInt(key, 10);
      if (Number.isFinite(num)) {
        answerMap.set(num, String(answers[k] || ""));
      }
    });
  }

  let correct = 0;
  const correctQuestions = new Set();
  const keys = Object.keys(answerKey);

  keys.forEach(k => {
    const qNum = parseInt(k.replace(/^q/i, ""), 10);
    if (!Number.isFinite(qNum)) return;
    const expected = answerKey[k];
    const accepted = (Array.isArray(expected) ? expected : [expected]).map(normalizeListeningText);
    const candidate = normalizeListeningText(answerMap.get(qNum));

    if (candidate && accepted.includes(candidate)) {
      correct++;
      correctQuestions.add(qNum);
    }
  });

  const boundedCorrect = Math.min(totalQuestions, correct);
  if (!detailed) return boundedCorrect;

  const incorrectQuestions = [];
  const startQ = totalQuestions === 20 && material.id.includes("drill-02") || material.id.includes("drill-04") || material.id.includes("drill-06") || material.id.includes("drill-08") ? 21 : 1;
  const endQ = startQ + totalQuestions - 1;

  for (let q = startQ; q <= endQ; q++) {
    if (!correctQuestions.has(q)) incorrectQuestions.push(q);
  }

  // Part Breakdown
  let partsConfig = [];
  if (totalQuestions === 40) {
    partsConfig = [
      { part: "Part 1", start: 1, end: 10 },
      { part: "Part 2", start: 11, end: 20 },
      { part: "Part 3", start: 21, end: 30 },
      { part: "Part 4", start: 31, end: 40 }
    ];
  } else {
    partsConfig = [
      { part: `Section ${startQ <= 10 ? "1" : "3"}`, start: startQ, end: startQ + 9 },
      { part: `Section ${startQ <= 10 ? "2" : "4"}`, start: startQ + 10, end: endQ }
    ];
  }

  const partBreakdown = partsConfig.map(p => ({
    part: p.part,
    mistakes: incorrectQuestions.filter(q => q >= p.start && q <= p.end).length
  }));

  // Question Type Breakdown
  const qTypeBreakdown = totalQuestions === 40 ? [
    { type: "Note & Form Completion", mistakes: incorrectQuestions.filter(q => (q >= 1 && q <= 10) || (q >= 31 && q <= 40)).length },
    { type: "Multiple Choice Questions (MCQ)", mistakes: incorrectQuestions.filter(q => (q >= 11 && q <= 15) || (q >= 21 && q <= 26)).length },
    { type: "Matching & Classification", mistakes: incorrectQuestions.filter(q => (q >= 16 && q <= 20) || (q >= 27 && q <= 30)).length }
  ] : [
    { type: "Form & Table Completion", mistakes: incorrectQuestions.filter(q => q <= startQ + 9).length },
    { type: "Multiple Choice & Matching", mistakes: incorrectQuestions.filter(q => q > startQ + 9).length }
  ];

  return {
    correct: boundedCorrect,
    total: totalQuestions,
    band: listeningBand(boundedCorrect, totalQuestions),
    incorrectQuestions,
    partBreakdown,
    questionTypeBreakdown: qTypeBreakdown.filter(t => t.mistakes >= 0)
  };
}

function listeningAttemptSummary(attempt) {
  if (!attempt) return null;
  return {
    id: attempt.id,
    materialId: attempt.materialId,
    materialTitle: attempt.materialTitle || "IELTS Listening Practice",
    kind: attempt.kind || "full-test",
    skill: "listening",
    correct: attempt.correct,
    total: attempt.total,
    points: attempt.points,
    band: attempt.band,
    incorrectQuestions: Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : [],
    partBreakdown: Array.isArray(attempt.partBreakdown) ? attempt.partBreakdown : [],
    questionTypeBreakdown: Array.isArray(attempt.questionTypeBreakdown) ? attempt.questionTypeBreakdown : [],
    durationSeconds: attempt.durationSeconds,
    createdAt: attempt.createdAt,
    href: `/english/listening-exam?id=${encodeURIComponent(attempt.materialId)}`
  };
}

function serveAudioFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Audio file not found");
  }
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const partialStart = parts[0];
    const partialEnd = parts[1];
    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = (end - start) + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000"
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": total,
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000"
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function listeningPersistenceMarkup(material, user, requestedMode) {
  const totalQuestions = Number(material.questionCount) || 40;
  const isFullTest = material.materialKind === "full-test" || totalQuestions === 40;
  const isPractice = requestedMode === "practice" || (!isFullTest && requestedMode !== "real");
  const modeLabel = isPractice ? (isFullTest ? "Practice Mode" : "Section Drill") : "Real Exam";
  const modeClass = isPractice ? "practice-mode" : "real-exam";
  const timerDisplay = isPractice ? "00:00" : "30 minutes remaining";
  const startQ = totalQuestions === 20 && (material.id.includes("drill-02") || material.id.includes("drill-04") || material.id.includes("drill-06") || material.id.includes("drill-08")) ? 21 : 1;
  const endQ = startQ + totalQuestions - 1;
  const durationSeconds = isFullTest ? 1800 : 1200;
  const isPremium = user?.plan === "premium";
  const allTranscripts = readListeningTranscripts();
  const testTranscripts = allTranscripts[material.id]?.parts || null;

  const config = JSON.stringify({
    id: material.id,
    title: material.title,
    grade: material.grade || "ielts",
    skill: "listening",
    collection: material.collection || "full-test",
    materialKind: material.materialKind || (isFullTest ? "full-test" : "practice"),
    questionCount: totalQuestions,
    startQ,
    endQ,
    durationSeconds,
    free: Boolean(material.free),
    userPlan: user?.plan || "free",
    audios: material.audios || [],
    takeawayFile: material.takeawayFile || null,
    transcripts: testTranscripts,
    answerKey: material.answerKey || {}
  });

  return `
<!-- Injected Authentic Cambridge CDI Styles for Listening -->
<style id="vortex-listening-cdi-styles">
  :root {
    --bg-tertiary: #ffffff !important;
    --bg-secondary: #ffffff !important;
    --example-bg: #f8fafc !important;
    --vx-primary: #1468f3;
    --vx-primary-hover: #0c57d3;
    --vx-bg: #0f172a;
    --vx-card: #ffffff;
    --vx-text: #1e293b;
    --vx-muted: #64748b;
    --vx-border: #e2e8f0;
    --vx-success: #10b981;
    --vx-danger: #ef4444;
  }
  body.night-mode {
    --bg-tertiary: #1e293b !important;
    --bg-secondary: #1e293b !important;
    --example-bg: #1e293b !important;
  }

  /* Eliminate all greenish / tinted background boxes */
  .notes-completion-block,
  .notes-box,
  .example-box,
  .part-header,
  .hotel-options-box,
  .options-box,
  .recommendations-box,
  .warn-box,
  .top-note,
  .qcard,
  .qbox,
  .card,
  .flowchart-step,
  .notes-table th,
  .notes-table td,
  .table-container,
  .section-box,
  .instructions,
  .part-instructions {
    background: #ffffff !important;
    background-color: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    color: #1e293b !important;
  }
  body.night-mode .notes-completion-block,
  body.night-mode .notes-box,
  body.night-mode .example-box,
  body.night-mode .part-header,
  body.night-mode .hotel-options-box,
  body.night-mode .options-box,
  body.night-mode .recommendations-box,
  body.night-mode .warn-box,
  body.night-mode .top-note,
  body.night-mode .qcard,
  body.night-mode .qbox,
  body.night-mode .card,
  body.night-mode .flowchart-step,
  body.night-mode .notes-table th,
  body.night-mode .notes-table td,
  body.night-mode .table-container,
  body.night-mode .section-box,
  body.night-mode .instructions,
  body.night-mode .part-instructions {
    background: #1e293b !important;
    background-color: #1e293b !important;
    border-color: #334155 !important;
    color: #f8fafc !important;
  }

  /* Cambridge CDI Top Exam Header */
  .vx-listening-header-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: #ffffff;
    color: #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    z-index: 10000;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  body.night-mode .vx-listening-header-bar {
    background: #0f172a;
    color: #f8fafc;
    border-color: #1e293b;
  }

  .vx-lh-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .vx-lh-logo {
    width: 28px;
    height: 28px;
    background: #e11d48;
    color: #ffffff;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 14px;
    letter-spacing: -0.05em;
  }
  .vx-lh-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    white-space: nowrap;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  body.night-mode .vx-lh-title {
    color: #f8fafc;
  }
  .vx-lh-mode-pill {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .vx-lh-mode-pill.real-exam {
    background: #fef3c7;
    color: #b45309;
    border: 1px solid #fde68a;
  }
  .vx-lh-mode-pill.practice-mode {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }

  .vx-lh-center {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .vx-timer-text {
    font-size: 13.5px;
    font-weight: 600;
    color: #475569;
    font-variant-numeric: tabular-nums;
  }
  body.night-mode .vx-timer-text {
    color: #94a3b8;
  }

  /* Audio player inside header */
  .vx-audio-player-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 3px 10px;
    border-radius: 8px;
  }
  body.night-mode .vx-audio-player-wrap {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-audio-parts-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .vx-audio-part-btn {
    background: transparent;
    color: #64748b;
    border: 1px solid transparent;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .vx-audio-part-btn.active {
    background: #1468f3;
    color: #ffffff;
  }
  .vx-audio-play-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #1468f3;
    color: #ffffff;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
  }
  .vx-audio-scrubber-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .vx-audio-time {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    min-width: 65px;
  }
  .vx-audio-scrubber {
    width: 90px;
    height: 4px;
    cursor: pointer;
  }
  .vx-audio-speed-select {
    background: #ffffff;
    color: #475569;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 4px;
    cursor: pointer;
  }
  body.night-mode .vx-audio-speed-select {
    background: #0f172a;
    color: #cbd5e1;
    border-color: #334155;
  }

  .vx-lh-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .vx-icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    transition: all 0.15s ease;
  }
  .vx-icon-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }
  body.night-mode .vx-icon-btn {
    background: #1e293b;
    border-color: #334155;
    color: #cbd5e1;
  }
  body.night-mode .vx-icon-btn:hover {
    background: #334155;
    color: #f8fafc;
  }

  .vx-submit-header-btn {
    padding: 6px 16px;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .vx-submit-header-btn:hover {
    background: #f8fafc;
    border-color: #94a3b8;
  }
  body.night-mode .vx-submit-header-btn {
    background: #1e293b;
    border-color: #334155;
    color: #f8fafc;
  }

  /* Shift Main Content and Fix Bottom Navigation Bar */
  body {
    padding-top: 56px !important;
    padding-bottom: 80px !important;
  }
  .header,
  header,
  .app-header,
  .audio-bar,
  div.audio-bar,
  #audio-bar,
  .zoom-controls,
  .legacy-header,
  .header-brand,
  #header,
  .part-header,
  .hl-context-menu {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }
  .main-offset {
    margin-top: 0 !important;
    padding-top: 0 !important;
  }
  .main-container,
  #main-container {
    margin-top: 0 !important;
    padding-top: 12px !important;
    padding-bottom: 90px !important;
    height: calc(100vh - 124px) !important;
    overflow-y: auto !important;
  }
  .left-panel {
    padding: 12px 20px 40px !important;
    max-width: 900px !important;
    margin: 0 auto !important;
  }
  .nav-arrows {
    position: fixed !important;
    bottom: 84px !important;
    top: auto !important;
    right: 20px !important;
    z-index: 101 !important;
  }
  .nav-row,
  .footer-nav,
  nav.nav-row,
  nav.perScorableItem,
  nav[aria-label="Questions"] {
    position: fixed !important;
    bottom: 0 !important;
    top: auto !important;
    left: 0 !important;
    right: 0 !important;
    height: 68px !important;
    z-index: 100 !important;
    display: flex !important;
    align-items: center !important;
    background: #ffffff !important;
    border-top: 1px solid #e2e8f0 !important;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.04) !important;
    padding: 0 16px !important;
  }
  body.night-mode .nav-row,
  body.night-mode .footer-nav,
  body.night-mode nav.nav-row {
    background: #0f172a !important;
    border-color: #1e293b !important;
  }

  /* Clean up question borders */
  .active-question,
  .multi-choice-question.active-question,
  .question.active-question,
  .notes-box.active-question,
  .flowchart.active-question,
  .question-set.active-question,
  .notes-table.active-question,
  .notes-item.active-question,
  .example-box.active-question {
    outline: none !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }
  .multi-choice-question {
    border: 1px solid transparent !important;
  }
  .multi-choice-question:focus,
  .multi-choice-question:focus-within {
    outline: none !important;
  }
  .answer-input:focus,
  select.answer-input:focus,
  .matching-select:focus {
    outline: 2px solid #1468f3 !important;
    border-color: #1468f3 !important;
    box-shadow: 0 0 0 3px rgba(20, 104, 243, 0.15) !important;
  }

  /* Cambridge 1:1 Matching and Question rows for Listening */
  .matching-list li,
  .matching-row,
  .tf-question-line {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 14px !important;
    width: 100% !important;
    max-width: 100% !important;
    padding: 8px 12px !important;
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    box-sizing: border-box !important;
    margin-bottom: 8px !important;
  }
  body.night-mode .matching-list li,
  body.night-mode .matching-row,
  body.night-mode .tf-question-line {
    background: #1e293b !important;
    border-color: #334155 !important;
  }
  .matching-list .m-text,
  .tf-question-text {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }

  /* Settings Modal Styles */
  .vx-modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(4px);
    z-index: 100000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .vx-modal-backdrop.show {
    display: flex;
  }
  .vx-settings-sheet {
    background: #ffffff;
    border-radius: 16px;
    width: 100%;
    max-width: 460px;
    padding: 24px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    font-family: inherit;
    color: #1e293b;
    position: relative;
    max-height: 90vh;
    overflow-y: auto;
  }
  body.night-mode .vx-settings-sheet {
    background: #1e293b;
    color: #f8fafc;
  }
  .vx-settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f1f5f9;
  }
  body.night-mode .vx-settings-header {
    border-color: #334155;
  }
  .vx-settings-title {
    font-size: 16px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .vx-settings-close {
    background: none;
    border: none;
    font-size: 20px;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
  }
  .vx-setting-section-title {
    font-size: 13px;
    font-weight: 700;
    color: #64748b;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  body.night-mode .vx-setting-section-title {
    color: #94a3b8;
  }
  .vx-setting-btn-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .vx-setting-opt-btn {
    border: 1.5px solid #e2e8f0;
    background: #f8fafc;
    color: #1e293b;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: all 0.15s ease;
  }
  .vx-setting-opt-btn:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
  }
  .vx-setting-opt-btn.active {
    border-color: #0f172a;
    background: #ffffff;
    font-weight: 700;
  }
  body.night-mode .vx-setting-opt-btn {
    background: #0f172a;
    border-color: #334155;
    color: #f8fafc;
  }
  body.night-mode .vx-setting-opt-btn.active {
    border-color: #38bdf8;
    background: #1e293b;
  }
  .vx-report-issue-card {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 14px;
  }
  body.night-mode .vx-report-issue-card {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.25);
  }
  .vx-report-issue-title {
    font-size: 13px;
    font-weight: 800;
    color: #b45309;
    margin-bottom: 2px;
  }
  .vx-report-issue-desc {
    font-size: 12px;
    color: #92400e;
    margin: 0;
  }
  body.night-mode .vx-report-issue-desc {
    color: #fde68a;
  }
  .vx-leave-test-link {
    display: block;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    color: #1e293b;
    text-decoration: none;
    transition: background 0.15s ease;
  }
  .vx-leave-test-link:hover {
    background: #f8fafc;
  }
  body.night-mode .vx-leave-test-link {
    border-color: #334155;
    color: #f8fafc;
  }
  body.night-mode .vx-leave-test-link:hover {
    background: #0f172a;
  }
  .vx-leave-test-title {
    font-size: 13px;
    font-weight: 700;
    color: #dc2626;
    margin-bottom: 2px;
  }
  .vx-leave-test-desc {
    font-size: 12px;
    color: #64748b;
    margin: 0;
  }

  /* Full Executive Results Dashboard View */
  .vx-results-sheet {
    background: #ffffff !important;
    border-radius: 24px !important;
    width: 100% !important;
    max-width: 960px !important;
    padding: 36px 40px !important;
    box-shadow: 0 30px 80px -15px rgba(0,0,0,0.4) !important;
    max-height: 92vh !important;
    overflow-y: auto !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    box-sizing: border-box !important;
    margin: 20px auto !important;
  }
  body.night-mode .vx-results-sheet,
  html[data-theme="dark"] .vx-results-sheet {
    background: #0f172a !important;
    color: #f8fafc !important;
    border: 1px solid #334155 !important;
  }

  .vx-res-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 20px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }
  body.night-mode .vx-res-head {
    border-color: #1e293b;
  }
  .vx-res-title-group h2 {
    margin: 0 0 4px 0;
    font-size: 24px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  body.night-mode .vx-res-title-group h2 {
    color: #f8fafc;
  }
  .vx-res-sub {
    font-size: 13.5px;
    color: #64748b;
    font-weight: 500;
  }
  .vx-res-badge-pill {
    background: #eff6ff;
    color: #1468f3;
    font-size: 12px;
    font-weight: 800;
    padding: 6px 14px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  body.night-mode .vx-res-badge-pill {
    background: #1e3a8a;
    color: #93c5fd;
  }
  .vx-res-close-x {
    background: #f1f5f9;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    color: #64748b;
    transition: all 0.15s ease;
  }
  .vx-res-close-x:hover {
    background: #e2e8f0;
    color: #0f172a;
  }
  body.night-mode .vx-res-close-x {
    background: #1e293b;
    color: #cbd5e1;
  }

  /* 3-Column Executive KPI Deck */
  .vx-res-kpi-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 16px;
    margin-bottom: 28px;
  }
  @media (max-width: 768px) {
    .vx-res-kpi-grid {
      grid-template-columns: 1fr;
    }
  }

  .vx-res-kpi-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-sizing: border-box;
  }
  body.night-mode .vx-res-kpi-card {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-kpi-card.primary {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border-color: #bfdbfe;
  }
  body.night-mode .vx-res-kpi-card.primary {
    background: linear-gradient(135deg, #172554 0%, #1e3a8a 100%);
    border-color: #1d4ed8;
  }
  .vx-res-kpi-label {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin-bottom: 8px;
  }
  .vx-res-kpi-card.primary .vx-res-kpi-label {
    color: #1e40af;
  }
  body.night-mode .vx-res-kpi-card.primary .vx-res-kpi-label {
    color: #93c5fd;
  }
  .vx-res-band-val {
    font-size: 52px;
    font-weight: 900;
    color: #1d4ed8;
    line-height: 1;
    letter-spacing: -0.03em;
    margin: 4px 0 8px;
  }
  body.night-mode .vx-res-band-val {
    color: #60a5fa;
  }
  .vx-res-cefr-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 800;
    color: #1e40af;
    background: #ffffff;
    padding: 4px 10px;
    border-radius: 999px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    align-self: flex-start;
  }
  body.night-mode .vx-res-cefr-badge {
    background: #0f172a;
    color: #93c5fd;
  }
  .vx-res-stat-val {
    font-size: 26px;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.1;
    margin: 4px 0 8px;
  }
  body.night-mode .vx-res-stat-val {
    color: #f8fafc;
  }
  .vx-res-progress-track {
    width: 100%;
    height: 8px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
    margin: 8px 0;
  }
  body.night-mode .vx-res-progress-track {
    background: #334155;
  }
  .vx-res-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    border-radius: 999px;
    transition: width 0.5s ease;
  }
  .vx-res-kpi-sub {
    font-size: 12.5px;
    font-weight: 600;
    color: #64748b;
  }
  body.night-mode .vx-res-kpi-sub {
    color: #94a3b8;
  }

  /* Section Breakdown Cards */
  .vx-res-section-title {
    font-size: 13.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0f172a;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  body.night-mode .vx-res-section-title {
    color: #f8fafc;
  }
  .vx-res-parts-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  @media (max-width: 640px) {
    .vx-res-parts-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .vx-res-part-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  body.night-mode .vx-res-part-card {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-part-name {
    font-size: 11.5px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
  }
  body.night-mode .vx-res-part-name {
    color: #94a3b8;
  }
  .vx-res-part-score {
    font-size: 15px;
    font-weight: 900;
    margin-top: 6px;
  }

  /* Question Diagnostic Pills */
  .vx-res-diag-wrap {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 28px;
  }
  body.night-mode .vx-res-diag-wrap {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-pills-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 180px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .vx-res-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    border: 1.5px solid;
    transition: all 0.15s ease;
    text-decoration: none;
  }
  .vx-res-pill-btn.incorrect {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
  }
  .vx-res-pill-btn.incorrect:hover {
    background: #fee2e2;
    border-color: #f87171;
    transform: translateY(-1px);
  }
  .vx-res-pill-btn.correct {
    background: #f0fdf4;
    color: #166534;
    border-color: #bbf7d0;
  }
  .vx-res-pill-btn.correct:hover {
    background: #dcfce7;
    border-color: #86efac;
    transform: translateY(-1px);
  }

  /* Bottom Actions Bar */
  .vx-res-footer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    flex-wrap: wrap;
    gap: 12px;
  }
  body.night-mode .vx-res-footer-actions {
    border-color: #334155;
  }

  .vx-btn-modal-secondary {
    min-height: 40px !important;
    padding: 0 18px !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    color: #334155 !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    text-decoration: none !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    transition: all 0.15s ease !important;
  }
  .vx-btn-modal-secondary:hover {
    background: #f8fafc !important;
    color: #0f172a !important;
    border-color: #94a3b8 !important;
  }
  body.night-mode .vx-btn-modal-secondary {
    background: #1e293b !important;
    border-color: #334155 !important;
    color: #e2e8f0 !important;
  }
  body.night-mode .vx-btn-modal-secondary:hover {
    background: #334155 !important;
    color: #ffffff !important;
  }

  .vx-btn-modal-primary {
    min-height: 40px !important;
    padding: 0 20px !important;
    border: 1px solid #0f172a !important;
    border-radius: 8px !important;
    background: #0f172a !important;
    color: #ffffff !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    text-decoration: none !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12) !important;
    transition: all 0.15s ease !important;
  }
  .vx-btn-modal-primary:hover {
    background: #1e293b !important;
    border-color: #1e293b !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 3px 8px rgba(15, 23, 42, 0.18) !important;
  }
  body.night-mode .vx-btn-modal-primary {
    background: #2563eb !important;
    border-color: #2563eb !important;
    color: #ffffff !important;
  }
  body.night-mode .vx-btn-modal-primary:hover {
    background: #1d4ed8 !important;
  }

  .vx-btn-modal-disabled {
    min-height: 40px !important;
    padding: 0 18px !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    background: #f1f5f9 !important;
    color: #94a3b8 !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    cursor: not-allowed !important;
    text-decoration: none !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    opacity: 0.85 !important;
    pointer-events: none !important;
  }
  body.night-mode .vx-btn-modal-disabled {
    background: #1e293b !important;
    border-color: #334155 !important;
    color: #64748b !important;
  }

  /* Review Banner */
  .vx-review-banner {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    background: #065f46;
    color: #ffffff;
    padding: 8px 20px;
    display: none;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    z-index: 9999;
  }
  .vx-review-banner.show {
    display: flex;
  }

  /* 1:1 Authentic Review Mode Styles */
  .vx-review-q-header {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 8px 0 10px !important;
    padding: 6px 12px !important;
    border-radius: 8px !important;
    flex-wrap: wrap !important;
  }
  .vx-review-q-header.incorrect {
    background: #fef2f2 !important;
    border: 1px solid #fee2e2 !important;
  }
  .vx-review-q-header.correct {
    background: #f0fdf4 !important;
    border: 1px solid #dcfce7 !important;
  }
  body.night-mode .vx-review-q-header.incorrect {
    background: rgba(239, 68, 68, 0.15) !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }
  body.night-mode .vx-review-q-header.correct {
    background: rgba(16, 185, 129, 0.15) !important;
    border-color: rgba(16, 185, 129, 0.3) !important;
  }

  .vx-review-q-pill {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 4px !important;
    padding: 3px 8px !important;
    border-radius: 5px !important;
    font-size: 13px !important;
    font-weight: 900 !important;
    color: #ffffff !important;
    flex-shrink: 0 !important;
  }
  .vx-review-q-pill.incorrect {
    background: #991b1b !important;
  }
  .vx-review-q-pill.correct {
    background: #166534 !important;
  }

  .vx-review-ans-text {
    font-size: 13.5px !important;
    color: #0f172a !important;
    font-weight: 700 !important;
  }
  body.night-mode .vx-review-ans-text {
    color: #f8fafc !important;
  }
  .vx-review-ans-text strong {
    color: #0f172a !important;
    font-weight: 900 !important;
    text-decoration: underline !important;
    text-decoration-color: #10b981 !important;
  }
  body.night-mode .vx-review-ans-text strong {
    color: #38bdf8 !important;
  }

  .vx-review-actions-wrap {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    margin-left: auto !important;
  }

  .vx-explain-btn {
    background: #eff6ff !important;
    color: #1d4ed8 !important;
    border: 1px solid #bfdbfe !important;
    border-radius: 6px !important;
    padding: 3px 10px !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
  }
  .vx-explain-btn:hover {
    background: #dbeafe !important;
    border-color: #93c5fd !important;
  }
  body.night-mode .vx-explain-btn {
    background: #1e3a8a !important;
    color: #bfdbfe !important;
    border-color: #3b82f6 !important;
  }

  .vx-trap-btn {
    background: #fffbeb !important;
    color: #92400e !important;
    border: 1px solid #fde68a !important;
    border-radius: 6px !important;
    padding: 3px 10px !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
  }
  .vx-trap-btn:hover {
    background: #fef3c7 !important;
    border-color: #fcd34d !important;
  }
  body.night-mode .vx-trap-btn {
    background: #78350f !important;
    color: #fef3c7 !important;
    border-color: #b45309 !important;
  }

  .vx-explanation-card,
  .vx-trap-card {
    background: #ffffff !important;
    border: 1.5px solid #cbd5e1 !important;
    border-radius: 10px !important;
    padding: 14px 18px !important;
    margin: 8px 0 14px !important;
    font-size: 13.5px !important;
    line-height: 1.6 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
  }
  body.night-mode .vx-explanation-card,
  body.night-mode .vx-trap-card {
    background: #1e293b !important;
    border-color: #475569 !important;
    color: #cbd5e1 !important;
  }
  .vx-explanation-card {
    border-left: 4px solid #3b82f6 !important;
  }
  .vx-trap-card {
    border-left: 4px solid #f59e0b !important;
  }
  .vx-explain-header {
    font-weight: 800 !important;
    color: #1d4ed8 !important;
    margin-bottom: 6px !important;
  }
  body.night-mode .vx-explain-header {
    color: #60a5fa !important;
  }
  .vx-trap-header {
    font-weight: 800 !important;
    color: #b45309 !important;
    margin-bottom: 6px !important;
  }
  body.night-mode .vx-trap-header {
    color: #fbbf24 !important;
  }

  /* Option Highlighting */
  .vx-review-correct-opt {
    background: #ecfdf5 !important;
    border: 1.5px solid #10b981 !important;
    border-left: 5px solid #10b981 !important;
    border-radius: 6px !important;
    color: #065f46 !important;
    font-weight: 700 !important;
    padding: 6px 12px !important;
    display: flex !important;
    align-items: center !important;
  }
  body.night-mode .vx-review-correct-opt {
    background: rgba(16, 185, 129, 0.2) !important;
    color: #6ee7b7 !important;
    border-color: #10b981 !important;
  }

  .vx-review-incorrect-opt {
    background: #fef2f2 !important;
    border: 1.5px solid #ef4444 !important;
    border-left: 5px solid #ef4444 !important;
    border-radius: 6px !important;
    color: #991b1b !important;
    padding: 6px 12px !important;
    opacity: 0.9 !important;
    display: flex !important;
    align-items: center !important;
  }
  body.night-mode .vx-review-incorrect-opt {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #fca5a5 !important;
    border-color: #ef4444 !important;
  }

  .vx-correct-answer-pill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    background: #ecfdf5 !important;
    color: #065f46 !important;
    border: 1px solid #a7f3d0 !important;
    border-radius: 6px !important;
    padding: 4px 10px !important;
    font-size: 13px !important;
    font-weight: 800 !important;
    margin-left: 10px !important;
    vertical-align: middle !important;
  }
  body.night-mode .vx-correct-answer-pill {
    background: #064e3b !important;
    color: #a7f3d0 !important;
    border-color: #059669 !important;
  }

  .vx-q-pill-review-correct {
    background: #166534 !important;
    color: #ffffff !important;
    border-color: #15803d !important;
    font-weight: 800 !important;
  }
  .vx-q-pill-review-incorrect {
    background: #991b1b !important;
    color: #ffffff !important;
    border-color: #b91c1c !important;
    font-weight: 800 !important;
  }

  /* Side-by-Side Transcript Panel */
  .vx-transcript-side-panel {
    position: fixed;
    top: 96px;
    right: 0;
    width: 480px;
    max-width: 42vw;
    height: calc(100vh - 164px);
    background: #ffffff;
    border-left: 2px solid #cbd5e1;
    box-shadow: -4px 0 16px rgba(0,0,0,0.06);
    z-index: 95;
    display: none;
    flex-direction: column;
    padding: 0;
  }
  .vx-transcript-side-panel.open {
    display: flex;
  }
  body.transcript-open .main-container,
  body.transcript-open #main-container {
    margin-right: 480px !important;
  }
  @media (max-width: 960px) {
    .vx-transcript-side-panel {
      width: 100%;
      max-width: 100vw;
      top: 56px;
      height: calc(100vh - 124px);
      z-index: 10000;
    }
    body.transcript-open .main-container,
    body.transcript-open #main-container {
      margin-right: 0 !important;
    }
  }
  body.night-mode .vx-transcript-side-panel {
    background: #0f172a;
    border-color: #1e293b;
    color: #f8fafc;
  }

  /* Yellow Highlights for answers in transcript */
  .vx-transcript-highlight,
  .highlight,
  mark.vx-transcript-highlight {
    background-color: #fef08a !important; /* Bright Yellow */
    color: #854d0e !important;
    font-weight: 800 !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    border: 1px solid #fde047 !important;
    display: inline !important;
    box-shadow: 0 1px 3px rgba(234, 179, 8, 0.2);
  }
  body.night-mode .vx-transcript-highlight,
  body.night-mode .highlight,
  body.night-mode mark.vx-transcript-highlight {
    background-color: #854d0e !important;
    color: #fef08a !important;
    border-color: #a16207 !important;
  }

  /* Suppress legacy modals from original HTML files */
  #results-modal, #result-modal, .modal-overlay, #results-details, #score-summary, #results-band, #results-score, .modal-content, #result-details {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  @media (max-width: 768px) {
    .vx-listening-header-bar {
      padding: 0 10px;
      height: auto;
      min-height: 56px;
      flex-wrap: wrap;
      gap: 6px;
    }
  }
</style>

<!-- Audio Element -->
<audio id="vxListeningAudio" preload="auto"></audio>

<!-- Injected Authentic Cambridge CDI Top Exam Header -->
<div class="vx-listening-header-bar" id="vxListeningHeaderBar">
  <div class="vx-lh-left">
    <div class="vx-lh-logo">◱</div>
    <span class="vx-lh-title" title="${material.title.replace(/"/g, "&quot;")}">${material.title.replace(/</g, "&lt;")}</span>
    <span class="vx-lh-mode-pill ${modeClass}" id="vxExamModeBadge">${modeLabel}</span>
  </div>

  <div class="vx-lh-center">
    <span class="vx-timer-text" id="vxTimerText">${timerDisplay}</span>
    <div class="vx-audio-player-wrap" id="vxAudioPlayerWrap" style="${isPractice ? "display:flex !important;" : "display:none !important;"}">
      <div class="vx-audio-parts-tabs" id="vxAudioPartsTabs">
        <!-- Generated dynamically in practice mode -->
      </div>
      <button type="button" class="vx-audio-play-btn" id="vxPlayPauseBtn" title="Play/Pause Audio (Space)">▶</button>
      <div class="vx-audio-scrubber-wrap">
        <span class="vx-audio-time" id="vxAudioTime">00:00 / 00:00</span>
        <input type="range" class="vx-audio-scrubber" id="vxAudioScrubber" min="0" max="100" value="0">
        <select class="vx-audio-speed-select" id="vxAudioSpeed">
          <option value="0.8">0.8x</option>
          <option value="1.0" selected>1.0x</option>
          <option value="1.2">1.2x</option>
          <option value="1.5">1.5x</option>
        </select>
      </div>
    </div>
  </div>

  <div class="vx-lh-right">
    <button type="button" class="vx-submit-header-btn" id="vxHeaderScoreBreakdownBtn" style="display:none;background:#0f172a;color:#fff;border:1px solid #334155;padding:5px 12px;border-radius:6px;" title="View Score Report">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;vertical-align:-2px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17v-4m5 4v-8m5 8v-6"/></svg>
      <span>Score Report</span>
    </button>
    <button type="button" class="vx-submit-header-btn" id="vxHeaderTranscriptBtn" style="display:none;background:#ffffff;color:#334155;border:1px solid #cbd5e1;padding:5px 12px;border-radius:6px;" title="Audio Transcript">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;vertical-align:-2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>Transcript</span>
    </button>
    <button type="button" class="vx-submit-header-btn" id="vxHeaderRetakeBtn" style="display:none;background:#ffffff;color:#334155;border:1px solid #cbd5e1;padding:5px 12px;border-radius:6px;" title="Retake Test">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;vertical-align:-2px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <span>Retake</span>
    </button>
    <button type="button" class="vx-icon-btn" id="vxFullscreenBtn" title="Toggle Fullscreen">⛶</button>
    <button type="button" class="vx-icon-btn" id="vxOpenSettingsBtn" title="Exam Settings">⚙</button>
    <button type="button" class="vx-submit-header-btn" id="vxHeaderSubmitBtn">Submit</button>
  </div>
</div>

<!-- Injected Exam Settings Modal (Matching Exact Reference UI) -->
<div id="vxSettingsModal" class="vx-modal-backdrop" role="dialog" aria-modal="true">
  <div class="vx-settings-sheet">
    <div class="vx-settings-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:#64748b"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <strong style="font-size:15px;color:#0f172a;font-weight:800;">Exam Settings & Appearance</strong>
      <button type="button" id="vxCloseSettingsBtn" style="margin-left:auto;background:none;border:none;font-size:20px;color:#64748b;cursor:pointer;padding:2px 6px;line-height:1;">✕</button>
    </div>

    <!-- Color Scheme Selection -->
    <div class="vx-setting-section-title">Color Scheme</div>
    <div class="vx-setting-btn-group" id="vxThemeGroup">
      <button type="button" class="vx-setting-opt-btn active" data-theme="light">
        <span>Standard (Light)</span>
        <span class="vx-check-icon">✓</span>
      </button>
      <button type="button" class="vx-setting-opt-btn" data-theme="dark">
        <span>Dark</span>
        <span class="vx-check-icon" style="display:none;">✓</span>
      </button>
      <button type="button" class="vx-setting-opt-btn" data-theme="system">
        <span>System</span>
        <span class="vx-check-icon" style="display:none;">✓</span>
      </button>
    </div>

    <!-- Text Size Selection -->
    <div class="vx-setting-section-title">Text Size</div>
    <div class="vx-setting-btn-group" id="vxTextSizeGroup">
      <button type="button" class="vx-setting-opt-btn active" data-size="default">
        <span>Default</span>
        <span class="vx-check-icon">✓</span>
      </button>
      <button type="button" class="vx-setting-opt-btn" data-size="large">
        <span>Large</span>
        <span class="vx-check-icon" style="display:none;">✓</span>
      </button>
      <button type="button" class="vx-setting-opt-btn" data-size="xlarge">
        <span>Extra Large</span>
        <span class="vx-check-icon" style="display:none;">✓</span>
      </button>
    </div>

    <!-- Report Issue Banner -->
    <div class="vx-report-issue-card">
      <div class="vx-report-issue-title">Report an Issue</div>
      <p class="vx-report-issue-desc">Tell us if something is missing, broken, or incorrect.</p>
    </div>

    <!-- Leave Test Link -->
    <a href="/english/materials?level=ielts&skill=listening" class="vx-leave-test-link">
      <div class="vx-leave-test-title">← Leave Test Without Saving</div>
      <p class="vx-leave-test-desc">Return to the tests page.</p>
    </a>
  </div>
</div>

<!-- Side-by-Side Audio Transcript Panel (Review Mode) -->
<aside id="vxTranscriptSidePanel" class="vx-transcript-side-panel" aria-label="Audio Transcript">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
    <div style="display:flex;align-items:center;gap:8px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:#64748b"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <strong style="font-size:13.5px;color:#0f172a;font-weight:800;">Audio Script & Key Locations</strong>
    </div>
    <button type="button" id="vxCloseTranscriptBtn" style="background:none;border:none;font-size:20px;color:#64748b;cursor:pointer;padding:2px 6px;line-height:1;">✕</button>
  </div>

  <!-- Part Selector Tabs -->
  <div id="vxTranscriptPartTabs" style="display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
    <button type="button" class="vx-audio-part-btn active" data-tpart="1">Part 1</button>
    <button type="button" class="vx-audio-part-btn" data-tpart="2">Part 2</button>
    <button type="button" class="vx-audio-part-btn" data-tpart="3">Part 3</button>
    <button type="button" class="vx-audio-part-btn" data-tpart="4">Part 4</button>
  </div>

  <!-- Transcript Body Container -->
  <div id="vxTranscriptBody" style="flex:1;overflow-y:auto;padding:18px 20px;font-size:13.5px;line-height:1.8;color:#1e293b;font-family:system-ui,-apple-system,sans-serif;">
    <!-- Populated dynamically with bright yellow highlights -->
  </div>
</aside>

<!-- Submission Confirmation Modal -->
<div id="vxSubmitModal" class="vx-modal-backdrop" role="dialog" aria-modal="true">
  <div class="vx-results-sheet" style="max-width:440px;text-align:center;">
    <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 10px;">Submit Listening Test?</h2>
    <p style="font-size:14px;color:#64748b;margin:0 0 20px;">Once submitted, your answers will be verified by the server and saved to your progress dashboard.</p>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button type="button" class="vx-submit-header-btn" id="vxCancelSubmitBtn" style="padding:10px 20px;">Keep working</button>
      <button type="button" class="vx-submit-header-btn" id="vxConfirmSubmitBtn" style="background:#1468f3;color:#fff;border:none;padding:10px 24px;">Confirm & Submit</button>
    </div>
  </div>
</div>

<!-- Grand Executive Results Performance Dashboard -->
<div id="vxResultsModal" class="vx-modal-backdrop" role="dialog" aria-modal="true">
  <div class="vx-results-sheet">
    
    <!-- Top Header -->
    <div class="vx-res-head">
      <div class="vx-res-title-group">
        <h2>Exam Performance Report</h2>
        <div class="vx-res-sub">Official Computer-Delivered IELTS Simulation Assessment</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="vx-res-badge-pill">LISTENING · ${material.formatLabel}</span>
        <button type="button" class="vx-res-close-x" id="vxResultsCloseTopBtn" title="Close report">✕</button>
      </div>
    </div>

    <!-- 3-Column Hero KPI Cards -->
    <div class="vx-res-kpi-grid">
      <!-- 1. Overall Band Score -->
      <div class="vx-res-kpi-card primary">
        <div class="vx-res-kpi-label">${isFullTest ? "IELTS Official Band" : "Accuracy Score"}</div>
        <div class="vx-res-band-val" id="vxResBandNum">--</div>
        <div class="vx-res-cefr-badge" id="vxResCefrBadge">CEFR B2 · Competent User</div>
      </div>

      <!-- 2. Raw Accuracy & Breakdown -->
      <div class="vx-res-kpi-card">
        <div class="vx-res-kpi-label">Raw Accuracy</div>
        <div class="vx-res-stat-val" id="vxResStatScore">--</div>
        <div class="vx-res-progress-track">
          <div class="vx-res-progress-fill" id="vxResProgressFill" style="width: 0%;"></div>
        </div>
        <div class="vx-res-kpi-sub" id="vxResStatSub">0 of 40 Questions Correct</div>
      </div>

      <!-- 3. Time & Assessment Details -->
      <div class="vx-res-kpi-card">
        <div class="vx-res-kpi-label">Test Duration</div>
        <div class="vx-res-stat-val" id="vxResTimeSpent">--</div>
        <div class="vx-res-kpi-sub" style="margin-top:auto;" id="vxResVerifiedStatus">Automated Assessment</div>
      </div>
    </div>

    <!-- Performance by Part Grid -->
    <div class="vx-res-section-title">
      <span>Performance by Part</span>
    </div>
    <div class="vx-res-parts-grid" id="vxResPartsRow">
      <!-- Injected dynamically -->
    </div>

    <!-- Question Diagnostic Review Pills -->
    <div class="vx-res-diag-wrap">
      <div class="vx-res-section-title" style="margin-bottom:8px;">
        <span>Question Diagnostics</span>
        <span style="font-size:12px;font-weight:500;color:#64748b;text-transform:none;">(Select any question to inspect in exam)</span>
      </div>
      <div class="vx-res-pills-list" id="vxResMistakesList">
        <!-- Injected dynamically -->
      </div>
    </div>

    <!-- Bottom Action Bar -->
    <div class="vx-res-footer-actions">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="vx-btn-modal-secondary" id="vxResultsTranscriptBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:5px;vertical-align:-2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Audio Transcript</span>
        </button>
        <button type="button" class="vx-btn-modal-disabled" id="vxCloseModalReviewBtn" disabled title="Detailed review coming soon">
          Review Mistakes (Soon)
        </button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="/english/account" class="vx-btn-modal-primary">
          <span>Go to Dashboard</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:5px;vertical-align:-2px"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
        </a>
      </div>
    </div>

  </div>
</div>

<script id="vortex-listening-engine-script">
(function() {
  ${listeningBand.toString()}
  var material = ${config};
  var token = localStorage.getItem('vortex-english-token') || (document.cookie.match(/(?:^|;\s*)vortex_english_token=([^;]+)/) ? decodeURIComponent(RegExp.$1) : null);
  var audios = material.audios || [];
  var currentAudioIdx = 0;
  var audioEl = document.getElementById('vxListeningAudio');
  var playBtn = document.getElementById('vxPlayPauseBtn');
  var scrubber = document.getElementById('vxAudioScrubber');
  var timeDisplay = document.getElementById('vxAudioTime');
  var speedSelect = document.getElementById('vxAudioSpeed');
  var partsTabs = document.getElementById('vxAudioPartsTabs');

  var timerText = document.getElementById('vxTimerText');
  var secondsLeft = material.durationSeconds || 1800;
  var urlParams = new URLSearchParams(window.location.search);
  var requestedMode = urlParams.get('mode');
  var isRealExam = material.materialKind === 'full-test' && requestedMode !== 'practice';
  var isPremium = material.userPlan === 'premium';
  var timerRunning = false;
  var timerHandle = null;
  var testStartedAt = Date.now();
  var submitted = false;

  // 1. Settings Modal Controls
  var settingsModal = document.getElementById('vxSettingsModal');
  document.getElementById('vxOpenSettingsBtn')?.addEventListener('click', function() {
    settingsModal?.classList.add('show');
  });
  document.getElementById('vxCloseSettingsBtn')?.addEventListener('click', function() {
    settingsModal?.classList.remove('show');
  });

  // 2. Fullscreen Toggle
  document.getElementById('vxFullscreenBtn')?.addEventListener('click', function() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function(){});
    } else {
      document.exitFullscreen().catch(function(){});
    }
  });

  // 3. Theme Switcher
  function applyTheme(theme) {
    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('night-mode', isDark);
    document.querySelectorAll('#vxThemeGroup .vx-setting-opt-btn').forEach(function(btn) {
      var match = btn.getAttribute('data-theme') === theme;
      btn.classList.toggle('active', match);
      var check = btn.querySelector('.vx-check-icon');
      if (check) check.style.display = match ? 'inline' : 'none';
    });
    try { localStorage.setItem('vx_ielts_theme', theme); } catch(e){}
  }
  document.querySelectorAll('#vxThemeGroup .vx-setting-opt-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      applyTheme(btn.getAttribute('data-theme'));
    });
  });
  var savedTheme = 'light';
  try { savedTheme = localStorage.getItem('vx_ielts_theme') || 'light'; } catch(e){}
  applyTheme(savedTheme);

  // 4. Text Size Switcher
  function applyTextSize(size) {
    var root = document.documentElement;
    if (size === 'large') root.style.fontSize = '115%';
    else if (size === 'xlarge') root.style.fontSize = '130%';
    else root.style.fontSize = '100%';

    document.querySelectorAll('#vxTextSizeGroup .vx-setting-opt-btn').forEach(function(btn) {
      var match = btn.getAttribute('data-size') === size;
      btn.classList.toggle('active', match);
      var check = btn.querySelector('.vx-check-icon');
      if (check) check.style.display = match ? 'inline' : 'none';
    });
    try { localStorage.setItem('vx_ielts_text_size', size); } catch(e){}
  }
  document.querySelectorAll('#vxTextSizeGroup .vx-setting-opt-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      applyTextSize(btn.getAttribute('data-size'));
    });
  });
  var savedTextSize = 'default';
  try { savedTextSize = localStorage.getItem('vx_ielts_text_size') || 'default'; } catch(e){}
  applyTextSize(savedTextSize);

  // 5. Audio Initializer
  function initAudio() {
    if (!audios.length) {
      if (document.getElementById('vxAudioPlayerWrap')) {
        document.getElementById('vxAudioPlayerWrap').style.display = 'none';
      }
      return;
    }
    if (isRealExam) {
      if (document.getElementById('vxAudioPlayerWrap')) {
        document.getElementById('vxAudioPlayerWrap').style.display = 'none';
      }
    } else {
      if (document.getElementById('vxAudioPlayerWrap')) {
        document.getElementById('vxAudioPlayerWrap').style.display = 'flex';
      }
      if (partsTabs) {
        partsTabs.innerHTML = '';
        audios.forEach(function(a, idx) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'vx-audio-part-btn' + (idx === 0 ? ' active' : '');
          btn.textContent = a.part ? 'Part ' + a.part : 'Track ' + (idx + 1);
          btn.onclick = function() { switchAudioPart(idx); };
          partsTabs.appendChild(btn);
        });
      }
    }
    loadAudioTrack(0);

    if (isRealExam) {
      startTimer();
      var playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(function() {
          function onFirstInteraction() {
            audioEl.play().catch(function(){});
            document.removeEventListener('click', onFirstInteraction);
            document.removeEventListener('keydown', onFirstInteraction);
          }
          document.addEventListener('click', onFirstInteraction, { once: true });
          document.addEventListener('keydown', onFirstInteraction, { once: true });
        });
      }
    }
  }

  function loadAudioTrack(idx) {
    if (!audios[idx]) return;
    currentAudioIdx = idx;
    var file = audios[idx].file;
    audioEl.src = '/english/audio/' + encodeURIComponent(file);
    if (speedSelect) {
      audioEl.playbackRate = parseFloat(speedSelect.value) || 1.0;
    }
    updatePartTabHighlight();
  }

  function switchAudioPart(idx) {
    var wasPlaying = !audioEl.paused;
    loadAudioTrack(idx);
    if (wasPlaying || isRealExam) audioEl.play().catch(function(){});
  }

  function updatePartTabHighlight() {
    if (!partsTabs) return;
    var btns = partsTabs.querySelectorAll('.vx-audio-part-btn');
    btns.forEach(function(b, i) {
      b.classList.toggle('active', i === currentAudioIdx);
    });
  }

  function togglePlay() {
    if (audioEl.paused) {
      audioEl.play().then(function() {
        if (playBtn) playBtn.textContent = '❚❚';
        if (!timerRunning && isRealExam) startTimer();
      }).catch(function(e) {
        console.warn('Playback error:', e);
      });
    } else {
      audioEl.pause();
      if (playBtn) playBtn.textContent = '▶';
    }
  }

  function formatTime(s) {
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  audioEl.addEventListener('timeupdate', function() {
    if (audioEl.duration && scrubber && timeDisplay) {
      var pct = (audioEl.currentTime / audioEl.duration) * 100;
      scrubber.value = pct;
      timeDisplay.textContent = formatTime(audioEl.currentTime) + ' / ' + formatTime(audioEl.duration);
    }
  });

  audioEl.addEventListener('ended', function() {
    if (playBtn) playBtn.textContent = '▶';
    if (currentAudioIdx < audios.length - 1) {
      currentAudioIdx++;
      loadAudioTrack(currentAudioIdx);
      audioEl.play().catch(function(){});
    }
  });

  scrubber?.addEventListener('input', function() {
    if (audioEl.duration) {
      audioEl.currentTime = (scrubber.value / 100) * audioEl.duration;
    }
  });

  speedSelect?.addEventListener('change', function() {
    audioEl.playbackRate = parseFloat(speedSelect.value) || 1.0;
  });

  playBtn?.addEventListener('click', togglePlay);

  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      togglePlay();
    }
  });

  var elapsedSeconds = 0;

  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    if (isRealExam) {
      timerHandle = setInterval(function() {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(timerHandle);
          if (timerText) timerText.textContent = '00:00';
          submitTest();
        } else {
          if (timerText) timerText.textContent = formatTime(secondsLeft) + ' remaining';
        }
      }, 1000);
    } else {
      timerHandle = setInterval(function() {
        if (submitted) return;
        elapsedSeconds++;
        if (timerText) timerText.textContent = formatTime(elapsedSeconds);
      }, 1000);
    }
  }

  function collectAnswers() {
    var answers = [];
    for (var i = material.startQ; i <= material.endQ; i++) {
      var val = '';
      var input = document.getElementById('q' + i) ||
                  document.querySelector('[data-q="' + i + '"]') ||
                  document.querySelector('[data-question="' + i + '"]') ||
                  document.querySelector('input[name="q' + i + '"][type="text"]') ||
                  document.querySelector('input[name="question-' + i + '"][type="text"]') ||
                  document.querySelector('select[name="q' + i + '"]') ||
                  document.querySelector('select[name="question-' + i + '"]') ||
                  document.querySelector('select[data-q="' + i + '"]');

      if (input && input.tagName === 'SELECT') {
        val = input.value;
      } else if (input && (input.type === 'text' || input.type === 'search')) {
        val = input.value;
      } else {
        var checked = document.querySelector('input[name="q' + i + '"]:checked') ||
                      document.querySelector('input[name="question-' + i + '"]:checked') ||
                      document.querySelector('[data-q="' + i + '"]:checked') ||
                      document.querySelector('[data-question="' + i + '"]:checked');
        if (checked) {
          val = checked.value;
        } else {
          var checkboxes = document.querySelectorAll('input[name="q' + i + '"]:checked, input[name="question-' + i + '"]:checked');
          if (checkboxes.length) {
            val = Array.from(checkboxes).map(function(c){ return c.value; }).join(', ');
          }
        }
      }
      answers.push({ key: 'q' + i, value: String(val || '').trim() });
    }
    return answers;
  }

  function getBandCefr(band) {
    var b = Number(band) || 0;
    if (b >= 8.5) return 'CEFR C2 · Expert User';
    if (b >= 7.5) return 'CEFR C1 · Very Good User';
    if (b >= 6.5) return 'CEFR B2+ · Good User';
    if (b >= 5.5) return 'CEFR B2 · Competent User';
    if (b >= 4.5) return 'CEFR B1 · Modest User';
    if (b > 0) return 'CEFR A2 · Limited User';
    return 'No Band · Incomplete Attempt';
  }

  function showVerifiedResult(attempt) {
    var modal = document.getElementById('vxResultsModal');
    var bandNum = document.getElementById('vxResBandNum');
    var cefrBadge = document.getElementById('vxResCefrBadge');
    var statScore = document.getElementById('vxResStatScore');
    var statSub = document.getElementById('vxResStatSub');
    var progressFill = document.getElementById('vxResProgressFill');
    var timeSpent = document.getElementById('vxResTimeSpent');
    var partsRow = document.getElementById('vxResPartsRow');
    var mistakesList = document.getElementById('vxResMistakesList');

    var correct = Number(attempt.correct || 0);
    var total = Number(attempt.total || 40);
    var pct = Math.round((correct / total) * 100);

    var isFullTest = material.materialKind === 'full-test' || total === 40;
    var band = attempt.band;
    if (isFullTest && (band === null || band === undefined)) {
      band = listeningBand(correct, total);
      if (band === null) band = 0.0;
    }

    if (bandNum) {
      if (isFullTest) {
        bandNum.textContent = 'Band ' + Number(band || 0).toFixed(1);
      } else {
        bandNum.textContent = correct + ' / ' + total;
      }
    }
    if (cefrBadge) {
      cefrBadge.textContent = isFullTest ? getBandCefr(band) : (pct >= 80 ? 'Mastery Level' : 'Practice Level');
    }
    if (statScore) {
      statScore.textContent = pct + '% (' + correct + '/' + total + ')';
    }
    if (statSub) {
      statSub.textContent = correct + ' of ' + total + ' questions correct (' + (total - correct) + ' mistakes)';
    }
    if (progressFill) {
      progressFill.style.width = pct + '%';
      if (pct < 50) progressFill.style.background = '#ef4444';
      else if (pct < 75) progressFill.style.background = '#f59e0b';
      else progressFill.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
    }
    if (timeSpent) {
      var durationSec = attempt.durationSeconds || Math.round((Date.now() - testStartedAt) / 1000);
      var m = Math.floor(durationSec / 60);
      var s = durationSec % 60;
      timeSpent.textContent = (m > 0 ? m + 'm ' : '') + s + 's';
    }

    if (partsRow && Array.isArray(attempt.partBreakdown)) {
      partsRow.innerHTML = attempt.partBreakdown.map(function(p) {
        var isZero = p.mistakes === 0;
        return '<div class="vx-res-part-card"><div class="vx-res-part-name">' + p.part + '</div><div class="vx-res-part-score" style="color:' + (isZero ? '#10b981' : '#dc2626') + '">' + (isZero ? '✔ Perfect Score' : p.mistakes + ' mistake' + (p.mistakes === 1 ? '' : 's')) + '</div></div>';
      }).join('');
    }

    if (mistakesList) {
      var incorrectSet = new Set(Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : []);
      var pillsHtml = '';
      for (var q = 1; q <= total; q++) {
        var isIncorrect = incorrectSet.has(q);
        pillsHtml += '<button type="button" class="vx-res-pill-btn ' + (isIncorrect ? 'incorrect' : 'correct') + '" data-jump-q="' + q + '" title="Jump to Question ' + q + ' in review">' + (isIncorrect ? '✕ Q' : '✓ Q') + q + '</button>';
      }
      mistakesList.innerHTML = pillsHtml;

      mistakesList.querySelectorAll('[data-jump-q]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var qNum = Number(btn.getAttribute('data-jump-q'));
          modal.classList.remove('show');
          var input = document.getElementById('q' + qNum);
          if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.focus();
            input.style.outline = '3px solid #1468f3';
          }
        });
      });
    }

    document.getElementById('vxResultsCloseTopBtn')?.addEventListener('click', function() {
      modal.classList.remove('show');
    });

    if (modal) modal.classList.add('show');
  }

  var currentListeningAttempt = null;

  function applyListeningReviewModeUi(attempt) {
    if (!attempt) return;
    currentListeningAttempt = attempt;
    var answerKey = material.answerKey || attempt.answerKey || {};
    var incorrectQuestions = Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : [];
    var incorrectSet = new Set(incorrectQuestions);
    var total = Number(attempt.total) || 40;

    var bandText = attempt.band !== null && attempt.band !== undefined ? ' · Band ' + Number(attempt.band).toFixed(1) : '';
    var repBtn = document.getElementById('vxHeaderScoreBreakdownBtn');
    var trBtn = document.getElementById('vxHeaderTranscriptBtn');
    var retBtn = document.getElementById('vxHeaderRetakeBtn');
    if (repBtn) repBtn.style.display = 'inline-block';
    if (trBtn) trBtn.style.display = 'inline-block';
    if (retBtn) retBtn.style.display = 'inline-block';

    // Color-code Bottom Nav Pills only (1-40)
    for (var q = 1; q <= total; q++) {
      var isIncorrect = incorrectSet.has(q);
      var navBtn = document.querySelector('[data-q="' + q + '"]') || document.querySelector('.footer-nav button:nth-child(' + q + ')');
      if (navBtn) {
        if (!isIncorrect) {
          navBtn.classList.add('vx-q-pill-review-correct');
          navBtn.classList.remove('vx-q-pill-review-incorrect');
        } else {
          navBtn.classList.add('vx-q-pill-review-incorrect');
          navBtn.classList.remove('vx-q-pill-review-correct');
        }
      }
    }
  }

  function evaluateListeningLocally(answers, durationSeconds) {
    var answerKey = material.answerKey || {};
    var totalQuestions = Number(material.questionCount) || 40;
    var correct = 0;
    var incorrectQuestions = [];
    var answerMap = new Map();
    answers.forEach(function(a) {
      var k = String(a.key || '').toLowerCase().replace(/^q/, '');
      var num = parseInt(k, 10);
      if (Number.isFinite(num)) answerMap.set(num, String(a.value || '').trim());
    });

    for (var q = 1; q <= totalQuestions; q++) {
      var expected = answerKey['q' + q] || answerKey[q] || answerKey[String(q)];
      var actual = answerMap.get(q) || '';
      var isMatch = false;
      if (expected !== undefined && expected !== null) {
        if (Array.isArray(expected)) {
          isMatch = expected.some(function(exp) { return String(exp).trim().toLowerCase() === actual.toLowerCase(); });
        } else {
          isMatch = String(expected).trim().toLowerCase() === actual.toLowerCase();
        }
      }
      if (isMatch) correct++;
      else incorrectQuestions.push(q);
    }

    var band = listeningBand(correct, totalQuestions);
    return {
      correct: correct,
      total: totalQuestions,
      band: band !== null ? band : (correct > 0 ? (Math.round((correct / totalQuestions * 9) * 2) / 2).toFixed(1) : '1.0'),
      incorrectQuestions: incorrectQuestions,
      partBreakdown: [
        { part: 'Part 1', mistakes: incorrectQuestions.filter(function(q) { return q >= 1 && q <= 10; }).length },
        { part: 'Part 2', mistakes: incorrectQuestions.filter(function(q) { return q >= 11 && q <= 20; }).length },
        { part: 'Part 3', mistakes: incorrectQuestions.filter(function(q) { return q >= 21 && q <= 30; }).length },
        { part: 'Part 4', mistakes: incorrectQuestions.filter(function(q) { return q >= 31 && q <= 40; }).length }
      ],
      questionTypeBreakdown: [],
      durationSeconds: durationSeconds
    };
  }

  async function submitTest() {
    if (submitted) return;
    submitted = true;
    clearInterval(timerHandle);
    if (audioEl) audioEl.pause();
    var answers = collectAnswers();
    var durationSeconds = Math.round((Date.now() - testStartedAt) / 1000);

    if (token) {
      try {
        var res = await fetch('/api/listening-attempts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify({
            materialId: material.id,
            answers: answers,
            durationSeconds: durationSeconds
          })
        });
        var data = await res.json().catch(function() { return {}; });
        if (res.ok && data.attempt) {
          currentListeningAttempt = data.attempt;
          showVerifiedResult(data.attempt);
          return;
        }
      } catch(err) {
        console.warn('Backend save error, evaluating locally:', err);
      }
    }

    var localAttempt = evaluateListeningLocally(answers, durationSeconds);
    currentListeningAttempt = localAttempt;
    showVerifiedResult(localAttempt);
  }

  // Start Test Button Handlers (for Drills and Practice files with Start Screens)
  document.addEventListener('click', function(e) {
    var startBtn = e.target.closest('#startBtn, .start-btn, #start-btn, button[onclick*="startTest"], #start-test-btn');
    if (startBtn) {
      var startScreen = document.getElementById('startScreen') || document.querySelector('.start-screen, #start-screen, .start-modal, #login-screen');
      if (startScreen) startScreen.style.display = 'none';
      var mainArea = document.getElementById('mainArea') || document.querySelector('#main-area, .main-area, .mainArea, .panels-container, .test-container');
      if (mainArea) mainArea.style.display = 'block';
      var topBar = document.getElementById('topBar');
      if (topBar) topBar.style.display = 'flex';
      var bottomNav = document.getElementById('bottomNav');
      if (bottomNav) bottomNav.style.display = 'flex';
      startTimer();
    }
  }, true);

  // Header Submit & Deliver Button Handlers
  document.getElementById('vxHeaderSubmitBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('vxSubmitModal')?.classList.add('show');
  });

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('#deliver-button, #deliver-btn, .footer__deliverButton___3FM07, .deliverButton, button[onclick*="checkAnswers"], #submitBtn, .submit-btn, button[onclick*="submitTest"], button[onclick*="confirmSubmit"], #submit-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('vxSubmitModal')?.classList.add('show');
    }
  }, true);

  document.getElementById('vxConfirmSubmitBtn')?.addEventListener('click', function() {
    document.getElementById('vxSubmitModal')?.classList.remove('show');
    submitTest();
  });

  document.getElementById('vxCancelSubmitBtn')?.addEventListener('click', function() {
    document.getElementById('vxSubmitModal')?.classList.remove('show');
  });

  document.getElementById('vxCloseModalReviewBtn')?.addEventListener('click', function() {
    document.getElementById('vxResultsModal')?.classList.remove('show');
    if (currentListeningAttempt) {
      applyListeningReviewModeUi(currentListeningAttempt);
    }
  });

  // 4. Side-by-Side Transcript Panel Controls
  var transcriptPanel = document.getElementById('vxTranscriptSidePanel');
  var transcriptBody = document.getElementById('vxTranscriptBody');
  var transcriptTabs = document.querySelectorAll('#vxTranscriptPartTabs .vx-audio-part-btn');
  var openTranscriptBtn = document.getElementById('vxOpenTranscriptBtn');
  var currentTranscriptPart = 1;

  function renderTranscriptPart(partNum) {
    currentTranscriptPart = partNum;
    if (!transcriptBody) return;
    transcriptTabs.forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tpart') === String(partNum));
    });

    var parts = material.transcripts || {};
    var text = parts[partNum] || parts[String(partNum)];
    if (text) {
      transcriptBody.innerHTML = text;
    } else {
      transcriptBody.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px 10px;"><p style="font-size:15px;font-weight:700;">Audio Script for Part ' + partNum + '</p><p>Listen to the audio track to review your answers.</p></div>';
    }
  }

  function toggleTranscriptPanel(forceOpen) {
    if (!transcriptPanel) return;
    var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !transcriptPanel.classList.contains('open');
    transcriptPanel.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('transcript-open', shouldOpen);
    if (shouldOpen) {
      renderTranscriptPart(currentTranscriptPart || 1);
      if (openTranscriptBtn) openTranscriptBtn.textContent = '✕ Hide Transcript';
    } else {
      if (openTranscriptBtn) openTranscriptBtn.textContent = '📜 Audio Transcript';
    }
  }

  openTranscriptBtn?.addEventListener('click', function() {
    toggleTranscriptPanel();
  });
  document.getElementById('vxResultsTranscriptBtn')?.addEventListener('click', function() {
    document.getElementById('vxResultsModal')?.classList.remove('show');
    toggleTranscriptPanel(true);
  });
  document.getElementById('vxCloseTranscriptBtn')?.addEventListener('click', function() {
    toggleTranscriptPanel(false);
  });

  transcriptTabs.forEach(function(btn) {
    btn.addEventListener('click', function() {
      renderTranscriptPart(btn.getAttribute('data-tpart') || 1);
    });
  });

  // Automatically synchronize transcript part when student switches section in bottom navigation!
  document.addEventListener('click', function(e) {
    var partBtn = e.target.closest('.footer__questionNo___3WNct, [data-part], button[onclick*="showPart"], button[onclick*="changeSection"]');
    if (partBtn) {
      var text = partBtn.textContent || '';
      var m = text.match(/(?:Part|Section)\s*(\d+)/i);
      if (m && m[1]) {
        renderTranscriptPart(parseInt(m[1], 10));
      }
    }
  });

  // 5. Review Mode Loading & Answers Filling
  var isReviewMode = urlParams.get('review') === 'true';
  if (isReviewMode) {
    var banner = document.getElementById('vxReviewBanner');
    if (banner) banner.classList.add('show');
    toggleTranscriptPanel(true);
    if (token) {
      fetch('/api/student/results', {
        headers: { Authorization: 'Bearer ' + token }
      }).then(function(r){ return r.json(); }).then(function(results) {
        if (Array.isArray(results)) {
          var found = results.find(function(item) {
            return item.materialId === material.id || item.id === material.id;
          });
          if (found) {
            applyListeningReviewModeUi(found);
          }
        }
      }).catch(function(){});
    }
  }

  document.getElementById('vxHeaderScoreBreakdownBtn')?.addEventListener('click', function() {
    if (currentListeningAttempt) showVerifiedResult(currentListeningAttempt);
    else document.getElementById('vxResultsModal')?.classList.add('show');
  });

  document.getElementById('vxHeaderTranscriptBtn')?.addEventListener('click', function() {
    toggleTranscriptPanel();
  });

  document.getElementById('vxHeaderRetakeBtn')?.addEventListener('click', function() {
    var url = new URL(window.location.href);
    url.searchParams.delete('review');
    window.location.href = url.toString();
  });

  initAudio();
  startTimer();
})();
</script>
`;
}

function sanitizeListeningHtml(source, material, user, requestedMode) {
  const clean = source
    .replace(/body::(?:before|after)\s*\{[\s\S]*?\}/gi, "")
    .replace(/\.(?:telegram-link|brand-link)(?::[a-z-]+)?\s*\{[^}]*\}/gi, "")
    .replace(/<a\b[^>]*href=["']https?:\/\/t\.me\/[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/https?:\/\/t\.me\/[^\s"'<]+/gi, "#")
    .replace(/@(?:ielts_material_full|ieltsmaterials_full|full exam materials|mindless_writer|fozilbek_ielts)/gi, "")
    .replace(/For More Authentic tests you need to buy Premium Service/gi, "")
    .replace(/<div\b[^>]*id=["'](?:login-screen|candidate-screen)["'][\s\S]*?<\/div>\s*<\/div>/gi, "")
    .replace(/const\s+CORRECT_PASSWORD\s*=[\s\S]*?;\s*let\s+candidateId\s*=\s*'';\s*let\s+isAuthenticated\s*=\s*false;/gi, "let candidateId = 'STUDENT'; let isAuthenticated = true;")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
      const sanitizedCss = css
        .replace(/body::(?:before|after)\s*\{[\s\S]*?\}/gi, "")
        .replace(/https?:\/\/t\.me\/[^\s"')]+/gi, "")
        .replace(/\.(?:telegram-link|brand-link)\b[\s\S]*?\{[\s\S]*?\}/gi, "")
        .replace(/\.(?:login-screen|candidate-screen)\b[\s\S]*?\{[\s\S]*?\}/gi, "");
      return `<style>${sanitizedCss}\n#login-screen, #candidate-screen, .login-screen, .candidate-screen { display: none !important; }</style>`;
    });

  const persistence = listeningPersistenceMarkup(material, user, requestedMode);
  return /<\/body>/i.test(clean) ? clean.replace(/<\/body>/i, `${persistence}\n</body>`) : `${clean}${persistence}`;
}

module.exports = {
  readListeningCatalog,
  scoreListeningAnswers,
  listeningAttemptSummary,
  serveAudioFile,
  sanitizeListeningHtml,
  listeningBand
};
