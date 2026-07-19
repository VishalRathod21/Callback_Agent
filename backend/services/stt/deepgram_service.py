import os
import httpx
import logging
from core.config import settings

logger = logging.getLogger(__name__)

class DeepgramSTT:
    def __init__(self):
        # Read API key from environment variable DEEPGRAM_API_KEY
        self.api_key = os.environ.get("DEEPGRAM_API_KEY")
        if not self.api_key:
            self.api_key = getattr(settings, "DEEPGRAM_API_KEY", "")
            
        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY is not set.")

    async def transcribe(self, audio_bytes: bytes) -> str:
        """
        Transcribe audio bytes using Deepgram's REST API.
        Returns the transcription text.
        """
        if not audio_bytes:
            return ""

        if not self.api_key:
            logger.error("DEEPGRAM_API_KEY is not configured. Cannot transcribe.")
            return ""

        url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true"
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/octet-stream"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, headers=headers, content=audio_bytes, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                
                # Parse response to extract the transcript text
                # Deepgram JSON structure:
                # data["results"]["channels"][0]["alternatives"][0]["transcript"]
                channels = data.get("results", {}).get("channels", [])
                if channels:
                    alternatives = channels[0].get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        logger.info(f"Deepgram STT transcription: {transcript}")
                        return transcript
                
                return ""
            except Exception as e:
                logger.error(f"Deepgram STT error: {e}")
                return ""
