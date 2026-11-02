"""Команды /start и /help: приветствие и кнопка открытия мини-аппа."""

import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo

import db
from config import config
from handlers.onboarding import begin_onboarding

logger = logging.getLogger(__name__)
router = Router()


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Главное reply-меню: единственная кнопка — открытие мини-аппа.

    Остальные сценарии (сброс цикла и т.п.) — командами (/reset_cycle).
    """
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="Открыть приложение",
                    web_app=WebAppInfo(url=config.webapp_url),
                )
            ],
        ],
        resize_keyboard=True,
    )


@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext) -> None:
    """Приветствие и главное меню. Если данных цикла нет — запускает онбординг."""
    name = message.from_user.first_name if message.from_user else "подруга"
    await message.answer(
        f"Привет, {name}! 💕\n\n"
        "Это твоё фитнес-приложение: тренировки и забота о себе по фазам "
        "менструального цикла. Нажми кнопку ниже, чтобы открыть его.",
        reply_markup=main_menu_keyboard(),
    )
    # TODO: позже здесь можно показать сводку по текущей фазе прямо в чате
    if message.from_user and db.get_user(message.from_user.id) is None:
        await begin_onboarding(message, state)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """Краткая справка по боту."""
    await message.answer(
        "Что умеет бот:\n"
        "/start — приветствие и кнопка открытия приложения\n"
        "/reset_cycle — сбросить данные цикла и пройти настройку заново\n"
        "/help — эта справка\n\n"
        "Внутри приложения — календарь по фазам цикла, тренировки дня "
        "и личный кабинет."
    )
