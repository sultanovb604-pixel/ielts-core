const assert = require("assert/strict");
const crypto = require("crypto");

const base = process.env.QA_BASE_URL || "http://127.0.0.1:4183";
const sourceFile = "full_reading1_with_explanation (2).html";
const materialId = `reading-${crypto.createHash("sha256").update(sourceFile).digest("hex").slice(0, 12)}`;
const answerKey = {
  1: "YES", 2: "YES", 3: "NO", 4: "NOT GIVEN", 5: "NO", 6: "NOT GIVEN", 7: "sail", 8: "narrow", 9: "locomotion", 10: "moisture",
  11: "stress", 12: "ground", 13: "fossil tracks", 14: "C", 15: "E", 16: "B", 17: "D", 18: "A", 19: "F", 20: "C",
  21: "D", 22: "C", 23: "A", 24: "disc", 25: "patterns", 26: "Mars", 27: "YES", 28: "NO", 29: "YES", 30: "NOT GIVEN",
  31: "YES", 32: "NO", 33: "D", 34: "A", 35: "C", 36: "A", 37: "C", 38: "A", 39: "F", 40: "B"
};

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || path}`);
  return body;
}

(async () => {
  const username = `qa_reading_${Date.now().toString(36)}`;
  const registration = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Reading QA", username, password: "QaReading123!", learning: "ielts", goal: "future" })
  });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${registration.token}` };
  const answers = Object.entries(answerKey).map(([number, value]) => ({ key: `q${number}`, value, type: "text", checked: false }));

  const verified = await request("/api/reading-attempts", {
    method: "POST",
    headers,
    body: JSON.stringify({ materialId, correct: 0, total: 40, answers, durationSeconds: 1200 })
  });
  assert.equal(verified.attempt.correct, 40, "The server must calculate the Reading score from submitted answers");
  assert.equal(verified.attempt.band, 9, "A verified 40/40 Reading result should be Band 9");

  const tampered = await request("/api/reading-attempts", {
    method: "POST",
    headers,
    body: JSON.stringify({ materialId, correct: 40, total: 40, answers: [], durationSeconds: 1 })
  });
  assert.equal(tampered.attempt.correct, 0, "A forged client score must be ignored");
  assert.equal(tampered.attempt.band, 0, "Blank Reading answers must not produce a positive band");

  const history = await request("/api/student/results", { headers });
  assert.equal(history[0].source, "reading");
  assert.equal(history.length, 2);
  process.stdout.write(`${JSON.stringify({ materialId, verifiedScore: verified.attempt.correct, verifiedBand: verified.attempt.band, tamperScore: tampered.attempt.correct, savedAttempts: history.length }, null, 2)}\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
