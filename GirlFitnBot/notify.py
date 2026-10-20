"""Планировщик уведомлений (MVP).

Каждую минуту проверяет время и отправляет мягкие напоминания тем,
кто их включил (флаги notify_* в users; спека — все уведомления
отключаемы по типам). Отправленные сегодня ключи хранятся в памяти,
чтобы не дублировать: после перезапуска возможен повтор за текущую
минуту — для демо допустимо (в README).

Время серверное (UTC на Amvera). Таймзоны пользователей не учитываются.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta

import cycle
import db
from config import config

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SEC = 60

MORNING_TIME = "09:00"
MORNING_TEXT = (
    "Доброе утро ♡ Сегодня для вас подготовлено: активность, питание "
    "и привычка дня. Откройте приложение, чтобы всё увидеть."
)
WORKOUT_TIME = "18:00"
WORKOUT_TEXT = (
    "Сегодняшняя тренировка ждёт вас — а если не хочется интенсивно, "
    "внутри всегда есть лёгкие варианты. Загляните, когда будет удобно."
)
EVENING_TIME = "21:00"
EVENING_TEXT = (
    "Как прошёл ваш день? Отметьте выполненные действия и сохраните "
    "свой прогресс — вам есть чем гордиться."
)
PERIOD_TIME = "10:00"

_sent: set = set()  # ключи вида "YYYY-MM-DD:tg_id:тип"


def _key(day: str, tg_id: int, kind: str) -> str:
    return f"{day}:{tg_id}:{kind}"


def _already_sent(day: str, tg_id: int, kind: str) -> bool:
    return _key(day, tg_id, kind) in _sent


async def _send(bot, tg_id: int, text: str) -> None:
    try:
        await bot.send_message(tg_id, text)
    except Exception as exc:  # пользователь мог заблокировать бота
        logger.warning("Не удалось отправить уведомление tg_id=%s: %s",
                       tg_id, exc)


async def scheduler_loop(bot) -> None:
    """Бесконечный цикл рассылки; отменяется вместе с приложением."""
    logger.info("Планировщик уведомлений запущен")
    while True:
        try:
            await _tick(bot)
        except Exception as exc:
            logger.error("Ошибка в планировщике уведомлений: %s", exc)
        await asyncio.sleep(CHECK_INTERVAL_SEC)


async def _tick(bot) -> None:
    now = datetime.now()
    today = now.date()
    day = today.isoformat()
    hhmm = now.strftime("%H:%M")

    for user in db.list_users():
        tg_id = user["tg_id"]

        if hhmm == MORNING_TIME and user["notify_plan"]:
            if not _already_sent(day, tg_id, "plan"):
                await _send(bot, tg_id, MORNING_TEXT)
                _sent.add(_key(day, tg_id, "plan"))

        if hhmm == WORKOUT_TIME and user["notify_workout"]:
            # Напоминаем только если тренировка сегодня ещё не отмечена
            start = (today - timedelta(days=30)).isoformat()
            done = db.get_workout_completions_range(tg_id, day, day)
            if not done and not _already_sent(day, tg_id, "workout"):
                await _send(bot, tg_id, WORKOUT_TEXT)
                _sent.add(_key(day, tg_id, "workout"))

        if hhmm == EVENING_TIME and user["notify_checkin"]:
            if not _already_sent(day, tg_id, "checkin"):
                await _send(bot, tg_id, EVENING_TEXT)
                _sent.add(_key(day, tg_id, "checkin"))

        if hhmm == PERIOD_TIME and user["notify_period"]:
            # За день до ожидаемой менструации — мягкий ориентир
            state = _cycle_state(user, today)
            if state and state["next_period"] == (today + timedelta(days=1)).isoformat():
                if not _already_sent(day, tg_id, "period"):
                    await _send(
                        bot, tg_id,
                        "Ориентировочно завтра могут начаться месячные — "
                        "приложение уже подготовило мягкие рекомендации.",
                    )
                    _sent.add(_key(day, tg_id, "period"))

    # Напоминания привычек по заданному времени
    for row in db.get_habit_reminders_due(hhmm):
        tg_id = row["tg_id"]
        user = db.get_user(tg_id)
        if user is None or not user["notify_habit"]:
            continue
        kind = f"habit:{row['title']}"
        if not _already_sent(day, tg_id, kind):
            await _send(
                bot, tg_id,
                f"Напоминание ♡ Пора отметить привычку «{row['title']}». "
                "Одно маленькое действие — и день уже удался.",
            )
            _sent.add(_key(day, tg_id, kind))


def _cycle_state(user, on_date: date):
    try:
        return cycle.build_cycle_state(
            user["cycle_start"], user["cycle_length"],
            user["period_length"], on_date=on_date,
        )
    except Exception:
        return None
