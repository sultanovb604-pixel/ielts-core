const assert = require("node:assert/strict");

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4183";

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname} failed (${response.status}): ${body.error || "Unknown error"}`);
  return body;
}

async function main() {
  const username = `qa_${Date.now()}`.slice(0, 24);
  const registration = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Listening QA", username, password: "ListeningQA2026!" })
  });
  const headers = { Authorization: `Bearer ${registration.token}` };
  const resources = await request("/api/resources", { headers });
  const listening = resources.find(item => item.id === "listening-full-test-01");
  assert.ok(listening, "Listening Full Test 01 must be present in the signed-in library.");
  assert.equal(listening.questionCount, 40);
  assert.equal(listening.access, "free");
  const examResponse = await fetch(`${baseUrl}/english/exam?token=${encodeURIComponent(registration.token)}`);
  const examHtml = await examResponse.text();
  assert.equal(examResponse.status, 200);
  assert.match(examHtml, /<audio\b/i);
  assert.match(examHtml, /vortex-listening-save-script/);
  assert.doesNotMatch(examHtml, /https?:\/\/t\.me\//i);
  assert.doesNotMatch(examHtml, /@(?:mindless_writer|fozilbek_ielts)/i);

  const answers = {
    q1: "northeast", q2: "peak season", q3: "weekend", q4: "quiet", q5: "beach",
    q6: "restaurant", q7: "garden", q8: "Cheffins", q9: "0192477285", q10: "Countryside Living",
    q11: "A", q12: "A", q13: "B", q14: "C", q15: "C", q16: "B", q17: "C", q18: "D", q19: "A", q20: "F",
    q21: "C", q22: "B", q23: "B", q24: "B", q25: "C", q26: "A", q27: "F", q28: "D", q29: "E", q30: "A",
    q31: "smooth", q32: "protection", q33: "half", q34: "still", q35: "salt", q36: "mud", q37: "smell", q38: "pump", q39: "pest", q40: "antibiotic"
  };
  const submission = await request("/api/listening-attempts", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ materialId: listening.id, answers: Object.entries(answers).map(([key, value]) => ({ key, value })), durationSeconds: 1200 })
  });
  assert.equal(submission.attempt.correct, 40);
  assert.equal(submission.attempt.total, 40);
  assert.equal(submission.attempt.band, 9);

  const tamperedSubmission = await request("/api/listening-attempts", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ materialId: listening.id, correct: 40, answers: [], durationSeconds: 5 })
  });
  assert.equal(tamperedSubmission.attempt.correct, 0, "The server must calculate the score from answers instead of trusting a client score.");
  assert.equal(tamperedSubmission.attempt.band, 0);

  const results = await request("/api/student/results", { headers });
  assert.equal(results[0].source, "listening");
  assert.equal(results[0].band, 0);
  const progress = await request("/api/student/progress", { headers });
  assert.equal(progress.listeningAttempts, 2);
  assert.equal(progress.tests, 1);

  console.log(JSON.stringify({
    libraryListening: listening.title,
    examAudioPresent: true,
    thirdPartyBrandingRemoved: true,
    savedScore: `${submission.attempt.correct}/${submission.attempt.total}`,
    savedBand: submission.attempt.band,
    resultSource: results[0].source,
    tamperCheckScore: tamperedSubmission.attempt.correct,
    listeningAttempts: progress.listeningAttempts
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
