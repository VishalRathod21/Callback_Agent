import os
import httpx
import logging
import urllib.parse
from core.config import settings

logger = logging.getLogger(__name__)

class ElevenLabsTTS:
    def __init__(self):
        # Read API key from environment variable ELEVENLABS_API_KEY
        self.api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not self.api_key:
            self.api_key = getattr(settings, "ELEVENLABS_API_KEY", "")
            
        # Read voice ID from environment variable or settings, fallback to default
        self.voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or getattr(settings, "ELEVENLABS_VOICE_ID", "") or "21m00Tcm4TlvDq8ikWAM"
            
        if not self.api_key:
            logger.warning("ELEVENLABS_API_KEY is not set.")

    async def _synthesize_google_fallback(self, text: str) -> bytes:
        """
        Fallback TTS using free Google Translate service, split into chunks < 200 chars.
        """
        logger.info("ElevenLabs unavailable or failed. Using Google Translate TTS fallback...")
        words = text.split()
        chunks = []
        current_chunk = []
        current_len = 0
        for w in words:
            if current_len + len(w) + 1 > 180:
                chunks.append(" ".join(current_chunk))
                current_chunk = [w]
                current_len = len(w)
            else:
                current_chunk.append(w)
                current_len += len(w) + 1
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        audio_data = b""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient() as client:
            for chunk in chunks:
                if not chunk.strip():
                    continue
                encoded = urllib.parse.quote(chunk)
                url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q={encoded}"
                try:
                    res = await client.get(url, headers=headers, timeout=12.0)
                    if res.status_code == 200:
                        audio_data += res.content
                    else:
                        logger.error(f"Google TTS fallback failed with status {res.status_code}: {res.text}")
                except Exception as e:
                    logger.error(f"Google TTS fallback request error: {e}")
                    
        return audio_data

    async def synthesize(self, text: str) -> bytes:
        """
        Synthesize text to speech using ElevenLabs streaming API.
        Returns MP3 bytes. Falls back to Google TTS if ElevenLabs fails.
        """
        if not text or not text.strip():
            return b""

        if not self.api_key:
            logger.warning("ELEVENLABS_API_KEY is not configured. Falling back to Google TTS.")
            return await self._synthesize_google_fallback(text)

        # Use ElevenLabs streaming API
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream"
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "accept": "audio/mpeg"
        }
        
        # Use eleven_multilingual_v2 as eleven_monolingual_v1 is deprecated
        payload = {
            "text": text.strip(),
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, headers=headers, json=payload, timeout=60.0)
                if response.status_code != 200:
                    logger.warning(f"ElevenLabs TTS failed ({response.status_code}). Triggering fallback.")
                    return await self._synthesize_google_fallback(text)
                audio_bytes = response.content
                logger.info(f"ElevenLabs TTS: Synthesized {len(audio_bytes)} bytes")
                return audio_bytes
            except Exception as e:
                logger.warning(f"ElevenLabs TTS request exception: {e}. Triggering fallback.")
                return await self._synthesize_google_fallback(text)
