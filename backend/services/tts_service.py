import asyncio
import logging
import os
import tempfile
import torch
import transformers.pytorch_utils as _pu

# Patch for Coqui TTS compatibility with newer transformers packages
if not hasattr(_pu, "isin_mps_friendly"):
    _pu.isin_mps_friendly = torch.isin  # type: ignore[attr-defined]

os.environ["COQUI_TOS_AGREED"] = "1"

logger = logging.getLogger(__name__)


class TTSService:
    def __init__(self):
        logger.info("Loading TTS model (tacotron2-DDC, CPU-optimized)...")
        # Lazy import to keep startup fast
        from TTS.api import TTS as CoquiTTS
        # tacotron2-DDC: ~50MB, generates in 1-3s on CPU
        # Much faster than xtts_v2 (~2GB, 15-30s on CPU)
        self.tts = CoquiTTS(
            model_name="tts_models/en/ljspeech/tacotron2-DDC",
            progress_bar=False,
            gpu=False,
        )
        logger.info("TTS model loaded successfully")

    async def synthesize(self, text: str) -> bytes:
        """
        Convert text to WAV audio bytes.
        Returns empty bytes on failure (caller handles gracefully).
        """
        if not text or not text.strip():
            return b""

        # Clean text — TTS handles plain sentences best
        clean = text.strip()
        # Truncate very long responses to prevent very long waits on CPU
        if len(clean) > 400:
            # Cut at last sentence boundary before 400 chars
            cutoff = clean[:400].rfind(".")
            if cutoff > 200:
                clean = clean[:cutoff + 1]
            else:
                clean = clean[:400] + "..."

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name

        try:
            # Run in thread — TTS is CPU-bound synchronous
            await asyncio.to_thread(
                self.tts.tts_to_file,
                text=clean,
                file_path=tmp_path,
            )

            with open(tmp_path, "rb") as f:
                audio_bytes = f.read()

            logger.info(
                f"TTS synthesized {len(audio_bytes)} bytes "
                f"for: '{clean[:60]}...'"
            )
            return audio_bytes

        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            return b""

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
