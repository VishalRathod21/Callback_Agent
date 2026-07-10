import asyncio
import logging
import os
import tempfile

os.environ["COQUI_TOS_AGREED"] = "1"

# Compatibility patch for Coqui TTS / transformers import error
try:
    import transformers.pytorch_utils
    if not hasattr(transformers.pytorch_utils, "isin_mps_friendly"):
        transformers.pytorch_utils.isin_mps_friendly = lambda *args, **kwargs: False
except ImportError:
    pass

logger = logging.getLogger(__name__)


class TTSService:
    def __init__(self):
        logger.info("Loading TTS (tacotron2-DDC, CPU fast)...")
        from TTS.api import TTS as CoquiTTS
        self.tts = CoquiTTS(
            model_name="tts_models/en/ljspeech/tacotron2-DDC",
            progress_bar=False,
            gpu=False,
        )
        logger.info("TTS loaded OK")

    async def synthesize(self, text: str) -> bytes:
        if not text or not text.strip():
            return b""

        # Truncate long text — TTS takes longer on CPU for long sentences
        clean = text.strip()
        if len(clean) > 300:
            cutoff = clean[:300].rfind(".")
            clean = clean[:cutoff + 1] if cutoff > 150 else clean[:300]

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            await asyncio.to_thread(
                self.tts.tts_to_file, text=clean, file_path=tmp
            )
            with open(tmp, "rb") as f:
                data = f.read()
            logger.info(f"TTS: {len(data)} bytes for '{clean[:50]}'")
            return data
        except Exception as e:
            logger.error(f"TTS error: {e}")
            return b""
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
