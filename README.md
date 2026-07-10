# 🎙️ InterviewAI

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1.svg?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![ChromaDB](https://img.shields.io/badge/VectorStore-ChromaDB-336791.svg?style=flat-square&logo=sqlite&logoColor=white)](https://www.trychroma.com)
[![Whisper STT](https://img.shields.io/badge/SpeechToText-Whisper--Base-brightgreen.svg?style=flat-square&logo=openai&logoColor=white)](https://github.com/openai/whisper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

InterviewAI is an immersive, AI-powered mock interview preparation platform. It simulates realistic, multi-round technical interviews, assessing candidates on Algorithmic Coding (DSA), Systems Architecture & Design, and Behavioral HR qualifications using the STAR methodology. The platform features an advanced audio engine for real-time speech processing, voice synthesis, and interactive visualization.

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

The system is split into three primary layers:
1.  **Frontend Client (React SPA)**: Renders the user interfaces, records and visualizes microphone audio, and handles real-time bidirectional WebSocket communication.
2.  **FastAPI Application Server**: Exposes REST API endpoints for candidate profiles, session management, and report generation, while coordinating real-time WebSocket state machines, local Whisper Speech-to-Text (STT), and local Coqui Text-to-Speech (TTS) synthesis.
3.  **Multi-Agent Orchestration & Infrastructure Layer**: Employs distinct specialist LLM agents for each interview stage. Candidate resumes are processed via ChromaDB for semantic RAG-based context injection, and interview transcripts, scores, and status updates are persisted in PostgreSQL.

---

## 📁 Repository Layout & Code Architecture

### 1. Backend Core (`backend/`)
*   `main.py`: Entrypoint configuring CORSMiddleware, global app states, routers, and standard exception handlers.
*   `api/`: Defines communication layers.
    *   `websocket.py`: Connection lifecycle, message routing (`start_round`, `candidate_text`, `audio_chunk`, `end_round`), and session state transitions.
    *   `routes/`: Modular REST routers for `auth` (JWT lifecycle), `candidates` (resume parsers), `interviews` (session control), `dsa` (problem loading & evaluation), and `reports` (grades retrieval).
*   `agents/`: Intelligent multi-agent backend.
    *   `orchestrator.py`: Tracks rounds queue (`dsa`, `technical`, `hr`), restores session state from database checkpoints, and calculates final ratings.
    *   `dsa_agent.py`: Generates custom DSA problems and evaluates approaches, correctness, and complexity.
    *   `tech_agent.py`: Drives technical system design rounds using resume profile keywords.
    *   `hr_agent.py`: Formulates situational STAR questions assessing cultural fit.
    *   `report_agent.py`: Synthesizes session transcripts into markdown reports.
*   `services/`:
    *   `llm_service.py`: LLM provider client supporting Groq/Gemini models with fallback logic.
    *   `stt_service.py`: Runs local OpenAI Whisper for offline, high-speed transcription.
    *   `tts_service.py`: Voice synthesis using local Coqui TTS models.
    *   `chroma_service.py`: Manages ChromaDB document vector embeddings.
*   `core/`: Core settings config, DB setup (`database.py`), SQLAlchemy models (`models.py`), Pydantic schemas (`schemas.py`), and real-time verbal pacing analysis (`communication_analyzer.py`).

### 2. Frontend Client (`frontend/`)
*   `src/pages/`:
    *   `Landing.jsx`: Premium landing page featuring dynamic glassmorphism and anchor scroll routes.
    *   `Upload.jsx`: Secure candidate resume uploader.
    *   `Lobby.jsx`: Interactive interview lobby and audio diagnostic checks.
    *   `DSARound.jsx`: Code editor panel, hint console, and execution panel.
    *   `InterviewRoom.jsx`: Fully animated, speech-focused mock room.
    *   `Report.jsx`: Performance grading dashboard with animated scores.
*   `src/hooks/`:
    *   `useAudioCapture.js`: Captures raw mic input, calculates decibel volume, and manages silence detection timers.
    *   `useWebSocket.js`: Manages socket channels, audio playback queues, and API request interceptors.
*   `src/context/`:
    *   `AuthContext.jsx`: Provides JWT token refresh hooks and routes protection.
*   `src/store/`:
    *   `interviewStore.js`: Zustand store for state management.

---

## 🗄️ Database Architecture

InterviewAI utilizes a PostgreSQL database. Below is the relational entity model:

```mermaid
erDiagram
    candidates ||--o{ interview_sessions : starts
    interview_sessions ||--o{ round_transcripts : records
    
    candidates {
        uuid id PK
        string email UK
        string name
        string target_role
        string resume_path
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
        text transcript "JSON list of dialogues or code submissions"
        json ai_evaluation "rubrics scoring data"
        float score
        datetime created_at
    }
```

---

## 🎙️ Real-time Audio Streaming Pipeline

Bidirectional voice interaction operates over standard WebSockets (`/ws/interview/{session_id}`):

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

1.  **MediaRecorder & Streaming**: The frontend captures microphone streams, segmenting audio into `400ms` Base64 encoded Opus chunks sent via WebSockets.
2.  **Silence & Turn Detection**: The client analyzer calculates decibel ranges. If silence lasts for `1.8 seconds` after speaking, the client fires a `silence_detected` event.
3.  **FFmpeg Transcoding**: The backend compiles incoming audio segments. On flush/silence signals, the combined Opus buffer is converted using `ffmpeg` into a single-channel `16kHz WAV` audio format.
4.  **STT & Agent Prompting**: Local Whisper transcribes the WAV file. The result is pushed to the active LLM Agent (DSA, Technical, or HR), which returns an interactive response.
5.  **TTS Voice Playback**: Coqui TTS generates natural WAV audio. The client decodes and queues these audio packets, playing them sequentially to ensure smooth, non-overlapping voice responses.

---

## 🛠️ Key Engineering Enhancements & Reliability Fixes

### 1. Audio Capture Stability (`useAudioCapture.js`)
*   **Persistent Stream Track Management**: Keeps the stream alive throughout the session, toggling track states (`enabled = false/true`) on muting, reducing browser permission delays.
*   **MediaRecorder Resiliency**: Automatic recovery loops restart the recorder if `MediaRecorder` runs into internal browser thread crashes or silent errors.

### 2. Request Interception & Anti-Race Condition (`useWebSocket.js`)
*   **Axios Deduplication Interceptor**: A global API request interceptor blocks duplicate, concurrent form submissions to `/dsa/submit` during the 2.5-second UI transition window.
*   **Orchestrator Safeguard**: Prevents corrupting the backend state machine, ensuring candidates advance correctly through all rounds (**DSA** $\rightarrow$ **Technical** $\rightarrow$ **HR** $\rightarrow$ **Report**) without skipping stages.

### 3. Typewriter and TTS Audio Synchronization (`InterviewRoom.jsx`)
*   **Synced Visual Display**: Animates interviewer questions in a typewriter format synced with the synthesized TTS audio playing, using characters-per-second ratios to adjust text flow dynamically.

---

## 🚀 Getting Started

### 1. Infrastructure Setup
Spin up PostgreSQL and ChromaDB containers:
```bash
docker compose up -d
```

### 2. Environment Configuration
Create a `backend/.env` file:
```ini
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5433/interviewai
GROQ_API_KEY=gsk_your_groq_api_key_here
GEMINI_API_KEY=AIzaSy_your_gemini_api_key_here
```

### 3. Dev Launch (Automated)
Run the dev tool to setup dependencies, database tables, and run server loops:
```bash
./start_dev.sh
```

### 4. Running Tests
Run the test suites:
```bash
cd backend
PYTHONPATH=. venv/bin/pytest
```
