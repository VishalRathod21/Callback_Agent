import asyncio
import logging
import os
import shutil
import tempfile

logger = logging.getLogger(__name__)


class WhisperSTT:
    def __init__(self, model_size: str = "base"):
        if not shutil.which("ffmpeg"):
            raise RuntimeError(
                "ffmpeg is required. Run: sudo apt install ffmpeg"
            )
        import whisper
        logger.info(f"Loading Whisper '{model_size}' on CPU...")
        self.model = whisper.load_model(model_size, device="cpu")
        logger.info("Whisper loaded OK")

    async def transcribe_bytes(self, audio_bytes: bytes) -> dict:
        if not audio_bytes or len(audio_bytes) < 200:
            return {"text": "", "language": "en"}

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_bytes)
            raw_path = f.name

        wav_path = raw_path + ".wav"
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-i", raw_path,
                "-ar", "16000", "-ac", "1", "-f", "wav", wav_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()

            if proc.returncode != 0 or not os.path.exists(wav_path):
                return {"text": "", "language": "en"}

            if os.path.getsize(wav_path) < 1000:
                return {"text": "", "language": "en"}

            result = await asyncio.to_thread(
                self.model.transcribe, wav_path,
                fp16=False, language=None, task="transcribe"
            )
            text = result.get("text", "").strip()
            logger.info(f"STT: '{text}'")
            return {"text": text, "language": result.get("language", "en")}

        except Exception as e:
            logger.error(f"STT error: {e}")
            return {"text": "", "language": "en"}
        finally:
            for p in [raw_path, wav_path]:
                try:
                    if os.path.exists(p): os.unlink(p)
                except: pass
