"""Синтез речи через edge-tts (Microsoft Edge neural voices)."""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile

import edge_tts

from player import play_mp3

from .base import TTSEngine

logger = logging.getLogger(__name__)


class EdgeTTSEngine(TTSEngine):
    def __init__(self, voice: str) -> None:
        self._voice = voice

    def speak(self, text: str) -> None:
        if not text:
            return
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp.close()
        try:
            asyncio.run(edge_tts.Communicate(text, self._voice).save(tmp.name))
            play_mp3(tmp.name)
        except Exception:
            logger.exception("Ошибка синтеза или воспроизведения речи")
        finally:
            try:
                os.unlink(tmp.name)
            except FileNotFoundError:
                pass
