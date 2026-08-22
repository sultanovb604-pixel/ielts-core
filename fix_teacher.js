const fs = require('fs');

const filePath = "c:/Users/user/Desktop/vortex english/server.js";
let content = fs.readFileSync(filePath, "utf-8");

const pattern = /(if \(req\.method === "(?:GET|POST|DELETE)" && pathname(?: === |\.startsWith\()"[^"]*\/api\/teacher\/[^"]*"[\)]?\) \{\s*const user = studentFromRequest\(req, data\);\s*if \(!user\) return json\(res, 401, \{ error: "Please sign in\." \}\);)/g;

const matches = content.match(pattern);
console.log("Found matches:", matches ? matches.length : 0);

content = content.replace(pattern, `$1\n    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });`);

fs.writeFileSync(filePath, content, "utf-8");
console.log("Done");
