const fs = require('fs');

const filePath = "c:/Users/user/Desktop/vortex english/server.js";
let content = fs.readFileSync(filePath, "utf-8");

content = content.replace(/return fs\.createReadStream\(([^)]+)\)\.pipe\(res\);/g, `const stream = fs.createReadStream($1);\n      stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end('File read error'); } });\n      return stream.pipe(res);`);
content = content.replace(/fs\.createReadStream\(([^)]+)\)\.pipe\(res\);/g, `const stream = fs.createReadStream($1);\n    stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end('File read error'); } });\n    stream.pipe(res);`);

fs.writeFileSync(filePath, content, "utf-8");
console.log("Done stream handling");
