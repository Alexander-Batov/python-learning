"""Разбор распознанной фразы: системная команда или обычный запрос к LLM.

Возвращает Command с kind:
    "exit"         — «спасибо, всё» → завершение работы
    "volume"       — абсолютная громкость, value = 0..100
    "volume_delta" — относительная громкость, value = ±10
    "open"         — открыть программу, value = имя из реестра
    "bot"          — запустить Katya_Bot
    "help"         — что умеет ассистент
None — не команда, текст уходит в LLM.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .registry import BOT_ALIASES

_EXIT_RE = re.compile(r"спасибо.{0,10}все\b")
_VOLUME_NUM_RE = re.compile(r"громкость[^0-9]{0,12}(\d{1,3})")
_VOLUME_WORD_RE = re.compile(r"громкость[^0-9]{0,15}(максимум|минимум)")
_UP_RE = re.compile(r"громче|прибавь|громкость выше|выше громкость")
_DOWN_RE = re.compile(r"тише|убавь|потише|громкость ниже")
_OPEN_RE = re.compile(r"(?:открой|откройте|запусти|запустите|включи|включите)\s+(.+)$")
_HELP_RE = re.compile(r"что ты умеешь|помоги|помощь|твои команды")

_VOLUME_STEP = 10


@dataclass(frozen=True)
class Command:
    kind: str
    value: int | str | None = None


def _normalize(text: str) -> str:
    t = text.lower().replace("ё", "е")
    t = re.sub(r"[^0-9a-zа-я ]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def parse(text: str) -> Command | None:
    t = _normalize(text)
    if not t:
        return None

    if _EXIT_RE.search(t):
        return Command("exit")

    m = _VOLUME_NUM_RE.search(t)
    if m:
        level = min(100, max(0, int(m.group(1))))
        return Command("volume", level)
    m = _VOLUME_WORD_RE.search(t)
    if m:
        return Command("volume", 100 if m.group(1) == "максимум" else 0)
    if _UP_RE.search(t):
        return Command("volume_delta", _VOLUME_STEP)
    if _DOWN_RE.search(t):
        return Command("volume_delta", -_VOLUME_STEP)

    m = _OPEN_RE.search(t)
    if m:
        target = m.group(1).strip()
        target = re.sub(r"^(пожалуйста|плиз)\s+", "", target)
        if target in BOT_ALIASES:
            return Command("bot")
        return Command("open", target)

    if _HELP_RE.search(t):
        return Command("help")

    return None
