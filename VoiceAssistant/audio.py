"""Работа с микрофоном: поток, громкость чанка, запись фразы по детектору тишины."""
from __future__ import annotations

import logging
from collections import deque

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


def rms_level(chunk: np.ndarray) -> float:
    """Среднеквадратичная громкость чанка (int16), 0 для тишины."""
    if chunk.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(chunk.astype(np.float64) ** 2)))


def open_mic(sample_rate: int, block_size: int) -> sd.InputStream:
    """Открывает и запускает поток микрофона (int16, моно)."""
    stream = sd.InputStream(
        samplerate=sample_rate,
        channels=1,
        dtype="int16",
        blocksize=block_size,
    )
    stream.start()
    logger.info("Микрофон открыт (%s Гц)", sample_rate)
    return stream


def record_phrase(
    stream: sd.InputStream,
    sample_rate: int,
    block_size: int,
    silence_rms: int,
    silence_seconds: float,
    max_seconds: float,
    min_seconds: float = 0.4,
) -> bytes:
    """Пишет речь до тишины: конец фразы — silence_seconds подряд тихих чанков.

    Возвращает PCM (int16, моно). Ограничение по длине — max_seconds.
    """
    silence_blocks = max(1, int(silence_seconds * sample_rate / block_size))
    max_blocks = int(max_seconds * sample_rate / block_size)
    min_blocks = int(min_seconds * sample_rate / block_size)
    quiet = deque(maxlen=silence_blocks)

    chunks: list[bytes] = []
    for n in range(max_blocks):
        data, _ = stream.read(block_size)
        chunk = data[:, 0]
        chunks.append(chunk.tobytes())
        quiet.append(rms_level(chunk) < silence_rms)
        if len(chunks) >= min_blocks and len(quiet) == silence_blocks and all(quiet):
            break

    return b"".join(chunks)
