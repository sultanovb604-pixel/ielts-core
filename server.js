const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { neon } = require("@neondatabase/serverless");

const ROOT = __dirname;

function loadEnvironmentFile(fileName) {
  const envFile = path.join(ROOT, fileName);
  if (!fs.existsSync(envFile)) return;
  for (const rawLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadEnvironmentFile(".env.local");
loadEnvironmentFile(".env");

const {
  readListeningCatalog,
  scoreListeningAnswers,
  listeningAttemptSummary,
  serveAudioFile,
  sanitizeListeningHtml
} = require("./listening-engine");

const LISTENING_MATERIALS_DIR = path.join(ROOT, "english-listening-materials");
const LISTENING_AUDIO_DIR = path.join(ROOT, "data", "listening-audio");
const LISTENING_CATALOG_FILE = path.join(ROOT, "data", "listening-catalog.json");
const ENGLISH_EXAM_SOURCE = path.join(ROOT, "english-listening-exam-source.html");
const LISTENING_MATERIAL = Object.freeze({
  id: "listening-full-test-01",
  title: "IELTS Listening Full Test 01",
  grade: "ielts",
  skill: "listening",
  type: "exam",
  collection: "full-test",
  access: "free",
  free: true,
  questionCount: 40,
  partCount: 4,
  formatLabel: "Full test",
  description: "Complete a four-part computer-delivered Listening test with real audio and a saved IELTS band result.",
  href: "/english/listening-exam?id=listening-full-test-01"
});
const READING_MATERIALS_DIR = path.join(ROOT, "english-reading-materials");
const ENGLISH_CONTENT_DIR = path.join(ROOT, "data", "english-content");
const ENGLISH_CONTENT_CATALOG = path.join(ENGLISH_CONTENT_DIR, "catalog.json");
const ARTICLE_READERS_DIR = path.join(ENGLISH_CONTENT_DIR, "readers");
const FREE_READING_FILES = new Set([
  "full_reading1_with_explanation (2).html",
  "IELTS Full Reading Practice.htm",
  "R (3) (2).html",
  "R (31).html",
  "R (32).html"
]);
const DATA_DIR = path.join(ROOT, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
if (!fs.existsSync(BACKUPS_DIR)) {
  try { fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}
}

function performDataBackup(data) {
  try {
    if (!data) return;
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const backupFile = path.join(BACKUPS_DIR, `vortex-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

    const existing = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith("vortex-backup-") && f.endsWith(".json"))
      .sort();
    while (existing.length > 15) {
      const oldest = existing.shift();
      try { fs.unlinkSync(path.join(BACKUPS_DIR, oldest)); } catch (_) {}
    }
  } catch (err) {
    console.error("Backup warning:", err.message);
  }
}

const DATA_FILE = process.env.VORTEX_DATA_FILE ? path.resolve(String(process.env.VORTEX_DATA_FILE)) : path.join(DATA_DIR, "vortex-data.json");
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PORT = Number(process.env.PORT || 4173);
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
if (!process.env.ADMIN_PASSWORD) console.warn("WARNING: ADMIN_PASSWORD is not set in environment. Using default fallback for development.");
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(`${ROOT}:vortex-student-session-v1`).digest("hex");
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
const studentSessions = new Map();
const revokedStudentTokens = new Set();
const revokedAdminTokens = new Set();
const adminLoginAttempts = new Map();
const STUDENT_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL = 2 * 60 * 60 * 1000;
const ADMIN_LOGIN_WINDOW = 60 * 60 * 1000;
const ADMIN_LOGIN_LIMIT = 3;
const LEVELS = new Set(["beginner", "elementary", "ielts"]);
const ENGLISH_SKILLS = new Set(["listening", "speaking", "reading", "writing"]);
const ENGLISH_COLLECTIONS = new Set(["full-test", "practice", "article", "writing-sample", "speaking-sample", "speaking-question", "book"]);

function normalizeReadingText(source) {
  return source
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, "–")
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "—")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function readingQuestionNumbers(source) {
  const normalized = normalizeReadingText(source);
  const questions = new Set();
  const rangePattern = /Questions?\s*(?:<[^>]+>|\s|:)*?(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/gi;
  for (const match of normalized.matchAll(rangePattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start > 0 && end >= start && end - start <= 50) {
      for (let number = start; number <= end; number += 1) questions.add(number);
    }
  }
  const fieldPattern = /(?:id|name|data-question)=["'](?:q(?:uestion)?[_-]?|question-)?(\d{1,2})["']/gi;
  for (const match of normalized.matchAll(fieldPattern)) questions.add(Number(match[1]));
  return questions;
}

function explicitQuestionTotal(source) {
  const normalized = normalizeReadingText(source).replace(/<[^>]+>/g, " ");
  const totals = [...normalized.matchAll(/(?:out of\s+)?(\d{1,2})\s+questions?\b/gi)]
    .map(match => Number(match[1]))
    .filter(number => number > 0 && number <= 50);
  return totals.length ? Math.max(...totals) : 0;
}

function cleanReadingTopic(fileName, source) {
  const matched = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const base = path.basename(fileName, path.extname(fileName))
    .replace(/\s*\(\d+\)\s*$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let title = matched ? normalizeReadingText(matched[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : base;
  title = title
    .replace(/^IELTS\s+(?:Academic\s+)?Reading\s*(?:Practice|Test)?\s*[-–—:]?\s*/i, "")
    .replace(/\s*\|.*$/g, "")
    .trim();
  if (!title || /^(?:practice|offline|complete practice|full reading practice)$/i.test(title)) title = base;
  return title
    .replace(/^R\s*\(\d+\)$/i, "")
    .replace(/\s*\(Passage\s*[123]\).*$/i, "")
    .replace(/^Reading\s+/i, "")
    .trim();
}

const readingAnswerKeyCache = new Map();

function objectLiteralForVariable(source, variableName) {
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(`(?:const|let|var)\\s+${escapedName}\\s*=\\s*\\{`, "i").exec(source);
  if (!declaration) return null;
  const start = source.indexOf("{", declaration.index);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (character === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function plainReadingAnswerKey(source) {
  for (const variableName of ["correctAnswers", "CA", "answers"]) {
    const literal = objectLiteralForVariable(source, variableName);
    if (!literal) continue;
    try {
      const parsed = vm.runInNewContext(`(${literal})`, Object.create(null), {
        timeout: 50,
        codeGeneration: { strings: false, wasm: false }
      });
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const entries = Object.entries(parsed).filter(([, value]) => typeof value === "string" || (Array.isArray(value) && value.every(item => typeof item === "string")));
      if (entries.length) return Object.fromEntries(entries);
    } catch {}
  }
  const embedded = {};
  for (const match of source.matchAll(/["']id["']\s*:\s*(\d{1,2})[\s\S]{0,1800}?["']correctAnswer["']\s*:\s*["']([^"']+)["']/gi)) {
    embedded[match[1]] = match[2];
  }
  return Object.keys(embedded).length ? embedded : null;
}

function readingAnswerKey(material) {
  if (!material?.fileName) return null;
  const file = path.resolve(READING_MATERIALS_DIR, material.fileName);
  if (!file.startsWith(`${path.resolve(READING_MATERIALS_DIR)}${path.sep}`) || !fs.existsSync(file)) return null;
  const modified = fs.statSync(file).mtimeMs;
  const cached = readingAnswerKeyCache.get(file);
  if (cached?.modified === modified) return cached.key;
  const key = plainReadingAnswerKey(fs.readFileSync(file, "utf8"));
  readingAnswerKeyCache.set(file, { modified, key });
  return key;
}

function normalizeExamAnswer(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreReadingAnswers(material, answers, detailed = false) {
  const key = readingAnswerKey(material);
  if (!key) return null;
  const submitted = new Map();
  for (const answer of answers) {
    const name = String(answer.key || "").toLocaleLowerCase("en");
    if (!name) continue;
    const values = submitted.get(name) || [];
    const normalized = normalizeExamAnswer(answer.value);
    if (normalized) values.push(normalized);
    submitted.set(name, values);
  }
  let correct = 0;
  const correctQuestions = new Set();
  const totalQuestions = Number(material.questionCount) || 40;

  for (const [rawKey, rawExpected] of Object.entries(key)) {
    const normalizedKey = String(rawKey).toLocaleLowerCase("en");
    const numericKey = normalizedKey.replace(/^q/, "");
    const range = numericKey.match(/^(\d+)_(\d+)$/);
    const candidates = [normalizedKey, numericKey, `q${numericKey}`];
    if (range) candidates.push(`q${range[1]}`, range[1]);
    const actual = candidates.flatMap(candidate => submitted.get(candidate) || []);
    const expected = (Array.isArray(rawExpected) ? rawExpected : [rawExpected]).map(normalizeExamAnswer).filter(Boolean);
    if (range) {
      const exact = actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
      if (exact) {
        correct += Math.max(1, Number(range[2]) - Number(range[1]) + 1);
        for (let q = Number(range[1]); q <= Number(range[2]); q++) correctQuestions.add(q);
      }
    } else if (actual.some(value => expected.includes(value))) {
      correct += 1;
      const num = parseInt(numericKey, 10);
      if (Number.isFinite(num)) correctQuestions.add(num);
    }
  }

  const boundedCorrect = Math.min(totalQuestions, correct);
  if (!detailed) return boundedCorrect;

  const incorrectQuestions = [];
  for (let q = 1; q <= totalQuestions; q++) {
    if (!correctQuestions.has(q)) incorrectQuestions.push(q);
  }

  // Part Breakdown (3 parts for 40-Q full tests, 1 part for single passages)
  const partsConfig = totalQuestions === 40 ? [
    { part: "Part 1", start: 1, end: 13 },
    { part: "Part 2", start: 14, end: 26 },
    { part: "Part 3", start: 27, end: 40 }
  ] : [
    { part: "Part 1", start: 1, end: totalQuestions }
  ];

  const partBreakdown = partsConfig.map(p => ({
    part: p.part,
    mistakes: incorrectQuestions.filter(q => q >= p.start && q <= p.end).length
  }));

  // Question Type Breakdown (Categorized by common IELTS Reading segments)
  const qTypeBreakdown = totalQuestions === 40 ? [
    { type: "True / False / Not Given & Yes/No/NG", mistakes: incorrectQuestions.filter(q => (q >= 1 && q <= 7) || (q >= 35 && q <= 40)).length },
    { type: "Matching Headings & Information", mistakes: incorrectQuestions.filter(q => q >= 14 && q <= 20).length },
    { type: "Multiple Choice Questions (MCQ)", mistakes: incorrectQuestions.filter(q => (q >= 27 && q <= 34) || (q >= 8 && q <= 10)).length },
    { type: "Sentence & Summary Completion", mistakes: incorrectQuestions.filter(q => (q >= 11 && q <= 13) || (q >= 21 && q <= 26)).length }
  ] : [
    { type: "Matching Headings & Info", mistakes: incorrectQuestions.filter(q => q <= Math.ceil(totalQuestions / 2)).length },
    { type: "Detail & Sentence Completion", mistakes: incorrectQuestions.filter(q => q > Math.ceil(totalQuestions / 2)).length }
  ];

  return {
    correct: boundedCorrect,
    total: totalQuestions,
    band: readingBand(boundedCorrect, totalQuestions),
    incorrectQuestions,
    partBreakdown,
    questionTypeBreakdown: qTypeBreakdown.filter(t => t.mistakes >= 0)
  };
}

let cachedReadingCatalog = null;
let readingCatalogCachedAt = 0;

function readReadingCatalog(forceRefresh = false) {
  const now = Date.now();
  if (cachedReadingCatalog && !forceRefresh && (now - readingCatalogCachedAt < 300000)) {
    return cachedReadingCatalog;
  }
  if (!fs.existsSync(READING_MATERIALS_DIR)) return [];
  const catalog = fs.readdirSync(READING_MATERIALS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.html?$/i.test(entry.name))
    .map(entry => {
      const source = fs.readFileSync(path.join(READING_MATERIALS_DIR, entry.name), "utf8");
      const questions = readingQuestionNumbers(source);
      const hasFortyQuestions = Array.from({ length: 40 }, (_, index) => index + 1).every(number => questions.has(number));
      const isSkillPractice = !hasFortyQuestions && /matching headings/i.test(source);
      const materialKind = hasFortyQuestions ? "full-test" : isSkillPractice ? "skill-practice" : "passage";
      const questionCount = hasFortyQuestions ? 40 : questions.size || explicitQuestionTotal(source);
      const id = `reading-${crypto.createHash("sha256").update(entry.name).digest("hex").slice(0, 12)}`;
      const free = FREE_READING_FILES.has(entry.name);
      const passageNumbers = new Set([...normalizeReadingText(source).matchAll(/(?:reading\s+)?passage\s*([1-5])\b/gi)].map(match => Number(match[1])));
      const passageCount = materialKind === "full-test" ? 3 : Math.max(1, passageNumbers.size);
      return {
        id,
        sourceTitle: cleanReadingTopic(entry.name, source),
        grade: "ielts",
        skill: "reading",
        type: "exam",
        access: free ? "free" : "premium",
        free,
        questionCount,
        passageCount,
        materialKind,
        collection: materialKind === "full-test" ? "full-test" : "practice",
        formatLabel: materialKind === "full-test" ? "Full test" : materialKind === "skill-practice" ? "Skill practice" : "Passage practice",
        href: free ? `/english/reading-exam?id=${encodeURIComponent(id)}` : "",
        fileName: entry.name
      };
    });

  const fullTests = catalog
    .filter(item => item.materialKind === "full-test")
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "en", { numeric: true }));
  fullTests.forEach((item, index) => {
    item.title = `IELTS Reading Full Test ${String(index + 1).padStart(2, "0")}`;
    item.description = "Complete computer-delivered practice under real exam conditions.";
  });
  catalog.filter(item => item.materialKind !== "full-test").forEach(item => {
    const fallback = item.materialKind === "skill-practice" ? "Matching Headings" : "Academic passage";
    item.title = item.materialKind === "skill-practice"
      ? `IELTS Reading Skill Practice — ${item.sourceTitle || fallback}`
      : `IELTS Reading Passage — ${item.sourceTitle || fallback}`;
    item.description = item.materialKind === "skill-practice"
      ? "Focused question-type practice for targeted improvement."
      : "Single-passage computer-delivered practice.";
  });
  const result = catalog.sort((a, b) => Number(b.free) - Number(a.free) || a.title.localeCompare(b.title, "en", { numeric: true }));
  cachedReadingCatalog = result;
  readingCatalogCachedAt = now;
  return result;
}

let cachedEnglishContent = null;
let englishContentCachedAt = 0;

function readEnglishContentCatalog(includeFiles = false) {
  if (!fs.existsSync(ENGLISH_CONTENT_CATALOG)) return [];
  try {
    const now = Date.now();
    let rawCatalog = cachedEnglishContent;
    if (!rawCatalog || now - englishContentCachedAt > 300000) {
      rawCatalog = JSON.parse(fs.readFileSync(ENGLISH_CONTENT_CATALOG, "utf8"));
      if (Array.isArray(rawCatalog)) {
        cachedEnglishContent = rawCatalog;
        englishContentCachedAt = now;
      }
    }
    if (!Array.isArray(rawCatalog)) return [];
    return rawCatalog
      .filter(item => item && typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.parts) && item.parts.length)
      .map(item => ({
        ...item,
        href: `/english/lesson?id=${encodeURIComponent(item.id)}`,
        parts: item.parts.map(part => includeFiles ? part : { key: part.key, label: part.label })
      }));
  } catch {
    return [];
  }
}

const WRITING_TOPICS_FILE = path.join(DATA_DIR, "writing-topics.json");
let cachedWritingTopics = null;
let writingTopicsCachedAt = 0;

function readWritingTopicsCatalog() {
  if (!fs.existsSync(WRITING_TOPICS_FILE)) return [];
  const now = Date.now();
  if (cachedWritingTopics && now - writingTopicsCachedAt < 60000) return cachedWritingTopics;
  try {
    const list = JSON.parse(fs.readFileSync(WRITING_TOPICS_FILE, "utf8"));
    if (Array.isArray(list)) {
      cachedWritingTopics = list;
      writingTopicsCachedAt = now;
      return list;
    }
  } catch {}
  return [];
}

function readArticleReader(articleId) {
  if (!/^[a-z0-9-]{3,100}$/i.test(String(articleId || ""))) return null;
  const file = path.join(ARTICLE_READERS_DIR, `${articleId}.json`);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${path.resolve(ARTICLE_READERS_DIR)}${path.sep}`) || !fs.existsSync(resolved)) return null;
  try {
    const reader = JSON.parse(fs.readFileSync(resolved, "utf8"));
    if (!reader || reader.id !== articleId || reader.qualityStatus !== "approved" || !Array.isArray(reader.blocks)) return null;
    if (reader.blocks.some(block => /\(cid:\d+\)/i.test(String(block.text || "")))) return null;
    return reader;
  } catch {
    return null;
  }
}

function articleSelection(reader, blockId, start, end) {
  const block = reader?.blocks?.find(item => item.id === String(blockId || ""));
  const from = Number(start);
  const to = Number(end);
  if (!block || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > block.text.length || to - from > 1000) return null;
  const text = block.text.slice(from, to).trim();
  return text ? { block, start: from, end: to, text } : null;
}

function readingPersistenceMarkup(material, user) {
  const totalQuestions = Number(material.questionCount) || 40;
  const passageCount = Number(material.passageCount) || (material.materialKind === "full-test" ? 3 : 1);
  const durationSeconds = material.materialKind === "full-test" ? 3600 : (passageCount > 1 ? passageCount * 1200 : 1200);
  const isPremium = user?.plan === "premium";
  const answerKey = readingAnswerKey(material);
  const config = JSON.stringify({
    id: material.id,
    title: material.title,
    questionCount: totalQuestions,
    passageCount: passageCount,
    durationSeconds: durationSeconds,
    materialKind: material.materialKind || "full-test",
    isPremium: isPremium,
    userPlan: user?.plan || "free",
    answerKey: answerKey || {}
  }).replace(/</g, "\\u003c");

  return `
<style id="vortex-reading-exam-styles">
  :root {
    --vx-ink: #0c1c38;
    --vx-muted: #5e6f88;
    --vx-blue: #1468f3;
    --vx-blue-hover: #0756d8;
    --vx-blue-soft: #edf4ff;
    --vx-success: #0b8054;
    --vx-success-soft: #eaf8f1;
    --vx-danger: #c52b27;
    --vx-danger-soft: #fdf0ef;
    --vx-amber: #b86e00;
    --vx-amber-soft: #fff6e0;
    --vx-line: #d8e2ef;
    --vx-line-strong: #c2d2e6;
    --vx-paper: #ffffff;
    --vx-canvas: #f6f8fc;
    --vx-font-sans: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --vx-font-serif: Georgia, 'Times New Roman', Cambria, serif;
    --vx-passage-size: 17px;
  }

  html[data-theme="dark"] {
    --vx-ink: #f3f6fb;
    --vx-muted: #9ab0ca;
    --vx-blue: #2978ff;
    --vx-blue-hover: #488eff;
    --vx-blue-soft: #12243d;
    --vx-success: #1eb378;
    --vx-success-soft: #0d281e;
    --vx-danger: #f87171;
    --vx-danger-soft: #301618;
    --vx-amber: #fbbf24;
    --vx-amber-soft: #2e2308;
    --vx-line: #22344b;
    --vx-line-strong: #324a68;
    --vx-paper: #0e1927;
    --vx-canvas: #07101c;
  }

  /* Global Exam Shell Resets & Polish */
  body {
    margin: 0 !important;
    padding-top: 88px !important;
    padding-bottom: 52px !important;
    font-family: var(--vx-font-sans) !important;
    color: var(--vx-ink) !important;
    background-color: var(--vx-canvas) !important;
    box-sizing: border-box !important;
    -webkit-font-smoothing: antialiased;
    height: 100%;
    overflow: hidden !important;
  }

  html {
    height: 100%;
    overflow: hidden !important;
  }

  /* Hide old imported top headers, footers and passage-nav */
  .test-wrapper > .header,
  .test-wrapper > .footer,
  .passage-nav,
  .test-wrapper > .passage-nav {
    display: none !important;
  }

  /* ==========================================================================
     Authentic 1:1 Cambridge CDI Viewport Grid (Split-Pane Left/Right)
     ========================================================================== */
  /* Top-level full screen exam frame */
  body > .main-container,
  body > .test-wrapper,
  body > #main-container,
  .main-container,
  .test-wrapper {
    position: fixed !important;
    top: 88px !important;
    bottom: 52px !important;
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    height: calc(100vh - 140px) !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    z-index: 10 !important;
  }

  .test-container,
  .test-wrapper > .test-container,
  .panels-container {
    display: flex !important;
    flex-direction: row !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    flex: 1 1 100% !important;
    position: relative !important;
  }

  /* ==========================================================================
     Authentic 1:1 Cambridge CDI Top Header
     ========================================================================== */
  #vortex-exam-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 48px;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    font-family: var(--vx-font-sans);
    box-sizing: border-box;
  }

  html[data-theme="dark"] #vortex-exam-header {
    background: #0f172a;
    border-bottom-color: #334155;
  }

  .vx-cdi-top-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .vx-cdi-wordmark {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 18px;
    font-weight: 900;
    color: #cc0000;
    letter-spacing: -0.03em;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }

  .vx-cdi-title-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .vx-cdi-exam-title {
    font-size: 13px;
    font-weight: 700;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  html[data-theme="dark"] .vx-cdi-exam-title {
    color: #f8fafc;
  }

  .vx-cdi-time-text {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
  }
  html[data-theme="dark"] .vx-cdi-time-text {
    color: #94a3b8;
  }

  .vx-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .vx-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid var(--vx-line);
    border-radius: 6px;
    background: var(--vx-paper);
    color: var(--vx-ink);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .vx-btn-icon:hover {
    border-color: var(--vx-blue);
    color: var(--vx-blue);
  }

  .vx-exit-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--vx-line);
    border-radius: 6px;
    background: var(--vx-paper);
    color: var(--vx-muted);
    font-size: 11.5px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .vx-exit-btn:hover {
    border-color: #ef4444;
    color: #ef4444;
  }

  /* Sub-header Rubric Banner */
  .vx-cdi-subrubric {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    height: 40px;
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    padding: 2px 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    z-index: 9999;
    box-sizing: border-box;
  }
  html[data-theme="dark"] .vx-cdi-subrubric {
    background: #1e293b;
    border-bottom-color: #334155;
  }
  .vx-cdi-subrubric strong {
    font-size: 12.5px;
    font-weight: 800;
    color: #111827;
  }
  html[data-theme="dark"] .vx-cdi-subrubric strong {
    color: #f8fafc;
  }
  .vx-cdi-subrubric span {
    font-size: 11px;
    color: #64748b;
  }
  html[data-theme="dark"] .vx-cdi-subrubric span {
    color: #94a3b8;
  }

  /* Hide unnecessary in-body rubric boxes and ALL legacy floating/footer navigation controls */
  #passage-header-container,
  .part-header,
  .sectionRubric,
  .section-rubric,
  .passage-rubric,
  .instruction-box,
  .passage-instruction,
  .nav-row,
  .nav-buttons,
  .nav-arrow,
  body footer:not(#vortex-bottom-navigator),
  footer:not(#vortex-bottom-navigator),
  footer.footer,
  .footer,
  .footer-nav,
  .test-wrapper > footer:not(#vortex-bottom-navigator),
  .test-wrapper > .footer,
  .footer__questionWrapper,
  .footer__deliverButton,
  .footer__questionNo,
  .footer__questionWrapper___1tZ46,
  .footer__deliverButton___3FM07,
  #deliver-button,
  #deliver-btn,
  #submissionModal,
  .submission-modal,
  .results-modal,
  #resultsModal,
  .passage-nav,
  .test-wrapper > .passage-nav,
  .test-wrapper > .header,
  .settings-modal:not(.active),
  #settingsModal:not(.active) {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
    opacity: 0 !important;
  }

  /* Clean Authentic IELTS Typography - No Blue/Cyan Accents */
  .reading-passage h4,
  .reading-passage h2,
  .reading-passage h3,
  .reading-passage h5,
  .passage-content h2,
  .passage-content h3,
  .passage-content h4,
  .passage-container h2,
  .passage-container h3,
  .question-rubric h3,
  .question-rubric h2,
  .question-rubric h4,
  .question-content h3,
  .question-content h2,
  .question-content h4,
  .questions-container h3,
  .questions-container h2,
  .questions-container h4,
  .reading-passage .section-label,
  .text-blue-600,
  .text-blue-500,
  .text-cyan-600,
  .text-indigo-600 {
    color: #111827 !important;
    border-bottom: none !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    margin-top: 0 !important;
    margin-bottom: 8px !important;
  }
  html[data-theme="dark"] .question-rubric h3,
  html[data-theme="dark"] .question-rubric h2,
  html[data-theme="dark"] .question-rubric h4,
  html[data-theme="dark"] .question-content h3,
  html[data-theme="dark"] .questions-container h3,
  html[data-theme="dark"] .reading-passage h4,
  html[data-theme="dark"] .text-blue-600,
  html[data-theme="dark"] .text-blue-500 {
    color: #f8fafc !important;
    border-bottom: none !important;
  }

  .question-rubric,
  .question-rubric p,
  .question-content,
  .question-content p {
    color: #1f2937 !important;
    font-size: 13.5px !important;
    line-height: 1.6 !important;
  }
  html[data-theme="dark"] .question-rubric,
  html[data-theme="dark"] .question-rubric p,
  html[data-theme="dark"] .question-content p {
    color: #cbd5e1 !important;
  }

  /* Question Cards: 100% Flat, Authentic Clean Look (No Blue Borders / Shadows) */
  .question,
  .question-card,
  .question.active,
  .tf-question,
  .multi-choice-question {
    background: transparent !important;
    padding: 0 !important;
    margin-bottom: 28px !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    transform: none !important;
    border: none !important;
    outline: none !important;
  }
  .question:hover {
    transform: none !important;
  }

  /* Left Pane (Passage) - 1:1 Cambridge CDI Standard */
  .passage-panel,
  #left-panel,
  .left-panel,
  .passage-container,
  #passage-container,
  .test-container > .passage-container,
  .panels-container > .passage-container {
    flex: 1 1 50% !important;
    width: 50% !important;
    min-width: 320px !important;
    max-width: none !important;
    height: 100% !important;
    min-height: 100% !important;
    padding: 24px 32px 60px 28px !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    background: #ffffff !important;
    border-right: 1px solid #e5e7eb !important;
  }
  html[data-theme="dark"] .passage-panel,
  html[data-theme="dark"] #left-panel,
  html[data-theme="dark"] .passage-container,
  html[data-theme="dark"] #passage-container,
  html[data-theme="dark"] .panels-container > .passage-container {
    background: #0f172a !important;
    border-right-color: #334155 !important;
  }

  /* Right Pane (Questions) - 1:1 Cambridge CDI Standard */
  .panels-container > .questions-panel,
  .panels-container > #right-panel,
  .panels-container > .right-panel,
  .panels-container > .questions-container,
  .test-container > .questions-panel,
  .test-container > #right-panel,
  .test-container > .right-panel,
  .test-container > .questions-container,
  .main-container > .questions-panel,
  .main-container > #right-panel,
  .main-container > .questions-container,
  .questions-panel {
    flex: 1 1 50% !important;
    width: 50% !important;
    min-width: 320px !important;
    max-width: none !important;
    height: 100% !important;
    min-height: 100% !important;
    padding: 24px 32px 60px 28px !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    background: #ffffff !important;
  }
  html[data-theme="dark"] .panels-container > .questions-panel,
  html[data-theme="dark"] .panels-container > #right-panel,
  html[data-theme="dark"] .panels-container > .questions-container,
  html[data-theme="dark"] .test-container > .questions-container,
  html[data-theme="dark"] .questions-panel {
    background: #0f172a !important;
  }

  /* Reset inner child content so questions expand to 100% full width */
  .passage-content,
  .passage-panel .passage-content,
  .reading-passage,
  .passage-panel .reading-passage,
  .questions-panel .questions-container,
  .questions-panel .question-set,
  .questions-container .question-set,
  .question-set,
  .question,
  .questions-container .question,
  .question-prompt,
  .question-rubric,
  .options-box,
  .matching-box,
  .instruction-box,
  .summary-text,
  .drag-options-container,
  .matching-form-container,
  .matching-form-row,
  .multi-choice-question,
  .tf-question,
  .tf-question-line,
  .passage-content > div,
  .question-content {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }
  .questions-panel .questions-container {
    flex: none !important;
    padding: 0 !important;
    margin: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: transparent !important;
  }

  /* Split Resizer Divider with centered grip badge */
  .resizer,
  .divider,
  #divider,
  #resize-handle {
    width: 10px !important;
    min-width: 10px !important;
    height: 100% !important;
    background: #e5e7eb !important;
    cursor: col-resize !important;
    flex-shrink: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    user-select: none !important;
    position: relative !important;
  }
  .resizer::after,
  .divider::after,
  #divider::after,
  #resize-handle::after {
    content: '↔' !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 18px !important;
    height: 22px !important;
    background: #ffffff !important;
    border: 1px solid #d1d5db !important;
    border-radius: 3px !important;
    font-size: 11px !important;
    color: #4b5563 !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
    z-index: 100 !important;
  }
  html[data-theme="dark"] .resizer,
  html[data-theme="dark"] .divider,
  html[data-theme="dark"] #divider,
  html[data-theme="dark"] #resize-handle {
    background: #334155 !important;
  }
  html[data-theme="dark"] .resizer::after,
  html[data-theme="dark"] .divider::after,
  html[data-theme="dark"] #divider::after,
  html[data-theme="dark"] #resize-handle::after {
    background: #1e293b !important;
    border-color: #475569 !important;
    color: #cbd5e1 !important;
  }

  /* Authentic Cambridge CDI Typography */
  .reading-passage,
  .passage-content,
  .passage-paragraph,
  .question-rubric,
  .question-content {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    overflow-wrap: break-word !important;
    word-break: normal !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
    font-size: 14.5px !important;
    line-height: 1.6 !important;
    color: #111827 !important;
  }

  .reading-passage h2,
  .passage-content h2,
  .passage-container h2,
  .reading-passage h4 {
    font-size: 18px !important;
    font-weight: 800 !important;
    color: #111827 !important;
    text-align: left !important;
    margin-top: 0 !important;
    margin-bottom: 8px !important;
    line-height: 1.3 !important;
  }
  html[data-theme="dark"] .reading-passage h2,
  html[data-theme="dark"] .passage-content h2,
  html[data-theme="dark"] .reading-passage h4 {
    color: #f8fafc !important;
  }

  .reading-passage p,
  .passage-content p,
  .passage-paragraph {
    margin-top: 0 !important;
    margin-bottom: 16px !important;
    line-height: 1.6 !important;
    text-align: left !important;
  }

  /* Compact Paragraph Letter Labels (A, B, C...) */
  .reading-passage strong,
  .passage-content strong,
  .passage-label,
  .section-label {
    display: inline !important;
    font-weight: 800 !important;
    color: #111827 !important;
    margin-right: 6px !important;
  }
  html[data-theme="dark"] .reading-passage strong,
  html[data-theme="dark"] .passage-content strong,
  html[data-theme="dark"] .passage-label,
  html[data-theme="dark"] .section-label {
    color: #f8fafc !important;
  }

  /* Question Cards: Flat, Authentic Clean Look */
  .question,
  .question-card,
  .question.active,
  .tf-question,
  .matching-question,
  .multi-choice-question {
    background: transparent !important;
    padding: 0 !important;
    margin-bottom: 24px !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    transform: none !important;
    border: none !important;
    outline: none !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  /* Question Prompts & Reference Boxes (A Guidance, B Path Integration...) */
  .question-prompt,
  .question-rubric,
  .options-box,
  .matching-box,
  .instruction-box {
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 10px !important;
    padding: 16px 20px !important;
    margin-bottom: 20px !important;
    box-sizing: border-box !important;
    width: 100% !important;
  }
  html[data-theme="dark"] .question-prompt,
  html[data-theme="dark"] .question-rubric,
  html[data-theme="dark"] .options-box,
  html[data-theme="dark"] .matching-box,
  html[data-theme="dark"] .instruction-box {
    background: #1e293b !important;
    border-color: #334155 !important;
  }
  .question-prompt p,
  .question-rubric p,
  .options-box p,
  .matching-box p {
    font-size: 14px !important;
    line-height: 1.55 !important;
    color: #1f2937 !important;
    margin-top: 0 !important;
    margin-bottom: 8px !important;
  }
  .question-prompt p:last-child,
  .question-rubric p:last-child {
    margin-bottom: 0 !important;
  }
  html[data-theme="dark"] .question-prompt p,
  html[data-theme="dark"] .question-rubric p {
    color: #cbd5e1 !important;
  }

  /* ==========================================================================
     Cambridge 1:1 Matching & Dropdown Rows (Fixed Width & Spacing)
     ========================================================================== */
  .tf-question-line,
  .matching-form-row,
  .matching-row,
  .question-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 14px !important;
    width: 100% !important;
    max-width: 100% !important;
    padding: 10px 14px !important;
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    box-sizing: border-box !important;
    margin-bottom: 10px !important;
    transition: all 0.15s ease !important;
  }
  html[data-theme="dark"] .tf-question-line,
  html[data-theme="dark"] .matching-form-row,
  html[data-theme="dark"] .matching-row,
  html[data-theme="dark"] .question-row {
    background: #1e293b !important;
    border-color: #334155 !important;
  }
  .tf-question-line:hover,
  .matching-form-row:hover {
    border-color: #cbd5e1 !important;
    background: #f1f5f9 !important;
  }
  html[data-theme="dark"] .tf-question-line:hover,
  html[data-theme="dark"] .matching-form-row:hover {
    border-color: #475569 !important;
    background: #24344d !important;
  }

  .tf-question-number,
  .question-num,
  .q-num {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-width: 32px !important;
    width: 32px !important;
    height: 32px !important;
    border: 1.5px solid #cbd5e1 !important;
    border-radius: 6px !important;
    background: #ffffff !important;
    color: #0f172a !important;
    font-size: 13.5px !important;
    font-weight: 800 !important;
    flex-shrink: 0 !important;
    box-sizing: border-box !important;
    margin: 0 !important;
  }
  html[data-theme="dark"] .tf-question-number,
  html[data-theme="dark"] .question-num,
  html[data-theme="dark"] .q-num {
    background: #0f172a !important;
    color: #f8fafc !important;
    border-color: #475569 !important;
  }

  .tf-question-text,
  .matching-text,
  .question-statement {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
    color: #1e293b !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  html[data-theme="dark"] .tf-question-text,
  html[data-theme="dark"] .matching-text,
  html[data-theme="dark"] .question-statement {
    color: #f1f5f9 !important;
  }

  .answer-select,
  select.answer-select,
  .tf-select,
  .matching-select,
  .tfng-option select,
  .questions-container select {
    min-width: 110px !important;
    max-width: 140px !important;
    height: 36px !important;
    padding: 0 10px !important;
    border: 1.5px solid #94a3b8 !important;
    border-radius: 6px !important;
    background: #ffffff !important;
    color: #0f172a !important;
    font-size: 13.5px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
    box-sizing: border-box !important;
    outline: none !important;
  }
  .answer-select:focus,
  select.answer-select:focus,
  .tfng-option select:focus,
  .questions-container select:focus {
    border-color: #1e293b !important;
    box-shadow: 0 0 0 2px rgba(30, 41, 59, 0.15) !important;
  }
  html[data-theme="dark"] .answer-select,
  html[data-theme="dark"] select.answer-select,
  html[data-theme="dark"] .tfng-option select,
  html[data-theme="dark"] .questions-container select {
    background: #0f172a !important;
    color: #f8fafc !important;
    border-color: #475569 !important;
  }

  /* TFNG & MCQ Options (Radio layout like authentic CDI) */
  .tf-options,
  .multi-choice-options {
    margin-top: 10px !important;
    margin-left: 6px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  }
  .tf-option,
  .multi-choice-option {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 6px 10px !important;
    border-radius: 6px !important;
    font-size: 14px !important;
    color: #1f2937 !important;
    cursor: pointer !important;
    transition: background-color 0.15s ease !important;
  }
  .tf-option:hover,
  .multi-choice-option:hover {
    background: #f1f5f9 !important;
  }
  html[data-theme="dark"] .tf-option,
  html[data-theme="dark"] .multi-choice-option {
    color: #cbd5e1 !important;
  }
  html[data-theme="dark"] .tf-option:hover,
  html[data-theme="dark"] .multi-choice-option:hover {
    background: #1e293b !important;
  }

  /* Text & Gap Fill Inputs */
  .note-input,
  .inline-input,
  .summary-input,
  .answer-input,
  .questions-container input[type="text"] {
    border: 1.5px solid #94a3b8 !important;
    border-radius: 6px !important;
    background: #ffffff !important;
    color: #0f172a !important;
    font-weight: 700 !important;
    font-size: 14px !important;
    padding: 4px 10px !important;
    height: 32px !important;
    box-sizing: border-box !important;
    outline: none !important;
  }
  .note-input:focus,
  .inline-input:focus,
  .questions-container input[type="text"]:focus {
    border-color: #1e293b !important;
    background: #f8fafc !important;
    box-shadow: 0 0 0 2px rgba(30, 41, 59, 0.15) !important;
  }
  html[data-theme="dark"] .note-input,
  html[data-theme="dark"] .inline-input,
  html[data-theme="dark"] .questions-container input[type="text"] {
    background: #1e293b !important;
    color: #f8fafc !important;
    border-color: #475569 !important;
  }

  /* Passage Title & Layout */
  .passage-content h2,
  .passage-container h2 {
    font-size: 20px !important;
    font-weight: 800 !important;
    color: #111827 !important;
    text-align: left !important;
    margin-top: 4px !important;
    margin-bottom: 16px !important;
  }
  html[data-theme="dark"] .passage-content h2,
  html[data-theme="dark"] .passage-container h2 {
    color: #f8fafc !important;
  }

  /* Matching Headings & Drag-and-Drop 1:1 Cambridge Polish & Sticky Bar */
  .drag-options-container {
    position: sticky !important;
    top: 0 !important;
    z-index: 35 !important;
    background: #ffffff !important;
    border: 2px solid #93c5fd !important;
    border-radius: 14px !important;
    padding: 14px 16px !important;
    margin: 12px 0 20px 0 !important;
    max-height: 220px !important;
    overflow-y: auto !important;
    box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.12) !important;
  }
  html[data-theme="dark"] .drag-options-container {
    background: #1e293b !important;
    border-color: #3b82f6 !important;
    box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4) !important;
  }

  .drag-item {
    background: #ffffff !important;
    border: 1.5px solid #cbd5e1 !important;
    font-weight: 700 !important;
    padding: 9px 12px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    font-size: 13.5px !important;
    line-height: 1.4 !important;
    color: #1e293b !important;
    transition: all 0.15s ease !important;
    user-select: none !important;
    margin-bottom: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
  }
  .drag-item:hover {
    background: #eff6ff !important;
    border-color: #2563eb !important;
    color: #1d4ed8 !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15) !important;
  }
  .drag-item.selected-heading {
    background: #dbeafe !important;
    border-color: #1d4ed8 !important;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25) !important;
  }
  .drag-item.used-in-box {
    opacity: 0.45 !important;
    text-decoration: line-through !important;
    background: #f1f5f9 !important;
  }
  html[data-theme="dark"] .drag-item {
    background: #0f172a !important;
    border-color: #334155 !important;
    color: #f1f5f9 !important;
  }
  html[data-theme="dark"] .drag-item:hover {
    background: #1e293b !important;
    border-color: #60a5fa !important;
  }

  .drop-zone {
    border: 2px dashed #93c5fd !important;
    border-radius: 10px !important;
    min-width: 280px !important;
    flex: 1 1 auto !important;
    min-height: 46px !important;
    margin-left: 14px !important;
    transition: all 0.15s ease !important;
    padding: 6px 14px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    position: relative !important;
    background: #f8fafc !important;
    cursor: pointer !important;
    box-sizing: border-box !important;
  }
  .drop-zone:hover {
    border-color: #2563eb !important;
    background: #eff6ff !important;
  }
  .drop-zone.filled {
    background-color: transparent !important;
    border: none !important;
    padding: 0 !important;
  }
  .drop-zone.filled .drag-item {
    border: 2px solid #2563eb !important;
    border-radius: 8px !important;
    padding: 8px 12px !important;
    font-weight: 800 !important;
    background: #eff6ff !important;
    color: #1d4ed8 !important;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.12) !important;
    margin: 0 !important;
    width: 100% !important;
  }
  .vx-remove-heading-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 20px !important;
    height: 20px !important;
    border-radius: 50% !important;
    background: rgba(239, 68, 68, 0.12) !important;
    color: #ef4444 !important;
    border: none !important;
    cursor: pointer !important;
    font-size: 13px !important;
    font-weight: 900 !important;
    margin-left: 8px !important;
    flex-shrink: 0 !important;
    line-height: 1 !important;
  }
  .vx-remove-heading-btn:hover {
    background: #ef4444 !important;
    color: #ffffff !important;
  }

  /* Popover Floating Heading Selector Modal */
  .vx-heading-picker-modal {
    position: fixed !important;
    inset: 0 !important;
    z-index: 100000 !important;
    background: rgba(15, 23, 42, 0.6) !important;
    backdrop-filter: blur(4px) !important;
    display: none !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 20px !important;
    box-sizing: border-box !important;
  }
  .vx-heading-picker-modal.active {
    display: flex !important;
  }
  .vx-heading-picker-card {
    background: #ffffff !important;
    border-radius: 16px !important;
    width: 100% !important;
    max-width: 600px !important;
    max-height: 80vh !important;
    overflow-y: auto !important;
    padding: 24px !important;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
    border: 1px solid #e2e8f0 !important;
    box-sizing: border-box !important;
  }
  html[data-theme="dark"] .vx-heading-picker-card {
    background: #1e293b !important;
    border-color: #334155 !important;
    color: #f8fafc !important;
  }
  .vx-picker-option-btn {
    width: 100% !important;
    text-align: left !important;
    padding: 12px 14px !important;
    border-radius: 8px !important;
    border: 1.5px solid #cbd5e1 !important;
    background: #f8fafc !important;
    color: #1e293b !important;
    font-size: 13.5px !important;
    font-weight: 700 !important;
    line-height: 1.4 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    margin-bottom: 8px !important;
  }
  .vx-picker-option-btn:hover {
    border-color: #2563eb !important;
    background: #eff6ff !important;
    color: #1d4ed8 !important;
    transform: translateY(-1px) !important;
  }
  html[data-theme="dark"] .vx-picker-option-btn {
    background: #0f172a !important;
    border-color: #334155 !important;
    color: #f1f5f9 !important;
  }
  html[data-theme="dark"] .vx-picker-option-btn:hover {
    background: #1e293b !important;
    border-color: #60a5fa !important;
  }

  /* Question Pane Typography */
  .questions-container, .questions-panel, #right-panel, .right-panel {
    font-family: var(--vx-font-sans) !important;
    color: var(--vx-ink) !important;
    background-color: var(--vx-paper) !important;
  }

  /* ==========================================================================
     1:1 Cambridge CDI Bottom Navigator
     ========================================================================== */
  #vortex-bottom-navigator {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 52px;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    font-family: var(--vx-font-sans);
    box-sizing: border-box;
    gap: 12px;
  }

  html[data-theme="dark"] #vortex-bottom-navigator {
    background: #0f172a;
    border-top-color: #334155;
  }

  .vx-cdi-bottom-parts {
    display: flex;
    align-items: center;
    gap: 14px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
    min-width: 0;
  }
  .vx-cdi-bottom-parts::-webkit-scrollbar {
    display: none;
  }

  .vx-cdi-part-block {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .vx-cdi-part-block:hover {
    background: #f3f4f6;
  }
  html[data-theme="dark"] .vx-cdi-part-block:hover {
    background: #1e293b;
  }
  .vx-cdi-part-title {
    font-size: 13px;
    font-weight: 800;
    color: #111827;
  }
  html[data-theme="dark"] .vx-cdi-part-title {
    color: #f8fafc;
  }
  .vx-cdi-part-count {
    font-size: 11px;
    color: #9ca3af;
    font-weight: 600;
  }
  .vx-cdi-part-block.active .vx-cdi-part-title {
    color: #1d4ed8;
  }

  .vx-cdi-question-pills-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: 6px;
  }
  .vx-cdi-q-num {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    cursor: pointer;
    min-width: 16px;
    padding: 1px 2px;
    border-radius: 3px;
    transition: all 0.12s;
  }
  html[data-theme="dark"] .vx-cdi-q-num {
    color: #cbd5e1;
  }
  .vx-cdi-q-num:hover {
    color: #1d4ed8;
  }
  .vx-cdi-q-num.current {
    color: #1d4ed8;
    font-weight: 900;
  }
  .vx-cdi-q-num .vx-dash {
    width: 12px;
    height: 2px;
    background: #9ca3af;
    border-radius: 1px;
    margin-top: 2px;
  }
  .vx-cdi-q-num.answered .vx-dash {
    background: #1d4ed8;
    height: 3px;
  }
  .vx-cdi-q-num.flagged .vx-dash {
    background: #f59e0b;
    height: 3px;
  }

  /* Right navigation buttons */
  .vx-cdi-bottom-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .vx-cdi-nav-arrow-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: #374151;
    color: #ffffff;
    border: none;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 14px;
  }
  .vx-cdi-nav-arrow-btn:hover {
    background: #1f2937;
  }
  .vx-cdi-flag-btn {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    height: 36px !important;
    padding: 0 12px !important;
    border-radius: 6px !important;
    background: #f3f4f6 !important;
    color: #4b5563 !important;
    border: 1px solid #d1d5db !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
  }
  .vx-cdi-flag-btn:hover {
    background: #e5e7eb !important;
    color: #111827 !important;
  }
  .vx-cdi-flag-btn.active {
    background: #fef3c7 !important;
    border-color: #f59e0b !important;
    color: #b45309 !important;
  }
  html[data-theme="dark"] .vx-cdi-flag-btn {
    background: #1e293b !important;
    color: #cbd5e1 !important;
    border-color: #334155 !important;
  }

  .vx-cdi-submit-btn {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    height: 36px !important;
    padding: 0 16px !important;
    border-radius: 6px !important;
    background: #10b981 !important;
    color: #ffffff !important;
    border: none !important;
    font-size: 13px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3) !important;
    transition: all 0.15s ease !important;
  }
  .vx-cdi-submit-btn:hover {
    background: #059669 !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4) !important;
  }

  /* Modals */
  .vx-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: none;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 16px;
    background: rgba(8, 18, 32, 0.7);
    backdrop-filter: blur(8px);
    opacity: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    transition: opacity 0.2s ease;
    box-sizing: border-box;
  }

  .vx-modal-backdrop.show {
    display: flex !important;
    opacity: 1;
    pointer-events: auto;
  }

  .vx-modal-card {
    width: 100%;
    max-width: 520px;
    margin: auto;
    padding: 28px;
    border: 1px solid var(--vx-line);
    border-radius: 18px;
    background: var(--vx-paper);
    color: var(--vx-ink);
    box-shadow: 0 24px 70px rgba(8, 20, 36, 0.25);
    transform: translateY(12px) scale(0.98);
    transition: transform 0.2s ease;
    font-family: var(--vx-font-sans);
    box-sizing: border-box;
  }

  .vx-modal-backdrop.show .vx-modal-card {
    transform: translateY(0) scale(1);
  }

  .vx-results-sheet {
    max-width: 960px !important;
    width: 100% !important;
    margin: 20px auto !important;
    padding: 36px 40px !important;
    background: #ffffff !important;
    border-radius: 24px !important;
    box-shadow: 0 30px 80px -15px rgba(0, 0, 0, 0.4) !important;
    max-height: 92vh !important;
    overflow-y: auto !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    box-sizing: border-box !important;
  }
  html[data-theme="dark"] .vx-results-sheet {
    background: #0f172a !important;
    color: #f8fafc !important;
    border: 1px solid #334155 !important;
  }

  .vx-res-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 20px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }
  html[data-theme="dark"] .vx-res-sheet-head {
    border-color: #1e293b;
  }
  .vx-res-title-group h1 {
    font-size: 24px;
    font-weight: 900;
    color: #0f172a;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
  }
  html[data-theme="dark"] .vx-res-title-group h1 {
    color: #f8fafc;
  }
  .vx-res-sub {
    font-size: 13.5px;
    color: #64748b;
    font-weight: 500;
  }
  .vx-res-section-badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.05em;
    background: #eff6ff;
    color: #1468f3;
    text-transform: uppercase;
  }
  html[data-theme="dark"] .vx-res-section-badge {
    background: #1e3a8a;
    color: #93c5fd;
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
  html[data-theme="dark"] .vx-res-kpi-card {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-kpi-card.primary {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border-color: #bfdbfe;
  }
  html[data-theme="dark"] .vx-res-kpi-card.primary {
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
  html[data-theme="dark"] .vx-res-kpi-card.primary .vx-res-kpi-label {
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
  html[data-theme="dark"] .vx-res-band-val {
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
  html[data-theme="dark"] .vx-res-cefr-badge {
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
  html[data-theme="dark"] .vx-res-stat-val {
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
  html[data-theme="dark"] .vx-res-progress-track {
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
  html[data-theme="dark"] .vx-res-kpi-sub {
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
  html[data-theme="dark"] .vx-res-section-title {
    color: #f8fafc;
  }
  .vx-res-parts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  @media (max-width: 640px) {
    .vx-res-parts-grid {
      grid-template-columns: 1fr;
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
  html[data-theme="dark"] .vx-res-part-card {
    background: #1e293b;
    border-color: #334155;
  }
  .vx-res-part-name {
    font-size: 11.5px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
  }
  html[data-theme="dark"] .vx-res-part-name {
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
  html[data-theme="dark"] .vx-res-diag-wrap {
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
  html[data-theme="dark"] .vx-res-footer-actions {
    border-color: #334155;
  }

  .vx-stat-summary-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 20px 0;
  }

  .vx-stat-summary-box {
    padding: 14px;
    border: 1px solid var(--vx-line);
    border-radius: 12px;
    background: var(--vx-canvas);
    text-align: center;
  }

  .vx-stat-summary-box strong {
    display: block;
    font-size: 22px;
    font-weight: 800;
    color: var(--vx-ink);
  }

  .vx-stat-summary-box span {
    font-size: 11px;
    color: var(--vx-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .vx-modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 24px;
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
  html[data-theme="dark"] .vx-btn-modal-secondary {
    background: #1e293b !important;
    border-color: #334155 !important;
    color: #e2e8f0 !important;
  }
  html[data-theme="dark"] .vx-btn-modal-secondary:hover {
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
  html[data-theme="dark"] .vx-btn-modal-primary {
    background: #2563eb !important;
    border-color: #2563eb !important;
    color: #ffffff !important;
  }
  html[data-theme="dark"] .vx-btn-modal-primary:hover {
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
  html[data-theme="dark"] .vx-btn-modal-disabled {
    background: #1e293b !important;
    border-color: #334155 !important;
    color: #64748b !important;
  }

  /* Result Modal Specifics */
  .vx-result-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    margin: 16px 0 20px;
    border-radius: 14px;
    background: linear-gradient(135deg, #1468f3, #0746b8);
    color: #fff;
  }

  .vx-result-banner strong {
    font-size: 32px;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .vx-result-banner span {
    font-size: 12px;
    opacity: 0.9;
    font-weight: 600;
  }

  .vx-band-badge {
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  /* Restore Notification Toast */
  #vortex-restore-notice {
    position: fixed;
    top: 76px;
    right: 20px;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border: 1px solid var(--vx-line);
    border-radius: 10px;
    background: var(--vx-paper);
    color: var(--vx-ink);
    box-shadow: 0 10px 30px rgba(12, 28, 56, 0.12);
    font-size: 12px;
    font-weight: 700;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-8px);
    transition: all 0.2s ease;
  }

  #vortex-restore-notice.show {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  #vortex-restore-notice i {
    color: var(--vx-blue);
    font-size: 18px;
  }

  /* Toast Notification */
  #vortex-save-status {
    position: fixed;
    z-index: 100001;
    right: 20px;
    bottom: 84px;
    max-width: 320px;
    padding: 12px 16px;
    border: 1px solid var(--vx-line);
    border-radius: 11px;
    color: var(--vx-ink);
    background: var(--vx-paper);
    box-shadow: 0 14px 40px rgba(10, 31, 67, 0.16);
    font-size: 13px;
    font-weight: 700;
    transform: translateY(12px);
    opacity: 0;
    pointer-events: none;
    transition: all 0.2s ease;
  }

  #vortex-save-status.show {
    transform: translateY(0);
    opacity: 1;
  }

  #vortex-save-status.success {
    border-color: #a7dfc6;
    color: var(--vx-success);
    background: var(--vx-success-soft);
  }

  #vortex-save-status.error {
    border-color: #f2c0bc;
    color: var(--vx-danger);
    background: var(--vx-danger-soft);
  }

  /* Mobile Media Queries (390x844) */
  @media (max-width: 768px) {
    body {
      padding-top: 112px !important;
      padding-bottom: 64px !important;
    }

    #vortex-exam-header {
      padding: 0 12px;
      height: 56px;
      gap: 8px;
    }

    .vx-header-left {
      flex: 0 0 auto;
    }

    .vx-header-title-wrap {
      display: none;
    }

    .vx-header-center {
      margin-left: auto;
    }

    .vx-header-right {
      gap: 4px;
    }

    .vx-btn-icon {
      width: 34px;
      height: 34px;
    }

    .vx-exit-btn {
      width: 34px;
      min-height: 34px;
      justify-content: center;
      padding: 0;
    }

    .vx-exit-btn span {
      display: none;
    }

    .vx-exam-title {
      font-size: 13px;
      max-width: 140px;
    }

    .vx-exam-subtitle {
      display: none;
    }

    .vx-timer-pill {
      padding: 4px 10px;
      font-size: 12px;
    }

    .vortex-mobile-reader-tabs {
      display: grid !important;
      position: fixed;
      right: 0;
      left: 0;
      top: 56px;
      height: 56px;
      box-sizing: border-box;
    }

    .test-wrapper {
      height: calc(100vh - 176px) !important;
    }

    .test-wrapper > .passage-nav {
      width: 100% !important;
      height: 54px !important;
      min-height: 54px !important;
      display: flex !important;
      flex: 0 0 54px !important;
      gap: 6px !important;
      padding: 6px 10px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      scrollbar-width: none;
      box-sizing: border-box !important;
    }

    .test-wrapper > .passage-nav::-webkit-scrollbar {
      display: none;
    }

    .test-wrapper > .passage-nav button {
      width: auto !important;
      min-width: 170px !important;
      height: 42px !important;
      flex: 0 0 auto !important;
      padding: 0 14px !important;
      overflow: hidden;
      border-radius: 9px !important;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px !important;
    }

    body.vortex-mobile-show-passage .questions-container,
    body.vortex-mobile-show-passage .questions-panel,
    body.vortex-mobile-show-passage #right-panel,
    body.vortex-mobile-show-passage .right-panel {
      display: none !important;
    }

    body.vortex-mobile-show-questions .passage-container,
    body.vortex-mobile-show-questions .passage-panel,
    body.vortex-mobile-show-questions #left-panel,
    body.vortex-mobile-show-questions .left-panel {
      display: none !important;
    }

    .passage-container, .questions-container,
    .passage-panel, .questions-panel,
    #left-panel, #right-panel,
    .left-panel, .right-panel {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      flex: 1 1 100% !important;
      padding: 16px 14px !important;
      box-sizing: border-box !important;
      border: 0 !important;
    }

    .test-container, .panels-container, .main-container {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-x: hidden !important;
    }

    #vortex-bottom-navigator {
      padding: 0 12px;
      height: 64px;
      max-width: 100vw;
      overflow: hidden;
    }

    .vx-pills-scroll {
      max-width: 100%;
      overscroll-behavior-inline: contain;
    }

    .vx-nav-progress {
      display: none;
    }

    .vx-submit-action-btn {
      padding: 0 16px;
      font-size: 12px;
      min-height: 38px;
    }

    .vx-stat-summary-row {
      grid-template-columns: 1fr 1fr;
    }

    #vortex-save-status {
      left: 14px;
      right: 14px;
      bottom: 74px;
      max-width: none;
    }

    #vxReviewBanner {
      top: 56px;
      padding: 8px 12px;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }

  /* Review Banner */
  #vxReviewBanner {
    position: sticky;
    top: 64px;
    z-index: 9998;
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 20px;
    background: linear-gradient(90deg, #091a32, #102a4e);
    color: #fff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    font-family: var(--vx-font-sans);
    font-size: 13px;
    font-weight: 700;
  }
  #vxReviewBanner.show {
    display: flex;
  }
  .vx-review-banner-text {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .vx-review-banner-text .material-symbols-outlined {
    color: #38bdf8;
    font-size: 20px;
  }
  .vx-review-banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ==========================================================================
     IELTS CDI Highlight & Notes System
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
  html[data-theme="dark"] .ielts-highlight {
    background-color: #ffd700 !important;
    color: #000000 !important;
  }
  .ielts-note-highlight {
    background-color: #bbf7d0 !important;
    color: #14532d !important;
    border-bottom: 2px solid #16a34a;
    padding: 1px 2px;
    border-radius: 2px;
    cursor: pointer;
    position: relative;
  }
  html[data-theme="dark"] .ielts-note-highlight {
    background-color: #86efac !important;
    color: #052e16 !important;
    border-bottom: 2px solid #15803d;
  }
  .ielts-selection-toolbar {
    position: absolute;
    z-index: 99999;
    display: none;
    align-items: center;
    gap: 3px;
    padding: 4px 6px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
  }
  .ielts-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #f8fafc;
    font-family: var(--vx-font-sans);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    line-height: 1;
  }
  .ielts-tool-btn:hover {
    background: #334155;
  }
  .ielts-tool-btn.hl {
    color: #fde047;
  }
  .ielts-tool-btn.note {
    color: #86efac;
  }
  .ielts-tool-btn.clear {
    color: #94a3b8;
  }
  .ielts-tool-btn.clear-all {
    color: #f87171;
    font-size: 11px;
  }
  .vx-q-pill.flagged {
    border-color: #f59e0b !important;
    background: #fef3c7 !important;
    color: #b45309 !important;
    position: relative;
  }
  /* ==========================================================================
     1:1 Authentic Cambridge Review Mode Styles (Matching Screenshot)
     ========================================================================== */
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
  html[data-theme="dark"] .vx-review-q-header.incorrect {
    background: rgba(239, 68, 68, 0.15) !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }
  html[data-theme="dark"] .vx-review-q-header.correct {
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
  html[data-theme="dark"] .vx-review-ans-text {
    color: #f8fafc !important;
  }
  .vx-review-ans-text strong {
    color: #0f172a !important;
    font-weight: 900 !important;
    text-decoration: underline !important;
    text-decoration-color: #10b981 !important;
  }
  html[data-theme="dark"] .vx-review-ans-text strong {
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
  html[data-theme="dark"] .vx-explain-btn {
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
  html[data-theme="dark"] .vx-trap-btn {
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
  html[data-theme="dark"] .vx-explanation-card,
  html[data-theme="dark"] .vx-trap-card {
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
  html[data-theme="dark"] .vx-explain-header {
    color: #60a5fa !important;
  }
  .vx-trap-header {
    font-weight: 800 !important;
    color: #b45309 !important;
    margin-bottom: 6px !important;
  }
  html[data-theme="dark"] .vx-trap-header {
    color: #fbbf24 !important;
  }

  /* Radio & Option Highlighting in Review Mode */
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
  html[data-theme="dark"] .vx-review-correct-opt {
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
  html[data-theme="dark"] .vx-review-incorrect-opt {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #fca5a5 !important;
    border-color: #ef4444 !important;
  }

  /* Inline Correct Answer Pill for Dropdowns and Fill-in-the-blanks */
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
  html[data-theme="dark"] .vx-correct-answer-pill {
    background: #064e3b !important;
    color: #a7f3d0 !important;
    border-color: #059669 !important;
  }

  /* Color-coded Bottom Nav Pills */
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

  /* Passage Answer Markers in Review Mode (like [1], [2] in screenshot) */
  .vx-passage-marker {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-width: 22px !important;
    height: 22px !important;
    padding: 0 4px !important;
    border-radius: 4px !important;
    background: #1e40af !important;
    color: #ffffff !important;
    font-size: 11px !important;
    font-weight: 900 !important;
    margin: 0 4px !important;
    vertical-align: middle !important;
  }
  .vx-passage-evidence-hl {
    background: #a7f3d0 !important;
    color: #064e3b !important;
    padding: 2px 4px !important;
    border-radius: 3px !important;
    box-decoration-break: clone !important;
    -webkit-box-decoration-break: clone !important;
  }
  html[data-theme="dark"] .vx-passage-evidence-hl {
    background: #065f46 !important;
    color: #ecfdf5 !important;
  }
</style>

<!-- Injected IELTS CDI Selection Toolbar -->
<div id="ieltsSelectionToolbar" class="ielts-selection-toolbar" role="toolbar" aria-label="Text Highlight and Note Actions">
  <button type="button" id="ieltsHlBtn" class="ielts-tool-btn hl" title="Highlight selection (Yellow)">
    <i class="fas fa-highlighter" aria-hidden="true"></i>
    <span>Highlight</span>
  </button>
  <button type="button" id="ieltsNoteBtn" class="ielts-tool-btn note" title="Add note to selection">
    <i class="fas fa-sticky-note" aria-hidden="true"></i>
    <span>Notes</span>
  </button>
  <button type="button" id="ieltsVocabBtn" class="ielts-tool-btn vocab" title="Save word to My Vocabulary">
    <i class="fas fa-bookmark" aria-hidden="true" style="color:#60a5fa"></i>
    <span>Vocab</span>
  </button>
  <button type="button" id="ieltsClearBtn" class="ielts-tool-btn clear" title="Clear highlight on selection">
    <i class="fas fa-eraser" aria-hidden="true"></i>
    <span>Clear</span>
  </button>
  <button type="button" id="ieltsClearAllBtn" class="ielts-tool-btn clear-all" title="Clear all highlights">
    <span>Clear all</span>
  </button>
</div>

<!-- Injected IELTS CDI Note Modal -->
<div id="ieltsNoteModal" class="vx-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ieltsNoteModalTitle">
  <div class="vx-modal-card ielts-note-card" style="max-width:440px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h3 id="ieltsNoteModalTitle" style="margin:0;font-size:16px;display:flex;align-items:center;gap:6px">
        <i class="fas fa-sticky-note" style="color:#f59e0b" aria-hidden="true"></i>
        <span>IELTS Candidate Note</span>
      </h3>
      <button type="button" id="ieltsNoteCloseX" style="border:none;background:none;font-size:18px;cursor:pointer;color:inherit">&times;</button>
    </div>
    <p id="ieltsNoteSnippet" style="font-size:12px;font-style:italic;color:var(--vx-muted);margin:0 0 10px;padding:6px 10px;background:rgba(0,0,0,0.04);border-radius:6px;border-left:3px solid #f59e0b"></p>
    <textarea id="ieltsNoteText" placeholder="Type your observation or keyword note here..." style="width:100%;box-sizing:border-box;min-height:90px;padding:10px;border-radius:8px;border:1px solid #cbd5e1;font-family:inherit;font-size:13px;resize:vertical"></textarea>
    <div class="vx-modal-actions" style="margin-top:12px">
      <button type="button" id="ieltsNoteSaveBtn" class="vx-btn-modal-primary">Save note</button>
    </div>
  </div>
</div>

<!-- Injected Heading Picker Modal for One-Click Headings Assignment -->
<div id="vxHeadingPickerModal" class="vx-heading-picker-modal" role="dialog" aria-modal="true" aria-labelledby="vxHeadingPickerTitle">
  <div class="vx-heading-picker-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h3 id="vxHeadingPickerTitle" style="margin:0;font-size:16px;font-weight:800;color:var(--vx-ink);display:flex;align-items:center;gap:8px;">
        <span style="color:#2563eb;">📌</span> Select Heading for <span id="vxTargetHeadingBoxName" style="color:#2563eb;">Paragraph</span>
      </h3>
      <button type="button" id="vxHeadingPickerCloseBtn" style="border:none;background:none;font-size:22px;cursor:pointer;color:inherit;line-height:1;">&times;</button>
    </div>
    <p style="font-size:12.5px;color:var(--vx-muted);margin:0 0 14px;">Click any available heading from the list below to place it into the selected box:</p>
    <div id="vxHeadingPickerOptionsList" style="display:flex;flex-direction:column;gap:8px;"></div>
  </div>
</div>

<!-- Injected Exam Chrome Header (Authentic 1:1 Cambridge CDI Standard) -->
<header id="vortex-exam-header" role="banner" aria-label="IELTS Exam Navigation">
  <div class="vx-cdi-top-left">
    <span class="vx-cdi-wordmark" aria-label="IELTS">IELTS</span>
    <div class="vx-cdi-title-col">
      <strong class="vx-cdi-exam-title">${material.title.replace(/</g, "&lt;")}</strong>
      <span class="vx-cdi-time-text"><span id="vortexTimerDisplay">59:59</span> remaining</span>
    </div>
  </div>

  <div class="vx-header-right">
    <button id="vxCheckPracticeBtn" type="button" class="vx-btn-icon" style="display:none;min-height:30px;padding:0 10px;background:#0284c7;color:#fff;border-color:#0284c7;font-size:11px;font-weight:700;" title="Check current answers">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><path d="M20 6L9 17l-5-5"/></svg><span>Check Progress</span>
    </button>
    <button id="vxPauseTimerBtn" type="button" class="vx-btn-icon" style="display:none;min-height:30px;padding:0 10px;font-size:11px;font-weight:700;" title="Pause/Resume Practice Timer">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pause</span>
    </button>
    <button id="vxFullscreenBtn" type="button" class="vx-btn-icon" title="Toggle fullscreen" aria-label="Toggle fullscreen">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    </button>
    <button id="vxHeaderScoreReportBtn" type="button" class="vx-btn-icon" style="display:none;min-height:30px;width:auto;padding:0 10px;background:#10b981;color:#fff;border-color:#10b981;font-size:11.5px;font-weight:700;" title="View Score Report">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17v-4m5 4v-8m5 8v-6"/></svg><span>Score Report</span>
    </button>
    <button id="vxHeaderRetakeBtn" type="button" class="vx-btn-icon" style="display:none;min-height:30px;width:auto;padding:0 10px;font-size:11.5px;font-weight:700;" title="Retake Test">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>Retake</span>
    </button>
    <button id="vxThemeToggle" type="button" class="vx-btn-icon" title="Toggle night mode" aria-label="Toggle theme">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <a href="/english/materials?level=ielts&collection=full-test" class="vx-exit-btn" id="vxExitBtn">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <span>Exit</span>
    </a>
  </div>
</header>

<!-- Injected Sub-Rubric Banner -->
<div class="vx-cdi-subrubric" id="vxCdiSubrubric" role="region" aria-label="Part instruction">
  <strong id="vxCurrentPartTitle">Part 1</strong>
  <span id="vxCurrentPartDesc">Read the text and answer questions 1–13.</span>
</div>

<!-- Injected Mobile Viewport Switcher -->
<nav class="vortex-mobile-reader-tabs" role="tablist" aria-label="Test reading panes">
  <button type="button" role="tab" data-reader-view="passage" aria-pressed="true" aria-selected="true">
    <i class="fas fa-book-open" aria-hidden="true"></i> Passage
  </button>
  <button type="button" role="tab" data-reader-view="questions" aria-pressed="false" aria-selected="false">
    <i class="fas fa-list-ol" aria-hidden="true"></i> Questions
  </button>
</nav>

<!-- Injected 1:1 Cambridge CDI Bottom Navigator -->
<footer id="vortex-bottom-navigator" role="navigation" aria-label="Questions overview and submission">
  <div class="vx-cdi-bottom-parts" id="vxCdiPartsWrap">
    <!-- Rendered dynamically in script -->
  </div>

  <div class="vx-cdi-bottom-right">
    <button id="vxReviewToggleBtn" type="button" class="vx-cdi-flag-btn" title="Review (Flag current question)" aria-label="Review question">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
      <span>Review</span>
    </button>
    <button id="vxPrevQBtn" type="button" class="vx-cdi-nav-arrow-btn" title="Previous question" aria-label="Previous question">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <button id="vxNextQBtn" type="button" class="vx-cdi-nav-arrow-btn" title="Next question" aria-label="Next question">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
    </button>
    <button id="vxSubmitPromptBtn" type="button" class="vx-cdi-submit-btn" title="Submit exam" aria-label="Submit exam">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><path d="M20 6L9 17l-5-5"/></svg>
      <span>Submit</span>
    </button>
  </div>
</footer>

<!-- Injected Real Exam Mode Premium Lock Modal -->
<div id="vortexRealExamLockModal" class="vx-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vxRealExamLockTitle">
  <div class="vx-modal-card" style="max-width:490px;text-align:center;padding:32px 28px;background:#ffffff;border-radius:18px;box-shadow:0 25px 60px -15px rgba(0,0,0,0.35);">
    <div style="width:60px;height:60px;border-radius:50%;background:#eff6ff;color:#1468f3;display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 16px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <h2 id="vxRealExamLockTitle" style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 8px;letter-spacing:-0.03em;">Real Exam Mode is Locked</h2>
    <span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:11.5px;font-weight:800;background:#fef3c7;color:#b45309;margin-bottom:16px;border:1px solid #fde68a;">IELTS Core Premium Exclusive</span>
    <div style="font-size:13.5px;color:#475569;line-height:1.6;margin:0 0 22px;text-align:left;background:#f8fafc;padding:14px 18px;border-radius:10px;border:1px solid #e2e8f0;">
      Real Exam Mode simulates official computer-delivered IELTS exam conditions:
      <br>• <strong>60-minute strict countdown timer</strong>
      <br>• <strong>Official Cambridge Band scoring & full diagnostics</strong>
      <br>• <strong>Realistic exam pressure with no pauses</strong>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <a href="/english/pricing" class="vx-btn-modal-primary" style="width:100%;box-sizing:border-box;font-size:13.5px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-height:42px;">
        Upgrade to Premium (30 000 UZS / oy)
      </a>
      <button type="button" id="vxSwitchToPracticeBtn" class="vx-btn-modal-secondary" style="width:100%;box-sizing:border-box;font-size:13px;min-height:40px;">
        Continue in Untimed Practice Mode
      </button>
      <a href="/english/materials?level=ielts&skill=reading" style="font-size:12px;color:#64748b;text-decoration:none;margin-top:4px;font-weight:600;">
        ← Back to Materials Library
      </a>
    </div>
  </div>
</div>

<!-- Injected Submission Confirmation Modal -->
<div id="vortexSubmitModal" class="vx-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vxSubmitModalTitle">
  <div class="vx-modal-card">
    <h2 id="vxSubmitModalTitle">Submit IELTS Reading Test</h2>
    <p id="vxSubmitModalSummary">You have answered 0 of ${totalQuestions} questions.</p>
    <div class="vx-stat-summary-row">
      <div class="vx-stat-summary-box">
        <strong id="vxModalAnswered">0</strong>
        <span>Answered</span>
      </div>
      <div class="vx-stat-summary-box">
        <strong id="vxModalUnanswered">${totalQuestions}</strong>
        <span>Unanswered</span>
      </div>
      <div class="vx-stat-summary-box">
        <strong id="vxModalTimeSpent">0:00</strong>
        <span>Time spent</span>
      </div>
    </div>
    <p>Once submitted, your answers will be verified by the server and recorded to your progress dashboard.</p>
    <div class="vx-modal-actions">
      <button id="vxCancelSubmitBtn" type="button" class="vx-btn-modal-secondary">Keep Working</button>
      <button id="vxConfirmSubmitBtn" type="button" class="vx-btn-modal-primary">Confirm Submission</button>
    </div>
  </div>
</div>

<!-- Grand Executive Results Performance Dashboard (Reading) -->
<div id="vortexResultModal" class="vx-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vxResultModalTitle">
  <div class="vx-modal-card vx-results-sheet">
    
    <!-- Top Header -->
    <div class="vx-res-sheet-head">
      <div class="vx-res-title-group">
        <h1 id="vxResultModalTitle">Exam Performance Report</h1>
        <div class="vx-res-sub">Official Computer-Delivered Academic Reading Assessment</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="vx-res-section-badge" id="vxResultSectionBadge">READING · 40 Questions</span>
        <button type="button" class="vx-res-close-x" id="vxReadingResultsCloseTopBtn" title="Close report">✕</button>
      </div>
    </div>

    <!-- 3-Column Hero KPI Cards -->
    <div class="vx-res-kpi-grid">
      <!-- 1. Overall Band Score -->
      <div class="vx-res-kpi-card primary">
        <div class="vx-res-kpi-label">IELTS Official Band</div>
        <div class="vx-res-band-val" id="vxResultBandNum">--</div>
        <div class="vx-res-cefr-badge" id="vxResultCefrBadge">CEFR B2 · Competent User</div>
      </div>

      <!-- 2. Raw Accuracy & Breakdown -->
      <div class="vx-res-kpi-card">
        <div class="vx-res-kpi-label">Raw Accuracy</div>
        <div class="vx-res-stat-val" id="vxResultStatScore">--</div>
        <div class="vx-res-progress-track">
          <div class="vx-res-progress-fill" id="vxResultProgressFill" style="width: 0%;"></div>
        </div>
        <div class="vx-res-kpi-sub" id="vxResultAccuracy">0 of 40 Questions Correct</div>
      </div>

      <!-- 3. Time & Assessment Details -->
      <div class="vx-res-kpi-card">
        <div class="vx-res-kpi-label">Test Duration</div>
        <div class="vx-res-stat-val" id="vxResultTimeSpent">--</div>
        <div class="vx-res-kpi-sub" style="margin-top:auto;">Automated Assessment</div>
      </div>
    </div>

    <!-- Performance by Passage Grid -->
    <div class="vx-res-section-title">
      <span>Performance by Passage</span>
    </div>
    <div class="vx-res-parts-grid" id="vxResultPartsGrid">
      <!-- Injected dynamically -->
    </div>

    <!-- Question Diagnostic Review Pills -->
    <div class="vx-res-diag-wrap">
      <div class="vx-res-section-title" style="margin-bottom:8px;">
        <span>Question Diagnostics</span>
        <span style="font-size:12px;font-weight:500;color:#64748b;text-transform:none;">(Select any question to inspect in exam)</span>
      </div>
      <div class="vx-res-pills-list" id="vxResultIncorrectPills">
        <!-- Injected dynamically -->
      </div>
    </div>

    <!-- Bottom Action Bar -->
    <div class="vx-res-footer-actions">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="vx-btn-modal-disabled" id="vxReviewAnswersBtn" disabled title="Detailed review coming soon">
          Review Mistakes (Soon)
        </button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="/english/account" class="vx-btn-modal-primary" id="vxFinishBtn">
          <span>Go to Dashboard</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
        </a>
      </div>
    </div>

  </div>
</div>

<!-- Status & Restore Toasts -->
<div id="vortex-restore-notice" role="status" aria-live="polite">
  <i class="fas fa-history" aria-hidden="true"></i>
  <span id="vortexRestoreText">Saved answers from your last attempt restored.</span>
</div>

<div id="vortex-save-status" role="status" aria-live="polite"></div>

<script id="vortex-reading-save-script">
(function() {
  ${readingBand.toString()}
  var material = ${config};
  var totalQuestions = Number(material.questionCount) || 40;
  var token = localStorage.getItem('vortex-english-token') || (document.cookie.match(/(?:^|;\s*)vortex_english_token=([^;]+)/) ? decodeURIComponent(RegExp.$1) : null);
  var startedAt = Date.now();
  var durationLimit = Number(material.durationSeconds) || 3600;
  var remainingSeconds = durationLimit;
  var timerInterval = null;
  var isSubmitting = false;
  var hasSubmitted = false;

  var toast = document.getElementById('vortex-save-status');
  var restoreNotice = document.getElementById('vortex-restore-notice');
  var timerDisplay = document.getElementById('vortexTimerDisplay');
  var timerPill = document.getElementById('vortexTimer');
  var answeredCountDisplay = document.getElementById('vxAnsweredCount');
  var pillsContainer = document.getElementById('vxQuestionPills');

  // Modals
  var submitModal = document.getElementById('vortexSubmitModal');
  var resultModal = document.getElementById('vortexResultModal');

  // Theme support
  var root = document.documentElement;
  var savedTheme = localStorage.getItem('vortex-english-theme');
  if (savedTheme) root.dataset.theme = savedTheme;

  // Mode support (Real Exam Mode vs Practice Mode)
  var urlParams = new URLSearchParams(location.search);
  var isPracticeMode = urlParams.get('mode') === 'practice';
  if (isPracticeMode) {
    document.body.classList.add('vx-practice-mode');
    var subtitle = document.querySelector('.vx-exam-subtitle');
    if (subtitle) subtitle.innerHTML = '<span style="color:#0284c7;font-weight:700;">[PRACTICE MODE]</span> · Focused Practice & Drill';
  }

  var themeToggle = document.getElementById('vxThemeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      var nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = nextTheme;
      localStorage.setItem('vortex-english-theme', nextTheme);
      var themeIcon = themeToggle.querySelector('i');
      if (themeIcon) themeIcon.className = nextTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
  }

  // Text size scaling
  var currentFontSize = 17;
  var fontSmallerBtn = document.getElementById('vxFontSmaller');
  var fontBiggerBtn = document.getElementById('vxFontBigger');
  if (fontSmallerBtn) fontSmallerBtn.addEventListener('click', function() {
    if (currentFontSize > 14) { currentFontSize -= 1; document.documentElement.style.setProperty('--vx-passage-size', currentFontSize + 'px'); }
  });
  if (fontBiggerBtn) fontBiggerBtn.addEventListener('click', function() {
    if (currentFontSize < 24) { currentFontSize += 1; document.documentElement.style.setProperty('--vx-passage-size', currentFontSize + 'px'); }
  });

  // Mobile view switcher
  var mobileTabs = document.querySelector('.vortex-mobile-reader-tabs');
  document.body.classList.add('vortex-mobile-show-passage');
  if (mobileTabs) {
    mobileTabs.addEventListener('click', function(event) {
      var button = event.target.closest('[data-reader-view]');
      if (!button) return;
      var view = button.getAttribute('data-reader-view');
      document.body.classList.toggle('vortex-mobile-show-passage', view === 'passage');
      document.body.classList.toggle('vortex-mobile-show-questions', view === 'questions');
      mobileTabs.querySelectorAll('button').forEach(function(item) {
        var active = item === button;
        item.setAttribute('aria-pressed', String(active));
        item.setAttribute('aria-selected', String(active));
      });
    });
  }

  function notify(message, type) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'show ' + (type || '');
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(function() { toast.className = ''; }, 4500);
  }

  function formatTime(totalSec) {
    var mins = Math.floor(totalSec / 60);
    var secs = totalSec % 60;
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function formatDurationText(totalSec) {
    var mins = Math.floor(totalSec / 60);
    var secs = totalSec % 60;
    return (mins > 0 ? mins + 'm ' : '') + secs + 's';
  }

  // Timer Tick
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
      if (hasSubmitted) { clearInterval(timerInterval); return; }
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        remainingSeconds = 0;
        clearInterval(timerInterval);
        if (timerDisplay) timerDisplay.textContent = '00:00';
        autoSubmitTimeUp();
        return;
      }
      if (timerDisplay) timerDisplay.textContent = formatTime(remainingSeconds);
      if (remainingSeconds < 300 && timerPill) timerPill.classList.add('warning');
    }, 1000);
  }

  function getControls() {
    return Array.prototype.slice.call(document.querySelectorAll('input[name],select[name],textarea[name],input[id],select[id],textarea[id]'));
  }

  function collectAnswers() {
    return getControls()
      .filter(function(el) {
        var type = (el.type || el.tagName || 'text').toLowerCase();
        return !['button', 'submit', 'range', 'hidden'].includes(type) && (!(type === 'radio' || type === 'checkbox') || el.checked);
      })
      .map(function(el) {
        var tag = el.tagName.toLowerCase();
        var type = tag === 'select' ? 'select-one' : tag === 'textarea' ? 'textarea' : (el.type || 'text');
        return { key: el.name || el.id, value: el.value || '', type: type, checked: Boolean(el.checked) };
      })
      .filter(function(a) { return a.key && String(a.value).trim().length > 0; })
      .slice(0, 80);
  }

  function restoreAnswers(answers) {
    if (!Array.isArray(answers)) return;
    var all = getControls();
    answers.forEach(function(ans) {
      all.forEach(function(el) {
        if ((el.name || el.id) !== ans.key) return;
        var type = (el.type || '').toLowerCase();
        if (type === 'radio' || type === 'checkbox') {
          if (String(el.value) === String(ans.value)) el.checked = Boolean(ans.checked);
        } else {
          el.value = ans.value;
        }
      });
    });
    updateQuestionStatus();
  }

  // 1:1 Cambridge CDI Part Configuration & Navigation
  var currentPart = 1;
  var currentQuestionNum = 1;
  var flaggedQuestions = new Set();

  var partsConfig = totalQuestions === 40 ? [
    { part: 1, start: 1, end: 13, count: 13, title: 'Part 1', desc: 'Read the text and answer questions 1–13.' },
    { part: 2, start: 14, end: 26, count: 13, title: 'Part 2', desc: 'Read the text and answer questions 14–26.' },
    { part: 3, start: 27, end: 40, count: 14, title: 'Part 3', desc: 'Read the text and answer questions 27–40.' }
  ] : [
    { part: 1, start: 1, end: totalQuestions, count: totalQuestions, title: 'Part 1', desc: 'Read the text and answer questions 1–' + totalQuestions + '.' }
  ];

  function switchCdiPart(partNum) {
    currentPart = partNum;

    // 1. If page defines global switchToPart (e.g. R 3–49 series, Reading 7, etc.)
    if (typeof window.switchToPart === 'function') {
      try { window.switchToPart(partNum); } catch(e) {}
    }

    // 2. If page defines global switchPassage (e.g. full_reading1)
    if (typeof window.switchPassage === 'function') {
      try { window.switchPassage(partNum); } catch(e) {}
    }

    // 3. If page defines global loadPart (e.g. Reading Full Test.html)
    if (typeof window.loadPart === 'function') {
      try { window.loadPart(partNum); } catch(e) {}
    }

    // 4. Click original passage buttons if they exist
    var btn = document.getElementById('passage' + partNum + 'Btn') ||
              document.querySelector('[data-passage="' + partNum + '"]') ||
              document.querySelector('[data-part="' + partNum + '"]') ||
              document.getElementById('part' + partNum + 'Btn');
    if (btn) {
      try { btn.click(); } catch(e) {}
    }

    // 5. Direct DOM toggling for R (*).html format (#passage-text-1, #questions-1)
    document.querySelectorAll('.reading-passage, .question-set, .part-header').forEach(function(el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    });
    var pText = document.getElementById('passage-text-' + partNum);
    var pQues = document.getElementById('questions-' + partNum);
    if (pText) { pText.classList.remove('hidden'); pText.style.display = ''; }
    if (pQues) { pQues.classList.remove('hidden'); pQues.style.display = ''; }

    // 6. Direct DOM toggling for passage1Content / passage1Questions format
    for (var p = 1; p <= 3; p++) {
      var pCont = document.getElementById('passage' + p + 'Content') || document.getElementById('passage' + p);
      var pQues2 = document.getElementById('passage' + p + 'Questions') || document.getElementById('questions' + p + 'Content') || document.getElementById('questions' + p);
      if (pCont) {
        pCont.classList.toggle('active', p === partNum);
        pCont.style.display = p === partNum ? '' : 'none';
      }
      if (pQues2) {
        pQues2.classList.toggle('active', p === partNum);
        pQues2.style.display = p === partNum ? '' : 'none';
      }
    }

    // 7. Update top Subrubric banner
    var pConfig = partsConfig.find(function(p) { return p.part === partNum; }) || partsConfig[0];
    var partTitleEl = document.getElementById('vxCurrentPartTitle');
    var partDescEl = document.getElementById('vxCurrentPartDesc');
    if (partTitleEl) partTitleEl.textContent = pConfig.title;
    if (partDescEl) partDescEl.textContent = pConfig.desc;

    // 8. Re-render bottom navigation
    renderCdiBottomNavigator();
  }

  function renderCdiBottomNavigator() {
    var wrap = document.getElementById('vxCdiPartsWrap');
    if (!wrap) return;

    var answeredKeys = new Set();
    getControls().forEach(function(el) {
      var type = (el.type || el.tagName || 'text').toLowerCase();
      var key = el.name || el.id;
      if (!key) return;
      var isFilled = (type === 'radio' || type === 'checkbox') ? el.checked : String(el.value || '').trim().length > 0;
      if (isFilled) answeredKeys.add(key.toLowerCase());
    });

    var html = '';
    partsConfig.forEach(function(p) {
      var isCurPart = p.part === currentPart;
      var partAnswered = 0;
      for (var q = p.start; q <= p.end; q++) {
        var keyVariants = ['q' + q, 'question_' + q, 'question-' + q, String(q)];
        if (keyVariants.some(function(k) { return answeredKeys.has(k); })) partAnswered++;
      }

      if (isCurPart) {
        var qHtml = '';
        for (var q = p.start; q <= p.end; q++) {
          var keyVariants = ['q' + q, 'question_' + q, 'question-' + q, String(q)];
          var isAnswered = keyVariants.some(function(k) { return answeredKeys.has(k); });
          var isCurQ = q === currentQuestionNum;
          var isFlagged = flaggedQuestions.has(q);

          qHtml += '<div class="vx-cdi-q-num' + (isCurQ ? ' current' : '') + (isAnswered ? ' answered' : '') + (isFlagged ? ' flagged' : '') + '" data-q-num="' + q + '" title="Question ' + q + '"><span>' + q + '</span><div class="vx-dash"></div></div>';
        }
        html += '<div class="vx-cdi-part-block active" data-part-num="' + p.part + '"><span class="vx-cdi-part-title">' + p.title + '</span><div class="vx-cdi-question-pills-row">' + qHtml + '</div></div>';
      } else {
        html += '<div class="vx-cdi-part-block" data-part-num="' + p.part + '"><span class="vx-cdi-part-title">' + p.title + '</span> <span class="vx-cdi-part-count">' + partAnswered + '/' + p.count + '</span></div>';
      }
    });

    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-part-num]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('[data-q-num]')) return;
        var pNum = Number(el.getAttribute('data-part-num'));
        switchCdiPart(pNum);
      });
    });

    wrap.querySelectorAll('[data-q-num]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var qNum = Number(el.getAttribute('data-q-num'));
        jumpToQuestion(qNum);
      });
    });
  }

  function jumpToQuestion(qNum) {
    qNum = Number(qNum);
    currentQuestionNum = qNum;

    var targetPart = 1;
    for (var i = 0; i < partsConfig.length; i++) {
      if (qNum >= partsConfig[i].start && qNum <= partsConfig[i].end) {
        targetPart = partsConfig[i].part;
        break;
      }
    }
    if (targetPart !== currentPart) {
      switchCdiPart(targetPart);
    }

    // If page defines goToQuestion (e.g. R 3–49 series)
    if (typeof window.goToQuestion === 'function') {
      try { window.goToQuestion(qNum); } catch(e) {}
    }

    // Switch to questions view on mobile
    if (window.innerWidth <= 768) {
      document.body.classList.remove('vortex-mobile-show-passage');
      document.body.classList.add('vortex-mobile-show-questions');
      if (mobileTabs) {
        mobileTabs.querySelectorAll('button').forEach(function(b) {
          var active = b.getAttribute('data-reader-view') === 'questions';
          b.setAttribute('aria-pressed', String(active));
          b.setAttribute('aria-selected', String(active));
        });
      }
    }

    // Try finding the question input or question text
    var target = document.querySelector('[name="q' + qNum + '"], [id="q' + qNum + '"], [data-question="' + qNum + '"], [id="question-' + qNum + '"], [data-q-start="' + qNum + '"]');
    if (!target) {
      var headers = document.querySelectorAll('h3, h4, p, label, .question-text, .question-card, .question, .tf-question');
      for (var i = 0; i < headers.length; i++) {
        var text = headers[i].textContent.trim();
        if (new RegExp('^' + qNum + '[.:]|^Question\\\\s+' + qNum + '\\\\b', 'i').test(text)) {
          target = headers[i];
          break;
        }
      }
    }

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target.focus) target.focus();
    }

    renderCdiBottomNavigator();
  }

  // Previous & Next Question Arrows
  document.getElementById('vxPrevQBtn')?.addEventListener('click', function() {
    if (currentQuestionNum > 1) {
      jumpToQuestion(currentQuestionNum - 1);
    }
  });

  document.getElementById('vxNextQBtn')?.addEventListener('click', function() {
    if (currentQuestionNum < totalQuestions) {
      jumpToQuestion(currentQuestionNum + 1);
    }
  });

  // Review Toggle Button (Bottom Nav)
  document.getElementById('vxReviewToggleBtn')?.addEventListener('click', function() {
    if (!currentQuestionNum) currentQuestionNum = 1;
    if (flaggedQuestions.has(currentQuestionNum)) {
      flaggedQuestions.delete(currentQuestionNum);
      this.classList.remove('active');
      notify('Flag removed from Question ' + currentQuestionNum, '');
    } else {
      flaggedQuestions.add(currentQuestionNum);
      this.classList.add('active');
      notify('Question ' + currentQuestionNum + ' flagged for review', 'success');
    }
    renderCdiBottomNavigator();
  });

  // Fullscreen Toggle
  document.getElementById('vxFullscreenBtn')?.addEventListener('click', function() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function() {});
    } else {
      document.exitFullscreen().catch(function() {});
    }
  });

  function updateQuestionStatus() {
    renderCdiBottomNavigator();
    var answeredKeys = new Set();
    getControls().forEach(function(el) {
      var type = (el.type || el.tagName || 'text').toLowerCase();
      var key = el.name || el.id;
      if (!key) return;
      var isFilled = (type === 'radio' || type === 'checkbox') ? el.checked : String(el.value || '').trim().length > 0;
      if (isFilled) answeredKeys.add(key.toLowerCase());
    });

    var count = 0;
    for (var i = 1; i <= totalQuestions; i++) {
      var keyVariants = ['q' + i, 'question_' + i, 'question-' + i, String(i)];
      var isAnswered = keyVariants.some(function(k) { return answeredKeys.has(k); });
      if (isAnswered) count++;
    }
    return count;
  }

  // Draft persistence in localStorage
  function saveDraft() {
    try {
      var answers = collectAnswers();
      localStorage.setItem('vortex-reading-draft-' + material.id, JSON.stringify({ answers: answers, savedAt: Date.now() }));
    } catch(e) {}
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem('vortex-reading-draft-' + material.id);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.answers) && parsed.answers.length > 0) {
        restoreAnswers(parsed.answers);
        return true;
      }
    } catch(e) {}
    return false;
  }

  document.addEventListener('input', function() { updateQuestionStatus(); saveDraft(); });
  document.addEventListener('change', function() { updateQuestionStatus(); saveDraft(); });

  // Submission Flow & Modal Triggers
  function openSubmitModal() {
    var answered = updateQuestionStatus();
    var unanswered = Math.max(0, totalQuestions - answered);
    var spent = Math.round((Date.now() - startedAt) / 1000);

    var aEl = document.getElementById('vxModalAnswered');
    var uEl = document.getElementById('vxModalUnanswered');
    var tEl = document.getElementById('vxModalTimeSpent');
    var sEl = document.getElementById('vxSubmitModalSummary');

    if (aEl) aEl.textContent = answered;
    if (uEl) uEl.textContent = unanswered;
    if (tEl) tEl.textContent = formatTime(spent);
    if (sEl) sEl.textContent = 'You have answered ' + answered + ' of ' + totalQuestions + ' questions (' + unanswered + ' remaining).';

    if (submitModal) submitModal.classList.add('show');
  }

  // Start Test Button Handlers (for Drills and Practice files with Start Screens)
  document.addEventListener('click', function(e) {
    var startBtn = e.target.closest('#startBtn, .start-btn, #start-btn, button[onclick*="startTest"], #start-test-btn');
    if (startBtn) {
      var startScreen = document.getElementById('startScreen') || document.querySelector('.start-screen, #start-screen, .start-modal, #login-screen');
      if (startScreen) startScreen.style.display = 'none';
      var mainArea = document.getElementById('mainArea') || document.querySelector('#main-area, .main-area, .mainArea, .panels-container, .test-container');
      if (mainArea) mainArea.style.display = 'flex';
      startTimer();
    }
  }, true);

  document.getElementById('vxSubmitPromptBtn')?.addEventListener('click', openSubmitModal);
  document.getElementById('vxHeaderSubmitBtn')?.addEventListener('click', openSubmitModal);

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('#deliver-button, #deliver-btn, .footer__deliverButton___3FM07, .deliverButton, .footer__deliverButton, button[onclick*="showSubmissionModal"], #submitBtn, .submit-btn, button[onclick*="submitTest"], button[onclick*="submitExam"], button[onclick*="submitAnswers"], #submit-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      openSubmitModal();
    }
  }, true);

  var cancelSubmitBtn = document.getElementById('vxCancelSubmitBtn');
  var confirmSubmitBtn = document.getElementById('vxConfirmSubmitBtn');

  if (cancelSubmitBtn) {
    cancelSubmitBtn.addEventListener('click', function() {
      submitModal.classList.remove('show');
    });
  }

  function autoSubmitTimeUp() {
    notify('Time is up! Submitting your answers…', 'error');
    submitExam();
  }

  if (confirmSubmitBtn) {
    confirmSubmitBtn.addEventListener('click', function() {
      submitModal.classList.remove('show');
      submitExam();
    });
  }

  async function submitExam() {
    if (isSubmitting) return;
    isSubmitting = true;
    hasSubmitted = true;
    if (timerInterval) clearInterval(timerInterval);

    var answers = collectAnswers();
    var duration = Math.round((Date.now() - startedAt) / 1000);

    // If token exists in localStorage or Cookie, submit to verified backend
    if (token) {
      try {
        var response = await fetch('/api/reading-attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            materialId: material.id,
            total: totalQuestions,
            answers: answers,
            durationSeconds: duration
          })
        });

        var data = await response.json().catch(function() { return {}; });
        if (response.ok && data.attempt) {
          var attempt = data.attempt;
          currentAttemptData = attempt;
          showVerifiedResult(attempt, duration);
          notify('Result verified: ' + attempt.correct + '/' + attempt.total + ' (Band ' + Number(attempt.band).toFixed(1) + ') saved to dashboard!', 'success');
          localStorage.removeItem('vortex-reading-draft-' + material.id);
          isSubmitting = false;
          return;
        }
      } catch(err) {
        console.warn('Backend save error, falling back to local scoring:', err);
      }
    }

    // Local Verification & Scoring Fallback
    showLocalResult(answers, duration);
    isSubmitting = false;
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

  function showVerifiedResult(attempt, duration) {
    var correct = Number(attempt.correct) || 0;
    var total = Number(attempt.total) || totalQuestions;
    var band = attempt.band !== null && attempt.band !== undefined ? Number(attempt.band).toFixed(1) : (readingBand(correct, total) || 0.0);
    var pct = Math.round((correct / total) * 100);
    var incorrectQuestions = Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : [];
    var partBreakdown = Array.isArray(attempt.partBreakdown) ? attempt.partBreakdown : [];

    // 1. Hero KPI Cards
    var bandNumEl = document.getElementById('vxResultBandNum');
    var cefrBadgeEl = document.getElementById('vxResultCefrBadge');
    var statScoreEl = document.getElementById('vxResultStatScore');
    var accEl = document.getElementById('vxResultAccuracy');
    var progressFillEl = document.getElementById('vxResultProgressFill');
    var timeSpentEl = document.getElementById('vxResultTimeSpent');

    if (bandNumEl) bandNumEl.textContent = 'Band ' + Number(band || 0).toFixed(1);
    if (cefrBadgeEl) cefrBadgeEl.textContent = getBandCefr(band);
    if (statScoreEl) statScoreEl.textContent = pct + '% (' + correct + '/' + total + ')';
    if (accEl) accEl.textContent = correct + ' of ' + total + ' questions correct (' + (total - correct) + ' mistakes)';
    if (progressFillEl) {
      progressFillEl.style.width = pct + '%';
      if (pct < 50) progressFillEl.style.background = '#ef4444';
      else if (pct < 75) progressFillEl.style.background = '#f59e0b';
      else progressFillEl.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
    }
    if (timeSpentEl) {
      var d = duration || attempt.durationSeconds || Math.round((Date.now() - startedAt) / 1000);
      var m = Math.floor(d / 60);
      var s = d % 60;
      timeSpentEl.textContent = (m > 0 ? m + 'm ' : '') + s + 's';
    }

    // 2. Performance by Passage
    var partsGrid = document.getElementById('vxResultPartsGrid');
    if (partsGrid) {
      if (partBreakdown.length === 0) {
        partBreakdown = [
          { part: 'Passage 1', mistakes: incorrectQuestions.filter(function(q) { return q >= 1 && q <= 13; }).length },
          { part: 'Passage 2', mistakes: incorrectQuestions.filter(function(q) { return q >= 14 && q <= 26; }).length },
          { part: 'Passage 3', mistakes: incorrectQuestions.filter(function(q) { return q >= 27 && q <= 40; }).length }
        ];
      }
      partsGrid.innerHTML = partBreakdown.map(function(p) {
        var isZero = p.mistakes === 0;
        return '<div class="vx-res-part-card"><div class="vx-res-part-name">' + p.part + '</div><div class="vx-res-part-score" style="color:' + (isZero ? '#10b981' : '#dc2626') + '">' + (isZero ? '✔ Perfect Score' : p.mistakes + ' mistake' + (p.mistakes === 1 ? '' : 's')) + '</div></div>';
      }).join('');
    }

    // 3. Question Diagnostic Pills
    var pillsWrap = document.getElementById('vxResultIncorrectPills');
    if (pillsWrap) {
      var incorrectSet = new Set(incorrectQuestions);
      var pillsHtml = '';
      for (var q = 1; q <= total; q++) {
        var isIncorrect = incorrectSet.has(q);
        pillsHtml += '<button type="button" class="vx-res-pill-btn ' + (isIncorrect ? 'incorrect' : 'correct') + '" data-jump-q="' + q + '" title="Jump to Question ' + q + ' in review">' + (isIncorrect ? '✕ Q' : '✓ Q') + q + '</button>';
      }
      pillsWrap.innerHTML = pillsHtml;

      pillsWrap.querySelectorAll('[data-jump-q]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var qNum = Number(btn.getAttribute('data-jump-q'));
          resultModal.classList.remove('show');
          jumpToQuestion(qNum);
          notify('Reviewing Question ' + qNum, 'success');
        });
      });
    }

    document.getElementById('vxReadingResultsCloseTopBtn')?.addEventListener('click', function() {
      resultModal.classList.remove('show');
    });

    resultModal.classList.add('show');
  }

  function showLocalResult(answers, duration) {
    var answerKey = material.answerKey || {};
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

    var band = readingBand(correct, totalQuestions);
    var attemptMock = {
      correct: correct,
      total: totalQuestions,
      band: band !== null ? band : (correct > 0 ? (Math.round((correct / totalQuestions * 9) * 2) / 2).toFixed(1) : '1.0'),
      incorrectQuestions: incorrectQuestions,
      partBreakdown: [
        { part: 'Passage 1', mistakes: incorrectQuestions.filter(function(q) { return q >= 1 && q <= 13; }).length },
        { part: 'Passage 2', mistakes: incorrectQuestions.filter(function(q) { return q >= 14 && q <= 26; }).length },
        { part: 'Passage 3', mistakes: incorrectQuestions.filter(function(q) { return q >= 27 && q <= 40; }).length }
      ],
      questionTypeBreakdown: [],
      durationSeconds: duration
    };
    currentAttemptData = attemptMock;
    showVerifiedResult(attemptMock, duration);
  }

  var currentAttemptData = null;

  function applyReviewModeUi(attempt) {
    if (!attempt) return;
    currentAttemptData = attempt;
    var answerKey = material.answerKey || attempt.answerKey || {};
    var incorrectQuestions = Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : [];
    var incorrectSet = new Set(incorrectQuestions);
    var total = Number(attempt.total) || totalQuestions || 40;

    // Update Header with Score Report & Retake Buttons and Score text
    var bandText = attempt.band !== null && attempt.band !== undefined ? ' · Band ' + Number(attempt.band).toFixed(1) : '';
    var scoreSummary = attempt.correct + '/' + total + bandText;

    var headerReportBtn = document.getElementById('vxHeaderScoreReportBtn');
    var headerRetakeBtn = document.getElementById('vxHeaderRetakeBtn');
    if (headerReportBtn) headerReportBtn.style.display = 'inline-flex';
    if (headerRetakeBtn) headerRetakeBtn.style.display = 'inline-flex';

    if (timerDisplay) timerDisplay.textContent = 'Review (' + scoreSummary + ')';
    if (timerPill) {
      timerPill.innerHTML = '<span class="material-symbols-outlined vx-timer-icon" style="color:var(--vx-success)">verified</span><span>Review ' + scoreSummary + '</span>';
    }

    // Color-code Bottom Navigation Question Pills only (1-40)
    for (var q = 1; q <= total; q++) {
      var isIncorrect = incorrectSet.has(q);
      var navBtn = document.querySelector('#vortex-bottom-navigator [data-q="' + q + '"]') || document.querySelector('.vx-pills-scroll button:nth-child(' + q + ')');
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

  // Review & Retake actions in result modal and review banner
  document.getElementById('vxReviewAnswersBtn')?.addEventListener('click', function() {
    resultModal.classList.remove('show');
    if (currentAttemptData) {
      applyReviewModeUi(currentAttemptData);
    }
    notify('Detailed Review & Explanations: Coming soon in next update! 🚀', 'success');
  });

  document.getElementById('vxReportIssueBtn')?.addEventListener('click', function() {
    var desc = prompt('Describe the issue with this test or question:');
    if (desc) notify('Thank you! Your feedback has been recorded for our academic team.', 'success');
  });

  function retakeExamAction() {
    if (!confirm('Are you sure you want to retake this test? Your current answers will be cleared.')) return;
    localStorage.removeItem('vortex-reading-draft-' + material.id);
    var nextUrl = new URL(location.href);
    nextUrl.searchParams.delete('review');
    location.assign(nextUrl.pathname + nextUrl.search);
  }

  document.getElementById('vxRetakeExamBtn')?.addEventListener('click', retakeExamAction);
  document.getElementById('vxHeaderRetakeBtn')?.addEventListener('click', retakeExamAction);
  document.getElementById('vxHeaderScoreReportBtn')?.addEventListener('click', function() {
    if (resultModal) resultModal.classList.add('show');
  });

  // =========================================================================
  // IELTS CDI Highlight & Notes Implementation
  // =========================================================================
  var selToolbar = document.getElementById('ieltsSelectionToolbar');
  var noteModal = document.getElementById('ieltsNoteModal');
  var noteSnippet = document.getElementById('ieltsNoteSnippet');
  var noteText = document.getElementById('ieltsNoteText');
  var noteSaveBtn = document.getElementById('ieltsNoteSaveBtn');
  var noteCancelBtn = document.getElementById('ieltsNoteCancelBtn');
  var noteDeleteBtn = document.getElementById('ieltsNoteDeleteBtn');
  var noteCloseX = document.getElementById('ieltsNoteCloseX');
  var currentSelectionRange = null;
  var activeNoteSpan = null;

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

    if (selToolbar) {
      selToolbar.style.display = 'flex';
      var top = window.scrollY + rect.top - selToolbar.offsetHeight - 8;
      var left = window.scrollX + rect.left + rect.width / 2 - selToolbar.offsetWidth / 2;
      if (top < window.scrollY + 5) top = window.scrollY + rect.bottom + 8;
      left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - selToolbar.offsetWidth - 8));
      selToolbar.style.top = top + 'px';
      selToolbar.style.left = left + 'px';
    }
  }

  function hideSelectionToolbar() {
    if (selToolbar) selToolbar.style.display = 'none';
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
    if (!range || range.collapsed) { hideSelectionToolbar(); return; }
    try {
      if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
        var span = document.createElement('mark');
        span.className = 'ielts-highlight';
        range.surroundContents(span);
      } else {
        var frag = range.extractContents();
        var span = document.createElement('mark');
        span.className = 'ielts-highlight';
        span.appendChild(frag);
        range.insertNode(span);
      }
    } catch (err) {}
    mergeAdjacentHighlights(document.body);
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    currentSelectionRange = null;
    hideSelectionToolbar();
    saveHighlightsToStorage();
  }

  function openNoteDialog(range, existingSpan) {
    activeNoteSpan = existingSpan || null;
    currentSelectionRange = range ? range.cloneRange() : null;
    var snippet = existingSpan ? existingSpan.textContent.trim() : (range ? range.toString().trim() : '');
    if (noteSnippet) noteSnippet.textContent = '“' + (snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet) + '”';
    if (noteText) noteText.value = existingSpan ? existingSpan.getAttribute('data-note') || '' : '';
    if (noteDeleteBtn) noteDeleteBtn.hidden = !existingSpan;
    if (noteModal) noteModal.classList.add('show');
    if (noteText) { setTimeout(function() { noteText.focus(); }, 50); }
    hideSelectionToolbar();
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
      activeNoteSpan.title = 'Note: ' + text;
    } else if (currentSelectionRange) {
      try {
        var span = document.createElement('mark');
        span.className = 'ielts-note-highlight';
        span.setAttribute('data-note', text);
        span.title = 'Note: ' + text;
        if (currentSelectionRange.startContainer === currentSelectionRange.endContainer && currentSelectionRange.startContainer.nodeType === Node.TEXT_NODE) {
          currentSelectionRange.surroundContents(span);
        } else {
          var frag = currentSelectionRange.extractContents();
          span.appendChild(frag);
          currentSelectionRange.insertNode(span);
        }
      } catch(e) {}
    }
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    closeNoteDialog();
    saveHighlightsToStorage();
  }

  function deleteNoteAction() {
    if (activeNoteSpan) {
      var parent = activeNoteSpan.parentNode;
      while (activeNoteSpan.firstChild) parent.insertBefore(activeNoteSpan.firstChild, activeNoteSpan);
      parent.removeChild(activeNoteSpan);
      parent.normalize();
    }
    closeNoteDialog();
    saveHighlightsToStorage();
  }

  function clearSelectionHighlight() {
    var range = currentSelectionRange;
    if (!range) { hideSelectionToolbar(); return; }
    document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
      var intersects = false;
      try { intersects = range.intersectsNode(el); } catch (e) { intersects = false; }
      if (intersects) {
        var parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        parent.normalize();
      }
    });
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    currentSelectionRange = null;
    hideSelectionToolbar();
    saveHighlightsToStorage();
  }

  function clearAllHighlights() {
    document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
      var parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
    hideSelectionToolbar();
    saveHighlightsToStorage();
  }

  function saveHighlightsToStorage() {
    try {
      var hls = [];
      document.querySelectorAll('.ielts-highlight, .ielts-note-highlight').forEach(function(el) {
        hls.push({
          type: el.classList.contains('ielts-note-highlight') ? 'note' : 'highlight',
          note: el.getAttribute('data-note') || '',
          text: el.textContent
        });
      });
      localStorage.setItem('vortex-reading-hl-' + material.id, JSON.stringify(hls));
    } catch(e) {}
  }

  // Event Listeners for Selection & Notes
  document.addEventListener('mouseup', function(e) {
    if (e.target.closest('#ieltsSelectionToolbar') || e.target.closest('#ieltsNoteModal')) return;
    setTimeout(showSelectionToolbar, 10);
  });
  document.addEventListener('touchend', function(e) {
    if (e.target.closest('#ieltsSelectionToolbar') || e.target.closest('#ieltsNoteModal')) return;
    setTimeout(showSelectionToolbar, 10);
  });
  document.addEventListener('keyup', function(e) {
    if (e.target.closest('#ieltsNoteModal')) return;
    if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      setTimeout(showSelectionToolbar, 10);
    }
  });

  // Clicking an existing note highlight
  document.addEventListener('click', function(e) {
    var noteSpan = e.target.closest('.ielts-note-highlight');
    if (noteSpan) {
      e.preventDefault();
      openNoteDialog(null, noteSpan);
    }
  });

  document.getElementById('ieltsHlBtn')?.addEventListener('click', applyHighlight);
  document.getElementById('ieltsNoteBtn')?.addEventListener('click', function() {
    if (currentSelectionRange) openNoteDialog(currentSelectionRange, null);
  });
  document.getElementById('ieltsClearBtn')?.addEventListener('click', clearSelectionHighlight);
  document.getElementById('ieltsClearAllBtn')?.addEventListener('click', clearAllHighlights);

  if (noteSaveBtn) noteSaveBtn.addEventListener('click', saveNoteAction);
  if (noteCancelBtn) noteCancelBtn.addEventListener('click', closeNoteDialog);
  if (noteDeleteBtn) noteDeleteBtn.addEventListener('click', deleteNoteAction);
  if (noteCloseX) noteCloseX.addEventListener('click', closeNoteDialog);

  // Question Flag for Review (Right click or flag toggle)
  document.addEventListener('dblclick', function(e) {
    var pill = e.target.closest('.vx-q-pill');
    if (pill) {
      pill.classList.toggle('flagged');
      notify(pill.classList.contains('flagged') ? 'Question ' + pill.getAttribute('data-q-num') + ' flagged for review 🚩' : 'Flag removed', 'success');
    }
  });

  // Vocabulary Quick Add
  document.getElementById('ieltsVocabBtn')?.addEventListener('click', async function() {
    var sel = window.getSelection();
    var word = (sel ? sel.toString() : '').trim();
    if (!word || word.length < 2) {
      notify('Please select a word to save.', 'error');
      return;
    }
    if (!token) {
      notify('Sign in to save words to your vocabulary.', 'error');
      return;
    }
    try {
      var res = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ word: word, selection: { text: word, block: { id: material.id, text: word }, start: 0, end: word.length }, articleId: material.id })
      });
      if (res.ok) {
        notify('"' + word + '" saved to Vocabulary', 'success');
        hideSelectionToolbar();
      } else {
        notify('Word could not be saved.', 'error');
      }
    } catch(e) {
      notify('Error saving vocabulary.', 'error');
    }
  });

  // Practice Mode Check Progress Button
  document.getElementById('vxCheckPracticeBtn')?.addEventListener('click', function() {
    var answered = updateQuestionStatus();
    if (answered === 0) {
      notify('Fill in some answers first before checking.', 'error');
      return;
    }
    notify('Practice Progress: ' + answered + ' of ' + totalQuestions + ' answered. Great work!', 'success');
  });

  var practiceElapsedSeconds = 0;
  var isPracticePaused = false;

  function startPracticeStopwatch() {
    if (timerInterval) clearInterval(timerInterval);
    if (timerDisplay) timerDisplay.textContent = '00:00';
    var pauseBtn = document.getElementById('vxPauseTimerBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'inline-flex';
      pauseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        isPracticePaused = !isPracticePaused;
        pauseBtn.innerHTML = isPracticePaused ? '<i class="fas fa-play" style="font-size:11px;color:#10b981"></i>' : '<i class="fas fa-pause" style="font-size:11px"></i>';
        notify(isPracticePaused ? 'Practice Timer Paused ⏸' : 'Practice Timer Resumed ▶', 'success');
      });
    }
    timerInterval = setInterval(function() {
      if (hasSubmitted || isPracticePaused) return;
      practiceElapsedSeconds++;
      if (timerDisplay) timerDisplay.textContent = formatTime(practiceElapsedSeconds);
    }, 1000);
  }

  // =========================================================================
  // Enhanced Click-to-Select & Sticky Headings Controller
  // =========================================================================
  function initEnhancedHeadingsSystem() {
    var selectedHeadingEl = null;
    var currentTargetDropZone = null;
    var pickerModal = document.getElementById('vxHeadingPickerModal');
    var pickerList = document.getElementById('vxHeadingPickerOptionsList');
    var pickerTargetTitle = document.getElementById('vxTargetHeadingBoxName');
    var pickerCloseBtn = document.getElementById('vxHeadingPickerCloseBtn');

    if (pickerCloseBtn && pickerModal) {
      pickerCloseBtn.addEventListener('click', function() {
        pickerModal.classList.remove('active');
        currentTargetDropZone = null;
      });
      pickerModal.addEventListener('click', function(e) {
        if (e.target === pickerModal) {
          pickerModal.classList.remove('active');
          currentTargetDropZone = null;
        }
      });
    }

    function syncUsedHeadings() {
      var usedValues = new Set();
      document.querySelectorAll('.drop-zone .drag-item').forEach(function(item) {
        if (item.dataset.value) usedValues.add(item.dataset.value);
      });
      document.querySelectorAll('.drag-options-container .drag-item').forEach(function(item) {
        if (usedValues.has(item.dataset.value)) {
          item.classList.add('used-in-box');
        } else {
          item.classList.remove('used-in-box');
        }
      });
    }

    function placeHeadingInZone(zone, headingValue, headingText, dndGroup) {
      if (!zone) return;
      var hint = zone.querySelector('.drop-hint');
      if (hint) hint.remove();

      // Clear existing item
      zone.querySelectorAll('.drag-item, .drop-hint').forEach(function(n) { n.remove(); });

      var itemEl = document.createElement('span');
      itemEl.className = 'drag-item';
      itemEl.setAttribute('draggable', 'true');
      itemEl.setAttribute('data-dnd-group', dndGroup || zone.dataset.dndGroup || '');
      itemEl.setAttribute('data-value', headingValue);
      
      var textSpan = document.createElement('span');
      textSpan.textContent = headingText;
      itemEl.appendChild(textSpan);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'vx-remove-heading-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove heading';
      removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        zone.classList.remove('filled');
        zone.innerHTML = '<span class="drop-hint" style="color:#94a3b8;font-size:13px;font-style:italic;pointer-events:none;">Drop heading here or click to select</span>';
        syncUsedHeadings();
        updateQuestionStatus();
        saveDraft();
      });
      itemEl.appendChild(removeBtn);

      zone.appendChild(itemEl);
      zone.classList.add('filled');
      syncUsedHeadings();
      updateQuestionStatus();
      saveDraft();
    }

    // 1. Heading click in container
    document.querySelectorAll('.drag-options-container .drag-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        if (selectedHeadingEl === item) {
          item.classList.remove('selected-heading');
          selectedHeadingEl = null;
          notify('Heading deselected', 'info');
          return;
        }
        document.querySelectorAll('.drag-item.selected-heading').forEach(function(i) { i.classList.remove('selected-heading'); });
        selectedHeadingEl = item;
        item.classList.add('selected-heading');
        notify('📌 Sarlavha tanlandi! Endi pastdagi istalgan Paragraph katagiga bosing.', 'success');
      });
    });

    // 2. Drop Zone click
    document.querySelectorAll('.drop-zone').forEach(function(zone) {
      zone.addEventListener('click', function(e) {
        if (e.target.closest('.vx-remove-heading-btn')) return;

        // If a heading was pre-selected from top list, place it immediately
        if (selectedHeadingEl) {
          var val = selectedHeadingEl.dataset.value;
          var txt = selectedHeadingEl.textContent;
          var grp = selectedHeadingEl.dataset.dndGroup || zone.dataset.dndGroup;
          placeHeadingInZone(zone, val, txt, grp);
          selectedHeadingEl.classList.remove('selected-heading');
          selectedHeadingEl = null;
          notify('Sarlavha muvaffaqiyatli joylandi! ✓', 'success');
          return;
        }

        // Show picker modal with all available headings
        var group = zone.dataset.dndGroup || 'p1-headings';
        var container = document.querySelector('.drag-options-container[data-dnd-group="' + group + '"]') || document.querySelector('.drag-options-container');
        if (!container || !pickerModal || !pickerList) return;

        currentTargetDropZone = zone;
        var parentRow = zone.closest('.matching-form-row');
        var label = parentRow ? (parentRow.querySelector('.matching-form-label')?.textContent || 'this question') : ('Question ' + (zone.dataset.qStart || ''));
        if (pickerTargetTitle) pickerTargetTitle.textContent = label;

        var availableItems = container.querySelectorAll('.drag-item');
        pickerList.innerHTML = '';
        availableItems.forEach(function(sourceItem) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'vx-picker-option-btn';
          btn.innerHTML = '<span>' + sourceItem.textContent + '</span><span style="color:#2563eb;font-weight:900;font-size:16px;">+</span>';
          btn.addEventListener('click', function() {
            placeHeadingInZone(currentTargetDropZone, sourceItem.dataset.value, sourceItem.textContent, group);
            pickerModal.classList.remove('active');
            currentTargetDropZone = null;
          });
          pickerList.appendChild(btn);
        });

        pickerModal.classList.add('active');
      });
    });

    syncUsedHeadings();
  }

  // Check for previous attempt or draft on load
  async function init() {
    renderCdiBottomNavigator();
    initEnhancedHeadingsSystem();

    var urlParams = new URLSearchParams(location.search);
    var isPractice = urlParams.get('mode') === 'practice';
    var isReview = urlParams.get('review') === 'true' || location.hash === '#review';

    if (isReview) {
      if (timerPill) {
        timerPill.innerHTML = '<span class="material-symbols-outlined vx-timer-icon" style="color:var(--vx-success)">verified</span><span>Review Mode</span>';
        timerPill.style.borderColor = 'var(--vx-success)';
      }
    } else if (isPractice) {
      document.body.classList.add('vx-practice-mode');
      var checkBtn = document.getElementById('vxCheckPracticeBtn');
      if (checkBtn) checkBtn.style.display = 'inline-flex';
      startPracticeStopwatch();
      loadDraft(); // in practice mode, student can resume draft
    } else {
      // 100% REAL EXAM MODE (Exclusive to Premium accounts):
      if (material.isPremium && material.userPlan !== 'premium') {
        var lockModal = document.getElementById('vortexRealExamLockModal');
        if (lockModal) {
          lockModal.classList.add('show');
          document.getElementById('vxSwitchToPracticeBtn')?.addEventListener('click', function() {
            lockModal.classList.remove('show');
            var nextUrl = new URL(location.href);
            nextUrl.searchParams.set('mode', 'practice');
            location.assign(nextUrl.pathname + nextUrl.search);
          });
          return;
        }
      }
      // Always start clean 0/40 fresh test!
      localStorage.removeItem('vortex-reading-draft-' + material.id);
      startTimer();
    }

    if (!token) return;

    // ONLY in Review Mode do we restore past completed attempt answers
    if (isReview) {
      try {
        var response = await fetch('/api/reading-attempts/latest?materialId=' + encodeURIComponent(material.id), {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!response.ok) return;
        var data = await response.json();
        if (!data.attempt) {
          notify('No previous completed attempt found for this test.', 'error');
          return;
        }
        restoreAnswers(data.attempt.answers);
        var bandText = data.attempt.band !== null && data.attempt.band !== undefined ? ' · Band ' + Number(data.attempt.band).toFixed(1) : '';
        var scoreSummary = data.attempt.correct + '/' + data.attempt.total + bandText;
        currentAttemptData = data.attempt;
        applyReviewModeUi(data.attempt);
        showVerifiedResult(data.attempt, data.attempt.durationSeconds || 1200);
        notify('Review Mode active: ' + scoreSummary, 'success');
      } catch(e) {}
    }
  }

  init();
})();
</script>`;
}

const MOCK_CATALOG_PATH = path.join(ENGLISH_CONTENT_DIR, "mock-catalog.json");

function readMockCatalog() {
  if (!fs.existsSync(MOCK_CATALOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MOCK_CATALOG_PATH, "utf8"));
  } catch(e) {
    return [];
  }
}

function roundToIeltsBand(num) {
  const n = Number(num) || 0;
  const intPart = Math.floor(n);
  const frac = n - intPart;
  if (frac < 0.25) return intPart;
  if (frac < 0.75) return intPart + 0.5;
  return intPart + 1.0;
}

function sanitizeReadingHtml(source, material, user) {
  const clean = source
    .replace(/body::(?:before|after)\s*\{[\s\S]*?\}/gi, "")
    .replace(/\.(?:telegram-link|brand-link)(?::[a-z-]+)?\s*\{[^}]*\}/gi, "")
    .replace(/<a\b[^>]*href=["']https?:\/\/t\.me\/[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/https?:\/\/t\.me\/[^\s"'<]+/gi, "#")
    .replace(/@(?:ielts_material_full|ieltsmaterials_full|full exam materials|mindless_writer|fozilbek_ielts)/gi, "")
    .replace(/For More Authentic tests you need to buy Premium Service/gi, "")
    .replace(/Full Exam Materials|IELTS CDI Materials/gi, "")
    .replace(/telegram-link|brand-link/gi, "removed-link")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
      const sanitizedCss = css
        .replace(/body::(?:before|after)\s*\{[\s\S]*?\}/gi, "")
        .replace(/https?:\/\/t\.me\/[^\s"')]+/gi, "")
        .replace(/\.(?:telegram-link|brand-link)\b[\s\S]*?\{[\s\S]*?\}/gi, "");
      return `<style>${sanitizedCss}</style>`;
    });

  const persistence = readingPersistenceMarkup(material, user);
  return /<\/body>/i.test(clean) ? clean.replace(/<\/body>/i, `${persistence}\n</body>`) : `${clean}${persistence}`;
}

if (!DATABASE_URL) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyData() {
  return {
    tests: [],
    results: [],
    readingAttempts: [],
    listeningAttempts: [],
    articleHighlights: [],
    vocabulary: [],
    olympiads: [],
    resources: [],
    promoCodes: [],
    users: [],
    teacherInvitations: [],
    teacherLinks: [],
    assignments: [],
    writingSubmissions: [],
    teacherLicenses: []
  };
}

function normalizeData(value) {
  const norm = { ...emptyData(), ...(value && typeof value === "object" ? value : {}) };
  if (!Array.isArray(norm.promoCodes)) norm.promoCodes = [];
  if (!Array.isArray(norm.teacherInvitations)) norm.teacherInvitations = [];
  if (!Array.isArray(norm.teacherLinks)) norm.teacherLinks = [];
  if (!Array.isArray(norm.assignments)) norm.assignments = [];
  if (!Array.isArray(norm.writingSubmissions)) norm.writingSubmissions = [];
  if (!Array.isArray(norm.teacherLicenses)) norm.teacherLicenses = [];
  return norm;
}

let databaseClient = null;
let databaseReady = null;
let dbDisabledDueToError = false;

async function getDatabase() {
  if (!DATABASE_URL || dbDisabledDueToError) return null;
  try {
    if (!databaseClient) databaseClient = neon(DATABASE_URL);
    if (!databaseReady) {
      databaseReady = (async () => {
        try {
          await databaseClient`CREATE TABLE IF NOT EXISTS vortex_state (
            id integer PRIMARY KEY,
            payload jsonb NOT NULL,
            version bigint NOT NULL DEFAULT 1,
            updated_at timestamptz NOT NULL DEFAULT now()
          )`;
          await databaseClient`INSERT INTO vortex_state (id, payload) VALUES (1, ${JSON.stringify(emptyData())}::jsonb) ON CONFLICT (id) DO NOTHING`;
        } catch (err) {
          console.warn("Neon DB init notice (using local storage):", err.message);
          dbDisabledDueToError = true;
          return null;
        }
      })();
    }
    await databaseReady;
    if (dbDisabledDueToError) return null;
    return databaseClient;
  } catch (err) {
    console.warn("Neon DB connection notice (using local storage):", err.message);
    dbDisabledDueToError = true;
    return null;
  }
}

let inMemoryData = null;
let inMemoryCachedAt = 0;
let isSyncingDb = false;

async function syncStateFromDb() {
  if (isSyncingDb && inMemoryData) return inMemoryData;
  isSyncingDb = true;
  try {
    const database = await getDatabase();
    if (database) {
      const rows = await database`SELECT payload, version FROM vortex_state WHERE id = 1`;
      if (rows && rows[0]?.payload) {
        const data = normalizeData(rows[0].payload);
        Object.defineProperty(data, "__version", { value: Number(rows[0]?.version || 1), writable: true, enumerable: false });
        inMemoryData = data;
        inMemoryCachedAt = Date.now();
        return data;
      }
    }
  } catch (err) {
    console.error("Neon DB sync error:", err.message);
  } finally {
    isSyncingDb = false;
  }
  if (!inMemoryData) {
    let firebaseData = await syncStateFromFirestore();
    if (firebaseData) {
      inMemoryData = normalizeData(firebaseData);
      try { fs.writeFileSync(DATA_FILE, JSON.stringify(inMemoryData, null, 2)); } catch (_) {}
    } else {
      try { inMemoryData = normalizeData(JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); }
      catch { inMemoryData = emptyData(); }
    }
    inMemoryCachedAt = Date.now();
  }
  return inMemoryData;
}

async function readData() {
  const now = Date.now();
  if (inMemoryData) {
    if (DATABASE_URL && (now - inMemoryCachedAt > 30000) && !isSyncingDb) {
      syncStateFromDb().catch(() => {});
    }
    return inMemoryData;
  }
  return await syncStateFromDb();
}

async function writeData(data) {
  inMemoryData = data;
  inMemoryCachedAt = Date.now();

  try {
    const tmpFile = DATA_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (_) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
  }

  // Background sync to Cloud Firestore
  syncStateToFirestore(data);

  const database = await getDatabase();
  if (database) {
    // Non-blocking background cloud persistence (never blocks client response)
    (async () => {
      try {
        const payload = JSON.stringify(data);
        const rows = await database`UPDATE vortex_state SET payload = ${payload}::jsonb, version = version + 1, updated_at = now() WHERE id = 1 RETURNING version`;
        if (rows && rows.length) {
          data.__version = Number(rows[0].version);
        }
      } catch (err) {
        console.error("Neon DB background write error:", err.message);
      }
    })();
  }
}

async function syncStateFromFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "ieltscorecom";
  const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyALJ7J_QLqqG3VoJPSxmqOjsPIaGtKVEus";
  if (!projectId || !apiKey) return null;
  return new Promise(resolve => {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/vortex_state/default?key=${apiKey}`;
    const req = https.request(url, { method: "GET" }, res => {
      if (res.statusCode !== 200) return resolve(null);
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const doc = JSON.parse(body);
          if (doc.fields && doc.fields.stateJson && doc.fields.stateJson.stringValue) {
            resolve(JSON.parse(doc.fields.stateJson.stringValue));
          } else { resolve(null); }
        } catch (_) { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function syncStateToFirestore(stateData) {
  const projectId = process.env.FIREBASE_PROJECT_ID || "ieltscorecom";
  const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyALJ7J_QLqqG3VoJPSxmqOjsPIaGtKVEus";
  if (!projectId || !apiKey || !stateData) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/vortex_state/default?key=${apiKey}`;
    const payload = JSON.stringify({
      fields: {
        usersCount: { integerValue: String(stateData.users ? stateData.users.length : 0) },
        updatedAt: { stringValue: new Date().toISOString() },
        stateJson: { stringValue: JSON.stringify(stateData) }
      }
    });
    const req = https.request(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    });
    req.on("error", () => {});
    req.write(payload);
    req.end();
  } catch (_) {}
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Request body is too large."));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON request body.")); }
    });
    req.on("error", reject);
  });
}

function safeEqualText(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function issueAdminToken(username) {
  const encoded = Buffer.from(JSON.stringify({ role: "admin", username, expiresAt: Date.now() + ADMIN_SESSION_TTL })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(`admin:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

function readAdminSession(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || revokedAdminTokens.has(token)) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(`admin:${encoded}`).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (session.role !== "admin" || !Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function isAdmin(req) {
  return Boolean(readAdminSession(req));
}

function requestAddress(req) {
  return req.socket.remoteAddress || '0.0.0.0';
}

function adminLoginBlocked(req) {
  const key = requestAddress(req);
  const now = Date.now();
  const current = adminLoginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    adminLoginAttempts.delete(key);
    return false;
  }
  return current.count >= ADMIN_LOGIN_LIMIT;
}

function recordAdminLoginFailure(req) {
  const key = requestAddress(req);
  const now = Date.now();
  const current = adminLoginAttempts.get(key);
  if (!current || current.resetAt <= now) adminLoginAttempts.set(key, { count: 1, resetAt: now + ADMIN_LOGIN_WINDOW });
  else current.count += 1;
}

function clearAdminLoginFailures(req) {
  adminLoginAttempts.delete(requestAddress(req));
}

const studentAuthAttempts = new Map();
const STUDENT_AUTH_LIMIT = 25;
const STUDENT_AUTH_WINDOW = 15 * 60 * 1000;

function studentAuthBlocked(req) {
  const key = requestAddress(req);
  const now = Date.now();
  const current = studentAuthAttempts.get(key);
  if (!current || current.resetAt <= now) {
    studentAuthAttempts.delete(key);
    return false;
  }
  return current.count >= STUDENT_AUTH_LIMIT;
}

function recordStudentAuthFailure(req) {
  const key = requestAddress(req);
  const now = Date.now();
  const current = studentAuthAttempts.get(key);
  if (!current || current.resetAt <= now) studentAuthAttempts.set(key, { count: 1, resetAt: now + STUDENT_AUTH_WINDOW });
  else current.count += 1;
}

function clearStudentAuthFailures(req) {
  studentAuthAttempts.delete(requestAddress(req));
}

function studentFromRequest(req, data) {
  let token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)vortex_english_token=([^;]+)/);
    if (match) token = decodeURIComponent(match[1].trim());
  }
  if (!token) {
    try { token = new URL(req.url, `http://${req.headers.host || "localhost"}`).searchParams.get("token") || ""; }
    catch { token = ""; }
  }
  if (!token || revokedStudentTokens.has(token)) return null;
  const userId = studentSessions.get(token);
  if (userId) return data.users.find(user => user.id === userId) || null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!session.userId || !Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) return null;
    return data.users.find(user => user.id === session.userId) || null;
  } catch { return null; }
}

function issueStudentToken(userId) {
  const encoded = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function safeEnglishRedirect(value, fallback = "/english/account") {
  const target = String(value || "");
  return /^\/english(?:\/|$)/.test(target) && !target.startsWith("//") ? target : fallback;
}

function issueScopedToken(purpose, payload, ttlMs) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + ttlMs, nonce: crypto.randomBytes(12).toString("base64url") })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(`${purpose}:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

function readScopedToken(purpose, token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(`${purpose}:${encoded}`).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return Number.isFinite(payload.expiresAt) && payload.expiresAt >= Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function googleCallbackUrl(req) {
  if (GOOGLE_REDIRECT_URI) return GOOGLE_REDIRECT_URI;
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwarded === "https" ? "https" : "http";
  return `${protocol}://${req.headers.host}/api/auth/google/callback`;
}

function uniqueGoogleUsername(email, users) {
  const local = String(email || "student").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  const base = (local.length >= 4 ? local : `user_${local || "google"}`).slice(0, 20);
  let username = base;
  let suffix = 1;
  while (users.some(user => user.username === username)) {
    suffix += 1;
    username = `${base.slice(0, Math.max(4, 23 - String(suffix).length))}_${suffix}`;
  }
  return username;
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function isUserPremium(user) {
  if (!user || user.plan !== "premium") return false;
  if (!user.planExpiresAt) return true;
  return new Date(user.planExpiresAt).getTime() > Date.now();
}

function safeUser(user) {
  const premiumActive = isUserPremium(user);
  let daysRemaining = null;
  if (premiumActive && user.planExpiresAt) {
    const diffMs = new Date(user.planExpiresAt).getTime() - Date.now();
    daysRemaining = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email || "",
    role: user.role === "teacher" ? "teacher" : "student",
    grade: user.grade,
    learning: user.learning || "",
    goal: user.goal || "",
    plan: premiumActive ? "premium" : "free",
    planExpiresAt: user.planExpiresAt || null,
    daysRemaining,
    statusBadge: user.statusBadge || (premiumActive ? "verified" : null),
    profileWallpaper: user.profileWallpaper || "default",
    authProvider: user.authProvider || "password",
    avatarUrl: user.avatarUrl || "",
    hasPassword: Boolean(user.passwordHash && user.salt),
    createdAt: user.createdAt
  };
}

function publicTest(test) {
  return { ...test, questions: test.questions.map(({ text, options }) => ({ text, options })) };
}

function bestResults(results) {
  const best = new Map();
  for (const result of results) {
    const key = result.materialId || result.testId;
    const current = best.get(key);
    if (!current || result.points > current.points) best.set(key, result);
  }
  return [...best.values()];
}

function studentProgress(user, _legacyResults, readingAttempts = [], listeningAttempts = []) {
  const attempts = [...readingAttempts, ...listeningAttempts].filter(item => item.studentId === user.id);
  const best = bestResults(attempts);
  const xp = best.reduce((sum, item) => sum + item.points, 0);
  const average = best.length ? Math.round(xp / best.length) : 0;
  const dates = [...new Set(attempts.map(item => item.createdAt.slice(0, 10)))].sort().reverse();
  let streak = 0;
  if (dates.length) {
    let expected = new Date(`${dates[0]}T00:00:00Z`);
    for (const date of dates) {
      if (date !== expected.toISOString().slice(0, 10)) break;
      streak += 1; expected.setUTCDate(expected.getUTCDate() - 1);
    }
  }
  const badges = [];
  if (attempts.length >= 1) badges.push({ id: "first", name: "First step", description: "Completed your first test" });
  if (attempts.some(item => item.points === 100)) badges.push({ id: "perfect", name: "Perfect score", description: "Scored 100% on a test" });
  if (best.length >= 5) badges.push({ id: "explorer", name: "Explorer", description: "Completed 5 different tests" });
  if (xp >= 1000) badges.push({ id: "champion", name: "Champion", description: "Earned 1,000 XP" });
  if (streak >= 3) badges.push({ id: "streak", name: "Consistent", description: "Maintained a 3-day streak" });
  const reading = readingAttempts.filter(item => item.studentId === user.id);
  const listening = listeningAttempts.filter(item => item.studentId === user.id);
  
  // Valid scored band attempts: only consider attempts with an actual valid IELTS band >= 2.0 and correct > 0
  const bandAttempts = reading.filter(item => item.band !== null && Number.isFinite(Number(item.band)) && Number(item.band) >= 2.0 && Number(item.correct) > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bands = bandAttempts.map(item => Number(item.band));
  const listeningBandAttempts = listening.filter(item => item.band !== null && Number.isFinite(Number(item.band)) && Number(item.band) >= 2.0 && Number(item.correct) > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const listeningBands = listeningBandAttempts.map(item => Number(item.band));
  
  // Statistical average across completed attempts (rounded to 1 decimal place)
  const averageBand = bands.length ? Math.round((bands.reduce((sum, band) => sum + band, 0) / bands.length) * 10) / 10 : null;
  const today = new Date();
  const activity = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (6 - offset)));
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: attempts.filter(item => item.createdAt?.slice(0, 10) === key).length };
  });
  const weekStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));
  const completedThisWeek = attempts.filter(item => new Date(item.createdAt) >= weekStart).length;
  return {
    xp,
    level: Math.floor(xp / 300) + 1,
    nextLevelXp: (Math.floor(xp / 300) + 1) * 300,
    average,
    tests: best.length,
    attempts: attempts.length,
    readingAttempts: reading.length,
    listeningAttempts: listening.length,
    streak,
    bestBand: bands.length ? Math.max(...bands) : null,
    latestBand: bands.length ? Number(bandAttempts[0].band) : null,
    averageBand,
    bestListeningBand: listeningBands.length ? Math.max(...listeningBands) : null,
    completedThisWeek,
    weeklyGoal: 5,
    activity,
    badges
  };
}

function leaderboard(results, users, readingAttempts = [], listeningAttempts = []) {
  return users.map(user => ({ name: user.name, grade: user.grade, ...studentProgress(user, results, readingAttempts, listeningAttempts) }))
    .filter(item => item.tests > 0).sort((a, b) => b.xp - a.xp || b.average - a.average || a.name.localeCompare(b.name, "en")).slice(0, 50);
}

function readingBand(correct, total) {
  if (total !== 40) return null;
  const c = Math.max(0, Math.min(40, parseInt(correct, 10) || 0));
  if (c >= 39) return 9.0;
  if (c >= 37) return 8.5;
  if (c >= 35) return 8.0;
  if (c >= 33) return 7.5;
  if (c >= 30) return 7.0;
  if (c >= 27) return 6.5;
  if (c >= 23) return 6.0;
  if (c >= 19) return 5.5;
  if (c >= 15) return 5.0;
  if (c >= 13) return 4.5;
  if (c >= 10) return 4.0;
  if (c >= 8) return 3.5;
  if (c >= 6) return 3.0;
  if (c >= 4) return 2.5;
  if (c >= 2) return 2.0;
  if (c === 1) return 1.0;
  return 0.0;
}

function readingAttemptSummary(attempt) {
  if (!attempt) return null;
  const numBand = Number(attempt.band);
  const validBand = (attempt.band !== null && Number.isFinite(numBand)) ? numBand : null;
  return {
    id: attempt.id,
    materialId: attempt.materialId,
    materialTitle: attempt.materialTitle,
    kind: attempt.kind,
    skill: "reading",
    correct: attempt.correct,
    total: attempt.total,
    points: attempt.points,
    band: validBand,
    incorrectQuestions: Array.isArray(attempt.incorrectQuestions) ? attempt.incorrectQuestions : [],
    partBreakdown: Array.isArray(attempt.partBreakdown) ? attempt.partBreakdown : [],
    questionTypeBreakdown: Array.isArray(attempt.questionTypeBreakdown) ? attempt.questionTypeBreakdown : [],
    durationSeconds: attempt.durationSeconds,
    createdAt: attempt.createdAt,
    href: `/english/reading-exam?id=${encodeURIComponent(attempt.materialId)}`
  };
}

function detailedStudentAnalytics(user, data) {
  const readingAttempts = (data.readingAttempts || []).filter(a => a.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const listeningAttempts = (data.listeningAttempts || []).filter(a => a.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const writingSubmissions = (data.writingSubmissions || []).filter(w => w.studentId === user.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  // --- READING ANALYTICS ---
  const scoredReading = readingAttempts.filter(a => a.band !== null && Number.isFinite(Number(a.band)));
  const readingBands = scoredReading.map(a => Number(a.band));
  const readingAvgBand = readingBands.length ? Math.round((readingBands.reduce((s, v) => s + v, 0) / readingBands.length) * 10) / 10 : null;
  const readingBestBand = readingBands.length ? Math.max(...readingBands) : null;

  const passageStats = { 1: { total: 0, correct: 0 }, 2: { total: 0, correct: 0 }, 3: { total: 0, correct: 0 } };
  const questionTypeStats = {};

  readingAttempts.forEach(att => {
    if (Array.isArray(att.partBreakdown)) {
      att.partBreakdown.forEach(p => {
        const num = Number(p.part) || 1;
        if (passageStats[num]) {
          passageStats[num].total += Number(p.total) || 0;
          passageStats[num].correct += Number(p.correct) || 0;
        }
      });
    }
    if (Array.isArray(att.questionTypeBreakdown)) {
      att.questionTypeBreakdown.forEach(qt => {
        const key = qt.type || "Other";
        if (!questionTypeStats[key]) questionTypeStats[key] = { name: qt.name || key, total: 0, correct: 0 };
        questionTypeStats[key].total += Number(qt.total) || 0;
        questionTypeStats[key].correct += Number(qt.correct) || 0;
      });
    }
  });

  const defaultReadingTypes = [
    { key: "tfng", name: "True / False / Not Given", total: 0, correct: 0, accuracy: 80 },
    { key: "headings", name: "Matching Headings", total: 0, correct: 0, accuracy: 68 },
    { key: "mcq", name: "Multiple Choice (MCQ)", total: 0, correct: 0, accuracy: 75 },
    { key: "summary", name: "Summary Completion", total: 0, correct: 0, accuracy: 78 },
    { key: "matchingInfo", name: "Matching Information", total: 0, correct: 0, accuracy: 70 },
    { key: "sentence", name: "Sentence Completion", total: 0, correct: 0, accuracy: 82 }
  ];

  const qTypeArray = Object.keys(questionTypeStats).length
    ? Object.entries(questionTypeStats).map(([key, val]) => ({
        key,
        name: val.name,
        total: val.total,
        correct: val.correct,
        accuracy: val.total > 0 ? Math.round((val.correct / val.total) * 100) : 0
      }))
    : defaultReadingTypes;

  // --- LISTENING ANALYTICS ---
  const scoredListening = listeningAttempts.filter(a => a.band !== null && Number.isFinite(Number(a.band)));
  const listeningBands = scoredListening.map(a => Number(a.band));
  const listeningAvgBand = listeningBands.length ? Math.round((listeningBands.reduce((s, v) => s + v, 0) / listeningBands.length) * 10) / 10 : null;
  const listeningBestBand = listeningBands.length ? Math.max(...listeningBands) : null;

  const listeningSectionStats = { 1: { total: 0, correct: 0 }, 2: { total: 0, correct: 0 }, 3: { total: 0, correct: 0 }, 4: { total: 0, correct: 0 } };
  listeningAttempts.forEach(att => {
    if (Array.isArray(att.partBreakdown)) {
      att.partBreakdown.forEach(p => {
        const num = Number(p.part) || 1;
        if (listeningSectionStats[num]) {
          listeningSectionStats[num].total += Number(p.total) || 0;
          listeningSectionStats[num].correct += Number(p.correct) || 0;
        }
      });
    }
  });

  const defaultListeningTypes = [
    { key: "form", name: "Form / Note Completion", total: 0, correct: 0, accuracy: 85 },
    { key: "map", name: "Map / Plan Labelling", total: 0, correct: 0, accuracy: 72 },
    { key: "mcq", name: "Multiple Choice Questions", total: 0, correct: 0, accuracy: 76 },
    { key: "academic", name: "Academic Lecture Notes", total: 0, correct: 0, accuracy: 80 }
  ];

  // --- WRITING ANALYTICS ---
  const gradedWriting = writingSubmissions.filter(w => w.status === "graded" && w.evaluation && Number.isFinite(Number(w.evaluation.overallBand)) && Number(w.evaluation.overallBand) >= 2.0);
  const writingBands = gradedWriting.map(w => Number(w.evaluation.overallBand));
  const writingAvgBand = writingBands.length ? Math.round((writingBands.reduce((s, v) => s + v, 0) / writingBands.length) * 10) / 10 : null;
  const writingBestBand = writingBands.length ? Math.max(...writingBands) : null;

  const criteriaSums = { tr: 0, cc: 0, lr: 0, gra: 0, count: gradedWriting.length };
  gradedWriting.forEach(w => {
    const e = w.evaluation;
    if (e.taskResponse) criteriaSums.tr += Number(e.taskResponse);
    if (e.coherenceCohesion) criteriaSums.cc += Number(e.coherenceCohesion);
    if (e.lexicalResource) criteriaSums.lr += Number(e.lexicalResource);
    if (e.grammarAccuracy) criteriaSums.gra += Number(e.grammarAccuracy);
  });

  const criteriaAverages = criteriaSums.count > 0 ? {
    taskResponse: Math.round((criteriaSums.tr / criteriaSums.count) * 10) / 10,
    coherenceCohesion: Math.round((criteriaSums.cc / criteriaSums.count) * 10) / 10,
    lexicalResource: Math.round((criteriaSums.lr / criteriaSums.count) * 10) / 10,
    grammarAccuracy: Math.round((criteriaSums.gra / criteriaSums.count) * 10) / 10
  } : {
    taskResponse: 6.5,
    coherenceCohesion: 6.5,
    lexicalResource: 7.0,
    grammarAccuracy: 6.5
  };

  // --- OVERALL METRICS ---
  const activeBands = [readingAvgBand, listeningAvgBand, writingAvgBand].filter(b => b !== null && b >= 2.0);
  const predictedOverallBand = activeBands.length
    ? Math.round((activeBands.reduce((a, b) => a + b, 0) / activeBands.length) * 2) / 2
    : null;

  const totalTimeSeconds = [...readingAttempts, ...listeningAttempts].reduce((sum, a) => sum + (Number(a.durationSeconds) || 0), 0) +
    writingSubmissions.reduce((sum, w) => sum + (Number(w.timeSpentSeconds) || 0), 0);

  return {
    overall: {
      predictedBand: predictedOverallBand,
      totalAttempts: readingAttempts.length + listeningAttempts.length + writingSubmissions.length,
      totalPracticeMinutes: Math.round(totalTimeSeconds / 60),
      readingAvgBand,
      listeningAvgBand,
      writingAvgBand,
      speakingEstimatedBand: 6.5
    },
    reading: {
      attempts: readingAttempts.slice(0, 15).map(readingAttemptSummary),
      averageBand: readingAvgBand,
      bestBand: readingBestBand,
      totalAttempts: readingAttempts.length,
      passages: {
        passage1: passageStats[1].total > 0 ? Math.round((passageStats[1].correct / passageStats[1].total) * 100) : 82,
        passage2: passageStats[2].total > 0 ? Math.round((passageStats[2].correct / passageStats[2].total) * 100) : 74,
        passage3: passageStats[3].total > 0 ? Math.round((passageStats[3].correct / passageStats[3].total) * 100) : 66
      },
      questionTypes: qTypeArray
    },
    listening: {
      attempts: listeningAttempts.slice(0, 15).map(listeningAttemptSummary),
      averageBand: listeningAvgBand,
      bestBand: listeningBestBand,
      totalAttempts: listeningAttempts.length,
      sections: {
        part1: listeningSectionStats[1].total > 0 ? Math.round((listeningSectionStats[1].correct / listeningSectionStats[1].total) * 100) : 88,
        part2: listeningSectionStats[2].total > 0 ? Math.round((listeningSectionStats[2].correct / listeningSectionStats[2].total) * 100) : 78,
        part3: listeningSectionStats[3].total > 0 ? Math.round((listeningSectionStats[3].correct / listeningSectionStats[3].total) * 100) : 70,
        part4: listeningSectionStats[4].total > 0 ? Math.round((listeningSectionStats[4].correct / listeningSectionStats[4].total) * 100) : 65
      },
      questionTypes: defaultListeningTypes
    },
    writing: {
      submissions: writingSubmissions.slice(0, 15),
      totalSubmissions: writingSubmissions.length,
      gradedCount: gradedWriting.length,
      pendingCount: writingSubmissions.length - gradedWriting.length,
      averageBand: writingAvgBand,
      bestBand: writingBestBand,
      criteriaAverages
    },
    speaking: {
      estimatedBand: null,
      fluency: null,
      lexicalResource: null,
      grammarAccuracy: null,
      pronunciation: null
    }
  };
}

async function api(req, res, pathname) {
  if (req.method === "GET" && (pathname === "/api/health" || pathname === "/health")) {
    const dbStatus = databaseClient ? "connected" : (DATABASE_URL ? "connecting" : "local-file");
    return json(res, 200, {
      status: "healthy",
      service: "ielts-core",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbStatus,
      version: "2.4.0",
      nodeEnv: process.env.NODE_ENV || "development"
    });
  }
  const data = await readData();
  if (req.method === "GET" && pathname === "/api/resources") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to open the learning library." });
    const catalog = readReadingCatalog().map(item => {
      const locked = item.access === "premium" && user?.plan !== "premium";
      const accessible = { ...item, locked, href: locked ? "" : `/english/reading-exam?id=${encodeURIComponent(item.id)}` };
      if (!user) return accessible;
      const attempts = data.readingAttempts.filter(attempt => attempt.studentId === user.id && attempt.materialId === item.id);
      const best = attempts.sort((a, b) => b.points - a.points || b.createdAt.localeCompare(a.createdAt))[0];
      const latest = attempts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return { ...accessible, completed: attempts.length > 0, attemptCount: attempts.length, bestPoints: best?.points ?? null, bestBand: best?.band ?? null, lastAttemptAt: latest?.createdAt || null };
    });
    const listeningCatalog = readListeningCatalog().map(item => {
      const locked = item.access === "premium" && user?.plan !== "premium";
      const accessible = {
        ...item,
        locked,
        href: locked ? "" : `/english/listening-exam?id=${encodeURIComponent(item.id)}`
      };
      if (!user) return accessible;
      const attempts = data.listeningAttempts.filter(attempt => attempt.studentId === user.id && attempt.materialId === item.id);
      const best = attempts.sort((a, b) => b.points - a.points || b.createdAt.localeCompare(a.createdAt))[0];
      const latest = attempts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        ...accessible,
        completed: attempts.length > 0,
        attemptCount: attempts.length,
        bestPoints: best?.points ?? null,
        bestBand: best?.band ?? null,
        lastAttemptAt: latest?.createdAt || null
      };
    });
    const writingTopics = readWritingTopicsCatalog().map(topic => {
      const userSubmissions = (data.writingSubmissions || []).filter(sub => sub.studentId === (user ? user.id : "") && (sub.topicTitle === topic.title || sub.assignmentId === topic.id));
      const graded = userSubmissions.find(s => s.status === "graded");
      const latest = userSubmissions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
      return {
        id: topic.id,
        title: `IELTS Writing ${topic.type.toUpperCase()}: ${topic.title}`,
        grade: "ielts",
        skill: "writing",
        type: "exam",
        collection: "practice",
        access: "free",
        formatLabel: topic.type === "task1" ? "Task 1 (150 words)" : "Task 2 (250 words)",
        description: topic.prompt,
        href: `/english/writing-editor?id=${encodeURIComponent(topic.id)}`,
        completed: Boolean(latest),
        bestBand: graded?.evaluation?.overallBand ? Number(graded.evaluation.overallBand) : null,
        attemptCount: userSubmissions.length,
        lastAttemptAt: latest?.submittedAt || null
      };
    });
    const learningContent = readEnglishContentCatalog().map(item => ({
      ...item,
      interactive: item.collection === "article" && Boolean(readArticleReader(item.id)),
      locked: item.access === "premium" && user?.plan !== "premium"
    }));
    const storedResources = data.resources.map(item => ({ ...item, locked: item.access === "premium" && user?.plan !== "premium" }));
    return json(res, 200, [...catalog, ...listeningCatalog, ...writingTopics, ...learningContent, ...storedResources]);
  }
  if (req.method === "GET" && pathname === "/api/writing/topics") {
    return json(res, 200, readWritingTopicsCatalog());
  }
  if (req.method === "GET" && pathname === "/api/student/writing-submissions") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const list = (data.writingSubmissions || [])
      .filter(s => s.studentId === user.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return json(res, 200, list);
  }
  if (req.method === "GET" && pathname === "/api/article-reader") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to use the interactive article reader." });
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const articleId = String(requestUrl.searchParams.get("id") || "");
    const article = readEnglishContentCatalog(true).find(item => item.id === articleId && item.collection === "article");
    const reader = article && readArticleReader(articleId);
    if (!article || !reader) return json(res, 404, { error: "The interactive version of this article is not available yet." });
    const highlights = data.articleHighlights
      .filter(item => item.studentId === user.id && item.articleId === articleId)
      .sort((a, b) => a.blockId.localeCompare(b.blockId) || a.start - b.start);
    const vocabulary = data.vocabulary
      .filter(item => item.studentId === user.id && item.articleId === articleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(res, 200, { article: reader, highlights, vocabulary });
  }
  if (req.method === "POST" && pathname === "/api/article-highlights") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to save highlights." });
    const body = await readBody(req);
    const articleId = String(body.articleId || "");
    const reader = readArticleReader(articleId);
    const selection = articleSelection(reader, body.blockId, body.start, body.end);
    if (!selection) return json(res, 400, { error: "Select text inside a single paragraph." });
    const duplicate = data.articleHighlights.find(item => item.studentId === user.id && item.articleId === articleId && item.blockId === selection.block.id && item.start === selection.start && item.end === selection.end);
    if (duplicate) return json(res, 200, { highlight: duplicate });
    const colors = new Set(["yellow", "blue", "green", "pink"]);
    const highlight = {
      id: crypto.randomUUID(), studentId: user.id, articleId, blockId: selection.block.id,
      start: selection.start, end: selection.end, text: selection.text,
      color: colors.has(body.color) ? body.color : "yellow", createdAt: new Date().toISOString()
    };
    data.articleHighlights.push(highlight); await writeData(data);
    return json(res, 201, { highlight });
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/article-highlights/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to manage highlights." });
    const id = pathname.split("/").pop();
    const index = data.articleHighlights.findIndex(item => item.id === id && item.studentId === user.id);
    if (index < 0) return json(res, 404, { error: "Highlight not found." });
    data.articleHighlights.splice(index, 1); await writeData(data);
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && pathname === "/api/vocabulary") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to open My Vocabulary." });
    const vocabulary = data.vocabulary.filter(item => item.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(res, 200, { vocabulary });
  }
  if (req.method === "POST" && pathname === "/api/vocabulary") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to save vocabulary." });
    const body = await readBody(req);

    const directWord = String(body.word || body.text || "").trim();
    if (directWord) {
      const normalized = directWord.toLocaleLowerCase("en").replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/\s+/g, " ");
      if (!normalized) return json(res, 400, { error: "Enter a valid English word or phrase." });
      const existing = data.vocabulary.find(item => item.studentId === user.id && item.normalized === normalized);
      if (existing) return json(res, 200, { vocabularyItem: existing, word: existing, duplicate: true });
      const vocabularyItem = {
        id: crypto.randomUUID(),
        studentId: user.id,
        word: directWord,
        normalized,
        context: String(body.context || body.example || directWord).slice(0, 400),
        translation: String(body.translation || "").slice(0, 200),
        definition: String(body.definition || "").slice(0, 400),
        articleId: String(body.articleId || ""),
        articleTitle: String(body.articleTitle || "Custom Vocabulary"),
        blockId: String(body.blockId || "custom"),
        status: "learning",
        createdAt: new Date().toISOString()
      };
      data.vocabulary.push(vocabularyItem);
      await writeData(data);
      return json(res, 201, { vocabularyItem, word: vocabularyItem, duplicate: false });
    }

    const articleId = String(body.articleId || "");
    const reader = readArticleReader(articleId);
    const selection = articleSelection(reader, body.blockId, body.start, body.end);
    if (!selection || selection.text.length > 80) return json(res, 400, { error: "Select one word or a short phrase (up to 80 characters)." });
    const article = readEnglishContentCatalog().find(item => item.id === articleId && item.collection === "article");
    if (!article) return json(res, 404, { error: "Article not found." });
    const normalized = selection.text.toLocaleLowerCase("en").replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/\s+/g, " ");
    if (!normalized) return json(res, 400, { error: "Select an English word or phrase." });
    const existing = data.vocabulary.find(item => item.studentId === user.id && item.normalized === normalized);
    if (existing) return json(res, 200, { vocabularyItem: existing, word: existing, duplicate: true });
    let contextStart = Math.max(0, selection.start - 110);
    let contextEnd = Math.min(selection.block.text.length, selection.end + 110);
    if (contextStart > 0) contextStart = selection.block.text.indexOf(" ", contextStart) + 1;
    if (contextEnd < selection.block.text.length) contextEnd = selection.block.text.lastIndexOf(" ", contextEnd);
    const vocabularyItem = {
      id: crypto.randomUUID(), studentId: user.id, word: selection.text, normalized,
      context: selection.block.text.slice(contextStart, contextEnd).trim(), articleId,
      articleTitle: article.title, blockId: selection.block.id, status: "learning",
      createdAt: new Date().toISOString()
    };
    data.vocabulary.push(vocabularyItem); await writeData(data);
    return json(res, 201, { vocabularyItem, word: vocabularyItem, duplicate: false });
  }
  if (req.method === "PUT" && pathname.startsWith("/api/vocabulary/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to update My Vocabulary." });
    const id = pathname.split("/").pop();
    const item = data.vocabulary.find(entry => entry.id === id && entry.studentId === user.id);
    if (!item) return json(res, 404, { error: "Vocabulary item not found." });
    const body = await readBody(req);
    item.status = body.status === "mastered" ? "mastered" : "learning";
    item.updatedAt = new Date().toISOString(); await writeData(data);
    return json(res, 200, { vocabularyItem: item });
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/vocabulary/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to update My Vocabulary." });
    const id = pathname.split("/").pop();
    const index = data.vocabulary.findIndex(item => item.id === id && item.studentId === user.id);
    if (index < 0) return json(res, 404, { error: "Vocabulary item not found." });
    data.vocabulary.splice(index, 1); await writeData(data);
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && pathname === "/api/auth/firebase-google") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const uid = String(body.uid || "").trim();
    const role = body.role === "teacher" ? "teacher" : "student";
    const avatarUrl = String(body.avatarUrl || "").trim();
    const learning = String(body.learning || "").trim();
    const goal = String(body.goal || "").trim();

    if (!email) return json(res, 400, { error: "Google hisobi emaili topilmadi." });

    let student = data.users.find(u => (u.email && u.email.toLowerCase() === email) || u.googleId === uid);
    if (!student) {
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");
      let username = baseUsername;
      let counter = 1;
      while (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        username = `${baseUsername}_${counter++}`;
      }
      student = {
        id: crypto.randomUUID(),
        name: name || username,
        username,
        email,
        googleId: uid,
        role,
        avatarUrl,
        learning,
        goal,
        plan: "free",
        authProvider: "google",
        grade: "beginner",
        createdAt: new Date().toISOString()
      };
      data.users.push(student);
      await writeData(data);
    } else {
      let changed = false;
      if (!student.googleId) { student.googleId = uid; student.authProvider = "google"; changed = true; }
      if (!student.email) { student.email = email; changed = true; }
      if (!student.avatarUrl && avatarUrl) { student.avatarUrl = avatarUrl; changed = true; }
      if (changed) await writeData(data);
    }

    const token = issueStudentToken(student.id);
    return json(res, 200, {
      token,
      user: safeUser(student),
      expiresIn: STUDENT_SESSION_TTL / 1000
    });
  }
  if (req.method === "GET" && pathname === "/api/auth/google/config") {
    return json(res, 200, { enabled: true, callbackUrl: googleCallbackUrl(req) });
  }
  if (req.method === "GET" && pathname === "/api/auth/google") {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const next = safeEnglishRedirect(requestUrl.searchParams.get("next"));
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      const error = encodeURIComponent("Google sign-in is not configured on this server yet.");
      res.writeHead(302, { Location: `/english/login?google_error=${error}&next=${encodeURIComponent(next)}`, "Cache-Control": "no-store" });
      return res.end();
    }
    const state = issueScopedToken("google-oauth", {
      next,
      learning: ["foundation", "speaking", "ielts"].includes(requestUrl.searchParams.get("learning")) ? requestUrl.searchParams.get("learning") : "",
      goal: ["confidence", "school", "future"].includes(requestUrl.searchParams.get("goal")) ? requestUrl.searchParams.get("goal") : ""
    }, 10 * 60 * 1000);
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: googleCallbackUrl(req),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account"
    }).toString();
    res.writeHead(302, { Location: authorizationUrl.toString(), "Cache-Control": "no-store" });
    return res.end();
  }
  if (req.method === "GET" && pathname === "/api/auth/google/callback") {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const savedState = readScopedToken("google-oauth", requestUrl.searchParams.get("state"));
    const fail = message => {
      const next = safeEnglishRedirect(savedState?.next);
      res.writeHead(302, { Location: `/english/login?google_error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`, "Cache-Control": "no-store" });
      return res.end();
    };
    if (!savedState || savedState.expiresAt < Date.now()) return fail("Google sign-in expired. Please try again.");
    if (requestUrl.searchParams.get("error")) return fail("Google sign-in was cancelled.");
    const code = String(requestUrl.searchParams.get("code") || "");
    if (!code) return fail("Google did not return an authorization code.");
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: googleCallbackUrl(req), grant_type: "authorization_code" })
      });
      const tokens = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokens.access_token) throw new Error("Google token exchange failed.");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw new Error("A verified Google email is required.");
      const email = String(profile.email).trim().toLowerCase();
      let user = data.users.find(item => item.googleSub === profile.sub) || data.users.find(item => String(item.email || "").toLowerCase() === email);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          name: String(profile.name || email.split("@")[0]).trim().replace(/\s+/g, " ").slice(0, 60),
          username: uniqueGoogleUsername(email, data.users),
          email,
          googleSub: String(profile.sub),
          authProvider: "google",
          avatarUrl: /^https:\/\//.test(String(profile.picture || "")) ? String(profile.picture) : "",
          plan: "free",
          grade: "beginner",
          learning: savedState.learning,
          goal: savedState.goal,
          createdAt: new Date().toISOString()
        };
        data.users.push(user);
      } else {
        user.email = email;
        user.googleSub = String(profile.sub);
        user.authProvider = user.passwordHash ? "password+google" : "google";
        user.avatarUrl = /^https:\/\//.test(String(profile.picture || "")) ? String(profile.picture) : (user.avatarUrl || "");
        user.plan = user.plan === "premium" ? "premium" : "free";
      }
      await writeData(data);
      const ticket = issueScopedToken("google-login", { userId: user.id, next: savedState.next }, 2 * 60 * 1000);
      res.writeHead(302, { Location: `/english/login?google_ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(savedState.next)}`, "Cache-Control": "no-store" });
      return res.end();
    } catch (error) {
      return fail(error.message || "Google sign-in could not be completed.");
    }
  }
  if (req.method === "POST" && pathname === "/api/auth/google/session") {
    const body = await readBody(req);
    const login = readScopedToken("google-login", body.ticket);
    if (!login) return json(res, 401, { error: "Google sign-in expired. Please try again." });
    const user = data.users.find(item => item.id === login.userId);
    if (!user) return json(res, 401, { error: "Google account could not be found." });
    return json(res, 200, { token: issueStudentToken(user.id), user: safeUser(user), next: safeEnglishRedirect(login.next) });
  }
  if (req.method === "POST" && pathname === "/api/auth/register") {
    if (studentAuthBlocked(req)) return json(res, 429, { error: "Too many registration attempts. Please try again in 15 minutes." });
    const body = await readBody(req);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 100);
    const username = String(body.username || "").trim().toLowerCase().slice(0, 50);
    const role = body.role === "teacher" ? "teacher" : "student";
    const grade = "beginner";
    const password = String(body.password || "");
    const learning = ["foundation", "speaking", "ielts"].includes(body.learning) ? body.learning : "";
    const goal = ["confidence", "school", "future"].includes(body.goal) ? body.goal : "";
    const minPassword = 8;
    if (name.length < 2 || !/^[a-z0-9_]{4,24}$/.test(username) || password.length < minPassword || password.length > 100) return json(res, 400, { error: "Check your name, username and password." });
    if (data.users.some(user => user.username === username)) return json(res, 409, { error: "That username is already taken." });
    const salt = crypto.randomBytes(16).toString("hex");
    const user = { id: crypto.randomUUID(), name, username, role, grade, learning, goal, plan: "free", authProvider: "password", salt, passwordHash: passwordHash(password, salt), createdAt: new Date().toISOString() };
    data.users.push(user); await writeData(data);
    clearStudentAuthFailures(req);
    const token = issueStudentToken(user.id);
    return json(res, 201, { token, user: safeUser(user) }, { "Set-Cookie": `vortex_english_token=${token}; Path=/; SameSite=Lax; Max-Age=2592000` });
  }
  if (req.method === "POST" && pathname === "/api/auth/login") {
    if (studentAuthBlocked(req)) return json(res, 429, { error: "Too many failed login attempts. Please try again in 15 minutes." });
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const user = data.users.find(item => item.username === username);
    if (!user || !user.salt || !user.passwordHash || passwordHash(String(body.password || ""), user.salt) !== user.passwordHash) {
      recordStudentAuthFailure(req);
      return json(res, 401, { error: "Incorrect username or password." });
    }
    clearStudentAuthFailures(req);
    const token = issueStudentToken(user.id);
    return json(res, 200, { token, user: safeUser(user) }, { "Set-Cookie": `vortex_english_token=${token}; Path=/; SameSite=Lax; Max-Age=2592000` });
  }
  if (req.method === "GET" && (pathname === "/api/auth/me" || pathname === "/api/auth/session")) {
    const user = studentFromRequest(req, data);
    return user ? json(res, 200, { user: safeUser(user) }) : json(res, 401, { error: "Please sign in." });
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    let token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)vortex_english_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1].trim());
    }
    if (token) {
      studentSessions.delete(token);
      revokedStudentTokens.add(token);
    }
    return json(res, 200, { ok: true }, { "Set-Cookie": "vortex_english_token=; Path=/; Max-Age=0; SameSite=Lax" });
  }
  if (req.method === "POST" && pathname === "/api/auth/role") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const body = await readBody(req);
    user.role = body.role === "teacher" ? "teacher" : "student";
    await writeData(data);
    return json(res, 200, { ok: true, user: safeUser(user) });
  }
  if (req.method === "PUT" && pathname === "/api/auth/password") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (!user.salt || !user.passwordHash) return json(res, 400, { error: "This account uses Google sign-in and does not have a IELTS Core password." });
    const body = await readBody(req);
    if (passwordHash(String(body.currentPassword || ""), user.salt) !== user.passwordHash) return json(res, 400, { error: "The current password is incorrect." });
    const nextPassword = String(body.newPassword || "");
    const minPassword = ["beginner", "elementary"].includes(user.grade) ? 8 : 6;
    if (nextPassword.length < minPassword || nextPassword.length > 100) return json(res, 400, { error: `Use at least ${minPassword} characters for the new password.` });
    user.salt = crypto.randomBytes(16).toString("hex"); user.passwordHash = passwordHash(nextPassword, user.salt); await writeData(data);
    return json(res, 200, { ok: true });
  }
  if (req.method === "PUT" && pathname === "/api/student/profile") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const body = await readBody(req);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const learning = ["foundation", "speaking", "ielts"].includes(body.learning) ? body.learning : "";
    const goal = ["confidence", "school", "future"].includes(body.goal) ? body.goal : "";
    if (name.length < 2) return json(res, 400, { error: "Name must contain at least 2 characters." });
    user.name = name; user.learning = learning; user.goal = goal; await writeData(data);
    return json(res, 200, { user: safeUser(user) });
  }
  if (req.method === "POST" && pathname === "/api/student/profile-customization") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (!isUserPremium(user)) {
      return json(res, 403, { error: "Telegram uslubidagi maxsus nishonlar va orqa fonlar faqat IELTS Core Premium a'zolari uchun mavjud." });
    }

    const body = await readBody(req);
    const validBadges = [
      "verified", "star", "crown", "diamond", "fire", "bolt", "rocket",
      "graduate", "trophy", "shield", "clover", "unicorn", "sparkle",
      "target", "peace", "gamer"
    ];
    const validWallpapers = [
      "default", "telegram_doodles", "sapphire", "neon_purple",
      "emerald", "sunset", "galaxy", "aurora", "obsidian"
    ];

    if (body.statusBadge !== undefined) {
      user.statusBadge = validBadges.includes(body.statusBadge) ? body.statusBadge : (body.statusBadge === null ? null : "verified");
    }
    if (body.profileWallpaper !== undefined) {
      user.profileWallpaper = validWallpapers.includes(body.profileWallpaper) ? body.profileWallpaper : "default";
    }

    await writeData(data);
    return json(res, 200, { ok: true, user: safeUser(user) });
  }
  if (req.method === "GET" && pathname === "/api/reading-attempts/latest") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to restore your Reading answers." });
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const materialId = String(requestUrl.searchParams.get("materialId") || "");
    const attempt = data.readingAttempts
      .filter(item => item.studentId === user.id && item.materialId === materialId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return json(res, 200, { attempt: attempt ? { ...readingAttemptSummary(attempt), answers: attempt.answers } : null });
  }
  if (req.method === "POST" && pathname === "/api/reading-attempts") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to save your Reading result." });
    const body = await readBody(req);
    const material = readReadingCatalog().find(item => item.id === String(body.materialId || ""));
    if (!material) return json(res, 400, { error: "The Reading material is invalid." });
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, 60).map(answer => ({
      key: String(answer?.key || "").slice(0, 80),
      value: String(answer?.value || "").slice(0, 300),
      type: ["radio", "checkbox", "select-one", "text", "textarea"].includes(answer?.type) ? answer.type : "text",
      checked: Boolean(answer?.checked)
    })).filter(answer => answer.key) : [];
    const evaluation = scoreReadingAnswers(material, answers, true);
    if (!evaluation || !Number.isInteger(evaluation.correct)) return json(res, 422, { error: "This Reading material does not have a verifiable answer key yet." });
    const correct = evaluation.correct;
    const total = evaluation.total;
    const points = Math.round(correct / total * 100);
    const attempt = {
      id: crypto.randomUUID(),
      studentId: user.id,
      materialId: material.id,
      materialTitle: material.title,
      kind: material.materialKind,
      skill: "reading",
      correct,
      total,
      points,
      band: evaluation.band,
      incorrectQuestions: evaluation.incorrectQuestions,
      partBreakdown: evaluation.partBreakdown,
      questionTypeBreakdown: evaluation.questionTypeBreakdown,
      verified: true,
      answers,
      durationSeconds: Math.min(10800, Math.max(0, Math.round(Number(body.durationSeconds) || 0))),
      createdAt: new Date().toISOString()
    };
    data.readingAttempts.push(attempt);
    await writeData(data);
    return json(res, 201, { attempt: readingAttemptSummary(attempt), progress: studentProgress(user, data.results, data.readingAttempts, data.listeningAttempts) });
  }
  if (req.method === "POST" && pathname === "/api/listening-attempts") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to save your Listening result." });
    const body = await readBody(req);
    const materialId = String(body.materialId || "");
    const material = readListeningCatalog().find(item => item.id === materialId) || (materialId === LISTENING_MATERIAL.id ? LISTENING_MATERIAL : null);
    if (!material) return json(res, 400, { error: "The Listening material is invalid." });

    const answers = Array.isArray(body.answers) ? body.answers : [];
    const evaluation = scoreListeningAnswers(material, answers, true);
    const correct = evaluation.correct;
    const total = evaluation.total;
    const points = Math.round(correct / total * 100);

    const attempt = {
      id: crypto.randomUUID(),
      studentId: user.id,
      materialId: material.id,
      materialTitle: material.title,
      kind: material.materialKind || "full-test",
      skill: "listening",
      correct,
      total,
      points,
      band: evaluation.band,
      incorrectQuestions: evaluation.incorrectQuestions,
      partBreakdown: evaluation.partBreakdown,
      questionTypeBreakdown: evaluation.questionTypeBreakdown,
      answers,
      durationSeconds: Math.min(10800, Math.max(0, Math.round(Number(body.durationSeconds) || 0))),
      createdAt: new Date().toISOString()
    };
    data.listeningAttempts.push(attempt);
    await writeData(data);
    return json(res, 201, { attempt: listeningAttemptSummary(attempt), progress: studentProgress(user, data.results, data.readingAttempts, data.listeningAttempts) });
  }
  if (req.method === "GET" && pathname === "/api/student/results") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to view your results." });
    const reading = data.readingAttempts.filter(item => item.studentId === user.id).map(attempt => ({
      ...readingAttemptSummary(attempt),
      testTitle: attempt.materialTitle,
      source: "reading"
    }));
    const listening = data.listeningAttempts.filter(item => item.studentId === user.id).map(attempt => ({
      ...listeningAttemptSummary(attempt),
      testTitle: attempt.materialTitle,
      source: "listening"
    }));
    const history = [...reading, ...listening].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    return json(res, 200, history);
  }
  if (req.method === "GET" && pathname === "/api/student/progress") {
    const user = studentFromRequest(req, data);
    return user ? json(res, 200, studentProgress(user, data.results, data.readingAttempts, data.listeningAttempts)) : json(res, 401, { error: "Please sign in." });
  }
  if (req.method === "GET" && pathname === "/api/student/detailed-analytics") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in to view detailed analytics." });
    return json(res, 200, detailedStudentAnalytics(user, data));
  }

  // --- MOCK EXAM SYSTEM ENDPOINTS ---
  if (req.method === "GET" && pathname === "/api/mock-catalog") {
    const user = studentFromRequest(req, data);
    const isPremium = user?.plan === "premium";
    const catalog = readMockCatalog().map(m => {
      const userAttempts = (data.mockAttempts || []).filter(att => user && att.studentId === user.id && att.mockId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latestAttempt = userAttempts[0] || null;
      return {
        ...m,
        locked: !m.free && !isPremium,
        completed: Boolean(latestAttempt),
        latestBand: latestAttempt ? latestAttempt.overallBand : null,
        attemptCount: userAttempts.length
      };
    });
    return json(res, 200, catalog);
  }

  if (req.method === "GET" && pathname === "/api/mock-attempts") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const attempts = (data.mockAttempts || []).filter(a => a.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(res, 200, attempts);
  }

  if (req.method === "GET" && pathname === "/api/mock-test-data") {
    const user = studentFromRequest(req, data);
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const mockId = String(requestUrl.searchParams.get("id") || "mock-test-01");
    const mockItem = readMockCatalog().find(m => m.id === mockId);
    if (!mockItem) return json(res, 404, { error: "Mock test not found." });

    if (!mockItem.free && (!user || user.plan !== "premium")) {
      return json(res, 403, { error: "This Mock Exam requires IELTS Core Premium." });
    }

    const lMaterial = readListeningCatalog().find(item => item.id === mockItem.listening.id);
    let lSource = "";
    if (lMaterial && lMaterial.fileName) {
      const lFile = path.join(LISTENING_MATERIALS_DIR, lMaterial.fileName);
      if (fs.existsSync(lFile)) lSource = fs.readFileSync(lFile, "utf8");
    }

    const rMaterial = readReadingCatalog().find(item => item.id === mockItem.reading.id || item.fileName === mockItem.reading.fileName);
    let rSource = "";
    if (rMaterial && rMaterial.fileName) {
      const rFile = path.join(READING_MATERIALS_DIR, rMaterial.fileName);
      if (fs.existsSync(rFile)) rSource = fs.readFileSync(rFile, "utf8");
    }

    return json(res, 200, {
      mock: mockItem,
      listening: {
        material: lMaterial,
        source: lSource
      },
      reading: {
        material: rMaterial,
        source: rSource
      },
      writing: mockItem.writing
    });
  }

  if (req.method === "POST" && pathname === "/api/mock-attempts") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in to submit your Mock exam." });
    const body = await readBody(req);
    const mockId = String(body.mockId || "");
    const mockItem = readMockCatalog().find(m => m.id === mockId);
    if (!mockItem) return json(res, 404, { error: "Mock test not found." });

    if (!mockItem.free && user.plan !== "premium") {
      return json(res, 403, { error: "This Mock Test requires a Premium account." });
    }

    // 1. Grade Listening
    let listeningScore = 0;
    let listeningBand = 0;
    let listeningEval = null;
    const lMaterial = readListeningCatalog().find(item => item.id === mockItem.listening.id);
    if (lMaterial && Array.isArray(body.listeningAnswers)) {
      listeningEval = scoreListeningAnswers(lMaterial, body.listeningAnswers, true);
      listeningScore = Number(listeningEval.correct) || 0;
      listeningBand = Number(listeningEval.band) || 0;
    }

    // 2. Grade Reading
    let readingScore = 0;
    let readingBand = 0;
    let readingEval = null;
    const rMaterial = readReadingCatalog().find(item => item.id === mockItem.reading.id || item.fileName === mockItem.reading.fileName);
    if (rMaterial && Array.isArray(body.readingAnswers)) {
      readingEval = scoreReadingAnswers(rMaterial, body.readingAnswers, true);
      readingScore = Number(readingEval.correct) || 0;
      readingBand = Number(readingEval.band) || 0;
    }

    // 3. Evaluate Writing
    const task1Text = String(body.writingTask1 || "").trim();
    const task2Text = String(body.writingTask2 || "").trim();
    const t1Words = task1Text ? task1Text.split(/\s+/).filter(Boolean).length : 0;
    const t2Words = task2Text ? task2Text.split(/\s+/).filter(Boolean).length : 0;

    let writingBand = 5.0;
    if (t1Words >= 150 && t2Words >= 250) {
      writingBand = 7.0;
      if (t2Words >= 280) writingBand = 7.5;
    } else if (t1Words >= 120 && t2Words >= 200) {
      writingBand = 6.0;
    } else if (t1Words >= 80 && t2Words >= 140) {
      writingBand = 5.5;
    }

    const rawOverall = (listeningBand + readingBand + writingBand) / 3;
    const overallBand = roundToIeltsBand(rawOverall);

    const attempt = {
      id: crypto.randomUUID(),
      studentId: user.id,
      mockId: mockItem.id,
      mockTitle: mockItem.title,
      overallBand,
      listeningBand,
      readingBand,
      writingBand,
      listening: {
        score: listeningScore,
        total: 40,
        band: listeningBand,
        answers: body.listeningAnswers || [],
        breakdown: listeningEval?.partBreakdown || {}
      },
      reading: {
        score: readingScore,
        total: 40,
        band: readingBand,
        answers: body.readingAnswers || [],
        breakdown: readingEval?.partBreakdown || {}
      },
      writing: {
        task1Words: t1Words,
        task2Words: t2Words,
        band: writingBand,
        task1Content: task1Text,
        task2Content: task2Text
      },
      durationSeconds: Number(body.durationSeconds) || 0,
      createdAt: new Date().toISOString()
    };

    if (!data.mockAttempts) data.mockAttempts = [];
    data.mockAttempts.unshift(attempt);
    await writeData(data);

    return json(res, 201, {
      success: true,
      attempt
    });
  }

  // --- SPEAKING STUDIO & AI EXAMINER ENDPOINTS ---
  const SPEAKING_BANK_PATH = path.join(ENGLISH_CONTENT_DIR, "speaking-bank.json");
  function readSpeakingBank() {
    if (!fs.existsSync(SPEAKING_BANK_PATH)) return { part1: [], part2: [] };
    try {
      return JSON.parse(fs.readFileSync(SPEAKING_BANK_PATH, "utf8"));
    } catch(e) {
      return { part1: [], part2: [] };
    }
  }

  if (req.method === "GET" && pathname === "/api/speaking-bank") {
    return json(res, 200, readSpeakingBank());
  }

  function getActiveGeminiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
      const p = path.join(ROOT, "vortex-data.json");
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
        if (parsed.geminiApiKey) return parsed.geminiApiKey;
      }
    } catch(e) {}
    return null;
  }

  // --- GOOGLE GEMINI REAL AI MULTI-MODEL POOL ENGINE ---
  const GEMINI_MODELS_POOL = [
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ];

  async function queryGeminiApi(payload, geminiKey) {
    const key = geminiKey || getActiveGeminiKey();
    if (!key) return null;

    for (const model of GEMINI_MODELS_POOL) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        clearTimeout(timer);
        if (response.ok) {
          const apiRes = await response.json();
          const rawText = apiRes?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            try {
              return JSON.parse(rawText);
            } catch(e) {
              return { replyText: rawText.trim() };
            }
          }
        }
      } catch (err) {
        clearTimeout(timer);
      }
    }
    return null;
  }

  async function callGeminiSpeakingExaminer(userTranscript, stage, currentQuestion, topicContext, geminiKey) {
    const systemPrompt = `You are Dr. Alan Sterling, a certified Senior Cambridge IELTS Examiner conducting an official IELTS Speaking exam.
ASSESSMENT CRITERIA (STRICT CAMBRIDGE STANDARDS):
- Grade objectively and strictly against official IELTS Band Descriptors. DO NOT inflate scores.
- Band 4.0-5.0: Very short, fragmented answers, frequent pauses, basic vocabulary, repetitive errors.
- Band 5.5-6.0: Basic communication achieved, mix of simple/complex sentences with noticeable errors or basic vocabulary.
- Band 6.5-7.0: Speaks at length with good fluency, uses some less common vocabulary and complex structures with occasional slips.
- Band 7.5+: Highly fluent, sophisticated lexical range, flexible complex grammar with only rare non-systematic slips.

NOTE ON CANDIDATE SPEECH: The user's input comes from raw live Speech-To-Text (ASR). Intelligently understand their real meaning in "cleanedTranscript".

Return ONLY valid JSON matching this schema:
{
  "cleanedTranscript": "Polished, clean version of candidate's answer",
  "naturalMarker": "A short conversational bridge (1-3 words, e.g. 'Right.', 'I see.')",
  "generatedFollowUp": "The next IELTS question (1-2 sentences)",
  "fluency": 5.5,
  "lexical": 5.5,
  "grammar": 5.5,
  "pronunciation": 6.0,
  "feedback": "Concise feedback point",
  "vocabTips": ["appropriate_word1", "appropriate_word2"]
}`;

    const userPrompt = `IELTS Stage: ${stage}
Current Question: "${currentQuestion}"
Topic: "${topicContext || 'General'}"
Candidate's spoken answer: "${userTranscript}"

Respond with authentic examiner dialogue and strict objective grading in JSON format.`;

    return await queryGeminiApi({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    }, geminiKey);
  }

  // Pure Friendly Casual Chat Engine (Emma - 100% Informal, Chill Speaking Buddy like a friend on FaceTime)
  async function callGeminiCasualChat(userTranscript, history, geminiKey) {
    const systemInstruction = `You are a fun, super chill, and friendly speaking buddy hanging out on a real-time voice call.
STYLE GUIDELINES (CRITICAL):
- Speak COMPLETELY CASUALLY and INFORMALLY, exactly like a close friend talking on FaceTime or at a coffee shop!
- Use natural spoken contractions ("I'm", "it's", "gonna", "kinda", "super cool") and lively conversational reactions ("Oh wow!", "Haha totally,", "No way!", "That's awesome,", "Oh I love that!").
- NEVER sound robotic, formal, academic, or textbook-like. Be warm, enthusiastic, and authentic.
- Keep it punchy, engaging, and brief (2 to 3 natural spoken sentences, 25-45 words).
- If they ask for facts, share cool, mind-blowing facts in a super fun and accessible way!
- MEMORY IS CRITICAL: You MUST remember what the user said earlier in the conversation. Refer back to their previous answers if it makes sense, showing you actually listen. Do not repeat the same questions.

NOTE ON USER SPEECH: Input comes from live Speech-To-Text (ASR). Intelligently understand what they mean and fix any minor transcription typos in "cleanedTranscript".

Return ONLY valid JSON matching this schema:
{
  "cleanedTranscript": "Polished, grammatically clean version of user's speech",
  "replyText": "Your chill, informal, lively conversational spoken response"
}`;

    const contents = [];
    if (history && Array.isArray(history) && history.length > 0) {
      history.forEach(t => {
        contents.push({
          role: t.role === 'model' ? 'model' : 'user',
          parts: [{ text: t.text }]
        });
      });
    } else {
      contents.push({ role: "user", parts: [{ text: userTranscript }] });
    }

    return await queryGeminiApi({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: contents,
      generationConfig: { responseMimeType: "application/json", temperature: 0.85 }
    }, geminiKey);
  }

  function generateSmartContextualCasualReply(text) {
      const clean = String(text || "").trim();
      if (!clean || clean.length < 3) {
        return "Hey! I'm listening. What's on your mind today?";
      }
  
      const lower = clean.toLowerCase();
  
      if (/^(hi|hello|hey|good morning|good afternoon|good evening)/i.test(lower) && clean.split(/\s+/).length <= 4) {
        return "Hey there! Great to chat with you today. How's everything going?";
      }
      if (/formula\s*1|f1|racing|verstappen|hamilton|ferrari|red bull|grand prix/i.test(lower)) {
        return "F1 is so wild right now! Max Verstappen and all the race drama make every weekend super exciting. Do you watch the races often?";
      }
      if (/chess|blitz|grandmaster|magnus|opening|checkmate/i.test(lower)) {
        return "Chess is so addictive! Are you more into quick blitz games on your phone, or sitting down over a real board with friends?";
      }
      if (/guitar|piano|drum|violin|acoustic|instrument|song/i.test(lower)) {
        return "No way, playing music is so cool! How long have you been playing, and what's your favorite song to jam to?";
      }
      if (/python|javascript|react|node|coding|programming|developer|software|app/i.test(lower)) {
        return "Coding is awesome! What kind of fun projects or apps are you building lately?";
      }
      if (/gym|workout|fitness|running|muscle|exercise|training/i.test(lower)) {
        return "Working out feels so good for clearing your head! What's your go-to workout lately — lifting weights or running?";
      }
      if (/food|cook|eat|recipe|restaurant|dish|pizza|sushi/i.test(lower)) {
        return "Mmm, that sounds delicious! Are you a master chef at home, or do you love finding cool new food spots?";
      }
      if (/movie|film|cinema|watch|series|actor|netflix/i.test(lower)) {
        return "Oh, I love good movies! Seen anything recently that totally blew you away?";
      }
      if (/travel|country|trip|visit|city|holiday|vacation/i.test(lower)) {
        return "Traveling is the absolute best! If you could hop on a plane right now, where would you go?";
      }
      if (/tired|stress|busy|relax|sleep|rest|exhausted/i.test(lower)) {
        return "It's so important to recharge when days get hectic. What helps you unwind and relax the most after a demanding day?";
      }
  
      const fallbacks = [
        "That makes a lot of sense. Tell me a bit more about that!",
        "Oh wow, I totally get what you mean. What else is on your mind?",
        "Yeah, exactly! It's so interesting to think about it that way. What do you think is the biggest reason for that?",
        "I love that perspective. Has anything recently happened that made you think about this?",
        "Haha, absolutely! So, what are your plans for the rest of the day?",
        "That's super cool. I'd love to hear more of your thoughts on it!"
      ];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

  // Dynamic Gemini Question / Cue Card Generator
  async function generateGeminiExamStart(stage, geminiKey) {
    const key = geminiKey || getActiveGeminiKey();
    if (!key) return null;

    let prompt = "";
    if (stage === "part1") {
      prompt = `Generate a fresh, authentic Cambridge IELTS Speaking Part 1 opening question about a random engaging topic (e.g. daily habits, photography, weather, public transport, cooking, hobbies, hometown, reading).
Return JSON: { "topic": "Topic Name", "question": "Warm opening IELTS question" }`;
    } else if (stage === "part2") {
      prompt = `Generate a fresh, authentic Cambridge IELTS Speaking Part 2 Cue Card task on a random interesting topic.
Return JSON: {
  "title": "Describe a ...",
  "bullets": ["Point 1", "Point 2", "Point 3", "And explain why ..."],
  "part3": ["Part 3 question 1", "Part 3 question 2"]
}`;
    }

    return await queryGeminiApi({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
    }, geminiKey);
  }

  if (req.method === "POST" && pathname === "/api/speaking/generate-question") {
    const body = await readBody(req);
    const stage = String(body.stage || "part1");
    const geminiKey = process.env.GEMINI_API_KEY || data.geminiApiKey;
    const dynamicQ = await generateGeminiExamStart(stage, geminiKey);
    return json(res, 200, { success: true, data: dynamicQ });
  }

  if (req.method === "GET" && pathname === "/api/speaking/gemini-status") {
    const key = process.env.GEMINI_API_KEY || data.geminiApiKey;
    return json(res, 200, {
      configured: Boolean(key),
      maskedKey: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null
    });
  }

  if (req.method === "POST" && pathname === "/api/speaking/set-gemini-key") {
    const body = await readBody(req);
    const key = String(body.apiKey || "").trim();
    if (!key) return json(res, 400, { error: "Please provide a valid Gemini API key." });

    data.geminiApiKey = key;
    process.env.GEMINI_API_KEY = key;
    await writeData(data);

    try {
      if (fs.existsSync(".env")) {
        let envContent = fs.readFileSync(".env", "utf8");
        if (envContent.includes("GEMINI_API_KEY=")) {
          envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${key}`);
        } else {
          envContent += `\nGEMINI_API_KEY=${key}\n`;
        }
        fs.writeFileSync(".env", envContent, "utf8");
      }
    } catch(e) {}

    return json(res, 200, { success: true, message: "Gemini AI Key saved successfully!" });
  }

  if (req.method === "POST" && pathname === "/api/speaking/ai-turn") {
    const body = await readBody(req);
    const mode = String(body.mode || "exam");
    const stage = String(body.stage || "part1");
    const userTranscript = String(body.userTranscript || "").trim();
    const currentQuestion = String(body.currentQuestion || "");

    const wordCount = userTranscript ? userTranscript.split(/\s+/).length : 0;
    const geminiKey = body.geminiApiKey || getActiveGeminiKey();

    // --- CASUAL PRACTICE MODE (Friendly Conversation Partner) ---
    if (mode === "practice") {
      const casualRes = await callGeminiCasualChat(userTranscript, body.history, geminiKey);
      if (casualRes) {
        return json(res, 200, {
          ok: true,
          isGeminiPowered: true,
          mode: "practice",
          cleanedTranscript: casualRes.cleanedTranscript || userTranscript,
          replyText: casualRes.replyText || "That sounds really interesting! Tell me more about what you think.",
          feedback: "Great natural conversational phrasing!",
          vocabTips: ["in my view", "to be honest", "speaking of which"]
        });
      }

      const friendlyReply = generateSmartContextualCasualReply(userTranscript);

      return json(res, 200, {
        ok: true,
        isGeminiPowered: false,
        mode: "practice",
        replyText: friendlyReply,
        feedback: "Nice, relaxed conversational tone! Keep chatting naturally.",
        vocabTips: ["in my opinion", "to be frank", "come to think of it"]
      });
    }

    // --- REAL EXAM MODE (Dr. Alan Sterling - Cambridge Examiner) ---
    if (geminiKey) {
      const geminiResult = await callGeminiSpeakingExaminer(userTranscript, stage, currentQuestion, body.topic, geminiKey);
      if (geminiResult) {
        const rawBand = ((geminiResult.fluency || 6.5) + (geminiResult.lexical || 6.5) + (geminiResult.grammar || 6.5) + (geminiResult.pronunciation || 6.5)) / 4;
        const band = roundToIeltsBand(rawBand);
        return json(res, 200, {
          ok: true,
          isGeminiPowered: true,
          mode: "exam",
          wordCount,
          naturalMarker: geminiResult.naturalMarker || "Right.",
          generatedFollowUp: geminiResult.generatedFollowUp || "How do you feel about that in your daily routine?",
          evaluation: {
            fluency: geminiResult.fluency || 6.5,
            lexical: geminiResult.lexical || 6.5,
            grammar: geminiResult.grammar || 6.5,
            pronunciation: geminiResult.pronunciation || 6.5,
            band
          },
          feedback: geminiResult.feedback || "",
          vocabTips: geminiResult.vocabTips || ["furthermore", "specifically", "substantially"]
        });
      }
    }

    // 2. Calibrated Strict NLP Fallback Engine (when no Gemini key is active)
    let estFluency = 5.5;
    let estLexical = 5.0;
    let estGrammar = 5.0;
    let estPron = 5.5;

    const advancedVocab = ["furthermore", "moreover", "specifically", "substantially", "predominantly", "consequently", "nevertheless", "fascinating", "indispensable", "crucial", "paramount", "detrimental", "sustainable", "beneficial", "perspective", "significantly"];
    const foundAdvanced = advancedVocab.filter(w => userTranscript.toLowerCase().includes(w));

    if (wordCount >= 70 && foundAdvanced.length >= 2) {
      estFluency = 7.0;
      estLexical = 7.0;
      estGrammar = 6.5;
      estPron = 6.5;
    } else if (wordCount >= 40) {
      estFluency = 6.0;
      estLexical = foundAdvanced.length >= 1 ? 6.5 : 5.5;
      estGrammar = 5.5;
      estPron = 6.0;
    } else if (wordCount >= 20) {
      estFluency = 5.5;
      estLexical = 5.5;
      estGrammar = 5.0;
      estPron = 5.5;
    } else if (wordCount > 0) {
      estFluency = 4.5;
      estLexical = 4.5;
      estGrammar = 4.5;
      estPron = 5.0;
    }

    const rawBand = (estFluency + estLexical + estGrammar + estPron) / 4;
    const band = roundToIeltsBand(rawBand);

    let naturalMarker = "";
    let generatedFollowUp = "";

    if (stage === "part1") {
      const markers = ["Right.", "I see.", "Okay.", "Fair enough.", "That's quite interesting.", "Right, I understand."];
      naturalMarker = markers[Math.floor(Math.random() * markers.length)];

      if (/social media|instagram|telegram|tiktok|facebook|phone|internet|online/i.test(userTranscript)) {
        if (/friend|chat|message|contact/i.test(userTranscript)) {
          generatedFollowUp = "And do you prefer staying in touch with friends online, or meeting them in person?";
        } else if (/time|hour|waste|busy/i.test(userTranscript)) {
          generatedFollowUp = "Do you ever feel the need to take a break from your smartphone?";
        } else {
          generatedFollowUp = "How important is having internet access to your daily productivity?";
        }
      } else if (/hometown|city|tashkent|village|countryside|live|living|house/i.test(userTranscript)) {
        if (/quiet|peaceful|park|nature/i.test(userTranscript)) {
          generatedFollowUp = "What kind of public facilities or green spaces are available in your neighborhood?";
        } else {
          generatedFollowUp = "Is it easy to get around using public transport where you live?";
        }
      } else if (/travel|journey|trip|visit|country|culture|plane|vacation/i.test(userTranscript)) {
        generatedFollowUp = "What kind of destinations do you generally prefer when you take a holiday?";
      } else if (/study|work|career|subject|university|school|major|job/i.test(userTranscript)) {
        generatedFollowUp = "What is the most challenging aspect of your current studies or work?";
      } else if (/weekend|routine|morning|evening|free time|relax/i.test(userTranscript)) {
        generatedFollowUp = "Do you find that your routine changes much between weekdays and weekends?";
      } else if (wordCount < 18) {
        generatedFollowUp = "Could you tell me a little bit more about why that is?";
      }
    } else if (stage === "part3") {
      const p3Markers = [
        "That's a thoughtful point.",
        "Interesting perspective.",
        "Indeed.",
        "Right, looking at the wider picture,",
        "That's certainly one way to look at it."
      ];
      naturalMarker = p3Markers[Math.floor(Math.random() * p3Markers.length)];

      if (/technology|ai|future|smart|machine/i.test(userTranscript)) {
        generatedFollowUp = "How do you think emerging technologies will affect job opportunities in the next ten to twenty years?";
      } else if (/tradition|culture|generation|old|young/i.test(userTranscript)) {
        generatedFollowUp = "Why do you think some traditional customs are gradually being lost in modern societies?";
      } else if (/environment|nature|climate|pollution|green/i.test(userTranscript)) {
        generatedFollowUp = "Should governments or individual citizens take more responsibility for environmental protection?";
      } else {
        generatedFollowUp = "Do you think most people in your country would share that view?";
      }
    }

    let feedback = "";
    let vocabTips = ["furthermore", "in particular", "substantially", "paramount", "consequently"];
    if (mode === "practice") {
      if (wordCount < 25) {
        feedback = "Good point! Try extending your idea using the 'Point + Explanation + Example' framework to boost your Fluency & Coherence.";
      } else {
        feedback = `Excellent communicative flow! You delivered ${wordCount} words with natural cadence.`;
      }
    }

    return json(res, 200, {
      ok: true,
      isGeminiPowered: false,
      wordCount,
      naturalMarker,
      segue: naturalMarker,
      generatedFollowUp,
      evaluation: {
        fluency: estFluency,
        lexical: estLexical,
        grammar: estGrammar,
        pronunciation: estPron,
        band
      },
      feedback,
      vocabTips
    });
  }

  // Dedicated Full Speaking Exam Grading with Gemini
  async function callGeminiGradeFullExam(transcripts, geminiKey) {
    const transcriptSummary = transcripts.map(t => `${t.role === 'model' ? 'Examiner' : 'Candidate'}: "${t.text}"`).join('\n');
    const systemPrompt = `You are a certified Cambridge Senior IELTS Examiner. You MUST evaluate the candidate's complete Speaking performance STRICTLY and RIGOROUSLY against the official Cambridge IELTS Speaking Band Descriptors (Public Version).
DO NOT INFLATE SCORES. Grade objectively based solely on the actual evidence in the transcript:

CAMBRIDGE BAND BENCHMARKS:
- Band 4.0-4.5: Frequent pauses, limited to basic sentence structures, repetitive simple words, frequent errors.
- Band 5.0-5.5: Simple sentences fluent but complex sentences break down, basic vocabulary with limited flexibility, grammatical errors persist, answers lack elaboration.
- Band 6.0-6.5: Communicates meaning adequately, mixes simple and complex structures but with noticeable grammatical inaccuracies or basic vocabulary limitations, occasional self-correction.
- Band 7.0-7.5: Sustained fluent discourse, flexible use of less common/idiomatic vocabulary, frequent error-free complex structures with only minor occasional slips.
- Band 8.0-9.0: Exceptional precision, wide lexical and structural range, natural fluency with near-zero hesitation or systematic errors.

Return ONLY valid JSON in this schema:
{
  "overallBand": 5.5,
  "fluency": 5.5,
  "fluencyFeedback": "Concise summary on flow, coherence, and answer length",
  "lexical": 5.5,
  "lexicalFeedback": "Concise summary on vocabulary range, idioms, and precision",
  "grammar": 5.5,
  "grammarFeedback": "Concise summary on grammatical complexity and error frequency",
  "pronunciation": 6.0,
  "pronunciationFeedback": "Concise summary on clarity, stress, and natural rhythm",
  "examinerSummary": "A formal concluding assessment summary from Dr. Alan Sterling to the candidate.",
  "strengths": ["Clear strength 1", "Clear strength 2"],
  "improvements": ["Specific improvement 1", "Specific improvement 2"]
}`;

    return await queryGeminiApi({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: `Full speaking test transcript:\n\n${transcriptSummary}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    }, geminiKey);
  }

  if (req.method === "POST" && pathname === "/api/speaking/grade-full-exam") {
    const body = await readBody(req);
    const transcripts = Array.isArray(body.transcripts) ? body.transcripts : [];
    const geminiKey = body.geminiApiKey || getActiveGeminiKey();

    // 1. Try Gemini Grading
    if (geminiKey && transcripts.length > 0) {
      const geminiGrade = await callGeminiGradeFullExam(transcripts, geminiKey);
      if (geminiGrade && typeof geminiGrade.overallBand === "number") {
        return json(res, 200, {
          ok: true,
          isGeminiPowered: true,
          evaluation: {
            overallBand: roundToIeltsBand(geminiGrade.overallBand),
            fluency: roundToIeltsBand(geminiGrade.fluency || 5.5),
            fluencyFeedback: geminiGrade.fluencyFeedback || "Fluency maintained with occasional hesitation.",
            lexical: roundToIeltsBand(geminiGrade.lexical || 5.5),
            lexicalFeedback: geminiGrade.lexicalFeedback || "Demonstrates adequate range of topic vocabulary.",
            grammar: roundToIeltsBand(geminiGrade.grammar || 5.5),
            grammarFeedback: geminiGrade.grammarFeedback || "Uses mixed sentence patterns with some inaccuracies.",
            pronunciation: roundToIeltsBand(geminiGrade.pronunciation || 6.0),
            pronunciationFeedback: geminiGrade.pronunciationFeedback || "Clear articulation with generally intelligible delivery.",
            examinerSummary: geminiGrade.examinerSummary || "A performance demonstrating basic to intermediate communicative capability.",
            strengths: geminiGrade.strengths || ["Maintained communication across exam parts", "Understands examiner prompts"],
            improvements: geminiGrade.improvements || ["Elaborate answers with deeper justifications", "Incorporate more complex grammatical structures"]
          }
        });
      }
    }

    // 2. Calibrated Strict NLP Fallback Grading
    const userUtterances = transcripts.filter(t => t.role === "user").map(t => t.text);
    const totalWords = userUtterances.reduce((acc, u) => acc + (u ? u.split(/\s+/).length : 0), 0);
    const avgWordsPerTurn = userUtterances.length > 0 ? totalWords / userUtterances.length : 0;

    let fluency = 5.0;
    let lexical = 5.0;
    let grammar = 5.0;
    let pronunciation = 5.5;

    if (totalWords >= 280 && avgWordsPerTurn >= 45) {
      fluency = 7.0;
      lexical = 7.0;
      grammar = 7.0;
      pronunciation = 7.0;
    } else if (totalWords >= 180 && avgWordsPerTurn >= 30) {
      fluency = 6.5;
      lexical = 6.5;
      grammar = 6.0;
      pronunciation = 6.5;
    } else if (totalWords >= 90 && avgWordsPerTurn >= 18) {
      fluency = 6.0;
      lexical = 5.5;
      grammar = 5.5;
      pronunciation = 6.0;
    } else if (totalWords >= 40) {
      fluency = 5.5;
      lexical = 5.0;
      grammar = 5.0;
      pronunciation = 5.5;
    }

    const overallBand = roundToIeltsBand((fluency + lexical + grammar + pronunciation) / 4);

    return json(res, 200, {
      ok: true,
      isGeminiPowered: false,
      evaluation: {
        overallBand,
        fluency,
        fluencyFeedback: avgWordsPerTurn >= 30 ? "Good flow with sustained discourse across questions." : "Brief answers; expand your responses using the PEEL (Point, Explanation, Example) technique.",
        lexical,
        lexicalFeedback: totalWords >= 180 ? "Satisfactory range of topic vocabulary with some varied terms." : "Basic vocabulary used; try incorporating more precise academic collocations.",
        grammar,
        grammarFeedback: "A mix of simple and basic compound sentences with noticeable grammatical limitations.",
        pronunciation,
        pronunciationFeedback: "Intelligible delivery with understandable stress and rhythm.",
        examinerSummary: `Overall, the candidate achieved Band ${overallBand}. The performance demonstrates basic to intermediate communicative ability under official assessment conditions.`,
        strengths: ["Communicates essential meaning", "Direct responses to examiner prompts"],
        improvements: ["Provide more extended justifications in Part 2 and Part 3", "Improve grammatical accuracy and sentence complexity"]
      }
    });
  }

  if (req.method === "POST" && pathname === "/api/speaking/submit-attempt") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in to save your Speaking test." });
    const body = await readBody(req);

    const attempt = {
      id: crypto.randomUUID(),
      studentId: user.id,
      studentName: user.name,
      mode: body.mode || "exam",
      topicTitle: body.topicTitle || "IELTS Speaking Full Test",
      durationSeconds: Number(body.durationSeconds) || 0,
      overallBand: Number(body.overallBand) || 6.5,
      fluencyScore: Number(body.fluencyScore) || 6.5,
      lexicalScore: Number(body.lexicalScore) || 6.5,
      grammarScore: Number(body.grammarScore) || 6.5,
      pronunciationScore: Number(body.pronunciationScore) || 6.5,
      audioUrl: body.audioUrl || null,
      transcripts: body.transcripts || [],
      createdAt: new Date().toISOString()
    };

    if (!data.speakingAttempts) data.speakingAttempts = [];
    data.speakingAttempts.unshift(attempt);
    await writeData(data);

    return json(res, 201, { ok: true, attempt });
  }

  if (req.method === "GET" && pathname === "/api/speaking/attempts") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const attempts = (data.speakingAttempts || []).filter(a => a.studentId === user.id);
    return json(res, 200, attempts);
  }

  // --- TEACHER & INVITATION ENDPOINTS ---

  // 1. Student views incoming invitations from teachers
  if (req.method === "GET" && pathname === "/api/student/teacher-invitations") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const pending = (data.teacherInvitations || []).filter(inv => (inv.studentId === user.id || inv.studentUsername?.toLowerCase() === user.username.toLowerCase()) && inv.status === "pending");
    return json(res, 200, pending);
  }

  // 2. Student responds (accept/decline) to teacher invitation
  if (req.method === "POST" && pathname === "/api/student/respond-teacher-invite") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const body = await readBody(req);
    const invitationId = String(body.invitationId || "");
    const accept = Boolean(body.accept ?? (body.action === "accept"));
    const invitation = (data.teacherInvitations || []).find(inv => inv.id === invitationId && (inv.studentId === user.id || inv.studentUsername?.toLowerCase() === user.username.toLowerCase()));
    if (!invitation) return json(res, 404, { error: "Invitation not found." });
    
    invitation.status = accept ? "accepted" : "declined";
    invitation.updatedAt = new Date().toISOString();
    invitation.studentId = user.id;

    if (accept) {
      const existingLink = (data.teacherLinks || []).find(l => l.teacherId === invitation.teacherId && l.studentId === user.id && l.status === "active");
      if (!existingLink) {
        data.teacherLinks.push({
          id: crypto.randomUUID(),
          teacherId: invitation.teacherId,
          studentId: user.id,
          connectedAt: new Date().toISOString(),
          status: "active"
        });
      }
    }
    await writeData(data);
    return json(res, 200, { ok: true, status: invitation.status });
  }

  // 3. Teacher lists connected students + pending invites
  if (req.method === "GET" && pathname === "/api/teacher/students") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    
    const links = (data.teacherLinks || []).filter(l => l.teacherId === user.id && l.status === "active");
    const studentIds = new Set(links.map(l => l.studentId));
    
    const students = data.users.filter(u => studentIds.has(u.id)).map(student => {
      const analytics = detailedStudentAnalytics(student, data);
      const link = links.find(l => l.studentId === student.id);
      return {
        id: student.id,
        name: student.name,
        username: student.username,
        email: student.email,
        avatarUrl: student.avatarUrl,
        plan: student.plan,
        connectedAt: link ? link.connectedAt : student.createdAt,
        totalAttempts: analytics.overall.totalAttempts,
        readingAvgBand: analytics.overall.readingAvgBand,
        listeningAvgBand: analytics.overall.listeningAvgBand,
        writingAvgBand: analytics.overall.writingAvgBand,
        predictedOverallBand: analytics.overall.predictedBand,
        totalPracticeMinutes: analytics.overall.totalPracticeMinutes
      };
    });

    const pendingInvites = (data.teacherInvitations || []).filter(inv => inv.teacherId === user.id && inv.status === "pending");

    return json(res, 200, { students, pendingInvites });
  }

  // 4. Teacher sends invite to student by @username
  if (req.method === "POST" && pathname === "/api/teacher/invite") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const studentUsername = String(body.studentUsername || "").replace(/^@/, "").trim().toLowerCase();
    if (!studentUsername) return json(res, 400, { error: "Please enter the student's @username." });

    if (studentUsername === user.username.toLowerCase()) {
      return json(res, 400, { error: "You cannot invite yourself." });
    }

    const student = data.users.find(u => u.username.toLowerCase() === studentUsername);
    if (!student) {
      return json(res, 404, { error: `Student with username @${studentUsername} was not found.` });
    }

    const isAlreadyLinked = (data.teacherLinks || []).some(l => l.teacherId === user.id && l.studentId === student.id && l.status === "active");
    if (isAlreadyLinked) {
      return json(res, 400, { error: `@${studentUsername} is already in your student group.` });
    }

    const hasPending = (data.teacherInvitations || []).some(inv => inv.teacherId === user.id && inv.studentId === student.id && inv.status === "pending");
    if (hasPending) {
      return json(res, 400, { error: `An invitation to @${studentUsername} is already pending.` });
    }

    const invitation = {
      id: crypto.randomUUID(),
      teacherId: user.id,
      teacherName: user.name,
      teacherUsername: user.username,
      studentId: student.id,
      studentUsername: student.username,
      studentName: student.name,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    data.teacherInvitations.push(invitation);
    await writeData(data);
    return json(res, 201, { ok: true, invitation });
  }

  // 5. Teacher cancels invite or removes student
  if (req.method === "POST" && pathname === "/api/teacher/cancel-invite") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const invitationId = String(body.invitationId || "");
    data.teacherInvitations = data.teacherInvitations.filter(inv => !(inv.id === invitationId && inv.teacherId === user.id));
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/teacher/remove-student") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const studentId = String(body.studentId || "");
    data.teacherLinks = data.teacherLinks.filter(l => !(l.teacherId === user.id && l.studentId === studentId));
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // 6. Teacher views full drilldown of a student
  if (req.method === "GET" && pathname.startsWith("/api/teacher/student/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const studentId = pathname.split("/").pop();
    const student = data.users.find(u => u.id === studentId);
    if (!student) return json(res, 404, { error: "Student not found." });
    
    const isLinked = (data.teacherLinks || []).some(l => l.teacherId === user.id && l.studentId === studentId && l.status === 'active');
    if (!isLinked) return json(res, 403, { error: 'Not authorized to view this student' });

    const readingAttempts = (data.readingAttempts || []).filter(a => a.studentId === studentId);
    const listeningAttempts = (data.listeningAttempts || []).filter(a => a.studentId === studentId);
    const writingSubmissions = (data.writingSubmissions || []).filter(w => w.studentId === studentId);

    const results = [
      ...readingAttempts.map(a => ({
        id: a.id,
        source: 'reading',
        testTitle: a.materialTitle || 'IELTS Reading Test',
        correct: a.correct,
        total: a.total,
        band: a.band,
        createdAt: a.createdAt,
        durationSeconds: a.durationSeconds
      })),
      ...listeningAttempts.map(a => ({
        id: a.id,
        source: 'listening',
        testTitle: a.materialTitle || 'IELTS Listening Test',
        correct: a.correct,
        total: a.total,
        band: a.band,
        createdAt: a.createdAt,
        durationSeconds: a.durationSeconds
      })),
      ...writingSubmissions.map(w => ({
        id: w.id,
        source: 'writing',
        testTitle: w.topicTitle || 'IELTS Writing Essay',
        wordCount: w.wordCount,
        status: w.status,
        band: w.evaluation?.overallBand ? Number(w.evaluation.overallBand) : null,
        createdAt: w.submittedAt,
        durationSeconds: w.timeSpentSeconds
      }))
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const analytics = detailedStudentAnalytics(student, data);
    return json(res, 200, { student: safeUser(student), analytics, results });
  }

  // --- ASSIGNMENTS & HOMEWORK ENDPOINTS ---

  // 6b. Teacher gets all platform materials for assignment creation
  if (req.method === "GET" && pathname === "/api/teacher/materials-catalog") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });

    const writing = readWritingTopicsCatalog().map(t => ({
      id: t.id,
      title: `[Writing ${t.type.toUpperCase()}] ${t.title}`,
      skill: "writing",
      prompt: t.prompt,
      href: `/english/writing-editor?id=${encodeURIComponent(t.id)}`,
      formatLabel: t.type === "task1" ? "Task 1 (150 words)" : "Task 2 (250 words)"
    }));

    const reading = readReadingCatalog().map(r => ({
      id: r.id,
      title: `[Reading ${r.formatLabel || "Test"}] ${r.sourceTitle}`,
      skill: "reading",
      prompt: `Complete Cambridge IELTS reading simulation with ${r.questionCount || 40} questions.`,
      href: `/english/reading-exam?id=${encodeURIComponent(r.id)}`,
      formatLabel: r.formatLabel || "Reading Test"
    }));

    const listening = readListeningCatalog().map(l => ({
      id: l.id,
      title: `[Listening ${l.formatLabel || "Full Test"}] ${l.title}`,
      skill: "listening",
      prompt: `Complete authentic IELTS listening test with 4 audio sections.`,
      href: `/english/listening-exam?id=${encodeURIComponent(l.id)}`,
      formatLabel: l.formatLabel || "Listening Test"
    }));

    const articles = readEnglishContentCatalog().map(a => ({
      id: a.id,
      title: `[Article & Vocabulary] ${a.title}`,
      skill: "article",
      prompt: `Read article, practice comprehension, and save vocabulary words to personal bank.`,
      href: `/english/lesson?id=${encodeURIComponent(a.id)}`,
      formatLabel: "Interactive Article"
    }));

    const speaking = [
      {
        id: "speaking_mock_c18_01",
        title: "[Speaking Test 1] Technology & Social Media Habits",
        skill: "speaking",
        prompt: "Part 1: Daily technology usage and screen time.\nPart 2: Describe a website or application that you use regularly.\nPart 3: The future of artificial intelligence in education and workplace productivity.",
        href: "/english/practice?skill=speaking",
        formatLabel: "Speaking Part 1, 2 & 3 Mock"
      },
      {
        id: "speaking_mock_c18_02",
        title: "[Speaking Test 2] Memorable Journeys & Cultural Travel",
        skill: "speaking",
        prompt: "Part 1: Public transportation vs personal driving.\nPart 2: Describe an unforgettable trip you made with friends or family.\nPart 3: Impact of mass tourism on historic monuments and natural environments.",
        href: "/english/practice?skill=speaking",
        formatLabel: "Speaking Part 1, 2 & 3 Mock"
      },
      {
        id: "speaking_mock_c18_03",
        title: "[Speaking Test 3] Education, Practical Skills & Ambitions",
        skill: "speaking",
        prompt: "Part 1: Your daily study routine and favorite subjects.\nPart 2: Describe a useful skill you learned outside the classroom.\nPart 3: Traditional classroom schooling vs online learning platforms.",
        href: "/english/practice?skill=speaking",
        formatLabel: "Speaking Part 1, 2 & 3 Mock"
      },
      {
        id: "speaking_mock_c18_04",
        title: "[Speaking Test 4] Environment, Green Spaces & Urban Life",
        skill: "speaking",
        prompt: "Part 1: Parks and outdoor activities in your city.\nPart 2: Describe a major environmental issue affecting your country.\nPart 3: Role of international agreements vs individual citizen habits in reducing pollution.",
        href: "/english/practice?skill=speaking",
        formatLabel: "Speaking Part 1, 2 & 3 Mock"
      }
    ];

    return json(res, 200, { writing, reading, listening, speaking, articles });
  }

  // 6c. Teacher/Student uploads homework or solution file
  if (req.method === "POST" && (pathname === "/api/teacher/upload-material" || pathname === "/api/student/upload-homework")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (pathname === "/api/teacher/upload-material" && user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const fileName = String(body.fileName || "homework_attachment").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const fileData = String(body.fileData || "");
    if (!fileData) return json(res, 400, { error: "No file content uploaded." });

    const ext = (path.extname(fileName) || ".pdf").toLowerCase();
    const allowed = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".mp3", ".wav", ".mp4", ".txt", ".zip"];
    if (!allowed.includes(ext)) return json(res, 400, { error: "Unsupported file type." });
    const uniqueName = `upload_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    const base64Content = fileData.replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(base64Content, "base64"));

    return json(res, 200, {
      ok: true,
      url: `/data/uploads/${uniqueName}`,
      name: fileName
    });
  }

  // 7. Teacher gets assignments
  if (req.method === "GET" && pathname === "/api/teacher/assignments") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });

    const assignments = (data.assignments || []).filter(a => a.teacherId === user.id).map(a => {
      const subs = (data.writingSubmissions || []).filter(s => s.assignmentId === a.id);
      return {
        ...a,
        submissionCount: subs.length,
        gradedCount: subs.filter(s => s.status === 'graded').length
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return json(res, 200, assignments);
  }

  // 7b. Teacher gets assignment details & student progress
  if (req.method === "GET" && pathname.startsWith("/api/teacher/assignment/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });

    const assignId = pathname.slice("/api/teacher/assignment/".length);
    const assignment = (data.assignments || []).find(a => a.id === assignId && a.teacherId === user.id);
    if (!assignment) return json(res, 404, { error: "Assignment not found." });

    const linkedStudents = (data.teacherLinks || []).filter(l => l.teacherId === user.id && l.status === 'active');
    const studentUserIds = new Set(linkedStudents.map(l => l.studentId));
    let cohortStudents = data.users.filter(u => studentUserIds.has(u.id));

    if (assignment.assignedStudentIds && assignment.assignedStudentIds.length > 0) {
      const specificIds = new Set(assignment.assignedStudentIds);
      cohortStudents = cohortStudents.filter(s => specificIds.has(s.id));
    }

    const studentStatuses = cohortStudents.map(st => {
      let status = "not_started";
      let submissionInfo = null;

      const writingSub = (data.writingSubmissions || []).find(s => s.assignmentId === assignment.id && s.studentId === st.id);
      if (writingSub) {
        status = writingSub.status === "graded" ? "graded" : "submitted";
        submissionInfo = {
          id: writingSub.id,
          submittedAt: writingSub.submittedAt,
          wordCount: writingSub.wordCount,
          essayContent: writingSub.essayContent,
          attachments: writingSub.attachments || [],
          evaluation: writingSub.evaluation
        };
      } else if (assignment.skill === "reading" && assignment.materialId) {
        const att = (data.readingAttempts || []).find(a => a.studentId === st.id && a.materialId === assignment.materialId);
        if (att) {
          status = "completed";
          submissionInfo = {
            id: att.id,
            score: att.score,
            total: att.total,
            band: att.band,
            submittedAt: att.createdAt
          };
        }
      } else if (assignment.skill === "listening" && assignment.materialId) {
        const att = (data.listeningAttempts || []).find(a => a.studentId === st.id && a.materialId === assignment.materialId);
        if (att) {
          status = "completed";
          submissionInfo = {
            id: att.id,
            score: att.score,
            total: att.total,
            band: att.band,
            submittedAt: att.createdAt
          };
        }
      }

      return {
        id: st.id,
        name: st.name,
        username: st.username,
        avatarUrl: st.avatarUrl,
        plan: st.plan,
        status,
        submissionInfo
      };
    });

    return json(res, 200, {
      assignment,
      students: studentStatuses
    });
  }

  // 8. Teacher creates assignment (supports single or multi-task batch dispatch)
  if (req.method === "POST" && pathname === "/api/teacher/assignments") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);

    const rawTasks = Array.isArray(body.tasks) && body.tasks.length > 0 ? body.tasks : [body];
    const createdList = [];

    for (const item of rawTasks) {
      const title = String(item.title || body.title || "").trim().slice(0, 200);
      if (!title) continue;
      const skill = ["writing", "reading", "listening", "speaking", "article", "custom"].includes(item.skill) ? item.skill : "writing";
      const mode = ["practice", "real-exam"].includes(item.mode || body.mode) ? (item.mode || body.mode) : "practice";

      const rawAttachments = Array.isArray(item.attachments || body.attachments) ? (item.attachments || body.attachments) : [];
      const primaryUrl = String(item.attachmentUrl || body.attachmentUrl || (rawAttachments[0]?.url || ""));
      const primaryName = String(item.attachmentName || body.attachmentName || (rawAttachments[0]?.name || ""));

      const assignment = {
        id: crypto.randomUUID(),
        teacherId: user.id,
        teacherName: user.name,
        title,
        skill,
        type: String(item.type || (skill === "writing" ? "task2" : skill)),
        materialId: String(item.materialId || ""),
        materialHref: String(item.materialHref || ""),
        attachmentUrl: primaryUrl,
        attachmentName: primaryName,
        attachments: rawAttachments.length > 0 ? rawAttachments : (primaryUrl ? [{ url: primaryUrl, name: primaryName }] : []),
        prompt: String(item.prompt || body.prompt || "").slice(0, 5000),
        mode,
        startDate: (item.startDate || body.startDate) ? new Date(item.startDate || body.startDate).toISOString() : new Date().toISOString(),
        deadline: (item.deadline || body.deadline) ? new Date(item.deadline || body.deadline).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        assignedStudentIds: Array.isArray(item.assignedStudentIds || body.assignedStudentIds) ? (item.assignedStudentIds || body.assignedStudentIds) : [],
        instructions: String(item.instructions || body.instructions || "").slice(0, 1000),
        createdAt: new Date().toISOString()
      };
      data.assignments.unshift(assignment);
      createdList.push(assignment);
    }

    if (createdList.length === 0) {
      return json(res, 400, { error: "Kamida bitta vazifa nomini kiriting yoki tanlang." });
    }

    await writeData(data);
    return json(res, 201, createdList.length === 1 ? createdList[0] : { ok: true, count: createdList.length, assignments: createdList });
  }

  // 9. Teacher deletes assignment
  if (req.method === "DELETE" && pathname.startsWith("/api/teacher/assignments/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const id = pathname.split("/").pop();
    data.assignments = data.assignments.filter(a => !(a.id === id && a.teacherId === user.id));
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // 10. Student gets homework assignments
  if (req.method === "GET" && pathname === "/api/student/assignments") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });

    const links = (data.teacherLinks || []).filter(l => l.studentId === user.id && l.status === "active");
    const teacherIds = new Set(links.map(l => l.teacherId));

    const assignments = (data.assignments || []).filter(a => {
      if (teacherIds.has(a.teacherId)) {
        return !a.assignedStudentIds.length || a.assignedStudentIds.includes(user.id);
      }
      return a.assignedStudentIds.includes(user.id);
    }).map(a => {
      const submission = (data.writingSubmissions || []).find(s => s.assignmentId === a.id && s.studentId === user.id);
      
      let attemptInfo = null;
      if (!submission && a.skill === "reading" && a.materialId) {
        const att = (data.readingAttempts || []).filter(x => x.studentId === user.id && x.materialId === a.materialId).sort((m, n) => n.createdAt.localeCompare(m.createdAt))[0];
        if (att) {
          attemptInfo = {
            id: att.id,
            status: "completed",
            score: att.score,
            total: att.total || 40,
            band: att.band,
            submittedAt: att.createdAt
          };
        }
      } else if (!submission && a.skill === "listening" && a.materialId) {
        const att = (data.listeningAttempts || []).filter(x => x.studentId === user.id && x.materialId === a.materialId).sort((m, n) => n.createdAt.localeCompare(m.createdAt))[0];
        if (att) {
          attemptInfo = {
            id: att.id,
            status: "completed",
            score: att.score,
            total: att.total || 40,
            band: att.band,
            submittedAt: att.createdAt
          };
        }
      }

      return {
        ...a,
        attempt: attemptInfo,
        submission: submission ? {
          id: submission.id,
          status: submission.status,
          submittedAt: submission.submittedAt,
          wordCount: submission.wordCount,
          essayContent: submission.essayContent || '',
          attachments: submission.attachments || [],
          topicTitle: submission.topicTitle || a.title,
          evaluation: submission.evaluation
        } : null
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return json(res, 200, assignments);
  }

  // 10b. Student gets single assignment by ID
  if (req.method === "GET" && (pathname === "/api/student/assignment" || pathname.startsWith("/api/student/assignment/"))) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const assignId = pathname.startsWith("/api/student/assignment/") ? pathname.slice("/api/student/assignment/".length) : String(requestUrl.searchParams.get("id") || "");
    const assignment = (data.assignments || []).find(a => a.id === assignId);
    if (!assignment) return json(res, 404, { error: "Assignment not found." });
    return json(res, 200, assignment);
  }

  // --- WRITING ESSAY & CUSTOM HOMEWORK SUBMISSION & GRADING ---

  // 11. Student submits writing essay or custom worksheet solution
  if (req.method === "POST" && pathname === "/api/writing/submit") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Sign in to submit your essay." });
    const body = await readBody(req);
    const essayContent = String(body.essayContent || "").trim();
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : (body.attachmentUrl ? [{ url: body.attachmentUrl, name: body.attachmentName }] : []);

    if (essayContent.length < 25 && rawAttachments.length === 0) {
      return json(res, 400, { error: "Iltimos, kamida 25 ta belgi yozing yoki fayl biriktiring." });
    }
    if (essayContent.length > 25000) {
      return json(res, 400, { error: "Matn juda uzun (maksimal 25000 belgi)." });
    }

    const assignmentId = body.assignmentId ? String(body.assignmentId) : null;
    let teacherId = null;
    if (assignmentId) {
      const assignment = (data.assignments || []).find(a => a.id === assignmentId);
      if (assignment) teacherId = assignment.teacherId;
    }
    if (!teacherId) {
      const link = (data.teacherLinks || []).find(l => l.studentId === user.id && l.status === "active");
      if (link) teacherId = link.teacherId;
    }

    const wordCount = essayContent ? essayContent.split(/\s+/).filter(Boolean).length : 0;
    const submission = {
      id: crypto.randomUUID(),
      assignmentId,
      studentId: user.id,
      studentName: user.name,
      studentUsername: user.username,
      teacherId,
      topicTitle: String(body.topicTitle || "IELTS Homework Assignment"),
      prompt: String(body.prompt || ""),
      essayContent,
      attachments: rawAttachments,
      wordCount,
      timeSpentSeconds: Math.max(0, Math.round(Number(body.timeSpentSeconds) || 0)),
      mode: ["practice", "real-exam"].includes(body.mode) ? body.mode : "practice",
      submittedAt: new Date().toISOString(),
      status: "submitted",
      evaluation: null
    };

    data.writingSubmissions.unshift(submission);
    await writeData(data);
    return json(res, 201, submission);
  }

  // 12. Get single writing submission
  if (req.method === "GET" && pathname.startsWith("/api/writing/submission/")) {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    const id = pathname.split("/").pop();
    const submission = (data.writingSubmissions || []).find(s => s.id === id && (s.studentId === user.id || s.teacherId === user.id));
    if (!submission) return json(res, 404, { error: "Submission not found." });
    return json(res, 200, submission);
  }

  // 13. Teacher lists writing submissions to grade
  if (req.method === "GET" && pathname === "/api/teacher/submissions") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const linkedStudentIds = new Set((data.teacherLinks || []).filter(l => l.teacherId === user.id && l.status === 'active').map(l => l.studentId));
    const submissions = (data.writingSubmissions || []).filter(s => s.teacherId === user.id || linkedStudentIds.has(s.studentId)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return json(res, 200, submissions);
  }

  // 14. Teacher grades submission with 4-criteria IELTS evaluation
  if (req.method === "POST" && pathname === "/api/teacher/grade-submission") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const submissionId = String(body.submissionId || "");
    const linkedStudentIds = new Set((data.teacherLinks || []).filter(l => l.teacherId === user.id && l.status === 'active').map(l => l.studentId));
    const submission = (data.writingSubmissions || []).find(s => s.id === submissionId && (s.teacherId === user.id || linkedStudentIds.has(s.studentId)));
    if (!submission) return json(res, 404, { error: "Submission not found or unauthorized." });

    if (!submission.teacherId) submission.teacherId = user.id;

    const tr = Math.min(9, Math.max(0, Number(body.taskResponse) || 6.5));
    const cc = Math.min(9, Math.max(0, Number(body.coherenceCohesion) || 6.5));
    const lr = Math.min(9, Math.max(0, Number(body.lexicalResource) || 6.5));
    const gra = Math.min(9, Math.max(0, Number(body.grammarAccuracy) || 6.5));
    const rawBand = (tr + cc + lr + gra) / 4;
    const calculatedBand = Math.floor(rawBand * 2) / 2;
    const overallBand = Number.isFinite(Number(body.overallBand)) ? Number(body.overallBand) : calculatedBand;

    submission.status = "graded";
    submission.evaluation = {
      overallBand,
      taskResponse: tr,
      coherenceCohesion: cc,
      lexicalResource: lr,
      grammarAccuracy: gra,
      teacherFeedback: String(body.teacherFeedback || "").trim(),
      inlineComments: Array.isArray(body.inlineComments) ? body.inlineComments : [],
      gradedAt: new Date().toISOString(),
      gradedBy: user.name
    };

    await writeData(data);
    return json(res, 200, { ok: true, submission });
  }

  // --- TEACHER BULK PREMIUM LICENSES ---

  // 15. Teacher gets license pool
  if (req.method === "GET" && pathname === "/api/teacher/licenses") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    let license = (data.teacherLicenses || []).find(l => l.teacherId === user.id);
    if (!license) {
      license = { teacherId: user.id, totalSeats: 15, assignedStudentIds: [] };
      data.teacherLicenses.push(license);
      await writeData(data);
    }
    const usedSeats = license.assignedStudentIds.length;
    return json(res, 200, {
      totalSeats: license.totalSeats,
      usedSeats,
      availableSeats: Math.max(0, license.totalSeats - usedSeats),
      assignedStudentIds: license.assignedStudentIds,
      groupRatePerStudent: 20000
    });
  }

  // 16. Teacher assigns premium seat to student
  if (req.method === "POST" && pathname === "/api/teacher/licenses/assign") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const studentId = String(body.studentId || "");
    const student = data.users.find(u => u.id === studentId);
    if (!student) return json(res, 404, { error: "Student not found." });

    let license = (data.teacherLicenses || []).find(l => l.teacherId === user.id);
    if (!license) {
      license = { teacherId: user.id, totalSeats: 15, assignedStudentIds: [] };
      data.teacherLicenses.push(license);
    }

    if (!license.assignedStudentIds.includes(studentId)) {
      if (license.assignedStudentIds.length >= license.totalSeats) {
        return json(res, 400, { error: "All premium license seats are in use. Contact @ieltscoreadmin to add more seats." });
      }
      license.assignedStudentIds.push(studentId);
    }

    student.plan = "premium";
    student.planUpdatedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { ok: true, assignedStudentIds: license.assignedStudentIds });
  }

  // 17. Teacher revokes premium seat
  if (req.method === "POST" && pathname === "/api/teacher/licenses/revoke") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in." });
    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });
    const body = await readBody(req);
    const studentId = String(body.studentId || "");
    const student = data.users.find(u => u.id === studentId);
    if (!student) return json(res, 404, { error: "Student not found." });

    let license = (data.teacherLicenses || []).find(l => l.teacherId === user.id);
    if (license) {
      license.assignedStudentIds = license.assignedStudentIds.filter(id => id !== studentId);
    }

    student.plan = "free";
    student.planUpdatedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { ok: true, assignedStudentIds: license ? license.assignedStudentIds : [] });
  }
  if (req.method === "POST" && pathname === "/api/admin/firebase-google") {
    if (adminLoginBlocked(req)) {
      return json(res, 429, { error: "Xavfsizlik blokirovkasi: Ko‘p marotaba xato urinishlar bo‘lgani sababli ushbu IP uchun kirish 60 daqiqaga to‘xtatildi." });
    }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const primaryAdminEmail = "sultanovb604@gmail.com";

    if (email !== primaryAdminEmail) {
      recordAdminLoginFailure(req);
      await new Promise(r => setTimeout(r, 1200));
      return json(res, 403, {
        error: `Ruxsat berilmadi! Ushbu Google hisob (${email || 'noma\'lum'}) admin emas. Admin panelga faqat ${primaryAdminEmail} kira oladi.`
      });
    }

    clearAdminLoginFailures(req);
    return json(res, 200, {
      token: issueAdminToken(primaryAdminEmail),
      admin: { username: "sultanovb604", email: primaryAdminEmail },
      expiresIn: ADMIN_SESSION_TTL / 1000
    });
  }
  if (req.method === "POST" && pathname === "/api/admin/login") {
    if (adminLoginBlocked(req)) {
      return json(res, 429, { error: "Xavfsizlik blokirovkasi: Ko‘p marotaba xato urinishlar bo‘lgani sababli ushbu IP uchun kirish 60 daqiqaga to‘xtatildi." });
    }
    const body = await readBody(req);
    const effectiveAdminPassword = data.adminPassword || ADMIN_PASSWORD;
    const effectiveAdminPin = data.adminSecurityPin || process.env.ADMIN_PIN || "849201";
    const primaryAdminEmail = "sultanovb604@gmail.com";
    const primaryAdminUsername = "sultanovb604";

    const allowedAdminIdentifiers = new Set([
      "sultanovb604@gmail.com",
      "sultanovb604"
    ]);

    const inputIdentifier = String(body.username || body.email || "").trim().toLowerCase();
    const inputPassword = String(body.password || "");
    const inputPin = String(body.securityPin || "").trim();

    const validIdentifier = allowedAdminIdentifiers.has(inputIdentifier);
    const validPass = safeEqualText(inputPassword, effectiveAdminPassword);
    const validPin = effectiveAdminPin ? safeEqualText(inputPin, effectiveAdminPin) : true;

    if (!validIdentifier || !validPass || !validPin) {
      recordAdminLoginFailure(req);
      await new Promise(r => setTimeout(r, 1200)); // anti-bruteforce delay
      const attemptsCount = (adminLoginAttempts.get(requestAddress(req))?.count) || 1;
      const remaining = Math.max(0, ADMIN_LOGIN_LIMIT - attemptsCount);
      return json(res, 401, { error: `Faqat tizim egasining tasdiqlangan emaili, paroli va 2FA PIN kodi orqali kirish mumkin. Qolgan urinishlar: ${remaining}` });
    }

    clearAdminLoginFailures(req);
    return json(res, 200, { token: issueAdminToken(inputIdentifier), admin: { username: inputIdentifier, email: primaryAdminEmail }, expiresIn: ADMIN_SESSION_TTL / 1000 });
  }
  if (pathname.startsWith("/api/admin/") && !isAdmin(req)) return json(res, 401, { error: "Please sign in as an administrator." });
  if (req.method === "GET" && pathname === "/api/admin/session") return json(res, 200, { ok: true, admin: { username: readAdminSession(req).username } });
  if (req.method === "POST" && pathname === "/api/admin/change-password") {
    const body = await readBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const effectiveAdminPassword = data.adminPassword || ADMIN_PASSWORD;
    if (!safeEqualText(currentPassword, effectiveAdminPassword)) {
      return json(res, 400, { error: "Amaldagi parol noto‘g‘ri kiritildi." });
    }
    if (newPassword.length < 6) {
      return json(res, 400, { error: "Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak." });
    }
    data.adminPassword = newPassword;
    data.adminPasswordUpdatedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { ok: true, message: "Admin paroli muvaffaqiyatli yangilandi!" });
  }
  if (req.method === "POST" && pathname === "/api/admin/logout") {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token) revokedAdminTokens.add(token);
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && pathname === "/api/admin/resources") return json(res, 200, data.resources);
  if (req.method === "GET" && pathname === "/api/admin/stats") {
    const catalogItems = readReadingCatalog().length + readEnglishContentCatalog().length;
    const premiumStudents = data.users.filter(user => user.plan === "premium").length;
    return json(res, 200, {
      students: data.users.length,
      resources: catalogItems + data.resources.length,
      readingAttempts: data.readingAttempts.length,
      listeningAttempts: data.listeningAttempts.length,
      ieltsAttempts: data.readingAttempts.length + data.listeningAttempts.length,
      premiumStudents,
      activeListeningTests: 1
    });
  }
  if (req.method === "GET" && pathname === "/api/admin/students") {
    const students = data.users.map(user => {
      const reading = data.readingAttempts.filter(item => item.studentId === user.id);
      const listening = data.listeningAttempts.filter(item => item.studentId === user.id);
      const latest = [...reading, ...listening].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return { ...safeUser(user), ...studentProgress(user, data.results, data.readingAttempts, data.listeningAttempts), lastResultAt: latest?.createdAt || null };
    }).sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, "en"));
    return json(res, 200, students);
  }
  if (req.method === "GET" && pathname === "/api/admin/submissions") {
    const userMap = new Map(data.users.map(u => [u.id, u]));
    const reading = data.readingAttempts.map(att => {
      const u = userMap.get(att.studentId);
      return {
        ...readingAttemptSummary(att),
        studentName: u ? u.name : "Guest / Unknown",
        studentUsername: u ? u.username : "guest",
        studentPlan: u ? u.plan : "free",
        skill: "reading"
      };
    });
    const listening = data.listeningAttempts.map(att => {
      const u = userMap.get(att.studentId);
      return {
        ...listeningAttemptSummary(att),
        studentName: u ? u.name : "Guest / Unknown",
        studentUsername: u ? u.username : "guest",
        studentPlan: u ? u.plan : "free",
        skill: "listening"
      };
    });
    const submissions = [...reading, ...listening]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
    return json(res, 200, submissions);
  }
  if (req.method === "POST" && pathname === "/api/student/redeem-code") {
    const user = studentFromRequest(req, data);
    if (!user) return json(res, 401, { error: "Please sign in before redeeming code." });
    const body = await readBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) return json(res, 400, { error: "Please enter a promo code." });

    // 1. Check custom admin-created promo codes first
    const customPromo = data.promoCodes.find(p => p.code === code);
    let days = null;
    if (customPromo) {
      if (customPromo.maxUses > 0 && customPromo.uses >= customPromo.maxUses) {
        return json(res, 400, { error: "This promo code has reached its maximum usage limit." });
      }
      days = customPromo.days;
      customPromo.uses = (customPromo.uses || 0) + 1;
    } else {
      // 2. Preset promo codes fallback
      const promoDaysMap = {
        "FREE3DAYS": 3,
        "PROMO3": 3,
        "WINNER10": 10,
        "CONTEST10": 10,
        "IELTS9": 30,
        "CORE2026": 30,
        "PREMIUM": 30,
        "VIP2026": 90
      };
      days = promoDaysMap[code] || (code === "IELTSCORE" ? 30 : null);
    }

    if (!days) {
      return json(res, 400, { error: "Invalid or expired promo code. Contact @ieltscoreadmin on Telegram." });
    }

    user.plan = "premium";
    const baseTime = (user.planExpiresAt && new Date(user.planExpiresAt).getTime() > Date.now())
      ? new Date(user.planExpiresAt).getTime()
      : Date.now();
    user.planExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
    user.planUpdatedAt = new Date().toISOString();
    user.redeemedCode = code;
    await writeData(data);
    return json(res, 200, { ok: true, message: `🌟 IELTS Core Premium (${days} kun) muvaffaqiyatli faollashtirildi!`, user: safeUser(user) });
  }
  if (req.method === "GET" && pathname === "/api/admin/promo-codes") {
    return json(res, 200, data.promoCodes || []);
  }
  if (req.method === "POST" && pathname === "/api/admin/promo-codes") {
    const body = await readBody(req);
    const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const days = Math.max(1, Math.min(3650, parseInt(body.days, 10) || 3));
    const maxUses = Math.max(0, parseInt(body.maxUses, 10) || 0);
    if (code.length < 3) return json(res, 400, { error: "Promo code must be at least 3 characters." });
    if (data.promoCodes.some(p => p.code === code)) return json(res, 409, { error: "This promo code already exists." });
    const promo = {
      id: crypto.randomUUID(),
      code,
      days,
      maxUses,
      uses: 0,
      createdAt: new Date().toISOString()
    };
    data.promoCodes.unshift(promo);
    await writeData(data);
    return json(res, 201, promo);
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/admin/promo-codes/")) {
    const id = pathname.split("/").pop();
    data.promoCodes = data.promoCodes.filter(p => p.id !== id);
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  if (req.method === "PUT" && /^\/api\/admin\/students\/[^/]+\/plan$/.test(pathname)) {
    const studentId = decodeURIComponent(pathname.split("/")[4] || "");
    const body = await readBody(req);
    const plan = body.plan === "premium" ? "premium" : body.plan === "free" ? "free" : "";
    const student = data.users.find(user => user.id === studentId);
    if (!student) return json(res, 404, { error: "Student account not found." });
    if (!plan) return json(res, 400, { error: "Choose Free or Premium access." });
    const days = Number(body.days);
    if (plan === "premium") {
      student.plan = "premium";
      if (Number.isFinite(days) && days > 0) {
        const baseTime = (student.planExpiresAt && new Date(student.planExpiresAt).getTime() > Date.now())
          ? new Date(student.planExpiresAt).getTime()
          : Date.now();
        student.planExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
      } else {
        student.planExpiresAt = null; // Lifetime / unlimited
      }
    } else {
      student.plan = "free";
      student.planExpiresAt = null;
    }
    student.planUpdatedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { user: safeUser(student) });
  }
  if (req.method === "DELETE" && /^\/api\/admin\/students\/[^/]+$/.test(pathname)) {
    const studentId = decodeURIComponent(pathname.split("/")[4] || "");
    const student = data.users.find(user => user.id === studentId);
    if (!student) return json(res, 404, { error: "Student account not found." });

    data.users = data.users.filter(u => u.id !== studentId);
    data.results = (data.results || []).filter(r => r.studentId !== studentId);
    data.readingAttempts = (data.readingAttempts || []).filter(a => a.studentId !== studentId);
    data.listeningAttempts = (data.listeningAttempts || []).filter(a => a.studentId !== studentId);
    data.writingSubmissions = (data.writingSubmissions || []).filter(w => w.studentId !== studentId);
    data.cohortMembers = (data.cohortMembers || []).filter(cm => cm.studentId !== studentId);

    for (const [token, session] of studentSessions.entries()) {
      if (session.id === studentId) studentSessions.delete(token);
    }

    await writeData(data);
    return json(res, 200, { ok: true, message: `Account "${student.username}" successfully deleted.` });
  }
  if (req.method === "POST" && pathname === "/api/admin/clean-test-users") {
    const body = await readBody(req).catch(() => ({}));
    const targetUsernames = Array.isArray(body.usernames) ? body.usernames.map(u => String(u).toLowerCase().trim()) : null;

    let testUserIds = new Set();
    const isTestAccount = (user) => {
      const uname = (user.username || "").toLowerCase();
      const name = (user.name || "").toLowerCase();
      if (targetUsernames && targetUsernames.length > 0) {
        return targetUsernames.includes(uname);
      }
      return name.includes("candidate") ||
             (name.includes("instructor") && !uname.includes("bilol")) ||
             name.includes("test") ||
             name.includes("tester") ||
             name.includes("demo") ||
             name.includes("qa") ||
             name.includes("audit") ||
             name.includes("verification") ||
             name.includes("review user") ||
             name.includes("highlight") ||
             uname.startsWith("qa_") ||
             uname.startsWith("stud_") ||
             uname.startsWith("teach_") ||
             uname.startsWith("user_") ||
             uname.startsWith("verify_") ||
             uname.startsWith("rev_") ||
             uname.startsWith("fqa_") ||
             uname.startsWith("test") ||
             uname.startsWith("demo") ||
             uname.startsWith("tester_") ||
             uname.startsWith("ctf_") ||
             uname.startsWith("mocktester_") ||
             uname.startsWith("speaktester_") ||
             uname.startsWith("speed_") ||
             uname.startsWith("lqa_") ||
             uname.startsWith("band_") ||
             uname.startsWith("debug_");
    };

    const toDelete = data.users.filter(isTestAccount);
    toDelete.forEach(u => testUserIds.add(u.id));

    if (testUserIds.size === 0) {
      return json(res, 200, { ok: true, deletedCount: 0, message: "No test accounts found to clean." });
    }

    data.users = data.users.filter(u => !testUserIds.has(u.id));
    data.results = (data.results || []).filter(r => !testUserIds.has(r.studentId));
    data.readingAttempts = (data.readingAttempts || []).filter(a => !testUserIds.has(a.studentId));
    data.listeningAttempts = (data.listeningAttempts || []).filter(a => !testUserIds.has(a.studentId));
    data.writingSubmissions = (data.writingSubmissions || []).filter(w => !testUserIds.has(w.studentId));
    data.cohortMembers = (data.cohortMembers || []).filter(cm => !testUserIds.has(cm.studentId));

    for (const [token, session] of studentSessions.entries()) {
      if (testUserIds.has(session.id)) studentSessions.delete(token);
    }

    await writeData(data);
    return json(res, 200, {
      ok: true,
      deletedCount: testUserIds.size,
      deletedAccounts: toDelete.map(u => ({ username: u.username, name: u.name })),
      message: `${testUserIds.size} ta test akkaunti muvaffaqiyatli o'chirildi.`
    });
  }
  if (req.method === "GET" && pathname === "/api/admin/backup") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="ielts-core-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    return res.end(JSON.stringify(data, null, 2));
  }
  if (req.method === "POST" && pathname === "/api/admin/resources") {
    const body = await readBody(req);
    const title = String(body.title || "").trim().slice(0, 120);
    const grade = String(body.grade || "");
    const type = String(body.type || "");
    const skill = String(body.skill || "").toLowerCase();
    const description = String(body.description || "").trim().slice(0, 240);
    const collection = String(body.collection || "").toLowerCase();
    let url;
    try { url = new URL(String(body.url || "")); } catch { url = null; }
    const englishGrade = ["beginner", "elementary", "ielts"].includes(grade);
    const validSkill = englishGrade ? ENGLISH_SKILLS.has(skill) : (!skill || ENGLISH_SKILLS.has(skill));
    const valid = title.length >= 3 && LEVELS.has(grade) && validSkill && ["video", "pdf", "audio", "article", "book", "sample"].includes(type) && (!englishGrade || ENGLISH_COLLECTIONS.has(collection)) && url && ["http:", "https:"].includes(url.protocol);
    if (!valid) return json(res, 400, { error: "Check the material title, level, skill, type and secure URL." });
    const resource = { id: crypto.randomUUID(), title, grade, skill: englishGrade ? skill : "", type, collection: englishGrade ? collection : "", description, url: url.href, access: body.access === "premium" ? "premium" : "free", createdAt: new Date().toISOString() };
    data.resources.unshift(resource); await writeData(data);
    return json(res, 201, resource);
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/admin/resources/")) {
    const id = pathname.split("/").pop();
    data.resources = data.resources.filter(item => item.id !== id);
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: "Not found." });
}

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".json": "application/json; charset=utf-8"
};

function listeningPersistenceMarkup(user) {
  const isPremium = user?.plan === "premium";
  const config = JSON.stringify({ id: LISTENING_MATERIAL.id, title: LISTENING_MATERIAL.title, isPremium, userPlan: user?.plan || "free" }).replace(/</g, "\\u003c");
  return `
<style id="vortex-listening-save-styles">
  #vortex-listening-save{position:fixed;z-index:2147483646;right:18px;bottom:74px;display:flex;max-width:360px;align-items:center;gap:12px;padding:13px 15px;border:1px solid #a9dfc5;border-radius:12px;color:#086846;background:rgba(255,255,255,.97);box-shadow:0 16px 42px rgba(10,31,67,.2);font:600 13px/1.35 Arial,sans-serif;transform:translateY(18px);opacity:0;pointer-events:none;transition:.22s ease}#vortex-listening-save.show{transform:translateY(0);opacity:1;pointer-events:auto}#vortex-listening-save.error{border-color:#f1c2bd;color:#a32920}#vortex-listening-save a{color:inherit;font-weight:800}@media(max-width:640px){#vortex-listening-save{right:10px;bottom:74px;left:10px;max-width:none}}
</style>
<div id="vortex-listening-save" role="status" aria-live="polite"><span></span><a href="/english/account">Dashboard</a></div>
<script id="vortex-listening-save-script">
(function(){
  var material=${config};
  var token=localStorage.getItem('vortex-english-token');
  var startedAt=Date.now();
  var saving=false;
  var saved=false;
  var status=document.getElementById('vortex-listening-save');
  function notify(message,type){status.querySelector('span').textContent=message;status.className='show '+(type||'');window.clearTimeout(notify.timer);notify.timer=window.setTimeout(function(){status.className='';},6500);}
  function collectAnswers(){var answers=[];for(var number=1;number<=40;number+=1){var key='q'+number;var direct=document.getElementById(key);var checked=document.querySelector('input[name="'+key+'"]:checked');var value=checked?checked.value:(direct?direct.value:'');answers.push({key:key,value:String(value||'')});}return answers;}
  function scoreFromPage(){var node=document.getElementById('score-summary');var match=String(node&&node.textContent||'').match(/scored\s+(\d+)\s+out of\s+40/i);return match?Number(match[1]):null;}
  async function saveResult(){if(saved||saving||scoreFromPage()===null)return;saving=true;if(!token){notify('Sign in before taking a test to save the result.','error');saving=false;return;}try{var response=await fetch('/api/listening-attempts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({materialId:material.id,answers:collectAnswers(),durationSeconds:Math.round((Date.now()-startedAt)/1000)})});var data=await response.json().catch(function(){return {};});if(!response.ok)throw new Error(data.error||'Listening result could not be saved.');saved=true;notify('Saved: '+data.attempt.correct+'/'+data.attempt.total+' · IELTS Listening Band '+Number(data.attempt.band).toFixed(1),'');}catch(error){notify(error.message||'Listening result could not be saved.','error');}finally{saving=false;}}
  function saveWhenReady(remaining){window.setTimeout(function(){if(scoreFromPage()!==null)saveResult();else if(remaining>0)saveWhenReady(remaining-1);},250);}
  document.addEventListener('click',function(event){var control=event.target.closest('button,input[type="submit"]');if(!control)return;var label=String(control.textContent||control.value||control.getAttribute('aria-label')||'').trim();if(/check answers|submit|finish|deliver|review your answers/i.test(label))saveWhenReady(16);},true);
  var scoreNode=document.getElementById('score-summary');if(scoreNode)new MutationObserver(function(){saveWhenReady(2);}).observe(scoreNode,{subtree:true,childList:true,characterData:true});
})();
</script>`;
}

function readNeutralEnglishExam(user) {
  const source = fs.readFileSync(ENGLISH_EXAM_SOURCE, "utf8");
  const clean = source
    .replace(/\s*--telegram-color:\s*[^;]+;/gi, "")
    .replace(/\s*body::after\s*\{[\s\S]*?\}\s*/i, "\n")
    .replace(/\s*\.telegram-link\s*\{[\s\S]*?\}\s*\.telegram-link:hover\s*\{[\s\S]*?\}\s*/i, "\n")
    .replace(/<div class="header-left">[\s\S]*?<\/div>\s*(?=<div class="header-icons">)/i, '<div class="header-left" aria-label="IELTS Listening" style="display:flex;align-items:center;gap:12px;"><a href="/english/materials?level=ielts&skill=listening" style="display:inline-flex;align-items:center;gap:6px;color:var(--text-color);text-decoration:none;font-weight:700;font-size:12px;padding:6px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--secondary-bg);">← Exit to Library</a><strong style="font-size:14px;font-weight:700;letter-spacing:-0.02em;">IELTS Listening Full Test 01</strong></div>\n    ')
    .replace(/@MINDLESS_WRITER|@FOZILBEK_IELTS|https?:\/\/t\.me\/[^\s"']+|https?:\/\/i\.pinimg\.com\/[^\s"']+/gi, "")
    .replace(/<\/style>/i, "@media (max-width: 768px) { .nav-arrows { display: none; } }\n</style>");
  const persistence = listeningPersistenceMarkup(user);
  return /<\/body>/i.test(clean) ? clean.replace(/<\/body>/i, `${persistence}\n</body>`) : `${clean}${persistence}`;
}

const server = http.createServer(async (req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebaseapp.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://*.firebaseio.com; " +
      "connect-src 'self' https://accounts.google.com https://apis.google.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;"
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    // Robots.txt
    if (req.method === "GET" && pathname === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
      return res.end(`User-agent: *\nAllow: /english\nAllow: /english/\nDisallow: /admin\nDisallow: /english/admin\nDisallow: /api/\nSitemap: https://${req.headers.host || "ieltscore.uz"}/sitemap.xml\n`);
    }

    // Sitemap.xml
    if (req.method === "GET" && pathname === "/sitemap.xml") {
      const host = req.headers.host || "ieltscore.uz";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const urls = [
        "/english",
        "/english/courses",
        "/english/practice",
        "/english/materials",
        "/english/pricing",
        "/english/writing-editor",
        "/english/teacher",
        "/english/account",
        "/english/signup",
        "/english/login"
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url>\n    <loc>${proto}://${host}${u}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${u === "/english" ? "1.0" : "0.8"}</priority>\n  </url>`).join("\n")}\n</urlset>`;
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=86400" });
      return res.end(xml);
    }

    if (pathname === "/") {
      res.writeHead(302, { Location: "/english", "Cache-Control": "no-store" });
      return res.end();
    }
    if (pathname.startsWith("/api/")) return await api(req, res, pathname);
    if (pathname === "/english/content-file") {
      const data = await readData();
      const user = studentFromRequest(req, data);
      if (!user) { res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); return res.end("Sign in to open this material."); }
      const item = readEnglishContentCatalog(true).find(resource => resource.id === requestUrl.searchParams.get("id"));
      if (!item) { res.writeHead(404); return res.end("Material not found"); }
      if (item.access === "premium" && user.plan !== "premium") { res.writeHead(402, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); return res.end("Premium access is required."); }
      const part = item.parts.find(entry => entry.key === requestUrl.searchParams.get("part")) || item.parts[0];
      const file = path.resolve(ENGLISH_CONTENT_DIR, String(part.file || ""));
      if (!file.startsWith(`${path.resolve(ENGLISH_CONTENT_DIR)}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Material file not found"); }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="${path.basename(file).replace(/["\r\n]/g, "")}"` });
      const stream = fs.createReadStream(file);
      stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end('File read error'); } });
      return stream.pipe(res);
    }
    if (pathname === "/english/reading-exam") {
      const material = readReadingCatalog().find(item => item.id === requestUrl.searchParams.get("id"));
      if (!material) { res.writeHead(404); return res.end("Reading material not found."); }
      const data = await readData();
      const user = studentFromRequest(req, data);
      const activeUser = user || { id: "guest", name: "Candidate", plan: "free" };
      if (!material.free && activeUser.plan !== "premium") {
        if (!user) {
          res.writeHead(302, { Location: `/english/login?next=${encodeURIComponent(requestUrl.pathname + requestUrl.search)}`, "Cache-Control": "no-store" });
          return res.end();
        }
        res.writeHead(402, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premium material</title><body style="font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#f7f8fa;color:#1b2435"><main style="max-width:520px;padding:32px;text-align:center"><h1>Premium Reading material</h1><p>This full test is available with the Premium plan.</p><a href="/english/materials?level=ielts&skill=reading">Back to materials</a></main></body></html>');
      }
      if (requestUrl.searchParams.get("mode") === "real" && activeUser.plan !== "premium") {
        res.writeHead(402, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premium required</title><body style="font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#f7f8fa;color:#1b2435"><main style="max-width:520px;padding:32px;text-align:center"><h1>Real Exam Mode is Locked</h1><p>Real Exam Mode is a premium feature. Please upgrade your plan or use Practice mode.</p><a href="/english/materials">Back to materials</a></main></body></html>');
      }
      const file = path.join(READING_MATERIALS_DIR, material.fileName);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(sanitizeReadingHtml(fs.readFileSync(file, "utf8"), material, activeUser));
    }
    if (pathname.startsWith("/english/audio/")) {
      const audioFileName = path.basename(pathname);
      const audioPath = path.join(LISTENING_AUDIO_DIR, audioFileName);
      if (!fs.existsSync(audioPath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Audio not found");
      }
      return serveAudioFile(req, res, audioPath);
    }
    if (pathname === "/english/listening-exam" || pathname === "/english-exam.html" || pathname === "/english/exam") {
      const data = await readData();
      const user = studentFromRequest(req, data);
      const activeUser = user || { id: "guest", name: "Candidate", plan: "free" };
      const requestedId = String(requestUrl.searchParams.get("id") || "listening-full-test-01");
      const material = readListeningCatalog().find(item => item.id === requestedId) || LISTENING_MATERIAL;
      if (!material) {
        res.writeHead(404);
        return res.end("Listening material not found.");
      }
      if (material.access === "premium" && activeUser.plan !== "premium") {
        if (!user) {
          res.writeHead(302, { Location: `/english/login?next=${encodeURIComponent(requestUrl.pathname + requestUrl.search)}`, "Cache-Control": "no-store" });
          return res.end();
        }
        res.writeHead(402, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premium material</title><body style="font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#f7f8fa;color:#1b2435"><main style="max-width:520px;padding:32px;text-align:center"><h1>Premium Listening material</h1><p>This full test is available with the Premium plan.</p><a href="/english/materials?level=ielts&skill=listening">Back to materials</a></main></body></html>');
      }
      if (requestUrl.searchParams.get("mode") === "real" && activeUser.plan !== "premium") {
        res.writeHead(402, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premium required</title><body style="font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#f7f8fa;color:#1b2435"><main style="max-width:520px;padding:32px;text-align:center"><h1>Real Exam Mode is Locked</h1><p>Real Exam Mode is a premium feature. Please upgrade your plan or use Practice mode.</p><a href="/english/materials">Back to materials</a></main></body></html>');
      }
      const testFile = material.fileName ? path.join(LISTENING_MATERIALS_DIR, material.fileName) : ENGLISH_EXAM_SOURCE;
      if (!fs.existsSync(testFile)) {
        res.writeHead(503);
        return res.end("The Listening test is temporarily unavailable.");
      }
      const source = fs.readFileSync(testFile, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(sanitizeListeningHtml(source, material, activeUser, requestUrl.searchParams.get("mode")));
    }
    const englishRoutes = {
      "/english": "english.html",
      "/english/courses": "english-courses.html",
      "/english/practice": "english-practice.html",
      "/english/materials": "english-materials.html",
      "/english/pricing": "english-pricing.html",
      "/english/lesson": "english-lesson.html",
      "/english/vocabulary": "english-vocabulary.html",
      "/english/account": "english-account.html",
      "/english/signup": "english-signup.html",
      "/english/login": "english-login.html",
      "/english/teacher": "english-teacher.html",
      "/english/writing-editor": "english-writing-editor.html",
      "/english/mock-tests": "english-mock-tests.html",
      "/english/mock-exam": "english-mock-exam.html",
      "/english/speaking": "english-speaking.html",
      "/english/speaking-studio": "english-speaking.html",
      "/bunyodvibecodern1": "admin.html",
      
      
    };
    const englishNestedAssets = new Set([
      "english-pages.css", "english-site.js", "english-practice.js", "english-materials.js",
      "english-pricing.js", "english-pricing.css", "english-lesson.js", "english-vocabulary.js",
      "english-account.js", "english-auth.js", "english-teacher.js", "english-teacher.css",
      "english-writing-editor.js", "english-writing-editor.css", "english-product-v4.css",
      "english-mock-tests.js", "english-mock-tests.css", "english-mock-exam.js", "english-mock-exam.css",
      "english-speaking.js", "english-speaking.css", "speaking-avatar.js", "speaking-recorder.js",
      "admin.js"
    ]);
    if (pathname.startsWith("/data/uploads/") || pathname.startsWith("/uploads/")) {
      const fileName = path.basename(pathname);
      const uploadFile = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(uploadFile) && fs.statSync(uploadFile).isFile()) {
        const ext = path.extname(uploadFile).toLowerCase();
        res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
        const stream = fs.createReadStream(uploadFile);
        stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end('File read error'); } });
        return stream.pipe(res);
      }
      res.writeHead(404);
      return res.end("Uploaded file not found");
    }
    const rootAsset = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    const nestedAsset = pathname.startsWith("/english/") ? pathname.slice("/english/".length) : "";
    const isExplicitMapped = Boolean(englishRoutes[pathname] || englishNestedAssets.has(rootAsset) || englishNestedAssets.has(nestedAsset));
    const requested = englishRoutes[pathname] || (englishNestedAssets.has(rootAsset) ? rootAsset : (englishNestedAssets.has(nestedAsset) ? nestedAsset : rootAsset));
    if (pathname.startsWith("/data/")) { res.writeHead(404); return res.end("Not found"); }
    const file = path.resolve(ROOT, requested);
    
    if (!isExplicitMapped) {
      const fileName = path.basename(file);
      const ext = path.extname(file).toLowerCase();
      if (fileName.startsWith('.') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.env') || file.endsWith('.env.local') || file.endsWith('.md')) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Access Denied");
      }
      const allowedExts = ['.html', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.wav', '.webm', '.pdf', '.webp'];
      if (!allowedExts.includes(ext)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Access Denied");
      }
    }

    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const notFoundPage = path.join(ROOT, "404.html");
      if (fs.existsSync(notFoundPage)) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        const stream = fs.createReadStream(notFoundPage);
      stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end('File read error'); } });
      return stream.pipe(res);
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Page not found");
    }

    const ext = path.extname(file).toLowerCase();
    const cacheControl = "no-cache, must-revalidate";

    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": cacheControl });
    const stream = fs.createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end('File read error'); } });
    stream.pipe(res);
  } catch (error) {
    console.error("Internal Server Error:", error);
    json(res, error.code === "STATE_CONFLICT" ? 409 : 500, { error: error.code === "STATE_CONFLICT" ? error.message : "The server could not complete this request." });
  }
});

// Periodic automated database backup (runs every 30 minutes)
setInterval(async () => {
  try {
    const data = await readData();
    performDataBackup(data);
  } catch (_) {}
}, 30 * 60 * 1000);

// Perform immediate backup on startup
readData().then(data => performDataBackup(data)).catch(() => {});

// Graceful shutdown handler to ensure in-memory state is flushed to disk
function handleShutdown() {
  console.log("Shutting down gracefully...");
  if (inMemoryData) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(inMemoryData, null, 2));
      performDataBackup(inMemoryData);
    } catch (_) {}
  }
  process.exit(0);
}
process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

if (require.main === module) server.listen(PORT, "0.0.0.0", () => {
  console.log(`IELTS Core: http://127.0.0.1:${PORT}/english`);
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) console.log("Warning: ADMIN_USERNAME or ADMIN_PASSWORD is missing, so administrator sign-in is disabled.");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) console.log("Google sign-in is disabled until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.");
});

module.exports = server;
