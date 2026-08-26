const https = require('https');
const fs = require('fs');
const path = require('path');

const projectId = 'ieltscorecom';
const apiKey = 'AIzaSyALJ7J_QLqqG3VoJPSxmqOjsPIaGtKVEus';
const dataPath = path.join(__dirname, '..', 'data', 'vortex-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('Preparing to sync ' + data.users.length + ' users to Cloud Firestore...');

const url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/vortex_state/default?key=' + apiKey;

const payload = {
  fields: {
    usersCount: { integerValue: String(data.users.length) },
    updatedAt: { stringValue: new Date().toISOString() },
    stateJson: { stringValue: JSON.stringify(data) }
  }
};

const reqData = JSON.stringify(payload);

const req = https.request(url, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(reqData)
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Firestore HTTP Status:', res.statusCode);
    try {
      const parsed = JSON.parse(d);
      if (res.statusCode === 200) {
        console.log('SUCCESS! Platform data synced to Cloud Firestore!');
        console.log('Cloud Document:', parsed.name);
      } else {
        console.log('Firestore API Response:', parsed);
      }
    } catch(e) {
      console.log('Raw response:', d);
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(reqData);
req.end();
