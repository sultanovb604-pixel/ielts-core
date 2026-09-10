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
    const packs = ["Volume 10", "Cambridge 19", "Pack 6", "Cambridge 18", "Volume 9", "Cambridge 17"];
    const catalog = raw.map((item, index) => {
      const qTypes = item.questionTypes && item.questionTypes.length
        ? item.questionTypes
        : ["Note Completion", "Form Completion", "Multiple Choice"];
      const pack = item.packName || packs[index % packs.length];
      const partNum = item.partCount === 1 || item.partNumber ? (item.partNumber || (index % 4) + 1) : null;
      return {
        ...item,
        packName: pack,
        partNumber: partNum,
        questionTypes: qTypes,
        href: `/english/listening-exam?id=${encodeURIComponent(item.id)}`
      };
    });
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
  const isMock = requestedMode === "mock";
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
    ${isMock ? "#deliver-button, #deliver-btn, .footer__deliverButton___3FM07, .deliverButton, #submitBtn, .submit-btn, #submit-btn, #vxHeaderSubmitBtn, .header, .cdi-header { display: none !important; pointer-events: none !important; }" : ""}
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

  body {
    padding-top: 100px !important;
    padding-bottom: 64px !important;
  }

  .vx-lh-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .vx-lh-brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    flex-shrink: 0;
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
    font-size: 14px;
    font-weight: 700;
    color: #1e293b;
    font-variant-numeric: tabular-nums;
  }
  body.night-mode .vx-timer-text {
    color: #f8fafc;
  }

  .vx-header-volume {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #475569;
    padding: 0 4px;
  }
  body.night-mode .vx-header-volume {
    color: #cbd5e1;
  }
  .vx-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 84px;
    height: 4px;
    background: #cbd5e1;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    vertical-align: middle;
  }
  .vx-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #1e293b;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .vx-volume-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }
  body.night-mode .vx-volume-slider {
    background: #475569;
  }
  body.night-mode .vx-volume-slider::-webkit-slider-thumb {
    background: #f8fafc;
  }

  /* Subheader banner (matching authentic Cambridge CDI) */
  .vx-listening-part-banner {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    height: 38px;
    background: #f4f4f0;
    border-bottom: 1px solid #e0e0dc;
    display: flex;
    align-items: center;
    padding: 0 20px;
    font-size: 13.5px;
    color: #1f2937;
    z-index: 9990;
    font-family: Arial, Helvetica, sans-serif;
    box-sizing: border-box;
  }
  body.night-mode .vx-listening-part-banner {
    background: #1e293b;
    border-bottom-color: #334155;
    color: #f1f5f9;
  }
  .vx-listening-part-banner strong {
    font-weight: 800;
    margin-right: 4px;
    color: #111827;
  }
  body.night-mode .vx-listening-part-banner strong {
    color: #ffffff;
  }

  /* Authentic Cambridge CDI Bottom Dock for Listening */
  .vx-cdi-bottom-dock {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 52px;
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-sizing: border-box;
  }
  body.night-mode .vx-cdi-bottom-dock {
    background: #0f172a;
    border-top-color: #1e293b;
  }
  .vx-cdi-dock-parts {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
  }
  .vx-cdi-dock-parts::-webkit-scrollbar { display: none; }
  .vx-cdi-dock-part-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .vx-cdi-dock-part-tab {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 800;
    color: #334155;
    cursor: pointer;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .vx-cdi-dock-part-tab.active {
    background: #1e293b;
    color: #ffffff;
    border-color: #1e293b;
  }
  body.night-mode .vx-cdi-dock-part-tab {
    background: #1e293b;
    color: #cbd5e1;
    border-color: #334155;
  }
  body.night-mode .vx-cdi-dock-part-tab.active {
    background: #3b82f6;
    color: #ffffff;
    border-color: #3b82f6;
  }
  .vx-cdi-dock-q-list {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .vx-cdi-dock-q-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 20px;
    padding: 1px 3px;
    font-size: 12px;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.12s;
    user-select: none;
  }
  body.night-mode .vx-cdi-dock-q-item {
    color: #cbd5e1;
  }
  .vx-cdi-dock-q-item .vx-q-top-line {
    width: 14px;
    height: 2.5px;
    background: #cbd5e1;
    border-radius: 1px;
    margin-bottom: 2px;
  }
  body.night-mode .vx-cdi-dock-q-item .vx-q-top-line {
    background: #475569;
  }
  .vx-cdi-dock-q-item.active {
    color: #1d4ed8;
    font-weight: 900;
  }
  .vx-cdi-dock-q-item.active .vx-q-top-line {
    background: #1d4ed8;
    height: 3px;
  }
  .vx-cdi-dock-q-item.answered .vx-q-top-line {
    background: #1e293b;
    height: 3px;
  }
  body.night-mode .vx-cdi-dock-q-item.answered .vx-q-top-line {
    background: #94a3b8;
  }
  .vx-cdi-dock-q-item.review-incorrect {
    color: #dc2626 !important;
  }
  .vx-cdi-dock-q-item.review-incorrect .vx-q-top-line {
    background: #ef4444 !important;
    height: 3.5px;
  }
  .vx-cdi-dock-q-item.review-correct {
    color: #166534 !important;
  }
  .vx-cdi-dock-q-item.review-correct .vx-q-top-line {
    background: #10b981 !important;
    height: 3.5px;
  }
  .vx-cdi-dock-arrows {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 10px;
    flex-shrink: 0;
  }
  .vx-dock-arrow-btn {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    background: #374151;
    color: #ffffff;
    border: none;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 0.15s;
  }
  .vx-dock-arrow-btn:hover {
    background: #1f2937;
  }

  /* Fill in the blank inputs */
  input[type="text"].listening-input,
  .test-content input[type="text"],
  .notes-completion-block input[type="text"],
  .qcard input[type="text"],
  .flowchart-step input[type="text"],
  .table-container input[type="text"],
  input.q-input {
    border: 1.5px solid #94a3b8 !important;
    border-radius: 4px !important;
    padding: 2px 8px !important;
    font-size: 13.5px !important;
    font-family: inherit !important;
    font-weight: 700 !important;
    color: #0f172a !important;
    background: #ffffff !important;
    height: 28px !important;
    min-width: 100px !important;
    outline: none !important;
    box-sizing: border-box !important;
  }
  input[type="text"]:focus {
    border-color: #1e293b !important;
    box-shadow: 0 0 0 2px rgba(30, 41, 59, 0.12) !important;
  }
  body.night-mode input[type="text"] {
    background: #1e293b !important;
    color: #f8fafc !important;
    border-color: #475569 !important;
  }

  /* Results Sheet Hero Cards matching Screenshot 3 */
  .vx-res-hero-container {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 640px) {
    .vx-res-hero-container {
      grid-template-columns: 1fr;
    }
  }
  .vx-res-hero-dark-card {
    background: #0f1c34;
    color: #ffffff;
    border-radius: 14px;
    padding: 22px 18px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .vx-res-hero-label {
    font-size: 12.5px;
    font-weight: 700;
    color: #93c5fd;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .vx-res-hero-score {
    font-size: 56px;
    font-weight: 900;
    line-height: 1;
    color: #ffffff;
    letter-spacing: -0.03em;
    margin: 4px 0 6px;
  }
  .vx-res-hero-out-of {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 600;
  }
  .vx-res-hero-stats-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-around;
  }
  body.night-mode .vx-res-hero-stats-card,
  html[data-theme="dark"] .vx-res-hero-stats-card {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-stat-item {
    text-align: center;
  }
  .vx-res-stat-big {
    font-size: 32px;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.1;
    margin-bottom: 4px;
  }
  body.night-mode .vx-res-stat-big,
  html[data-theme="dark"] .vx-res-stat-big {
    color: #f8fafc;
  }
  .vx-res-stat-label {
    font-size: 12.5px;
    font-weight: 700;
    color: #64748b;
  }
  .vx-res-stat-divider {
    width: 1px;
    height: 48px;
    background: #e2e8f0;
  }
  body.night-mode .vx-res-stat-divider,
  html[data-theme="dark"] .vx-res-stat-divider {
    background: #334155;
  }
  .vx-res-section-block {
    margin-bottom: 22px;
  }
  .vx-res-incorrect-pills-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .vx-res-incorrect-pill {
    min-width: 36px;
    height: 32px;
    border-radius: 8px;
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fca5a5;
    font-size: 13px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .vx-res-incorrect-pill:hover {
    background: #fecaca;
    transform: translateY(-1px);
  }
  body.night-mode .vx-res-incorrect-pill,
  html[data-theme="dark"] .vx-res-incorrect-pill {
    background: #450a0a;
    color: #fca5a5;
    border-color: #7f1d1d;
  }
  .vx-res-qtypes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
  }
  .vx-res-qtype-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  body.night-mode .vx-res-qtype-card,
  html[data-theme="dark"] .vx-res-qtype-card {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-qtype-name {
    font-size: 13px;
    font-weight: 700;
    color: #334155;
  }
  body.night-mode .vx-res-qtype-name,
  html[data-theme="dark"] .vx-res-qtype-name {
    color: #cbd5e1;
  }
  .vx-res-qtype-val {
    font-size: 13px;
    font-weight: 900;
    color: #ef4444;
  }
  .vx-res-qtype-val.clean {
    color: #10b981;
  }
  .vx-res-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 18px;
    border-top: 1px solid #e2e8f0;
    margin-top: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }
  body.night-mode .vx-res-actions-bar,
  html[data-theme="dark"] .vx-res-actions-bar {
    border-color: #334155;
  }
  .vx-btn-report-issue {
    background: none;
    border: none;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
  }
  .vx-btn-report-issue:hover {
    color: #0f172a;
  }
  .vx-btn-review-mistakes-cta {
    background: #2563eb !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 10px 22px !important;
    font-size: 14px !important;
    font-weight: 800 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    cursor: pointer !important;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25) !important;
    transition: all 0.15s ease !important;
  }
  .vx-btn-review-mistakes-cta:hover {
    background: #1d4ed8 !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35) !important;
  }
  .vx-btn-finish-exam {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 13.5px;
    font-weight: 700;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .vx-btn-finish-exam:hover {
    background: #e2e8f0;
    color: #0f172a;
  }
  body.night-mode .vx-btn-finish-exam,
  html[data-theme="dark"] .vx-btn-finish-exam {
    background: #1e293b;
    color: #e2e8f0;
    border-color: #334155;
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
  .hl-context-menu,
  #highlightToolbar,
  .highlight-toolbar,
  #toolbar-selection-btns,
  #toolbar-highlight-btns,
  #highlightBtn,
  #selection-toolbar,
  #noteInputOverlay,
  #notesPanel,
  .q-badge {
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

  /* Detailed Answer Key Review Section */
  .vx-res-answers-table-wrap {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 22px;
    margin-bottom: 24px;
    box-sizing: border-box;
  }
  body.night-mode .vx-res-answers-table-wrap {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-table-filters {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .vx-filter-tab {
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    background: #f1f5f9;
    color: #475569;
    border: 1.5px solid transparent;
    transition: all 0.15s ease;
  }
  body.night-mode .vx-filter-tab {
    background: #0f172a;
    color: #94a3b8;
  }
  .vx-filter-tab:hover {
    transform: translateY(-1px);
  }
  .vx-filter-tab.active {
    background: #eff6ff;
    color: #1468f3;
    border-color: #bfdbfe;
  }
  body.night-mode .vx-filter-tab.active {
    background: #1e3a8a;
    color: #93c5fd;
    border-color: #3b82f6;
  }
  .vx-filter-tab.mistakes.active {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
  }
  body.night-mode .vx-filter-tab.mistakes.active {
    background: #450a0a;
    color: #fca5a5;
    border-color: #991b1b;
  }
  .vx-filter-tab.correct.active {
    background: #f0fdf4;
    color: #166534;
    border-color: #bbf7d0;
  }
  body.night-mode .vx-filter-tab.correct.active {
    background: #052e16;
    color: #86efac;
    border-color: #166534;
  }

  .vx-res-answers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 12px;
    max-height: 420px;
    overflow-y: auto;
    padding: 6px 4px 6px 0;
    margin-top: 10px;
  }
  .vx-ans-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }
  body.night-mode .vx-ans-card {
    background: #0f172a;
    border-color: #334155;
  }
  .vx-ans-card.is-correct {
    border-left: 4px solid #10b981;
  }
  .vx-ans-card.is-incorrect {
    border-left: 4px solid #ef4444;
  }
  .vx-ans-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .vx-ans-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 800;
  }
  .vx-ans-badge.correct {
    background: #dcfce7;
    color: #166534;
  }
  body.night-mode .vx-ans-badge.correct {
    background: #064e3b;
    color: #6ee7b7;
  }
  .vx-ans-badge.incorrect {
    background: #fee2e2;
    color: #991b1b;
  }
  body.night-mode .vx-ans-badge.incorrect {
    background: #450a0a;
    color: #fca5a5;
  }
  .vx-ans-data-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12.5px;
  }
  .vx-ans-field-label {
    font-size: 10.5px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  body.night-mode .vx-ans-field-label {
    color: #94a3b8;
  }
  .vx-ans-user-val {
    font-weight: 700;
    color: #0f172a;
    word-break: break-word;
  }
  body.night-mode .vx-ans-user-val {
    color: #f8fafc;
  }
  .vx-ans-user-val.empty {
    color: #94a3b8;
    font-style: italic;
    font-weight: 500;
  }
  .vx-ans-correct-val {
    font-weight: 800;
    color: #059669;
    background: #ecfdf5;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid #a7f3d0;
    display: inline-block;
    word-break: break-word;
    font-size: 12.5px;
  }
  body.night-mode .vx-ans-correct-val {
    background: #064e3b;
    color: #6ee7b7;
    border-color: #047857;
  }
  .vx-ans-jump-btn {
    background: none;
    border: none;
    color: #1468f3;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    padding: 4px 0 0 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
  }
  .vx-ans-jump-btn:hover {
    text-decoration: underline;
  }

  /* Sticky Review Banner & Inline Review Badges */
  .vx-review-sticky-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #0f172a;
    color: #ffffff;
    padding: 12px 24px;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .vx-rsb-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .vx-rsb-badge {
    background: #1468f3;
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
    letter-spacing: 0.05em;
  }
  .vx-rsb-score {
    font-size: 14px;
    font-weight: 700;
  }
  .vx-rsb-hint {
    font-size: 12px;
    color: #94a3b8;
  }
  .vx-rsb-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .vx-rsb-btn {
    padding: 7px 15px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
  }
  .vx-rsb-btn.primary {
    background: #10b981;
    color: #ffffff;
  }
  .vx-rsb-btn.primary:hover {
    background: #059669;
  }
  .vx-rsb-btn.secondary {
    background: #334155;
    color: #f8fafc;
  }
  .vx-rsb-btn.secondary:hover {
    background: #475569;
  }

  /* Inline Feedback under Exam Questions in Review Mode */
  .vx-inline-feedback {
    display: block;
    margin: 8px 0;
    padding: 7px 12px;
    border-radius: 8px;
    font-size: 12.5px;
    line-height: 1.45;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-sizing: border-box;
  }
  .vx-inline-feedback.correct {
    background: #f0fdf4;
    border: 1.5px solid #86efac;
    color: #166534;
  }
  .vx-inline-feedback.incorrect {
    background: #fef2f2;
    border: 1.5px solid #fca5a5;
    color: #991b1b;
  }
  body.night-mode .vx-inline-feedback.correct {
    background: #064e3b;
    border-color: #047857;
    color: #6ee7b7;
  }
  body.night-mode .vx-inline-feedback.incorrect {
    background: #450a0a;
    border-color: #991b1b;
    color: #fca5a5;
  }
  .vx-inline-feedback strong {
    font-weight: 800;
  }
  .vx-review-input-correct {
    border-color: #10b981 !important;
    background-color: #f0fdf4 !important;
  }
  .vx-review-input-incorrect {
    border-color: #ef4444 !important;
    background-color: #fef2f2 !important;
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

  /* ==========================================================================
     Authentic IELTS CDI Highlight & Notes System
     ========================================================================== */
  .ielts-highlight {
    background-color: #ffe066 !important;
    color: #111827 !important;
    padding: 1px 2px;
    border-radius: 2px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    cursor: pointer;
  }
  body.night-mode .ielts-highlight,
  html[data-theme="dark"] .ielts-highlight {
    background-color: #ffd700 !important;
    color: #000000 !important;
  }
  .ielts-note-highlight {
    background-color: #fef08a !important;
    color: #111827 !important;
    border-bottom: 2px solid #ca8a04 !important;
    padding: 1px 2px;
    border-radius: 2px;
    cursor: pointer;
    position: relative;
  }
  body.night-mode .ielts-note-highlight,
  html[data-theme="dark"] .ielts-note-highlight {
    background-color: #fde047 !important;
    color: #000000 !important;
    border-bottom-color: #eab308 !important;
  }
  .ielts-note-tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    color: #f8fafc;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;
    max-width: 240px;
    white-space: normal;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 100001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  }
  .ielts-note-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: #0f172a;
  }
  .ielts-note-highlight:hover .ielts-note-tooltip {
    opacity: 1;
  }

  /* Floating Selection Popover */
  .ielts-selection-toolbar {
    position: absolute;
    z-index: 99999;
    display: none;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
    font-family: system-ui, -apple-system, sans-serif;
  }
  body.night-mode .ielts-selection-toolbar {
    background: #1e293b;
    border-color: #475569;
  }
  .ielts-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    line-height: 1;
  }
  .ielts-tool-btn:hover {
    background: rgba(255, 255, 255, 0.22);
  }
  .ielts-tool-btn.btn-clear:hover {
    background: #dc2626;
    border-color: #dc2626;
  }

  /* Authentic Right-Click Context Menu */
  .ielts-context-menu {
    position: fixed;
    z-index: 100000;
    display: none;
    flex-direction: column;
    min-width: 140px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    padding: 4px;
    font-family: system-ui, -apple-system, sans-serif;
  }
  body.night-mode .ielts-context-menu,
  html[data-theme="dark"] .ielts-context-menu {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .ielts-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: #1e293b;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  body.night-mode .ielts-menu-item,
  html[data-theme="dark"] .ielts-menu-item {
    color: #f8fafc;
  }
  .ielts-menu-item:hover {
    background: #f1f5f9;
  }
  body.night-mode .ielts-menu-item:hover,
  html[data-theme="dark"] .ielts-menu-item:hover {
    background: #334155;
  }
  .ielts-menu-item.clear {
    color: #dc2626;
  }
  .ielts-menu-item.clear:hover {
    background: #fef2f2;
  }
  body.night-mode .ielts-menu-item.clear {
    color: #fca5a5;
  }
  body.night-mode .ielts-menu-item.clear:hover {
    background: rgba(220, 38, 38, 0.2);
  }
  .ielts-menu-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 3px 0;
  }
  body.night-mode .ielts-menu-divider,
  html[data-theme="dark"] .ielts-menu-divider {
    background: #334155;
  }
</style>

<!-- Audio Element -->
<audio id="vxListeningAudio" preload="auto"></audio>

<!-- Injected Authentic Cambridge CDI Top Exam Header -->
<div class="vx-listening-header-bar" id="vxListeningHeaderBar">
  <div class="vx-lh-left">
    <a href="/english" class="vx-lh-brand" title="IELTS Core">
      <img src="/assets/ielts-core-mark.png" height="26" alt="IELTS Core">
    </a>
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
    <div class="vx-header-volume" title="Volume">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <input type="range" id="vxAudioVolumeSlider" min="0" max="1" step="0.01" value="1" class="vx-volume-slider" aria-label="Volume">
    </div>
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
    <button type="button" class="vx-icon-btn" id="vxOpenSettingsBtn" title="Exam Settings">☰</button>
    <button type="button" class="vx-submit-header-btn" id="vxHeaderSubmitBtn">Submit</button>
  </div>
</div>

<!-- Subheader Banner (Part Instruction matching Cambridge CDI) -->
<div class="vx-listening-part-banner" id="vxListeningPartBanner">
  <strong id="vxListeningPartTitle">Part 1</strong>: <span id="vxListeningPartDesc">Listen and answer questions 1–10.</span>
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

<!-- Grand Executive Results Performance Dashboard (matching Authentic Screenshot 3) -->
<div id="vxResultsModal" class="vx-modal-backdrop" role="dialog" aria-modal="true">
  <div class="vx-results-sheet cdi-results-sheet">
    
    <!-- Top Header -->
    <div class="vx-res-head">
      <div class="vx-res-title-group">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="/assets/ielts-core-mark.png" height="24" alt="IELTS Core">
          <h2 style="margin:0;font-size:20px;font-weight:800;color:#0f172a;">Exam Results</h2>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="vx-res-timer-display" id="vxResTimerDisplay" style="font-size:13.5px;font-weight:600;color:#64748b;">0 seconds remaining</span>
        <button type="button" class="vx-res-close-x" id="vxResultsCloseTopBtn" title="Close report">✕</button>
      </div>
    </div>

    <!-- Hero Score Banner matching Screenshot 3 -->
    <div class="vx-res-hero-container">
      <div class="vx-res-hero-dark-card">
        <div class="vx-res-hero-label">Your Band Score</div>
        <div class="vx-res-hero-score" id="vxResBandNum">0</div>
        <div class="vx-res-hero-out-of">out of 9</div>
      </div>
      <div class="vx-res-hero-stats-card">
        <div class="vx-res-stat-item">
          <div class="vx-res-stat-big" id="vxResStatScore">0%</div>
          <div class="vx-res-stat-label" id="vxResStatSub">0 / 40 Correct</div>
        </div>
        <div class="vx-res-stat-divider"></div>
        <div class="vx-res-stat-item">
          <div class="vx-res-stat-big" id="vxResTimeSpent">0:00</div>
          <div class="vx-res-stat-label">Test Duration</div>
        </div>
      </div>
    </div>

    <!-- Incorrect Questions Pills -->
    <div class="vx-res-section-block">
      <div class="vx-res-section-title">Incorrect Questions</div>
      <div class="vx-res-incorrect-pills-row" id="vxResMistakesList">
        <!-- Injected dynamically: soft red pills [ 1 ] [ 2 ] ... -->
      </div>
    </div>

    <!-- Performance by Part -->
    <div class="vx-res-section-block">
      <div class="vx-res-section-title">Performance by Part</div>
      <div class="vx-res-parts-grid" id="vxResPartsRow">
        <!-- Injected dynamically -->
      </div>
    </div>

    <!-- Mistakes by Question Type -->
    <div class="vx-res-section-block">
      <div class="vx-res-section-title">Mistakes by Question Type</div>
      <div class="vx-res-qtypes-grid" id="vxResQTypesRow">
        <!-- Injected dynamically -->
      </div>
    </div>

    <!-- Complete Answers & Explanations Review Sheet -->
    <div class="vx-res-answers-table-wrap" id="vxListeningResultAnswersTableWrap">
      <div class="vx-res-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:gap:10px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span>Detailed Answer Key & Review</span>
          <span style="font-size:12px;font-weight:600;color:#64748b;text-transform:none;">(All Official Answers)</span>
        </div>
        <div class="vx-res-table-filters" role="tablist" aria-label="Filter listening answer results">
          <button type="button" class="vx-filter-tab active" data-res-filter="all">All (<span id="vxListeningFilterAllCount">--</span>)</button>
          <button type="button" class="vx-filter-tab mistakes" data-res-filter="mistakes">Mistakes (<span id="vxListeningFilterMistakesCount">--</span>)</button>
          <button type="button" class="vx-filter-tab correct" data-res-filter="correct">Correct (<span id="vxListeningFilterCorrectCount">--</span>)</button>
        </div>
      </div>
      <div class="vx-res-answers-grid" id="vxListeningResultAnswersGrid"></div>
    </div>

    <!-- Bottom Action Bar matching Screenshot 3 -->
    <div class="vx-res-actions-bar">
      <div style="display:flex;gap:10px;align-items:center;">
        <button type="button" class="vx-btn-report-issue" id="vxResultsReportIssueBtn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Report issue</span>
        </button>
        <button type="button" class="vx-btn-modal-secondary" id="vxResultsTranscriptBtn" style="padding:6px 12px;font-size:12.5px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:4px;vertical-align:-2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Transcript</span>
        </button>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <button type="button" class="vx-btn-modal-primary vx-btn-review-mistakes-cta" id="vxCloseModalReviewBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Review Mistakes</span>
        </button>
        <a href="/english/materials?level=ielts&skill=listening" class="vx-btn-finish-exam">Finish</a>
      </div>
    </div>

  </div>
</div>

<!-- Injected Authentic Cambridge CDI Bottom Dock for Listening -->
<footer id="vxListeningBottomDock" class="vx-cdi-bottom-dock" role="navigation" aria-label="Exam question navigation">
  <div class="vx-cdi-dock-parts" id="vxListeningDockParts">
    <!-- Rendered dynamically in script -->
  </div>
  <div class="vx-cdi-dock-arrows">
    <button type="button" class="vx-dock-arrow-btn" id="vxListeningPrevBtn" title="Previous question" aria-label="Previous question">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <button type="button" class="vx-dock-arrow-btn" id="vxListeningNextBtn" title="Next question" aria-label="Next question">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  </div>
</footer>

<!-- Injected Authentic IELTS CDI Selection Toolbar -->
<div id="ieltsSelectionToolbar" class="ielts-selection-toolbar" role="toolbar" aria-label="Text Highlight and Note Actions">
  <button type="button" id="ieltsHlBtn" class="ielts-tool-btn" title="Highlight selection">
    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ffe066;border:1px solid #d97706;"></span>
    <span>Highlight</span>
  </button>
  <button type="button" id="ieltsNoteBtn" class="ielts-tool-btn" title="Add note">
    <span>📝 Notes</span>
  </button>
  <button type="button" id="ieltsClearBtn" class="ielts-tool-btn btn-clear" style="display:none;" title="Clear highlight">
    <span>Clear</span>
  </button>
  <button type="button" id="ieltsClearAllBtn" class="ielts-tool-btn btn-clear" style="display:none;" title="Clear all highlights">
    <span>Clear all</span>
  </button>
</div>

<!-- Injected Authentic IELTS CDI Right-Click Context Menu -->
<div id="ieltsContextMenu" class="ielts-context-menu" role="menu" aria-label="IELTS Exam Options">
  <button type="button" id="ieltsCtxHlBtn" class="ielts-menu-item" role="menuitem">
    <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#ffe066;border:1px solid #d97706;"></span>
    <span>Highlight</span>
  </button>
  <button type="button" id="ieltsCtxNoteBtn" class="ielts-menu-item" role="menuitem">
    <span>📝 Notes</span>
  </button>
  <div id="ieltsCtxDivider" class="ielts-menu-divider" style="display:none;"></div>
  <button type="button" id="ieltsCtxClearBtn" class="ielts-menu-item clear" style="display:none;" role="menuitem">
    <span>✕ Clear</span>
  </button>
  <button type="button" id="ieltsCtxClearAllBtn" class="ielts-menu-item clear" style="display:none;" role="menuitem">
    <span>⊘ Clear all</span>
  </button>
</div>

<!-- Injected Authentic IELTS CDI Note Modal -->
<div id="ieltsNoteModal" class="vx-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ieltsNoteModalTitle">
  <div class="vx-modal-card ielts-note-card" style="max-width:440px;background:#ffffff;border-radius:12px;padding:20px;box-shadow:0 12px 36px rgba(0,0,0,0.25);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h3 id="ieltsNoteModalTitle" style="margin:0;font-size:16px;display:flex;align-items:center;gap:6px;color:#0f172a;">
        <span>📝 Candidate Note</span>
      </h3>
      <button type="button" id="ieltsNoteCloseX" style="border:none;background:none;font-size:20px;cursor:pointer;color:#64748b;line-height:1;">&times;</button>
    </div>
    <p id="ieltsNoteSnippet" style="font-size:12px;font-style:italic;color:#64748b;margin:0 0 10px;padding:6px 10px;background:#f8fafc;border-radius:6px;border-left:3px solid #f59e0b;"></p>
    <textarea id="ieltsNoteText" placeholder="Type your observation or keyword note here..." style="width:100%;box-sizing:border-box;min-height:90px;padding:10px;border-radius:8px;border:1px solid #cbd5e1;font-family:inherit;font-size:13px;resize:vertical;"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button type="button" id="ieltsNoteDeleteBtn" class="vx-submit-header-btn" style="color:#dc2626;display:none;margin-right:auto;">Delete note</button>
      <button type="button" id="ieltsNoteCancelBtn" class="vx-submit-header-btn">Cancel</button>
      <button type="button" id="ieltsNoteSaveBtn" class="vx-submit-header-btn" style="background:#1468f3;color:#ffffff;border-color:#1468f3;">Save note</button>
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
          var mins = Math.ceil(secondsLeft / 60);
          if (mins > 1) {
            if (timerText) timerText.textContent = mins + ' minutes remaining';
          } else {
            if (timerText) timerText.textContent = formatTime(secondsLeft) + ' remaining';
          }
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

  // Volume slider control
  var volumeSlider = document.getElementById('vxAudioVolumeSlider');
  if (volumeSlider && audioEl) {
    volumeSlider.addEventListener('input', function() {
      audioEl.volume = parseFloat(this.value);
    });
  }

  // Question jumping and Part banner
  var currentQ = material.startQ || 1;

  function updatePartBanner(qNum) {
    var part = 1;
    var range = '1–10';
    if (qNum > 30) { part = 4; range = '31–40'; }
    else if (qNum > 20) { part = 3; range = '21–30'; }
    else if (qNum > 10) { part = 2; range = '11–20'; }
    var leadEl = document.getElementById('vxListeningPartTitle');
    var descEl = document.getElementById('vxListeningPartDesc');
    if (leadEl) leadEl.textContent = 'Part ' + part;
    if (descEl) descEl.textContent = 'Listen and answer questions ' + range + '.';
  }

  function jumpToQuestion(qNum) {
    currentQ = qNum;
    var input = document.getElementById('q' + qNum) ||
                document.querySelector('[data-q="' + qNum + '"]') ||
                document.querySelector('[data-question="' + qNum + '"]') ||
                document.querySelector('input[name="q' + qNum + '"]') ||
                document.querySelector('input[name="question-' + qNum + '"]') ||
                document.querySelector('[id*="q' + qNum + '"]') ||
                document.querySelector('.question-' + qNum);
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { input.focus(); } catch(e){}
    }
    updatePartBanner(qNum);
    renderListeningBottomDock();
  }

  function renderListeningBottomDock() {
    var dockParts = document.getElementById('vxListeningDockParts');
    if (!dockParts) return;
    var numParts = isFullTest ? 4 : (material.questionCount <= 10 ? 1 : (material.questionCount <= 20 ? 2 : 4));
    var html = '';
    for (var p = 1; p <= numParts; p++) {
      var pStart = (p - 1) * 10 + 1;
      var pEnd = p * 10;
      if (material.questionCount !== 40) {
        pStart = material.startQ + (p - 1) * Math.ceil(material.questionCount / numParts);
        pEnd = Math.min(material.endQ, pStart + Math.ceil(material.questionCount / numParts) - 1);
      }
      var isPartActive = currentQ >= pStart && currentQ <= pEnd;
      html += '<div class="vx-cdi-dock-part-group" data-dock-part="' + p + '">';
      html += '<button type="button" class="vx-cdi-dock-part-tab ' + (isPartActive ? 'active' : '') + '" data-part-jump="' + pStart + '">Part ' + p + '</button>';
      html += '<div class="vx-cdi-dock-q-list">';
      for (var q = pStart; q <= pEnd; q++) {
        var isQActive = (q === currentQ);
        var ctrl = document.getElementById('q' + q) || document.querySelector('[name="q' + q + '"]') || document.querySelector('[data-q="' + q + '"]');
        var isAnswered = false;
        if (ctrl) {
          if (ctrl.type === 'radio' || ctrl.type === 'checkbox') {
            var checkedEl = document.querySelector('[name="' + ctrl.name + '"]:checked');
            isAnswered = Boolean(checkedEl);
          } else {
            isAnswered = String(ctrl.value || '').trim().length > 0;
          }
        }
        var isReview = Boolean(currentListeningAttempt);
        var isIncorrect = isReview && (currentListeningAttempt.incorrectQuestions || []).includes(q);
        var qClass = 'vx-cdi-dock-q-item';
        if (isQActive) qClass += ' active';
        if (isAnswered) qClass += ' answered';
        if (isReview) {
          qClass += isIncorrect ? ' review-incorrect' : ' review-correct';
        }
        html += '<div class="' + qClass + '" data-q-select="' + q + '"><span class="vx-q-top-line"></span><span>' + q + '</span></div>';
      }
      html += '</div></div>';
    }
    dockParts.innerHTML = html;

    dockParts.querySelectorAll('[data-q-select]').forEach(function(el) {
      el.onclick = function() {
        var qNum = parseInt(this.getAttribute('data-q-select'), 10);
        jumpToQuestion(qNum);
      };
    });
    dockParts.querySelectorAll('[data-part-jump]').forEach(function(el) {
      el.onclick = function() {
        var qNum = parseInt(this.getAttribute('data-part-jump'), 10);
        jumpToQuestion(qNum);
      };
    });
  }

  document.getElementById('vxListeningPrevBtn')?.addEventListener('click', function() {
    if (currentQ > material.startQ) jumpToQuestion(currentQ - 1);
  });
  document.getElementById('vxListeningNextBtn')?.addEventListener('click', function() {
    if (currentQ < material.endQ) jumpToQuestion(currentQ + 1);
  });

  document.addEventListener('input', function() { renderListeningBottomDock(); });
  document.addEventListener('change', function() { renderListeningBottomDock(); });

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

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var submittedListeningAnswers = [];
  var currentListeningAttempt = null;

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
    var qTypesRow = document.getElementById('vxResQTypesRow');

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
        bandNum.textContent = Number(band || 0).toFixed(1);
      } else {
        bandNum.textContent = correct;
      }
    }
    if (cefrBadge) {
      cefrBadge.textContent = isFullTest ? getBandCefr(band) : (pct >= 80 ? 'Mastery Level' : 'Practice Level');
    }
    if (statScore) {
      statScore.textContent = pct + '%';
    }
    if (statSub) {
      statSub.textContent = correct + ' / ' + total + ' Correct';
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

    var incorrectQuestions = Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : [];
    var incorrectSet = new Set(incorrectQuestions);

    if (mistakesList) {
      if (incorrectQuestions.length === 0) {
        mistakesList.innerHTML = '<span style="font-size:13px;color:#10b981;font-weight:700;">✔ Excellent! All questions answered correctly.</span>';
      } else {
        mistakesList.innerHTML = incorrectQuestions.map(function(q) {
          return '<button type="button" class="vx-res-incorrect-pill" data-jump-q="' + q + '" title="Jump to Question ' + q + ' in review">' + q + '</button>';
        }).join('');
      }

      mistakesList.querySelectorAll('[data-jump-q]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var qNum = Number(btn.getAttribute('data-jump-q'));
          modal.classList.remove('show');
          if (currentListeningAttempt) applyListeningReviewModeUi(currentListeningAttempt);
          jumpToQuestion(qNum);
        });
      });
    }

    if (qTypesRow) {
      var p1M = incorrectQuestions.filter(function(q){ return q >= 1 && q <= 10; }).length;
      var p2M = incorrectQuestions.filter(function(q){ return q >= 11 && q <= 20; }).length;
      var p3M = incorrectQuestions.filter(function(q){ return q >= 21 && q <= 30; }).length;
      var p4M = incorrectQuestions.filter(function(q){ return q >= 31 && q <= 40; }).length;
      qTypesRow.innerHTML =
        '<div class="vx-res-qtype-card"><span class="vx-res-qtype-name">Form & Note Completion</span><span class="vx-res-qtype-val' + (p1M === 0 ? ' clean' : '') + '">' + (p1M === 0 ? '✔ 0 errors' : p1M + ' mistakes') + '</span></div>' +
        '<div class="vx-res-qtype-card"><span class="vx-res-qtype-name">Multiple Choice & Maps</span><span class="vx-res-qtype-val' + (p2M === 0 ? ' clean' : '') + '">' + (p2M === 0 ? '✔ 0 errors' : p2M + ' mistakes') + '</span></div>' +
        '<div class="vx-res-qtype-card"><span class="vx-res-qtype-name">Matching & Discussion</span><span class="vx-res-qtype-val' + (p3M === 0 ? ' clean' : '') + '">' + (p3M === 0 ? '✔ 0 errors' : p3M + ' mistakes') + '</span></div>' +
        '<div class="vx-res-qtype-card"><span class="vx-res-qtype-name">Lecture Sentence Completion</span><span class="vx-res-qtype-val' + (p4M === 0 ? ' clean' : '') + '">' + (p4M === 0 ? '✔ 0 errors' : p4M + ' mistakes') + '</span></div>';
    }

    // Detailed Answer Key Cards & Filter Tabs
    var answerKey = material.answerKey || attempt.answerKey || {};
    var answersMap = new Map();
    var sourceAnswers = submittedListeningAnswers.length ? submittedListeningAnswers : (Array.isArray(attempt.answers) ? attempt.answers : []);
    sourceAnswers.forEach(function(a) {
      var k = String(a.key || '').toLowerCase().replace(/^q/, '');
      var num = parseInt(k, 10);
      if (Number.isFinite(num)) answersMap.set(num, String(a.value || '').trim());
    });

    var filterAllCount = document.getElementById('vxListeningFilterAllCount');
    var filterMistakesCount = document.getElementById('vxListeningFilterMistakesCount');
    var filterCorrectCount = document.getElementById('vxListeningFilterCorrectCount');
    var answersGrid = document.getElementById('vxListeningResultAnswersGrid');

    var mistakesCount = incorrectQuestions.length;
    var correctCount = Math.max(0, total - mistakesCount);

    if (filterAllCount) filterAllCount.textContent = total;
    if (filterMistakesCount) filterMistakesCount.textContent = mistakesCount;
    if (filterCorrectCount) filterCorrectCount.textContent = correctCount;

    if (answersGrid) {
      var cardsHtml = '';
      for (var q = 1; q <= total; q++) {
        var isIncorrect = incorrectSet.has(q);
        var expected = answerKey['q' + q] || answerKey[q] || answerKey[String(q)];
        var expectedDisplay = Array.isArray(expected) ? expected.join(' / ') : (expected !== undefined && expected !== null ? String(expected) : 'Not specified');
        var userAns = answersMap.get(q) || '';

        cardsHtml += '<div class="vx-ans-card ' + (isIncorrect ? 'is-incorrect' : 'is-correct') + '" data-ans-status="' + (isIncorrect ? 'mistakes' : 'correct') + '">' +
          '<div class="vx-ans-card-header">' +
            '<span class="vx-ans-badge ' + (isIncorrect ? 'incorrect' : 'correct') + '">' + (isIncorrect ? '✕' : '✔') + ' Question ' + q + '</span>' +
            '<span style="font-size:11px;font-weight:800;letter-spacing:0.04em;color:' + (isIncorrect ? '#ef4444' : '#10b981') + ';">' + (isIncorrect ? 'INCORRECT' : 'CORRECT') + '</span>' +
          '</div>' +
          '<div class="vx-ans-data-row">' +
            '<span class="vx-ans-field-label">Your Answer:</span>' +
            '<span class="vx-ans-user-val ' + (userAns ? '' : 'empty') + '">' + (userAns ? escapeHtml(userAns) : 'Not Answered') + '</span>' +
          '</div>' +
          '<div class="vx-ans-data-row">' +
            '<span class="vx-ans-field-label">Official Correct Answer:</span>' +
            '<span class="vx-ans-correct-val">' + escapeHtml(expectedDisplay) + '</span>' +
          '</div>' +
          '<button type="button" class="vx-ans-jump-btn" data-ans-jump="' + q + '">' +
            '<span>Inspect in Test</span>' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>' +
          '</button>' +
        '</div>';
      }
      answersGrid.innerHTML = cardsHtml;

      document.querySelectorAll('#vxListeningResultAnswersTableWrap .vx-filter-tab').forEach(function(tab) {
        tab.onclick = function() {
          document.querySelectorAll('#vxListeningResultAnswersTableWrap .vx-filter-tab').forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          var filter = tab.getAttribute('data-res-filter');
          answersGrid.querySelectorAll('.vx-ans-card').forEach(function(card) {
            var st = card.getAttribute('data-ans-status');
            card.style.display = (filter === 'all' || filter === st) ? 'flex' : 'none';
          });
        };
      });

      answersGrid.querySelectorAll('[data-ans-jump]').forEach(function(btn) {
        btn.onclick = function() {
          var qNum = Number(btn.getAttribute('data-ans-jump'));
          modal.classList.remove('show');
          if (currentListeningAttempt) applyListeningReviewModeUi(currentListeningAttempt);
          jumpToQuestion(qNum);
        };
      });
    }

    document.getElementById('vxResultsCloseTopBtn')?.addEventListener('click', function() {
      modal.classList.remove('show');
    });

    document.getElementById('vxCloseModalReviewBtn')?.addEventListener('click', function() {
      modal.classList.remove('show');
      if (currentListeningAttempt) {
        applyListeningReviewModeUi(currentListeningAttempt);
        var firstMistake = (currentListeningAttempt.incorrectQuestions || [])[0] || material.startQ;
        jumpToQuestion(firstMistake);
      }
    });

    document.getElementById('vxResultsReportIssueBtn')?.addEventListener('click', function() {
      alert('Thank you for reporting! Our Cambridge academic team will inspect this audio segment and question key.');
    });

    if (modal) modal.classList.add('show');
  }

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

    // Freeze all inputs for review
    for (var q = 1; q <= total; q++) {
      var inputs = document.querySelectorAll('#q' + q + ', [name="q' + q + '"], [name="question-' + q + '"], [name="question_' + q + '"], [data-q="' + q + '"], [data-question="' + q + '"]');
      inputs.forEach(function(inp) {
        inp.disabled = true;
      });
    }

    // Inline question feedback and input highlights
    document.querySelectorAll('.vx-inline-feedback').forEach(function(el) { el.remove(); });
    var answersMap = new Map();
    var sourceAnswers = submittedListeningAnswers.length ? submittedListeningAnswers : (Array.isArray(attempt.answers) ? attempt.answers : []);
    sourceAnswers.forEach(function(a) {
      var k = String(a.key || '').toLowerCase().replace(/^q/, '');
      var num = parseInt(k, 10);
      if (Number.isFinite(num)) answersMap.set(num, String(a.value || '').trim());
    });

    for (var q = 1; q <= total; q++) {
      var isIncorrect = incorrectSet.has(q);
      var expected = answerKey['q' + q] || answerKey[q] || answerKey[String(q)];
      var expectedDisplay = Array.isArray(expected) ? expected.join(' / ') : (expected !== undefined && expected !== null ? String(expected) : 'Not specified');
      var userAns = answersMap.get(q) || '';

      var ctrl = document.getElementById('q' + q) ||
                 document.querySelector('input[name="q' + q + '"]') ||
                 document.querySelector('input[name="question-' + q + '"]') ||
                 document.querySelector('select[name="q' + q + '"]') ||
                 document.querySelector('select[name="question-' + q + '"]') ||
                 document.querySelector('[data-q="' + q + '"]') ||
                 document.querySelector('[data-question="' + q + '"]');

      if (ctrl) {
        ctrl.classList.add(isIncorrect ? 'vx-review-input-incorrect' : 'vx-review-input-correct');
        var feedback = document.createElement('div');
        feedback.className = 'vx-inline-feedback ' + (isIncorrect ? 'incorrect' : 'correct');
        if (isIncorrect) {
          feedback.innerHTML = '<strong>✕ Incorrect.</strong> Your Answer: <em>' + (userAns ? escapeHtml(userAns) : 'Not Answered') + '</em> · Official Correct Answer: <strong>' + escapeHtml(expectedDisplay) + '</strong>';
        } else {
          feedback.innerHTML = '<strong>✔ Correct!</strong> Answer: <strong>' + escapeHtml(expectedDisplay) + '</strong>';
        }

        var attachTarget = (ctrl.type === 'radio' || ctrl.type === 'checkbox')
          ? (ctrl.closest('.form-group, .question-block, .radio-group, .question-options, fieldset') || ctrl.parentElement)
          : ctrl;

        if (attachTarget && attachTarget.nextSibling) {
          attachTarget.parentNode.insertBefore(feedback, attachTarget.nextSibling);
        } else if (attachTarget && attachTarget.parentNode) {
          attachTarget.parentNode.appendChild(feedback);
        }
      }
    }

    // Refresh bottom dock to highlight incorrect/correct in red/green
    renderListeningBottomDock();

    // Show persistent sticky bottom review bar
    var stickyBar = document.getElementById('vxListeningReviewStickyBar');
    if (!stickyBar) {
      stickyBar = document.createElement('div');
      stickyBar.id = 'vxListeningReviewStickyBar';
      stickyBar.className = 'vx-review-sticky-bar';
      document.body.appendChild(stickyBar);
    }
    stickyBar.style.display = 'flex';
    stickyBar.innerHTML = '<div class="vx-rsb-info">' +
      '<span class="vx-rsb-badge">EXAM REVIEW MODE</span>' +
      '<span class="vx-rsb-score">Score: <strong>' + attempt.correct + '/' + total + '</strong>' + bandText + '</span>' +
      '<span class="vx-rsb-hint">Official answers are shown below each question.</span>' +
    '</div>' +
    '<div class="vx-rsb-actions">' +
      '<button type="button" class="vx-rsb-btn primary" id="vxListeningRsbOpenModalBtn">Open Score Report</button>' +
      '<button type="button" class="vx-rsb-btn secondary" id="vxListeningRsbTranscriptBtn">Audio Transcript</button>' +
      '<button type="button" class="vx-rsb-btn secondary" id="vxListeningRsbRetakeBtn">Retake Test</button>' +
    '</div>';

    document.getElementById('vxListeningRsbOpenModalBtn')?.addEventListener('click', function() {
      document.getElementById('vxResultsModal')?.classList.add('show');
    });
    document.getElementById('vxListeningRsbTranscriptBtn')?.addEventListener('click', function() {
      toggleTranscriptPanel(true);
    });
    document.getElementById('vxListeningRsbRetakeBtn')?.addEventListener('click', function() {
      var url = new URL(window.location.href);
      url.searchParams.delete('review');
      window.location.href = url.toString();
    });
  }

  function evaluateListeningLocally(answers, durationSeconds) {
    var answerKey = material.answerKey || {};
    var totalQuestions = Number(material.questionCount) || 40;
    var correct = 0;
    var incorrectQuestions = [];
    var answerMap = new Map();
    submittedListeningAnswers = answers;
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
    submittedListeningAnswers = answers;
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

  // =========================================================================
  // Authentic IELTS CDI Highlight & Notes System
  // =========================================================================
  function initIeltsHighlightSystem() {
    var selToolbar = document.getElementById('ieltsSelectionToolbar');
    var ctxMenu = document.getElementById('ieltsContextMenu');
    var noteModal = document.getElementById('ieltsNoteModal');
    var noteSnippet = document.getElementById('ieltsNoteSnippet');
    var noteText = document.getElementById('ieltsNoteText');
    var noteSaveBtn = document.getElementById('ieltsNoteSaveBtn');
    var noteCancelBtn = document.getElementById('ieltsNoteCancelBtn');
    var noteDeleteBtn = document.getElementById('ieltsNoteDeleteBtn');
    var noteCloseX = document.getElementById('ieltsNoteCloseX');
    var currentSelectionRange = null;
    var activeNoteSpan = null;
    var lastRightClickedEl = null;

    function showSelectionToolbar() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hideSelectionToolbar();
        return;
      }
      var text = sel.toString().trim();
      if (!text || text.length < 1) {
        hideSelectionToolbar();
        return;
      }
      var range = sel.getRangeAt(0);
      currentSelectionRange = range.cloneRange();
      var rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        hideSelectionToolbar();
        return;
      }

      var hasHl = false;
      document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
        try {
          if (range.intersectsNode(el)) hasHl = true;
        } catch(e) {}
      });

      var clearBtn = document.getElementById('ieltsClearBtn');
      var clearAllBtn = document.getElementById('ieltsClearAllBtn');
      if (clearBtn) clearBtn.style.display = hasHl ? 'inline-flex' : 'none';
      if (clearAllBtn) clearAllBtn.style.display = hasHl ? 'inline-flex' : 'none';

      if (selToolbar) {
        selToolbar.style.display = 'flex';
        var top = window.scrollY + rect.top - selToolbar.offsetHeight - 8;
        var left = window.scrollX + rect.left + (rect.width / 2) - (selToolbar.offsetWidth / 2);
        if (top < window.scrollY + 5) top = window.scrollY + rect.bottom + 8;
        left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - selToolbar.offsetWidth - 8));
        selToolbar.style.top = top + 'px';
        selToolbar.style.left = left + 'px';
      }
    }

    function hideSelectionToolbar() {
      if (selToolbar) selToolbar.style.display = 'none';
    }

    function showContextMenu(clientX, clientY, clickedHl, sel) {
      if (!ctxMenu) return;
      var text = sel ? sel.toString().trim() : '';
      var hasText = text.length > 0;
      var hasHl = Boolean(clickedHl);

      if (!hasText && !hasHl) {
        hideContextMenu();
        return;
      }

      lastRightClickedEl = clickedHl;
      if (hasText && sel && sel.rangeCount) {
        currentSelectionRange = sel.getRangeAt(0).cloneRange();
      }

      var hlBtn = document.getElementById('ieltsCtxHlBtn');
      var noteBtn = document.getElementById('ieltsCtxNoteBtn');
      var divider = document.getElementById('ieltsCtxDivider');
      var clearBtn = document.getElementById('ieltsCtxClearBtn');
      var clearAllBtn = document.getElementById('ieltsCtxClearAllBtn');

      if (hlBtn) hlBtn.style.display = hasText ? 'flex' : 'none';
      if (noteBtn) noteBtn.style.display = hasText ? 'flex' : 'none';
      if (divider) divider.style.display = (hasText && hasHl) ? 'block' : 'none';
      if (clearBtn) clearBtn.style.display = hasHl ? 'flex' : 'none';
      if (clearAllBtn) clearAllBtn.style.display = (hasHl || document.querySelector('.ielts-highlight, .ielts-note-highlight')) ? 'flex' : 'none';

      ctxMenu.style.display = 'flex';
      var w = ctxMenu.offsetWidth || 140;
      var h = ctxMenu.offsetHeight || 100;
      var left = clientX;
      var top = clientY;

      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (left < 8) left = 8;
      if (top < 8) top = 8;

      ctxMenu.style.left = left + 'px';
      ctxMenu.style.top = top + 'px';
      hideSelectionToolbar();
    }

    function hideContextMenu() {
      if (ctxMenu) ctxMenu.style.display = 'none';
      lastRightClickedEl = null;
    }

    function mergeAdjacentHighlights(rootEl) {
      (rootEl || document.body).querySelectorAll('.ielts-highlight').forEach(function(span) {
        var next = span.nextSibling;
        while (next && next.nodeType === 1 && next.classList && next.classList.contains('ielts-highlight')) {
          while (next.firstChild) span.appendChild(next.firstChild);
          var toRemove = next;
          next = next.nextSibling;
          toRemove.remove();
        }
        span.normalize();
      });
    }

    function applyHighlight() {
      var range = currentSelectionRange;
      if (!range || range.collapsed) {
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount) range = sel.getRangeAt(0);
        else { hideSelectionToolbar(); hideContextMenu(); return; }
      }

      try {
        if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          var span = document.createElement('mark');
          span.className = 'ielts-highlight';
          range.surroundContents(span);
        } else {
          var common = range.commonAncestorContainer;
          var walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT, null);
          var textNodes = [];
          var node;
          while ((node = walker.nextNode())) {
            var nodeRange = document.createRange();
            nodeRange.selectNodeContents(node);
            if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0) {
              textNodes.push(node);
            }
          }

          if (textNodes.length > 0) {
            textNodes.forEach(function(tn) {
              if (tn.parentNode && tn.parentNode.classList && tn.parentNode.classList.contains('ielts-highlight')) return;
              var sOff = (tn === range.startContainer) ? range.startOffset : 0;
              var eOff = (tn === range.endContainer) ? range.endOffset : tn.nodeValue.length;
              if (sOff >= eOff || tn.nodeValue.slice(sOff, eOff).trim() === '') return;

              var targetNode = tn;
              if (sOff > 0) {
                targetNode = tn.splitText(sOff);
                eOff -= sOff;
              }
              if (eOff < targetNode.nodeValue.length) {
                targetNode.splitText(eOff);
              }
              var mark = document.createElement('mark');
              mark.className = 'ielts-highlight';
              targetNode.parentNode.insertBefore(mark, targetNode);
              mark.appendChild(targetNode);
            });
          } else {
            var frag = range.extractContents();
            var fallback = document.createElement('mark');
            fallback.className = 'ielts-highlight';
            fallback.appendChild(frag);
            range.insertNode(fallback);
          }
        }
      } catch(e) {
        console.warn('IELTS highlight error:', e);
      }

      mergeAdjacentHighlights(document.body);
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      currentSelectionRange = null;
      hideSelectionToolbar();
      hideContextMenu();
      saveHighlightsToStorage();
    }

    function openNoteDialog(range, existingSpan) {
      activeNoteSpan = existingSpan || null;
      currentSelectionRange = range ? range.cloneRange() : null;
      var snippet = existingSpan ? existingSpan.textContent.trim() : (range ? range.toString().trim() : '');
      if (noteSnippet) noteSnippet.textContent = '“' + (snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet) + '”';
      if (noteText) noteText.value = existingSpan ? existingSpan.getAttribute('data-note') || '' : '';
      if (noteDeleteBtn) noteDeleteBtn.style.display = existingSpan ? 'inline-flex' : 'none';
      if (noteModal) noteModal.classList.add('show');
      if (noteText) { setTimeout(function() { noteText.focus(); }, 60); }
      hideSelectionToolbar();
      hideContextMenu();
    }

    function closeNoteDialog() {
      if (noteModal) noteModal.classList.remove('show');
      activeNoteSpan = null;
      currentSelectionRange = null;
    }

    function saveNoteAction() {
      var text = (noteText ? noteText.value : '').trim();
      if (!text) {
        if (activeNoteSpan) deleteNoteAction();
        else closeNoteDialog();
        return;
      }

      if (activeNoteSpan) {
        activeNoteSpan.setAttribute('data-note', text);
        var existingTip = activeNoteSpan.querySelector('.ielts-note-tooltip');
        if (existingTip) existingTip.textContent = text;
        else {
          var tip = document.createElement('span');
          tip.className = 'ielts-note-tooltip';
          tip.textContent = text;
          activeNoteSpan.appendChild(tip);
        }
      } else if (currentSelectionRange) {
        try {
          var span = document.createElement('mark');
          span.className = 'ielts-note-highlight';
          span.setAttribute('data-note', text);
          var tooltip = document.createElement('span');
          tooltip.className = 'ielts-note-tooltip';
          tooltip.textContent = text;

          if (currentSelectionRange.startContainer === currentSelectionRange.endContainer && currentSelectionRange.startContainer.nodeType === Node.TEXT_NODE) {
            currentSelectionRange.surroundContents(span);
            span.appendChild(tooltip);
          } else {
            var frag = currentSelectionRange.extractContents();
            span.appendChild(frag);
            span.appendChild(tooltip);
            currentSelectionRange.insertNode(span);
          }
        } catch(e) {
          console.warn('IELTS note error:', e);
        }
      }

      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      closeNoteDialog();
      saveHighlightsToStorage();
    }

    function deleteNoteAction() {
      if (activeNoteSpan) {
        var parent = activeNoteSpan.parentNode;
        var tip = activeNoteSpan.querySelector('.ielts-note-tooltip');
        if (tip) tip.remove();
        if (parent) {
          while (activeNoteSpan.firstChild) parent.insertBefore(activeNoteSpan.firstChild, activeNoteSpan);
          activeNoteSpan.remove();
          parent.normalize();
        }
      }
      closeNoteDialog();
      saveHighlightsToStorage();
    }

    function clearHighlight(targetEl) {
      var elementsToClear = [];
      if (targetEl) {
        var hl = targetEl.closest('.ielts-highlight, .ielts-note-highlight');
        if (hl) elementsToClear.push(hl);
      } else if (currentSelectionRange) {
        document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
          var intersects = false;
          try { intersects = currentSelectionRange.intersectsNode(el); } catch(e) {}
          if (intersects) elementsToClear.push(el);
        });
      }

      elementsToClear.forEach(function(el) {
        var tip = el.querySelector('.ielts-note-tooltip');
        if (tip) tip.remove();
        var parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
          parent.normalize();
        }
      });

      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      currentSelectionRange = null;
      hideSelectionToolbar();
      hideContextMenu();
      saveHighlightsToStorage();
    }

    function clearAllHighlights() {
      document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
        var tip = el.querySelector('.ielts-note-tooltip');
        if (tip) tip.remove();
        var parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
          parent.normalize();
        }
      });

      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      currentSelectionRange = null;
      hideSelectionToolbar();
      hideContextMenu();
      saveHighlightsToStorage();
    }

    function saveHighlightsToStorage() {
      try {
        var list = [];
        document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
          list.push({
            type: el.classList.contains('ielts-note-highlight') ? 'note' : 'highlight',
            note: el.getAttribute('data-note') || '',
            text: el.textContent.replace(el.querySelector('.ielts-note-tooltip')?.textContent || '', '').trim()
          });
        });
        localStorage.setItem('vortex-listening-hl-' + material.id, JSON.stringify(list));
      } catch(e) {}
    }

    // Right-Click Context Menu Listener
    document.addEventListener('contextmenu', function(e) {
      var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;

      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      var clickedHl = e.target.closest('.ielts-highlight, .ielts-note-highlight');

      if (clickedHl || (text && text.length > 0)) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, clickedHl, sel);
      } else {
        e.preventDefault();
        hideContextMenu();
        hideSelectionToolbar();
      }
    });

    // Selection mouse/touch listeners
    document.addEventListener('mouseup', function(e) {
      if (e.target.closest('#ieltsSelectionToolbar') || e.target.closest('#ieltsContextMenu') || e.target.closest('#ieltsNoteModal') || e.target.closest('.vx-listening-header-bar')) return;
      setTimeout(showSelectionToolbar, 15);
    });
    document.addEventListener('touchend', function(e) {
      if (e.target.closest('#ieltsSelectionToolbar') || e.target.closest('#ieltsContextMenu') || e.target.closest('#ieltsNoteModal') || e.target.closest('.vx-listening-header-bar')) return;
      setTimeout(showSelectionToolbar, 15);
    });
    document.addEventListener('keyup', function(e) {
      if (e.target.closest('#ieltsNoteModal')) return;
      if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        setTimeout(showSelectionToolbar, 15);
      }
    });

    // Click outside listeners
    document.addEventListener('mousedown', function(e) {
      if (!e.target.closest('#ieltsSelectionToolbar')) {
        hideSelectionToolbar();
      }
      if (!e.target.closest('#ieltsContextMenu')) {
        hideContextMenu();
      }
    });
    window.addEventListener('scroll', function() {
      hideSelectionToolbar();
      hideContextMenu();
    }, true);

    // Clicking an existing note highlight opens note editor
    document.addEventListener('click', function(e) {
      var noteSpan = e.target.closest('.ielts-note-highlight');
      if (noteSpan && !e.target.closest('#ieltsContextMenu')) {
        e.preventDefault();
        openNoteDialog(null, noteSpan);
      }
    });

    // Buttons
    document.getElementById('ieltsHlBtn')?.addEventListener('click', applyHighlight);
    document.getElementById('ieltsCtxHlBtn')?.addEventListener('click', applyHighlight);
    document.getElementById('ieltsNoteBtn')?.addEventListener('click', function() {
      if (currentSelectionRange) openNoteDialog(currentSelectionRange, null);
    });
    document.getElementById('ieltsCtxNoteBtn')?.addEventListener('click', function() {
      if (currentSelectionRange) openNoteDialog(currentSelectionRange, null);
    });
    document.getElementById('ieltsClearBtn')?.addEventListener('click', function() { clearHighlight(lastRightClickedEl); });
    document.getElementById('ieltsCtxClearBtn')?.addEventListener('click', function() { clearHighlight(lastRightClickedEl); });
    document.getElementById('ieltsClearAllBtn')?.addEventListener('click', clearAllHighlights);
    document.getElementById('ieltsCtxClearAllBtn')?.addEventListener('click', clearAllHighlights);

    if (noteSaveBtn) noteSaveBtn.addEventListener('click', saveNoteAction);
    if (noteCancelBtn) noteCancelBtn.addEventListener('click', closeNoteDialog);
    if (noteDeleteBtn) noteDeleteBtn.addEventListener('click', deleteNoteAction);
    if (noteCloseX) noteCloseX.addEventListener('click', closeNoteDialog);
  }

  initIeltsHighlightSystem();
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
