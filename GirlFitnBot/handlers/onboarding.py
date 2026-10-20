"""Онбординг: сбор данных цикла через FSM, сброс и изменение данных.

Сценарий задаётся дважды: при первом /start (если пользователя нет в базе)
и по команде /reset_cycle / кнопке «Изменить данные цикла» / действию из мини-аппа.
"""

import logging
from datetime import date, datetime
from typing import Optional, Tuple

from aiogram import Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

import db

logger = logging.getLogger(__name__)
router = Router()

DEFAULT_CYCLE_LENGTH = 28
MIN_CYCLE_LENGTH = 21
MAX_CYCLE_LENGTH = 35

DEFAULT_PERIOD_LENGTH = 5
MIN_PERIOD_LENGTH = 2
MAX_PERIOD_LENGTH = 8


class Onboarding(StatesGroup):
    """Шаги онбординга: имя → дата начала → длина цикла → длительность месячных."""

    name = State()
    cycle_start = State()
    cycle_length = State()
    period_length = State()


async def begin_onboarding(message: Message, state: FSMContext) -> None:
    """Старт сценария: знакомимся, затем спрашиваем дату начала месячных."""
    await state.set_state(Onboarding.name)
    await message.answer(
        "Привет! Я помогу настроить приложение под твой цикл 🌿\n\n"
        "Как тебя зовут? Можно просто имя."
    )


@router.message(Onboarding.name)
async def process_name(message: Message, state: FSMContext) -> None:
    """Принимает имя, спрашивает дату начала последних месячных."""
    name = (message.text or "").strip()
    if not 1 <= len(name) <= 64:
        await message.answer(
            "Хм, имя выглядит слишком коротким или длинным — попробуем ещё раз?"
        )
        return
    await state.update_data(name=name)
    await state.set_state(Onboarding.cycle_start)
    await message.answer(
        f"Приятно познакомиться, {name}! 🌿\n\n"
        "Когда начались твои последние месячные? "
        "Пришли дату в формате ДД.ММ.ГГГГ — например, 12.09.2025."
    )


def parse_cycle_start(text: str) -> Tuple[Optional[date], Optional[str]]:
    """Парсит дату начала месячных: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.

    Возвращает (дата, None) или (None, причина ошибки для подстановки в ответ).
    """
    text = text.strip()
    parsed: Optional[date] = None
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(text, fmt).date()
            break
        except ValueError:
            continue
    if parsed is None:
        return None, "не получилось разобрать формат даты"
    if parsed > date.today():
        return None, "эта дата ещё в будущем"
    return parsed, None


@router.message(Onboarding.cycle_start)
async def process_cycle_start(message: Message, state: FSMContext) -> None:
    """Принимает дату начала последних месячных, спрашивает длину цикла."""
    parsed, error = parse_cycle_start(message.text or "")
    if parsed is None:
        await message.answer(
            f"Хм, {error} 🤔 Давай ещё раз — дата в формате ДД.ММ.ГГГГ, "
            "например 12.09.2025."
        )
        return
    await state.update_data(cycle_start=parsed.isoformat())
    await state.set_state(Onboarding.cycle_length)
    await message.answer(
        f"Запомнила: {parsed.strftime('%d.%m.%Y')} ✨\n\n"
        f"Теперь средняя длина цикла в днях — обычно это {MIN_CYCLE_LENGTH}–"
        f"{MAX_CYCLE_LENGTH}, чаще всего {DEFAULT_CYCLE_LENGTH}. "
        f"Если не уверена — просто отправь {DEFAULT_CYCLE_LENGTH}."
    )


@router.message(Onboarding.cycle_length)
async def process_cycle_length(message: Message, state: FSMContext) -> None:
    """Принимает длину цикла, спрашивает длительность месячных."""
    text = (message.text or "").strip()
    try:
        length = int(text)
    except ValueError:
        await message.answer(
            "Нужно целое число — например, 28. Давай попробуем ещё раз?"
        )
        return
    if not MIN_CYCLE_LENGTH <= length <= MAX_CYCLE_LENGTH:
        await message.answer(
            f"Длина цикла обычно от {MIN_CYCLE_LENGTH} до {MAX_CYCLE_LENGTH} дней. "
            "Пришли число из этого диапазона 💗"
        )
        return

    await state.update_data(cycle_length=length)
    await state.set_state(Onboarding.period_length)
    await message.answer(
        f"Записала: цикл {length} дней ✨\n\n"
        f"Последний вопрос: сколько дней обычно идут месячные? "
        f"Обычно это {MIN_PERIOD_LENGTH}–{MAX_PERIOD_LENGTH}, чаще всего "
        f"{DEFAULT_PERIOD_LENGTH}. Если не уверена — просто отправь "
        f"{DEFAULT_PERIOD_LENGTH}."
    )


@router.message(Onboarding.period_length)
async def process_period_length(message: Message, state: FSMContext) -> None:
    """Принимает длительность месячных, сохраняет данные пользователя."""
    text = (message.text or "").strip()
    try:
        period = int(text)
    except ValueError:
        await message.answer(
            "Нужно целое число — например, 5. Давай попробуем ещё раз?"
        )
        return
    if not MIN_PERIOD_LENGTH <= period <= MAX_PERIOD_LENGTH:
        await message.answer(
            f"Месячные обычно длятся от {MIN_PERIOD_LENGTH} до "
            f"{MAX_PERIOD_LENGTH} дней. Пришли число из этого диапазона 💗"
        )
        return

    data = await state.get_data()
    db.save_user(
        message.from_user.id,
        data["cycle_start"],
        data["cycle_length"],
        name=data.get("name"),
        period_length=period,
    )
    await state.clear()
    await message.answer(
        "Готово, данные сохранены! 🎀\n\n"
        "Открой приложение кнопкой ниже — там твой персональный календарь "
        "и тренировки по фазам цикла. Данные всегда можно изменить "
        "в профиле приложения или командой /reset_cycle."
    )


@router.message(Command("reset_cycle"))
async def cmd_reset_cycle(message: Message, state: FSMContext) -> None:
    """Сброс данных цикла и перезапуск онбординга."""
    if message.from_user:
        db.reset_user(message.from_user.id)
    await state.clear()
    await message.answer("Окей, стёрла старые данные цикла.")
    await begin_onboarding(message, state)
