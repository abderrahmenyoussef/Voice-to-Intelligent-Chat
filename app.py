from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import whisperx
import requests
import os
from dotenv import load_dotenv
import tempfile
import json

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize WhisperX
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")  # Use "cuda" if you have GPU
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float32")
WHISPER_BATCH_SIZE = int(os.getenv("WHISPER_BATCH_SIZE", "16"))

# Load WhisperX model with error handling
try:
    print(f"Loading WhisperX model: {WHISPER_MODEL_SIZE} on {WHISPER_DEVICE}")
    model = whisperx.load_model(WHISPER_MODEL_SIZE, WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    print("WhisperX model loaded successfully!")
except Exception as e:
    print(f"Error loading WhisperX model: {e}")
    print("Trying with fallback settings...")
    try:
        model = whisperx.load_model("tiny", "cpu", compute_type="float32")
        print("WhisperX model loaded with fallback settings!")
    except Exception as e2:
        print(f"Critical error: Could not load WhisperX model: {e2}")
        print("Try running: pip install --upgrade whisperx")
        exit(1)

# OpenRouter API configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = os.getenv("OPENROUTER_API_URL", "https://openrouter.ai/api/v1/chat/completions")

# LLAMA Model configuration
LLAMA_MODEL_NAME = os.getenv("LLAMA_MODEL_NAME", "meta-llama/llama-3.3-70b-instruct:free")
LLAMA_TEMPERATURE = float(os.getenv("LLAMA_TEMPERATURE", "0.7"))
LLAMA_MAX_TOKENS = int(os.getenv("LLAMA_MAX_TOKENS", "1000"))
LLAMA_SYSTEM_MESSAGE = os.getenv("LLAMA_SYSTEM_MESSAGE", "You are a helpful AI assistant. Respond naturally and helpfully to the user's questions.")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save uploaded file temporarily with proper extension
        file_extension = audio_file.filename.split('.')[-1] if '.' in audio_file.filename else 'wav'
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_extension}') as tmp_file:
            audio_file.save(tmp_file.name)
            
            try:
                # Load audio and transcribe
                print(f"Loading audio from: {tmp_file.name}")
                audio = whisperx.load_audio(tmp_file.name)
                print(f"Audio loaded, duration: {len(audio)/16000:.2f} seconds")
                
                print("Starting transcription...")
                result = model.transcribe(audio, batch_size=WHISPER_BATCH_SIZE)
                print(f"Transcription result: {result}")
                
                # Extract transcript text
                transcript = result.get("text", "").strip()
                
                # Get segments for more detailed info (optional)
                segments = result.get("segments", [])
                
                # Check if transcript is empty
                if not transcript:
                    # Try to get text from segments
                    if segments:
                        transcript = " ".join([seg.get("text", "") for seg in segments]).strip()
                    
                    if not transcript:
                        print("No speech detected in the audio")
                        return jsonify({
                            'error': 'No speech detected in the audio. Please try speaking more clearly or check your audio file.',
                            'transcript': '',
                            'segments': segments,
                            'success': False
                        }), 400
                
                print(f"Final transcript: '{transcript}'")
                
                return jsonify({
                    'transcript': transcript,
                    'segments': segments,
                    'success': True
                })
                
            except Exception as transcribe_error:
                return jsonify({
                    'error': f'Transcription error: {str(transcribe_error)}',
                    'success': False
                }), 500
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(tmp_file.name)
                except:
                    pass
            
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/chat', methods=['POST'])
def chat_with_llama():
    try:
        data = request.json
        user_message = data.get('message', '')
        
        if not user_message:
            return jsonify({'error': 'No message provided'}), 400
        
        if not OPENROUTER_API_KEY:
            return jsonify({'error': 'OpenRouter API key not configured'}), 500
        
        # Prepare the request to OpenRouter
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": LLAMA_MODEL_NAME,
            "messages": [
                {
                    "role": "system",
                    "content": LLAMA_SYSTEM_MESSAGE
                },
                {
                    "role": "user",
                    "content": user_message
                }
            ],
            "temperature": LLAMA_TEMPERATURE,
            "max_tokens": LLAMA_MAX_TOKENS
        }
        
        # Make request to OpenRouter
        response = requests.post(OPENROUTER_URL, headers=headers, json=payload)
        
        if response.status_code == 200:
            result = response.json()
            ai_response = result['choices'][0]['message']['content']
            
            return jsonify({
                'response': ai_response,
                'success': True
            })
        else:
            return jsonify({
                'error': f'OpenRouter API error: {response.status_code} - {response.text}',
                'success': False
            }), 500
            
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
