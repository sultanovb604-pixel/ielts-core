// Dependency-free checks for the logged-out design. Run browser checks separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pages = ['english.html', 'english-login.html', 'english-signup.html', 'english-practice.html', 'english-courses.html', 'english-pricing.html'];
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  check((html.match(/<h1\b/g) || []).length === 1, file + ': exactly one h1');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  check(ids.length === new Set(ids).size, file + ': unique IDs');
  check(ids.includes('main') && html.includes('class="skip-link"'), file + ': skip navigation');
  check(html.includes('public-site') && html.includes('/english-public.css'), file + ': public style entry');
  for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
    const url = new URL(match[1], 'http://localhost');
    if (path.extname(url.pathname)) check(fs.existsSync(path.join(root, url.pathname.slice(1))), file + ': missing asset ' + url.pathname);
    if (url.pathname === '/english' && file === 'english.html' && url.hash) check(ids.includes(url.hash.slice(1)), file + ': broken anchor ' + url.hash);
  }
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) { new vm.Script(match[1], { filename: file }); checks++; }
  }
}
for (const file of ['english-public.js', 'english-auth.js', 'english-pricing.js', 'english-practice.js', 'english-session.js', 'server.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
  check(result.status === 0, file + ': ' + result.stderr);
}
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
check(server.includes('"english-public.css"') && server.includes('"english-public.js"'), 'Public assets must be allowed by the server');
const css = fs.readFileSync(path.join(root, 'english-public.css'), 'utf8');
check(!css.includes(':public'), 'No unresolved CSS scope placeholders');
check(css.includes('.public-site:not(.member-layout)'), 'Authenticated workspace excluded from public theme');
check(css.includes('prefers-reduced-motion'), 'Reduced motion preference supported');
for (const file of ['english-login.html', 'english-signup.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  check(html.includes('id="authForm"') && html.includes('id="authMessage"'), file + ': preserve auth hooks');
  check(html.includes('name="username"') && html.includes('name="password"'), file + ': preserve auth field names');
  check(html.includes('data-google-auth') && html.includes('data-password-toggle'), file + ': preserve auth controls');
}
const home = fs.readFileSync(path.join(root, 'english.html'), 'utf8');
check(home.includes('href="#practice-preview" data-start-sample'), 'First step can be tried without an account');
check(home.includes('id="practice-preview" tabindex="-1"'), 'Sample fragment target receives keyboard focus');
check(home.includes('id="sampleNext" hidden') && home.includes("hidden = !correct"), 'Account invitation follows a completed sample');
check(home.includes('/english/signup?next=%2Fenglish%2Fmaterials%3Fskill%3Dreading'), 'Reading intent preserved from sample to account');
check(home.includes('id="sampleEvidence"') && home.includes("classList.add('revealed')"), 'Answer feedback points to evidence');
check(css.includes('--paper:#fffdf8'), 'Shared warm paper token');
function luminance(hex) {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
for (const [ink, paper] of [['10233f', 'fffdf8'], ['5b6b80', 'fffdf8'], ['ffffff', '245bc7'], ['5b6b80', 'ffffff'], ['5b6b80', 'edf3fc'], ['ffdfb6', '214faf'], ['795735', 'f8e5d2'], ['634d33', 'fff4df']]) {
  const values = [luminance(ink), luminance(paper)].sort((a,b) => b-a);
  const contrast = (values[0] + .05) / (values[1] + .05);
  check(contrast >= 4.5, 'Text contrast ' + ink + '/' + paper + ': ' + contrast.toFixed(2));
}
console.log('PASS: ' + checks + ' public-design checks across ' + pages.length + ' pages.');
