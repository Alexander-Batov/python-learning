"""Воспроизведение mp3 через WinMM (Windows) — без сторонних зависимостей."""
from __future__ import annotations

import ctypes
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_winmm = ctypes.windll.winmm  # только Windows


def _mci(command: str) -> None:
    result = _winmm.mciSendStringW(command, None, 0, None)
    if result != 0:
        raise RuntimeError(f"mciSendStringW вернул код {result} для команды: {command!r}")


def play_mp3(path: str | Path, alias: str = "voice_assistant_mp3") -> None:
    """Воспроизводит mp3-файл и ждёт конца воспроизведения."""
    path = str(Path(path).resolve())
    _mci(f'open "{path}" type mpegvideo alias {alias}')
    try:
        _mci(f"play {alias} wait")
    finally:
        _mci(f"close {alias}")
