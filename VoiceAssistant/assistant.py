"""Главный цикл ассистента.

wake word -> «Слушаю» -> запись фразы -> STT -> системная команда или LLM -> TTS.
Микрофонный поток открыт один раз на всю сессию: чанки идут в детектор
wake word, а после активации — в запись фразы.
"""
from __future__ import annotations

import logging

from audio import open_mic, record_phrase
from commands import parse
from commands.handlers import execute
from config import Settings
from llm import LLMClient
from stt import STTEngine
from tts import TTSEngine
from wakeword_listener import WakeWordDetector

logger = logging.getLogger(__name__)

NO_SPEECH = "Я не расслышал. Позови меня ещё раз."


class Assistant:
    def __init__(
        self,
        settings: Settings,
        stt: STTEngine,
        tts: TTSEngine,
        llm: LLMClient,
    ) -> None:
        self._settings = settings
        self._stt = stt
        self._tts = tts
        self._llm = llm

    def run(self) -> None:
        s = self._settings
        detector = WakeWordDetector(
            wake_word=s.wake_word,
            threshold=s.wake_threshold,
            sample_rate=s.sample_rate,
        )
        stream = open_mic(s.sample_rate, s.block_size)
        logger.info("Жду wake word '%s'... (выход: Ctrl+C)", s.wake_word)
        try:
            while True:
                data, _ = stream.read(s.block_size)
                if not detector.process(data[:, 0]):
                    continue

                logger.info("Услышан wake word '%s'", s.wake_word)
                self._tts.speak(s.ready_phrase)

                pcm = record_phrase(
                    stream,
                    sample_rate=s.sample_rate,
                    block_size=s.block_size,
                    silence_rms=s.silence_rms,
                    silence_seconds=s.silence_seconds,
                    max_seconds=s.max_phrase_seconds,
                )
                text = self._stt.recognize(pcm)
                logger.info("Распознано: %r", text)
                if not text:
                    self._tts.speak(NO_SPEECH)
                    continue

                if self._handle(text):
                    break
        finally:
            stream.stop()
            stream.close()
            logger.info("Микрофон закрыт")

    def _handle(self, text: str) -> bool:
        """Обрабатывает распознанный текст. Возвращает True, если пора выйти."""
        command = parse(text)
        if command is not None and command.kind == "exit":
            self._tts.speak(self._settings.goodbye_phrase)
            return True
        if command is not None:
            answer = execute(command, self._settings)
            if answer:
                self._tts.speak(answer)
            return False
        answer = self._llm.chat(text)
        self._tts.speak(answer)
        return False
