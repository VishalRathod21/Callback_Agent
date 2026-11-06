"""LLM abstraction layer supporting Groq and Gemini.

All agents talk to ``llm_service`` (a module-level ``LLMService``).  When no
provider is configured the service is *unavailable*: every call raises
``LLMUnavailableError`` quickly so callers can degrade honestly (heuristic
scoring flagged as such, fallback question banks, ...) instead of hanging on
network retries.
"""

from __future__ import annotations

import abc
import asyncio
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from core.config import settings

logger = logging.getLogger(__name__)


class LLMUnavailableError(RuntimeError):
    """Raised when no LLM provider is configured or reachable."""


class BaseLLMProvider(abc.ABC):
    name = "base"

    @abc.abstractmethod
    async def generate(self, prompt: str, system_instruction: Optional[str] = None,
                       temperature: Optional[float] = None) -> tuple[str, str]: ...

    @abc.abstractmethod
    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None,
                            temperature: Optional[float] = None) -> tuple[str, str]: ...

    @abc.abstractmethod
    async def chat(self, messages: List[Dict[str, Any]], system_instruction: Optional[str] = None,
                   temperature: Optional[float] = None) -> tuple[str, str]: ...


async def retry_with_backoff(coro_func, *args, max_retries: int = 3, initial_delay: float = 1.0,
                             backoff_factor: float = 2.0, **kwargs):
    """Retry an async call with exponential backoff and a per-call timeout."""
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            return await asyncio.wait_for(coro_func(*args, **kwargs), timeout=settings.LLM_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            logger.warning("LLM request timed out (attempt %d/%d)", attempt + 1, max_retries)
            if attempt == max_retries - 1:
                raise
        except Exception as e:  # noqa: BLE001
            # Do not retry on hard client errors (bad key, bad request)
            status = getattr(e, "status_code", None)
            if status in (400, 401, 403, 404, 422):
                raise
            logger.warning("LLM request failed: %s (attempt %d/%d)", e, attempt + 1, max_retries)
            if attempt == max_retries - 1:
                raise
        await asyncio.sleep(delay)
        delay *= backoff_factor


class GroqProvider(BaseLLMProvider):
    name = "groq"

    def __init__(self, api_key: str, default_model: str, fallback_models: List[str]):
        from groq import AsyncGroq

        self.default_model = default_model
        self.fallback_models = fallback_models
        self.client = AsyncGroq(api_key=api_key)

    async def _completion(self, model: str, messages: list, temperature: Optional[float], json_mode: bool) -> str:
        params: dict = {"model": model, "messages": messages}
        if temperature is not None:
            params["temperature"] = temperature
        if json_mode:
            params["response_format"] = {"type": "json_object"}
        response = await self.client.chat.completions.create(**params)
        return response.choices[0].message.content

    def _messages(self, prompt: str, system_instruction: Optional[str]) -> list:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        return messages

    async def generate(self, prompt, system_instruction=None, temperature=None):
        return await self._execute_with_fallback(self._messages(prompt, system_instruction), temperature, False)

    async def generate_json(self, prompt, system_instruction=None, temperature=None):
        return await self._execute_with_fallback(self._messages(prompt, system_instruction), temperature, True)

    async def chat(self, messages, system_instruction=None, temperature=None):
        formatted = []
        if system_instruction:
            formatted.append({"role": "system", "content": system_instruction})
        for m in messages:
            role = "assistant" if m.get("role") == "model" else m.get("role", "user")
            content = m.get("content") or (m.get("parts") or [""])[0]
            formatted.append({"role": role, "content": content})
        return await self._execute_with_fallback(formatted, temperature, False)

    async def _execute_with_fallback(self, messages: list, temperature: Optional[float], json_mode: bool):
        models_to_try = [self.default_model] + [m for m in self.fallback_models if m != self.default_model]
        last_exception: Exception | None = None
        for model in models_to_try:
            try:
                res = await retry_with_backoff(self._completion, model, messages, temperature, json_mode)
                return res, model
            except Exception as e:  # noqa: BLE001
                logger.warning("Groq model %s failed: %s", model, e)
                last_exception = e
        raise last_exception or RuntimeError("No Groq model succeeded")


class GeminiProvider(BaseLLMProvider):
    """Gemini provider using the ``google-genai`` SDK."""

    name = "gemini"

    def __init__(self, api_key: str, default_model: str):
        from google import genai

        self.default_model = default_model
        self.client = genai.Client(api_key=api_key)

    async def _call(self, contents, system_instruction, temperature, json_mode) -> str:
        from google.genai import types

        config_kwargs: dict = {}
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        if temperature is not None:
            config_kwargs["temperature"] = temperature
        if json_mode:
            config_kwargs["response_mime_type"] = "application/json"
        config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

        def _run():
            resp = self.client.models.generate_content(model=self.default_model, contents=contents, config=config)
            return resp.text or ""

        return await retry_with_backoff(asyncio.to_thread, _run)

    async def generate(self, prompt, system_instruction=None, temperature=None):
        return await self._call(prompt, system_instruction, temperature, False), self.default_model

    async def generate_json(self, prompt, system_instruction=None, temperature=None):
        return await self._call(prompt, system_instruction, temperature, True), self.default_model

    async def chat(self, messages, system_instruction=None, temperature=None):
        from google.genai import types

        contents = []
        for m in messages:
            role = "model" if m.get("role") in ("assistant", "model") else "user"
            text = m.get("content") or (m.get("parts") or [""])[0]
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=text)]))
        return await self._call(contents, system_instruction, temperature, False), self.default_model


class UnavailableProvider(BaseLLMProvider):
    """Provider used when nothing is configured — fails fast."""

    name = "none"

    def __init__(self, reason: str):
        self.reason = reason

    async def generate(self, *_, **__):
        raise LLMUnavailableError(self.reason)

    async def generate_json(self, *_, **__):
        raise LLMUnavailableError(self.reason)

    async def chat(self, *_, **__):
        raise LLMUnavailableError(self.reason)


def get_provider() -> BaseLLMProvider:
    provider_name = settings.LLM_PROVIDER.lower()
    try:
        if provider_name == "gemini":
            if not settings.llm_configured:
                return UnavailableProvider("GEMINI_API_KEY is not configured.")
            return GeminiProvider(api_key=settings.GEMINI_API_KEY, default_model=settings.GEMINI_MODEL)
        if provider_name == "groq":
            if not settings.llm_configured:
                return UnavailableProvider("GROQ_API_KEY is not configured.")
            fallback_list = [m.strip() for m in settings.GROQ_FALLBACK_MODELS.split(",") if m.strip()]
            return GroqProvider(settings.GROQ_API_KEY, settings.GROQ_MODEL, fallback_list)
        return UnavailableProvider(f"LLM_PROVIDER '{provider_name}' is disabled.")
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to initialise LLM provider '%s': %s", provider_name, exc)
        return UnavailableProvider(str(exc))


class LLMService:
    """Thin façade with latency logging, JSON repair and availability flag."""

    def __init__(self, provider: Optional[BaseLLMProvider] = None):
        self.provider = provider or get_provider()
        self.last_latency_s: float | None = None
        self.call_count = 0

    @property
    def available(self) -> bool:
        return not isinstance(self.provider, UnavailableProvider)

    @property
    def provider_name(self) -> str:
        return getattr(self.provider, "name", self.provider.__class__.__name__)

    async def _timed(self, label: str, coro):
        start = time.monotonic()
        try:
            res, model_used = await coro
        except LLMUnavailableError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.error("LLM %s failed: %s", label, e)
            raise
        self.last_latency_s = time.monotonic() - start
        self.call_count += 1
        logger.info("LLM %s ok — provider=%s model=%s latency=%.2fs", label, self.provider_name, model_used,
                    self.last_latency_s)
        return res

    async def generate(self, prompt: str, system_instruction: Optional[str] = None,
                       temperature: Optional[float] = None) -> str:
        return await self._timed("generate", self.provider.generate(prompt, system_instruction, temperature))

    async def chat(self, messages: List[Dict[str, Any]], system_instruction: Optional[str] = None,
                   temperature: Optional[float] = None) -> str:
        return await self._timed("chat", self.provider.chat(messages, system_instruction, temperature))

    async def generate_json(self, prompt: str, system_instruction: Optional[str] = None,
                            temperature: Optional[float] = None, attempts: int = 2) -> dict:
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                raw = await self._timed("generate_json", self.provider.generate_json(prompt, system_instruction, temperature))
                parsed = self._try_parse(raw)
                if parsed is not None:
                    return parsed
                logger.warning("LLM returned non-JSON payload (attempt %d): %.200s", attempt + 1, raw)
                last_exc = ValueError("LLM response was not valid JSON")
            except LLMUnavailableError:
                raise
            except Exception as e:  # noqa: BLE001
                last_exc = e
            if attempt < attempts - 1:
                await asyncio.sleep(0.5)
        raise last_exc or ValueError("Failed to obtain valid JSON from LLM")

    @staticmethod
    def _try_parse(text: str) -> dict | None:
        if not text:
            return None
        cleaned = text.strip()
        # Strip ```json fences
        fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.S)
        if fence:
            cleaned = fence.group(1).strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
        try:
            data = json.loads(cleaned)
            return data if isinstance(data, dict) else None
        except Exception:
            pass
        # Recover the first balanced JSON object in the text
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                data = json.loads(cleaned[start:end + 1])
                return data if isinstance(data, dict) else None
            except Exception:
                return None
        return None


# Global service instance
llm_service = LLMService()
