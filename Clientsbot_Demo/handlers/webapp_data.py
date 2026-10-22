"""Приём данных из мини-аппа (web_app_data)."""

import json
import logging

from aiogram import F, Router
from aiogram.types import Message

logger = logging.getLogger(__name__)
router = Router()


@router.message(F.web_app_data)
async def handle_webapp_data(message: Message) -> None:
    """Принимает JSON от мини-аппа и отвечает, что выбрал пользователь.

    Ожидаемый формат: {"section": "Раздел N"}.

    TODO: здесь будет основная обработка данных мини-аппа —
          запись в БД, запуск сценариев, FSM и т.д.
    """
    raw = message.web_app_data.data
    user_id = message.from_user.id if message.from_user else "неизвестен"
    logger.info("Данные от мини-аппа (user_id=%s): %s", user_id, raw)

    try:
        payload = json.loads(raw)
        section = payload.get("section", "неизвестный раздел")
    except (json.JSONDecodeError, AttributeError):
        # Если пришло не-JSON — отвечаем сырыми данными, не падая
        section = raw

    await message.answer(f"Вы выбрали: {section}")
