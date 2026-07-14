# 🎙️ Callback Rehearsal / InterviewAI

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1.svg?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![FAISS](https://img.shields.io/badge/VectorStore-FAISS-blue.svg?style=flat-square)](https://github.com/facebookresearch/faiss)
[![Whisper STT](https://img.shields.io/badge/SpeechToText-Whisper--Base-brightgreen.svg?style=flat-square&logo=openai&logoColor=white)](https://github.com/openai/whisper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Callback Rehearsal** (InterviewAI) is a state-of-the-art, immersive AI-powered mock interview simulation platform. It replicates a high-fidelity, multi-round technical and behavioral hiring cycle. Using resume profiling, semantic RAG-based context injection, and agentic workflows, it tailors every question specifically to the candidate's target role and background.

---

## ✨ Core Highlights

*   **Resume Screening & RAG Integration**: Extracts skills and experience profiles from uploaded resumes, parsing them into FAISS Vector Store to inject relevant candidate history during rounds.
*   **DSA / Algorithmic Coding Round**: Generates custom coding problems based on candidate tier. Includes a live code editor with diagnostic hints, evaluation metrics, and runtime complexity breakdown.
*   **Systems Architecture Round**: Simulates design reviews targeting technical systems, microservices, and design patterns customized to target roles.
*   **Behavioral HR (STAR Methodology)**: Evaluates corporate fit, leadership, and emotional intelligence using custom behavioral prompts aligned with the STAR framework.
*   **Pacing & Articulation Analytics**: Monitors spoken verbal delivery, tracking total words spoken, filler words (e.g., *"like"*, *"um"*, *"ah"*, *"so"*), and calculates filler ratios to grade articulation.
*   **Rich Glassmorphic Design**: Sleek, modern dark-theme user experience built with customized CSS, micro-interactions, responsive score charts, and real-time audio visualizers.

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
        FAISS[(FAISS Vector Store)]
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
    Agents -->|Vector Embeddings & RAG| FAISS
    Agents -->|AI Response Text| WSC
    WSC -->|Synthesized Voice Bytes| TTS
```

---

## 🎙️ Real-time Audio & Dialogue Pipeline

Voice mode streams audio bidirectionally over WebSockets (`/ws/interview/{session_id}`):

```mermaid
sequenceDiagram
    autonumber
    participant Client as React Client (useAudioCapture)
    participant Server as FastAPI Server (websocket.py)
    participant STT as Whisper Service
    participant Agent as LLM Agent (Orchestrator)
    participant TTS as Coqui TTS Service

    Client->>Server: Connect to WebSocket Session
    Server-->>Client: Send 'state_change' (listening)
    Note over Client: Candidate begins speaking...
    Client->>Server: Send base64 WebM/Opus audio chunks (every 400ms)
    Note over Client: Candidate stops speaking (1.8s silence detected)
    Client->>Server: Send 'silence_detected' event
    Server->>Server: Accumulate buffer & run FFmpeg conversion (Opus -> mono WAV)
    Server->>STT: Transcribe audio file
    STT-->>Server: Return transcribed text
    Server->>Client: Send 'transcript' (candidate text)
    Server-->>Client: Send 'state_change' (processing)
    Server->>Agent: Query agent with history and transcript
    Agent-->>Server: Return textual AI response
    Server->>Client: Send 'ai_response' (interviewer text)
    Server-->>Client: Send 'state_change' (ai_speaking)
    Server->>TTS: Synthesize AI text response to audio
    TTS-->>Server: Return WAV voice bytes
    Server->>Client: Send 'ai_audio' voice bytes
    Note over Client: Client plays audio queue sequentially...
    Note over Client: Audio finishes playing...
    Server-->>Client: Send 'state_change' (listening)
```

---

## 🛠️ Key Engineering Implementations & Optimization Fixes

### 1. Token Refresh Mutex (Axios Interceptor Fix)
The backend enforces **Refresh Token Rotation (RTR)** to secure cookie-based refresh tokens. 
*   **The Issue**: Landing on pages like the `Report` dashboard triggers concurrent API calls. When a session expires, both requests simultaneously fire `POST /auth/refresh` with the same cookie. The first call rotates the cookie; the second call presents the old rotated cookie, causing a security violation that wipes all refresh tokens and logs the user out.
*   **The Solution**: An in-flight promise mutex locks duplicate refresh attempts in the Axios interceptor (`frontend/src/api/client.js`). All concurrent requests queue up, waiting for the first request's rotated access token, avoiding unintended logouts.

### 2. Fast/Text-Only Startup Option (`VOICE_ENABLED`)
*   **The Issue**: Local ML pipelines (Whisper STT & Coqui TTS) require substantial CPU memory and overhead, causing up to a 60-second delay during development startup, and massive synthesis freezes (2-3 minutes) on machines lacking GPUs.
*   **The Solution**: Toggle `VOICE_ENABLED=false` in the backend environment. This bypasses Whisper and Coqui initializations, completing startup in under **1 second** and switching the interview interface to text mode.

### 3. Voice Silence Detection (`useAudioCapture.js`)
*   Uses the Web Audio API (`AnalyserNode`) to compute RMS amplitude. When audio amplitude drops below `-50dB` for more than `1.8s` after active speaking, a `silence_detected` event is pushed to flush the speech chunk buffer.

---

## 📁 Repository Layout & Architecture

### 📂 Backend Structure (`backend/`)
```
backend/
├── agents/                  # LangGraph-based multi-agent orchestration
│   ├── dsa_agent.py         # DSA problem generator & evaluator
│   ├── hr_agent.py          # STAR Behavioral HR interviewer
│   ├── tech_agent.py        # Technical Systems architecture interviewer
│   ├── report_agent.py      # Final report markdown generator
│   └── orchestrator.py      # Main state machine manager
├── api/                     # API routers & WebSocket endpoints
│   ├── routes/              # Auth, Candidates, DSA, Reports, Sessions routers
│   └── websocket.py         # WebSocket audio handler & state events loop
├── core/                    # Core configuration and database engines
│   ├── communication_analyzer.py # Word-count & filler-words parser
│   ├── config.py            # Pydantic settings schema
│   ├── database.py          # SQLAlchemy async connection engine
│   ├── models.py            # DB schema definitions
│   └── security.py          # Hash passwords, JWT signers, RTR handlers
├── services/                # Integration microservices
│   ├── llm_service.py       # Groq & Gemini model client wrapper
│   ├── stt_service.py       # Whisper speech-to-text wrapper
│   ├── tts_service.py       # Coqui text-to-speech engine
│   └── faiss_service.py     # Vector store (FAISS) wrapper
└── main.py                  # FastAPI server entrypoint
```

### 📂 Frontend Structure (`frontend/`)
```
frontend/
├── src/
│   ├── api/                 # Axios clients and interceptors
│   ├── components/ui/       # Shared premium ui modules (Navbar, Button, Card, Badge)
│   ├── context/             # React Auth context provider
│   ├── hooks/               # useAudioCapture, useWebSocket custom react hooks
│   ├── pages/               # Landing, Upload, Lobby, DSARound, InterviewRoom, Report
│   └── store/               # Zustand state stores
```

---

## 🗄️ Database Schema Relational Design

```mermaid
erDiagram
    users ||--o{ refresh_tokens : has
    users ||--o{ candidates : screens
    candidates ||--o{ interview_sessions : starts
    interview_sessions ||--o{ round_transcripts : records
    
    users {
        uuid id PK
        string email UK
        string full_name
        string password_hash
        boolean is_active
        datetime last_login
    }

    refresh_tokens {
        integer id PK
        uuid user_id FK
        string refresh_token_hash UK
        string device_name
        string browser
        string ip_address
        boolean revoked
        datetime expires_at
    }
    
    candidates {
        uuid id PK
        uuid user_id FK
        string email UK
        string name
        string target_role
        string resume_path
        integer ats_score
        string status "enum: idle, screening, interviewing, completed"
        datetime created_at
    }
    
    interview_sessions {
        uuid id PK
        uuid candidate_id FK
        string status "enum: active, completed, cancelled"
        string current_round "enum: dsa, technical, hr"
        json round_scores "dsa, technical, and hr ratings"
        float overall_score
        string feedback_summary
        datetime started_at
        datetime ended_at
    }

    round_transcripts {
        integer id PK
        uuid session_id FK
        string round_name "enum: dsa, technical, hr"
        text transcript "JSON dialogue transcript"
        json ai_evaluation "detailed rubric matrices"
        float score
        datetime created_at
    }
```

---

## 🚀 Setup & Installation Guide

### Prerequisites
*   **Docker** (for PostgreSQL database service)
*   **Python 3.10+** (venv recommended)
*   **Node.js v18+** & **npm**
*   **FFmpeg** (required on system PATH for audio conversion)
    *   *Linux*: `sudo apt install ffmpeg`
    *   *macOS*: `brew install ffmpeg`

---

### Step 1: Configure Environment Variables
Create a `.env` file in the `backend/` directory:

```ini
# --- LLM Providers ---
GROQ_API_KEY=gsk_your_groq_api_key_here
LLM_PROVIDER=groq
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_FALLBACK_MODELS=llama-3.3-70b-versatile,qwen/qwen3-32b,llama3-8b-8192

# --- Database & Storage ---
# Postgres container port mapped to 5433 to avoid system clashes
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5433/interviewai
FAISS_INDEX_PATH=./faiss_store
UPLOAD_DIR=./uploads

# --- Models & Settings ---
WHISPER_MODEL=base
VOICE_ENABLED=false # Set to true to load local voice models
JWT_SECRET_KEY=generate_a_secure_jwt_hex_secret_here
```

---

### Step 2: Spin Up Infrastructure Services
Start Postgres Docker container:
```bash
docker compose up -d
```
*   **PostgreSQL** will run on port `5433`.

---

### Step 3: Run the Automated Startup Script
An automated developer tool is provided to install node modules, setup python virtual environments, run migrations, and launch both client and server nodes:

```bash
chmod +x start_dev.sh
./start_dev.sh
```

---

### Step 4: Verification & Endpoints
Once running, check the local setup:
*   **React Frontend Web**: [http://localhost:5173](http://localhost:5173)
*   **FastAPI API Docs**: [http://localhost:8002/docs](http://localhost:8002/docs)
*   **Backend Health Check**: [http://localhost:8002/health](http://localhost:8002/health)

To stop development processes:
```bash
./stop_dev.sh
```

---

### Running Automated Test Suites
Run the python test modules locally:
```bash
cd backend
PYTHONPATH=. venv/bin/pytest
```

---

## 🔒 Security & Secrets Warning
> [!WARNING]
> **Key Rotation Warning**: Ensure any active credentials (such as custom `GROQ_API_KEY`, `GEMINI_API_KEY`, or custom database links) are never committed to version control. Always include `backend/.env` in your global `.gitignore` patterns. Rotate any compromised environment secret immediately.
