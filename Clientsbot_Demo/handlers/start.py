"""Команды /start и /help: приветствие и кнопка открытия мини-аппа."""

import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo

from config import config

logger = logging.getLogger(__name__)
router = Router()


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Главное reply-меню с кнопкой открытия мини-аппа.

    TODO: добавить сюда остальные кнопки меню по мере наполнения бота.
    """
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="📱 Открыть приложение",
                    web_app=WebAppInfo(url=config.webapp_url),
                )
            ],
        ],
        resize_keyboard=True,
    )


@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    """Приветствие и главное меню."""
    name = message.from_user.first_name if message.from_user else "друг"
    await message.answer(
        f"Привет, {name}!\n\n"
        "Это каркас бота с мини-аппом. Нажмите кнопку ниже, "
        "чтобы открыть приложение.",
        reply_markup=main_menu_keyboard(),
    )
    # TODO: регистрация пользователя в БД, проверка подписки и т.п.


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """Краткая справка по каркасу."""
    await message.answer(
        "Что умеет этот каркас:\n"
        "/start — приветствие и кнопка открытия мини-аппа\n"
        "/help — эта справка\n\n"
        "Внутри мини-аппа — экраны-заглушки, отправляющие выбор боту."
    )
