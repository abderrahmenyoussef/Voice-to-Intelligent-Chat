class VoiceChat {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.currentTranscript = '';
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.recordBtn = document.getElementById('recordBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.audioFile = document.getElementById('audioFile');
        this.transcriptSection = document.getElementById('transcriptSection');
        this.transcriptBox = document.getElementById('transcriptBox');
        this.sendToAI = document.getElementById('sendToAI');
        this.editTranscript = document.getElementById('editTranscript');
        this.chatMessages = document.getElementById('chatMessages');
        this.loading = document.getElementById('loading');
        this.loadingText = document.getElementById('loadingText');
    }

    setupEventListeners() {
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.uploadBtn.addEventListener('click', () => this.audioFile.click());
        this.audioFile.addEventListener('change', (e) => this.handleFileUpload(e));
        this.sendToAI.addEventListener('click', () => this.sendToAI_handler());
        this.editTranscript.addEventListener('click', () => this.editTranscript_handler());
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/wav' });
                this.transcribeAudio(blob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateRecordButton();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.showError('Error accessing microphone. Please check permissions.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            this.updateRecordButton();
        }
    }

    updateRecordButton() {
        if (this.isRecording) {
            this.recordBtn.classList.add('recording');
            this.recordBtn.innerHTML = '<span class="btn-icon">⏹️</span><span class="btn-text">Stop Recording</span>';
        } else {
            this.recordBtn.classList.remove('recording');
            this.recordBtn.innerHTML = '<span class="btn-icon">🎙️</span><span class="btn-text">Start Recording</span>';
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.transcribeAudio(file);
        }
    }

    async transcribeAudio(audioBlob) {
        this.showLoading('Transcribing audio...');
        
        const formData = new FormData();
        formData.append('audio', audioBlob);

        try {
            const response = await fetch('/transcribe', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            this.hideLoading();

            if (result.success) {
                this.currentTranscript = result.transcript;
                this.showTranscript(result.transcript);
            } else {
                this.showError('Transcription failed: ' + result.error);
            }
        } catch (error) {
            this.hideLoading();
            this.showError('Error during transcription: ' + error.message);
        }
    }

    showTranscript(transcript) {
        this.transcriptBox.textContent = transcript;
        this.transcriptSection.style.display = 'block';
    }

    async sendToAI_handler() {
        const message = this.transcriptBox.textContent.trim();
        if (!message) {
            this.showError('No transcript to send');
            return;
        }

        this.addMessage(message, 'user');
        this.showLoading('Getting AI response...');

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message })
            });

            const result = await response.json();
            this.hideLoading();

            if (result.success) {
                this.addMessage(result.response, 'ai');
                this.transcriptSection.style.display = 'none';
                this.currentTranscript = '';
            } else {
                this.showError('AI response failed: ' + result.error);
            }
        } catch (error) {
            this.hideLoading();
            this.showError('Error getting AI response: ' + error.message);
        }
    }

    editTranscript_handler() {
        this.transcriptBox.contentEditable = true;
        this.transcriptBox.focus();
        this.transcriptBox.style.border = '2px solid #3b82f6';
        this.transcriptBox.style.outline = 'none';
        
        // Add save button
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'btn send-btn';
        saveBtn.style.marginLeft = '10px';
        saveBtn.onclick = () => {
            this.transcriptBox.contentEditable = false;
            this.transcriptBox.style.border = '1px solid #cbd5e1';
            this.currentTranscript = this.transcriptBox.textContent;
            saveBtn.remove();
        };
        
        this.editTranscript.parentNode.appendChild(saveBtn);
    }

    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const prefix = type === 'user' ? '<strong>You:</strong> ' : '<strong>AI Assistant:</strong> ';
        messageContent.innerHTML = prefix + content;
        
        messageDiv.appendChild(messageContent);
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showLoading(text) {
        this.loadingText.textContent = text;
        this.loading.style.display = 'flex';
    }

    hideLoading() {
        this.loading.style.display = 'none';
    }

    showError(message) {
        this.addMessage(`Error: ${message}`, 'ai');
        console.error(message);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VoiceChat();
});
