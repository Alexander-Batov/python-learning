"""Самодиагностика ассистента.

Запуск: venv/Scripts/python.exe main.py --check

Проверяет, что реально прочитано из .env (без секретов), уровень сигнала
микрофона (для подбора SILENCE_RMS), связь с LLM и синтез TTS.
"""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile

from audio import open_mic, rms_level
from config import Settings

logger = logging.getLogger(__name__)


def run_check(settings: Settings) -> None:
    print("=== 1. Конфиг (.env) ===")
    print(f"  LLM base_url : {settings.llm_base_url or 'https://api.openai.com/v1 (дефолт OpenAI!)'}")
    print(f"  LLM model    : {settings.llm_model}")
    if settings.llm_api_key:
        print(f"  Ключ API     : задан ({settings.llm_api_key[:6]}...)")
    else:
        print("  Ключ API     : НЕ ЗАДАН — проверь .env (имя файла ровно «.env», без .txt!)")
    print(f"  Wake word    : {settings.wake_word} (порог {settings.wake_threshold})")
    print(f"  Голос TTS    : {settings.tts_voice}")
    print(f"  SILENCE_RMS  : {settings.silence_rms}")

    print("\n=== 2. Микрофон (говори что-нибудь ~3 секунды) ===")
    stream = open_mic(settings.sample_rate, settings.block_size)
    try:
        levels: list[float] = []
        blocks = int(3 * settings.sample_rate / settings.block_size)
        for _ in range(blocks):
            data, _ = stream.read(settings.block_size)
            levels.append(rms_level(data[:, 0]))
    finally:
        stream.stop()
        stream.close()
    quiet = sorted(levels)[: len(levels) // 2]
    noise = sum(quiet) / len(quiet)
    print(f"  фон ~{noise:.0f}, максимум {max(levels):.0f}")
    print(f"  рекомендуемый SILENCE_RMS: {noise * 3:.0f}–{noise * 5:.0f}")

    print("\n=== 3. LLM (тестовый запрос) ===")
    from openai import OpenAI

    if not settings.llm_api_key:
        print("  пропуск — ключ не задан")
    else:
        try:
            client = OpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url,
                timeout=15,
            )
            client.chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": "привет"}],
                max_tokens=1,
            )
            print("  OK — сервер ответил")
        except Exception as exc:
            print(f"  ОШИБКА: {type(exc).__name__}: {str(exc)[:300]}")

    print("\n=== 4. TTS (синтез тестовой фразы) ===")
    import edge_tts

    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    try:
        asyncio.run(edge_tts.Communicate("Проверка голоса.", settings.tts_voice).save(tmp.name))
        print(f"  OK, синтезировано {os.path.getsize(tmp.name)} байт")
    except Exception as exc:
        print(f"  ОШИБКА: {type(exc).__name__}: {str(exc)[:200]}")
    finally:
        os.unlink(tmp.name)

    print("\nПроверка завершена.")
