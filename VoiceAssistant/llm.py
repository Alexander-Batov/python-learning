"""Клиент LLM через OpenAI-совместимый API (ключ и base_url из .env)."""
from __future__ import annotations

import logging
from collections import deque

from openai import OpenAI

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Ты — голосовой ассистент на компьютере пользователя. "
    "Отвечай по-русски, кратко: одно-два предложения. "
    "Без markdown, списков и эмодзи — твой ответ будет озвучен вслух."
)


class LLMClient:
    def __init__(
        self,
        api_key: str | None,
        base_url: str | None,
        model: str,
        history_size: int = 6,
    ) -> None:
        self._model = model
        self._history: deque[dict] = deque(maxlen=history_size)
        self._client: OpenAI | None = None
        if api_key:
            self._client = OpenAI(api_key=api_key, base_url=base_url, timeout=30)
            logger.info("LLM endpoint: %s | модель: %s", base_url or "https://api.openai.com/v1", model)
        else:
            logger.warning("OPENAI_API_KEY не задан — ответы LLM недоступны")

    def chat(self, text: str) -> str:
        if self._client is None:
            return "Не задан ключ API в файле .env."
        self._history.append({"role": "user", "content": text})
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, *self._history],
                temperature=1,
                max_tokens=300,
            )
            answer = response.choices[0].message.content.strip()
        except Exception:
            logger.exception("Ошибка запроса к LLM")
            self._history.pop()  # неудачный запрос в историю не пишем
            return "Не могу связаться с сервером. Проверь сеть и настройки."
        self._history.append({"role": "assistant", "content": answer})
        return answer

    def reset_history(self) -> None:
        self._history.clear()
