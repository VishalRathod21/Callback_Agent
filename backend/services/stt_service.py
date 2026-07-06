import asyncio
import logging
import os
import shutil
import subprocess
import tempfile

import whisper

logger = logging.getLogger(__name__)


def _check_ffmpeg():
    if not shutil.which("ffmpeg"):
        raise RuntimeError(
            "ffmpeg is required. Run: sudo apt install ffmpeg\n"
            "Whisper cannot process browser audio without ffmpeg."
        )


class WhisperSTT:
    def __init__(self, model_size: str = "base"):
        _check_ffmpeg()
        logger.info(f"Loading Whisper model '{model_size}' on CPU...")
        self.model = whisper.load_model(model_size, device="cpu")
        logger.info(f"Whisper '{model_size}' loaded successfully")

    async def transcribe_bytes(self, audio_bytes: bytes) -> dict:
        """
        Transcribe raw audio bytes (any format browser sends — WebM, Opus, OGG).
        Converts to 16kHz mono WAV using ffmpeg before passing to Whisper.
        """
        if not audio_bytes or len(audio_bytes) < 100:
            return {"text": "", "language": "en"}

        # Write raw bytes to temp file
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as raw_f:
            raw_f.write(audio_bytes)
            raw_path = raw_f.name

        wav_path = raw_path + ".wav"

        try:
            # Convert browser audio → 16kHz mono WAV (Whisper requirement)
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y",
                "-i", raw_path,
                "-ar", "16000",   # 16kHz sample rate
                "-ac", "1",       # mono channel
                "-f", "wav",
                wav_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode != 0:
                err_msg = stderr.decode('utf-8', errors='ignore') if stderr else 'No stderr output'
                logger.error(f"ffmpeg conversion failed with return code {proc.returncode}. stderr: {err_msg}")
                return {"text": "", "language": "en"}

            # Check output file has actual content
            if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
                logger.warning("Converted WAV file is too small — likely silence")
                return {"text": "", "language": "en"}

            # Run Whisper transcription in a thread (CPU-bound)
            result = await asyncio.to_thread(
                self.model.transcribe,
                wav_path,
                fp16=False,         # CPU does not support fp16
                language=None,      # auto-detect language
                task="transcribe",
            )

            text = result.get("text", "").strip()
            lang = result.get("language", "en")
            logger.info(f"STT transcribed: '{text}' (lang: {lang})")
            return {"text": text, "language": lang}

        except Exception as e:
            logger.error(f"STT error: {e}")
            return {"text": "", "language": "en"}

        finally:
            for path in [raw_path, wav_path]:
                try:
                    if os.path.exists(path):
                        os.unlink(path)
                except Exception:
                    pass

    async def transcribe_file(self, file_path: str) -> dict:
        """Transcribe from a file path directly."""
        with open(file_path, "rb") as f:
            return await self.transcribe_bytes(f.read())
