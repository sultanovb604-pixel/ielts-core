// IELTS Core Speaking Audio Recorder & Teacher Submission Engine
(function () {
  'use strict';

  class SpeakingAudioRecorder {
    constructor() {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.audioBlob = null;
      this.audioUrl = null;
      this.stream = null;
      this.isRecording = false;
      this.recordingStartTime = 0;
      this.durationSeconds = 0;
      this.onStopCallback = null;
    }

    async startRecording(onStop) {
      this.onStopCallback = onStop;
      this.audioChunks = [];
      this.audioBlob = null;
      this.audioUrl = null;

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.getSupportedMimeType() });

        this.mediaRecorder.ondataavailable = event => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          this.audioBlob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() });
          this.audioUrl = URL.createObjectURL(this.audioBlob);
          this.durationSeconds = Math.round((Date.now() - this.recordingStartTime) / 1000);
          this.isRecording = false;
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
          }
          if (this.onStopCallback) {
            this.onStopCallback(this.audioBlob, this.audioUrl, this.durationSeconds);
          }
        };

        this.mediaRecorder.start(250);
        this.recordingStartTime = Date.now();
        this.isRecording = true;
        return true;
      } catch (err) {
        console.error('Microphone access error:', err);
        throw new Error('Microphone permission was denied. Please allow microphone access in your browser settings.');
      }
    }

    stopRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    }

    downloadRecording(fileName = 'ielts_speaking_response.webm') {
      if (!this.audioBlob) return;
      const a = document.createElement('a');
      a.href = this.audioUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    async uploadToTeacher(assignmentId, topicTitle) {
      if (!this.audioBlob) throw new Error('No audio recording available to submit.');
      const token = localStorage.getItem('vortex-english-token');
      if (!token) throw new Error('Please sign in before submitting to teacher.');

      // Convert blob to base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(this.audioBlob);
      });

      const fileName = `speaking_${Date.now()}_${(topicTitle || 'mock').replace(/[^a-zA-Z0-9]/g, '_')}.webm`;

      // 1. Upload audio file
      const uploadRes = await fetch('/api/student/upload-homework', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName,
          fileData: base64Data
        })
      });

      const uploadResult = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadResult.error || 'Failed to upload audio file');

      // 2. Submit as homework task if assignmentId is present
      if (assignmentId) {
        const submitRes = await fetch('/api/writing/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            assignmentId,
            topicTitle: topicTitle || 'IELTS Speaking Audio Response',
            essayContent: '[Audio Speaking Submission Attached Below]',
            attachments: [{ url: uploadResult.url, name: fileName }],
            timeSpentSeconds: this.durationSeconds,
            mode: 'real-exam'
          })
        });
        const submitResult = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitResult.error || 'Failed to submit speaking homework');
        return { ok: true, submission: submitResult };
      }

      return { ok: true, fileUrl: uploadResult.url };
    }

    getSupportedMimeType() {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
      if (MediaRecorder.isTypeSupported('audio/ogg')) return 'audio/ogg';
      return '';
    }
  }

  window.SpeakingAudioRecorder = SpeakingAudioRecorder;
})();
