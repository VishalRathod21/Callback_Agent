# 🎙️ InterviewAI

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1.svg?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![ChromaDB](https://img.shields.io/badge/VectorStore-ChromaDB-336791.svg?style=flat-square&logo=sqlite&logoColor=white)](https://www.trychroma.com)
[![Whisper STT](https://img.shields.io/badge/SpeechToText-Whisper--Base-brightgreen.svg?style=flat-square&logo=openai&logoColor=white)](https://github.com/openai/whisper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

InterviewAI is an immersive, AI-powered mock interview preparation platform. It simulates realistic, multi-round interviews, assessing candidates on Algorithmic Coding (DSA), Systems Architecture & Design, and Behavioral HR qualifications using the STAR methodology. The platform features an advanced audio engine for real-time speech processing, voice synthesis, and interactive visualization.

---

## 🏗️ System Architecture

```mermaid
graph TD
    %% Frontend Components
    subgraph Frontend [React Single Page App]
        UI[Interview Room Page]
        WH[useWebSocket Hook]
        AC[useAudioCapture Hook]
        AV[AudioVisualizer Component]
    end

    %% Gateway & Backend Services
    subgraph Backend [FastAPI Application Server]
        WSC[WebSocket Router]
        STT[Whisper STT Service]
        TTS[Coqui TTS Service]
        
        %% Agents Layer
        subgraph Agents [Multi-Agent Orchestrator]
            DSA[DSA Algorithmic Agent]
            TECH[Technical Systems Agent]
            HR[STAR Behavioral HR Agent]
        end
    end

    %% Database & External Storage
    subgraph Infrastructure [Dockerized Infra Services]
        PG[(PostgreSQL 16 Database)]
        CH[(Chroma Vector DB)]
    end

    %% Interactions
    UI --> WH
    UI --> AV
    AC -->|Audio Stream & volume data| AV
    AC -->|Base64 Opus/WebM Chunks| WH
    WH <-->|JSON Websocket / Audio Chunks| WSC
    
    WSC -->|ffmpeg mono WAV| STT
    WSC -->|Prompt history| Agents
    STT -->|Transcribed Text| WSC
    
    Agents -->|Evaluations / History| PG
    Agents -->|Vector Embeddings & RAG| CH
    Agents -->|AI Response Text| WSC
    WSC -->|Synthesized Voice Bytes| TTS
```

---

## ✨ Core Features

### 1. Hybrid Input Workflow
*   **Voice Mode**: Speak naturally. Dynamic recording handles audio recording directly in the browser using the `MediaRecorder` API and streams it in real-time.
*   **Keyboard Mode**: Instantly switch to standard text-editor inputs if in a noisy environment or if you prefer typing.

### 2. Canvas-Based Audio Oscilloscope
*   A premium, glowing visualizer rendered using the HTML5 Canvas API and Web Audio API `analyser` node. It paints a dynamic golden waveform reflecting the exact frequency and pitch of the candidate's speech.

### 3. Turn-Based Speech Processing
*   **EBML Header Stream Safety**: Audio chunks are accumulated at the network socket layer. When the user finishes speaking, the complete buffer (containing the original container headers) is sent to the transcriber. This prevents `ffmpeg` file parsing errors and provides context-rich Whisper transcribing.
*   **Whisper STT**: Automatically transcribes voice responses locally on CPU.
*   **Coqui TTS**: Synthesizes custom voices locally to read interviewer responses aloud.

### 4. Comprehensive Evaluation Dashboard
*   Grades interviews automatically upon round completion.
*   Calculates relative success metrics (e.g. System Design, Communication, Problem Solving) and charts performance dynamically with sleek animated progress gauges.

---

## 🛠️ Prerequisites & Tech Stack

### Frontend
*   **React 18** (Vite-powered SPA)
*   **Zustand** (Sleek global state management)
*   **Chart.js** & Canvas drawing elements

### Backend
*   **FastAPI** (High-performance ASGI server)
*   **SQLAlchemy + Alembic** (PostgreSQL ORM & DB migrations)
*   **OpenAI Whisper** (Local Speech-to-Text inference)
*   **Coqui TTS** (Local Text-to-Speech synthesis)
*   **ChromaDB** (RAG-based vector storage for custom interview questions)
*   **FFmpeg** (Required for audio format trans-coding)

---

## 📝 Environment Configurations

Create a `.env` file inside the `backend/` directory.

```ini
# Database Connection
DATABASE_URL=postgresql://postgres:password@localhost:5433/interviewai

# LLM Providers
GROQ_API_KEY=gsk_your_groq_api_key_here
GEMINI_API_KEY=AIzaSy_your_gemini_api_key_here

# Local Server Settings
HOST=0.0.0.0
PORT=8002
```

---

## 🚀 Quick Start Guide

### Step 1: Start Infrastructure (PostgreSQL & ChromaDB)
Launch the databases inside isolated Docker containers:
```bash
docker compose up -d
```
> [!NOTE]
> PostgreSQL runs on host port `5433` and ChromaDB runs on host port `8001`.

### Step 2: Use Dev Script (Recommended)
You can build and start the entire development stack with a single utility script:
```bash
./start_dev.sh
```
This script automatically:
1. Clears any zombie ports on `8002`, `5173`, and `5174`.
2. Spins up the Docker containers.
3. Checks/builds the Python virtual environment (`venv`) and installs dependencies.
4. Executes DB migrations using `alembic upgrade head`.
5. Starts the FastAPI backend and React frontend parallel servers.

### Step 3: Manual Execution
If you prefer starting services manually, do the following:

#### 1. Backend Server Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate

# Install packages
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start API dev server
uvicorn main:app --reload --host 0.0.0.0 --port 8002
```

#### 2. Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```

---

## 🔌 WebSocket Communication Protocol

Real-time audio, text, and round operations occur over standard WebSockets (`ws://localhost:8002/ws/interview/{session_id}`).

### Client -> Server Messages

| Event Name | Schema Payload | Description |
| :--- | :--- | :--- |
| `start_round` | `{"type": "start_round", "round": "technical", "target_role": "...", "resume_context": "..."}` | Initializes and schedules the specified interview round. |
| `audio_chunk` | `{"type": "audio_chunk", "data": "BASE64_BYTES", "duration_ms": 500}` | Streams 500ms audio bytes sequentially during active recording. |
| `audio_flush` | `{"type": "audio_flush"}` | Signals completion of candidate's speaking turn; triggers full STT. |
| `typed_answer` | `{"type": "typed_answer", "text": "CANDIDATE_RESPONSE"}` | Submits response in Text Mode. |
| `end_round` | `{"type": "end_round"}` | Forces round termination and requests automatic agent grading. |

### Server -> Client Messages

| Event Name | Schema Payload | Description |
| :--- | :--- | :--- |
| `connected` | `{"type": "connected", "session_id": "UUID"}` | Verifies client-server link initialization. |
| `transcript` | `{"type": "transcript", "text": "...", "speaker": "candidate"}` | Transcribed result of the candidate's speech. |
| `ai_response` | `{"type": "ai_response", "text": "..."}` | Interactive response text generated by the round agent. |
| `audio` | `{"type": "audio", "data": "BASE64_WAV"}` | TTS voice synthesis playback bytes. |
| `round_complete`| `{"type": "round_complete", "score": 85, "feedback": "...", "next_round": "..."}` | Grades and reports performance metrics for the round. |

---

## 🧪 Testing

To run the full backend testing suites, make sure your virtual environment is active and execute:
```bash
cd backend
PYTHONPATH=. venv/bin/pytest
```

---

## ❓ Troubleshooting

### 1. `ffmpeg conversion failed`
Ensure `ffmpeg` is installed on your host system:
*   **Ubuntu/Debian**: `sudo apt update && sudo apt install -y ffmpeg`
*   **macOS**: `brew install ffmpeg`
*   **Windows**: `winget install FFmpeg`

### 2. Database Connection Issues
If the backend throws connection errors on database startup, ensure the Docker postgres container is healthy:
```bash
docker ps
```
If you have a local postgres server running on host port `5432` or `5433`, terminate it or adjust the host port inside `docker-compose.yml`.

### 3. Whisper Speech-to-Text Performance
Whisper uses CPU-based processing by default. If transcription takes longer than 3–4 seconds:
*   Reduce model size from `"base"` to `"tiny"` in `backend/services/stt_service.py` to speed up CPU inference.
