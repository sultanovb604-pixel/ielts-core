// IELTS Core Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyALJ7J_QLqqG3VoJPSxmqOjsPIaGtKVEus",
  authDomain: "ieltscorecom.firebaseapp.com",
  projectId: "ieltscorecom",
  storageBucket: "ieltscorecom.firebasestorage.app",
  messagingSenderId: "937610994904",
  appId: "1:937610994904:web:bbab5fcead08965dbee3ad",
  measurementId: "G-JM6L0LBHYH"
};

if (typeof window !== 'undefined') {
  window.firebaseConfig = firebaseConfig;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
