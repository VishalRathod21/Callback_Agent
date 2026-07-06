"""LLM Abstraction layer supporting Groq and other providers."""

import abc
import asyncio
import json
import logging
import time
from typing import List, Dict, Any, Optional

from core.config import settings

logger = logging.getLogger(__name__)


class BaseLLMProvider(abc.ABC):
    """Abstract base class for all LLM providers."""

    @abc.abstractmethod
    async def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        """Generate text from a prompt. Returns tuple of (response_text, model_used)."""
        pass

    @abc.abstractmethod
    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        """Generate JSON text from a prompt. Returns tuple of (response_text, model_used)."""
        pass

    @abc.abstractmethod
    async def chat(self, messages: List[Dict[str, Any]], system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        """Run a chat completion. Returns tuple of (response_text, model_used)."""
        pass


async def retry_with_backoff(coro_func, *args, max_retries: int = 3, initial_delay: float = 1.0, backoff_factor: float = 2.0, **kwargs):
    """Retries an async function call with exponential backoff on exceptions."""
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            return await asyncio.wait_for(coro_func(*args, **kwargs), timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning("Request timed out (attempt %d/%d)", attempt + 1, max_retries)
            if attempt == max_retries - 1:
                raise
        except Exception as e:
            logger.warning("Request failed with error: %s (attempt %d/%d)", e, attempt + 1, max_retries)
            if attempt == max_retries - 1:
                raise
        await asyncio.sleep(delay)
        delay *= backoff_factor


class GroqProvider(BaseLLMProvider):
    """Groq API provider implementation."""

    def __init__(self, api_key: str, default_model: str, fallback_models: List[str]):
        self.api_key = api_key
        self.default_model = default_model
        self.fallback_models = fallback_models
        from groq import AsyncGroq
        self.client = AsyncGroq(api_key=api_key)

    async def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        async def _call(**kwargs):
            model = kwargs.pop('model')
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            call_params = {
                "model": model,
                "messages": messages,
            }
            if temperature is not None:
                call_params["temperature"] = temperature
            
            response = await self.client.chat.completions.create(**call_params)
            return response.choices[0].message.content

        return await self._execute_with_fallback(_call)

    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        async def _call(**kwargs):
            model = kwargs.pop('model')
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            call_params = {
                "model": model,
                "messages": messages,
                "response_format": {"type": "json_object"}
            }
            if temperature is not None:
                call_params["temperature"] = temperature
            
            response = await self.client.chat.completions.create(**call_params)
            return response.choices[0].message.content

        return await self._execute_with_fallback(_call)

    async def chat(self, messages: List[Dict[str, Any]], system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        async def _call(**kwargs):
            model = kwargs.pop('model')
            formatted_messages = []
            if system_instruction:
                formatted_messages.append({"role": "system", "content": system_instruction})
            
            for m in messages:
                role = m.get("role")
                if role == "model":
                    role = "assistant"
                content = m.get("content")
                if not content and m.get("parts"):
                    content = m["parts"][0]
                formatted_messages.append({"role": role, "content": content})

            call_params = {
                "model": model,
                "messages": formatted_messages,
            }
            if temperature is not None:
                call_params["temperature"] = temperature

            response = await self.client.chat.completions.create(**call_params)
            return response.choices[0].message.content

        return await self._execute_with_fallback(_call)

    async def _execute_with_fallback(self, func, *args, **kwargs):
        models_to_try = [self.default_model]
        for m in self.fallback_models:
            if m not in models_to_try:
                models_to_try.append(m)

        last_exception = None
        for model in models_to_try:
            logger.info("Attempting Groq request using model: %s", model)
            kwargs['model'] = model
            try:
                res = await retry_with_backoff(func, *args, **kwargs)
                return res, model
            except Exception as e:
                logger.warning("Model %s failed: %s. Trying next model if available.", model, e)
                last_exception = e
        if last_exception:
            raise last_exception
        raise RuntimeError("No models succeeded")


class GeminiProvider(BaseLLMProvider):
    """Gemini API provider implementation for backwards compatibility."""

    def __init__(self, api_key: str, default_model: str):
        self.api_key = api_key
        self.default_model = default_model
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.genai = genai

    async def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        model = self.genai.GenerativeModel(
            model_name=self.default_model,
            system_instruction=system_instruction
        )
        gen_config = {}
        if temperature is not None:
            gen_config["temperature"] = temperature
        response = await model.generate_content_async(prompt, generation_config=gen_config)
        return response.text, self.default_model

    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        return await self.generate(prompt, system_instruction, temperature)

    async def chat(self, messages: List[Dict[str, Any]], system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> tuple[str, str]:
        model = self.genai.GenerativeModel(
            model_name=self.default_model,
            system_instruction=system_instruction
        )
        gen_config = {}
        if temperature is not None:
            gen_config["temperature"] = temperature
            
        gemini_messages = []
        for m in messages:
            role = m.get("role")
            if role == "assistant":
                role = "model"
            content = m.get("content")
            if not content and m.get("parts"):
                content = m["parts"][0]
            gemini_messages.append({"role": role, "parts": [content]})
            
        response = await model.generate_content_async(gemini_messages, generation_config=gen_config)
        return response.text, self.default_model


def get_provider() -> BaseLLMProvider:
    """Instantiate the configured LLM provider."""
    provider_name = settings.LLM_PROVIDER.lower()
    if provider_name == "groq":
        fallback_list = [m.strip() for m in settings.GROQ_FALLBACK_MODELS.split(",")]
        return GroqProvider(
            api_key=settings.GROQ_API_KEY,
            default_model=settings.GROQ_MODEL,
            fallback_models=fallback_list
        )
    elif provider_name == "gemini":
        return GeminiProvider(
            api_key=settings.GEMINI_API_KEY,
            default_model=settings.GEMINI_MODEL
        )
    else:
        # Fallback to Groq
        fallback_list = [m.strip() for m in settings.GROQ_FALLBACK_MODELS.split(",")]
        return GroqProvider(
            api_key=settings.GROQ_API_KEY,
            default_model=settings.GROQ_MODEL,
            fallback_models=fallback_list
        )


class LLMService:
    """LLM abstraction service."""

    def __init__(self, provider: Optional[BaseLLMProvider] = None):
        self.provider = provider or get_provider()

    async def generate(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> str:
        provider_name = self.provider.__class__.__name__
        logger.info("LLM Request start - Provider: %s", provider_name)
        start_time = time.monotonic()
        try:
            res, model_used = await self.provider.generate(prompt, system_instruction, temperature)
            latency = time.monotonic() - start_time
            logger.info("LLM Request end - Provider: %s, Model: %s, Latency: %.2f seconds", provider_name, model_used, latency)
            return res
        except Exception as e:
            logger.error("LLM generate failed: %s", e)
            raise

    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> dict:
        provider_name = self.provider.__class__.__name__
        last_exc = None
        for attempt in range(3):
            logger.info("LLM JSON Request start - Provider: %s (attempt %d/3)", provider_name, attempt + 1)
            start_time = time.monotonic()
            try:
                res, model_used = await self.provider.generate_json(prompt, system_instruction, temperature)
                latency = time.monotonic() - start_time
                logger.info("LLM JSON Request end - Provider: %s, Model: %s, Latency: %.2f seconds", provider_name, model_used, latency)
                parsed = self._try_parse(res)
                if parsed is not None:
                    return parsed
                logger.warning("JSON parsing failed for response: %s", res)
            except Exception as e:
                logger.error("LLM generate_json failed on attempt %d: %s", attempt + 1, e)
                last_exc = e
            
            await asyncio.sleep(0.5)

        logger.error("All JSON generate attempts failed.")
        if last_exc:
            raise last_exc
        raise ValueError("Failed to obtain valid JSON from LLM")

    async def chat(self, messages: List[Dict[str, Any]], system_instruction: Optional[str] = None, temperature: Optional[float] = None) -> str:
        provider_name = self.provider.__class__.__name__
        logger.info("LLM Chat Request start - Provider: %s", provider_name)
        start_time = time.monotonic()
        try:
            res, model_used = await self.provider.chat(messages, system_instruction, temperature)
            latency = time.monotonic() - start_time
            logger.info("LLM Chat Request end - Provider: %s, Model: %s, Latency: %.2f seconds", provider_name, model_used, latency)
            return res
        except Exception as e:
            logger.error("LLM chat failed: %s", e)
            raise

    @staticmethod
    def _try_parse(text: str) -> dict | None:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            try:
                first_nl = cleaned.index("\n")
                cleaned = cleaned[first_nl + 1 :]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3].strip()
            except ValueError:
                pass
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
        try:
            data = json.loads(cleaned)
            return data if isinstance(data, dict) else None
        except Exception:
            return None


# Global service instance
llm_service = LLMService()
