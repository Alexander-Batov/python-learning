"""Приём данных из мини-аппа (web_app_data)."""

import json
import logging

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

import db
from handlers.onboarding import begin_onboarding

logger = logging.getLogger(__name__)
router = Router()


@router.message(F.web_app_data)
async def handle_webapp_data(message: Message, state: FSMContext) -> None:
    """Принимает JSON-действия от мини-аппа.

    Ожидаемый формат: {"action": "reset_cycle"}.

    TODO: новые действия мини-аппа (избранное, напоминания и т.п.) —
          добавлять сюда веткой elif под action.
    """
    raw = message.web_app_data.data
    user_id = message.from_user.id if message.from_user else "неизвестен"
    logger.info("Данные от мини-аппа (user_id=%s): %s", user_id, raw)

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, AttributeError, TypeError):
        await message.answer("Пришло что-то непонятное — попробуй ещё раз 🤔")
        return

    action = payload.get("action")
    if action == "reset_cycle":
        if message.from_user:
            db.reset_user(message.from_user.id)
        await message.answer(
            "Хорошо, обнулила данные цикла — давай укажем их заново 💗"
        )
        await begin_onboarding(message, state)
        return

    await message.answer("Приняла! Если что-то нужно поменять — кнопки ниже.")
