import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.stt.deepgram_service import DeepgramSTT
from services.tts.elevenlabs_service import ElevenLabsTTS
from services.embeddings.gemini_embeddings import GeminiEmbeddingService

@pytest.mark.asyncio
async def test_deepgram_stt_success():
    service = DeepgramSTT()
    service.api_key = "test_key"
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "results": {
            "channels": [
                {
                    "alternatives": [
                        {"transcript": "hello world"}
                    ]
                }
            ]
        }
    }
    
    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        result = await service.transcribe(b"dummy_audio_bytes")
        assert result == "hello world"
        mock_post.assert_called_once()

@pytest.mark.asyncio
async def test_deepgram_stt_empty_or_no_key():
    service = DeepgramSTT()
    service.api_key = ""
    
    result = await service.transcribe(b"dummy_audio_bytes")
    assert result == ""
    
    service.api_key = "test_key"
    result = await service.transcribe(b"")
    assert result == ""

@pytest.mark.asyncio
async def test_elevenlabs_tts_success():
    service = ElevenLabsTTS()
    service.api_key = "test_key"
    service.voice_id = "test_voice"
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"mp3_audio_data"
    
    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        result = await service.synthesize("hello text")
        assert result == b"mp3_audio_data"
        mock_post.assert_called_once()

@pytest.mark.asyncio
async def test_elevenlabs_tts_empty_or_no_key():
    service = ElevenLabsTTS()
    service.api_key = ""
    
    with patch.object(service, "_synthesize_google_fallback", new_callable=AsyncMock) as mock_fallback:
        mock_fallback.return_value = b""
        result = await service.synthesize("hello text")
        assert result == b""
        mock_fallback.assert_called_once_with("hello text")
    
    service.api_key = "test_key"
    result = await service.synthesize("")
    assert result == b""

@pytest.mark.asyncio
async def test_gemini_embeddings_success():
    with patch("google.genai.Client") as mock_client_class:
        mock_client = mock_client_class.return_value
        
        mock_response = MagicMock()
        mock_embedding = MagicMock()
        mock_embedding.values = [0.1, 0.2, 0.3]
        mock_response.embeddings = [mock_embedding]
        
        mock_client.models.embed_content.return_value = mock_response
        
        service = GeminiEmbeddingService()
        service.api_key = "test_key"
        
        # Test single text embedding
        result = await service.embed("hello text")
        assert result == [0.1, 0.2, 0.3]
        mock_client.models.embed_content.assert_called_with(
            model="text-embedding-004",
            contents="hello text"
        )
        
        # Test batch embedding
        mock_embedding2 = MagicMock()
        mock_embedding2.values = [0.4, 0.5, 0.6]
        mock_response.embeddings = [mock_embedding, mock_embedding2]
        
        result_batch = await service.embed_batch(["text1", "text2"])
        assert result_batch == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        mock_client.models.embed_content.assert_called_with(
            model="text-embedding-004",
            contents=["text1", "text2"]
        )
