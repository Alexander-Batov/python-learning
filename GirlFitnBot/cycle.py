"""Расчёт фаз менструального цикла.

ЗЕРКАЛО webapp/cycle.js: методика фаз описана в двух местах.
Меняйте схему только здесь и в webapp/cycle.js, остальное подстроится само.

Классическая схема от дня начала месячных для цикла длиной L,
месячные длятся P дней:
- Менструальная: дни 1-P
- Фолликулярная: дни (P+1) - (L-15)
- Овуляторная: дни (L-14) - (L-12), овуляция примерно в день L-14
- Лютеиновая: дни (L-11) - L
"""

from datetime import date, datetime, timedelta
from typing import Optional

PHASE_MENSTRUAL = "menstrual"
PHASE_FOLLICULAR = "follicular"
PHASE_OVULATORY = "ovulatory"
PHASE_LUTEAL = "luteal"
PHASE_OVERDUE = "overdue"

DATE_FORMAT = "%Y-%m-%d"

# Длительность месячных по умолчанию (если пользователь её не указывал)
DEFAULT_PERIOD_LENGTH = 5


def get_cycle_day(
    on_date: date, cycle_start: date, cycle_length: int
) -> Optional[int]:
    """Номер дня цикла для даты с учётом повторяющихся циклов.

    День 1 — день начала месячных. Используется для раскраски
    календаря и карточек дат: даты после конца цикла заворачиваются
    в следующий цикл. Если дата раньше cycle_start, возвращает None.
    """
    diff = (on_date - cycle_start).days
    if diff < 0:
        return None
    return diff % cycle_length + 1


def get_current_day(
    on_date: date, cycle_start: date, cycle_length: int
) -> Optional[int]:
    """Сколько дней прошло от начала отслеживаемого цикла, без заворота.

    Может вернуть число больше cycle_length — это «просроченный» цикл
    (get_phase тогда вернёт overdue). Дата раньше cycle_start → None.
    """
    diff = (on_date - cycle_start).days
    if diff < 0:
        return None
    return diff + 1


def get_phase(
    cycle_day: Optional[int], cycle_length: int, period_length: int
) -> Optional[str]:
    """Фаза по номеру дня цикла: menstrual / follicular / ovulatory / luteal.

    Менструальная фаза длится period_length дней (длительность месячных
    пользователя). Если день больше длины цикла — цикл «просрочен»,
    возвращает "overdue": это деликатный статус, а не ошибка.
    Для cycle_day=None вернёт None.
    """
    if cycle_day is None:
        return None
    if cycle_day > cycle_length:
        return PHASE_OVERDUE
    if cycle_day <= period_length:
        return PHASE_MENSTRUAL
    if cycle_day <= cycle_length - 15:
        return PHASE_FOLLICULAR
    if cycle_day <= cycle_length - 12:
        return PHASE_OVULATORY
    return PHASE_LUTEAL


def get_next_period_date(cycle_start: date, cycle_length: int) -> date:
    """Ожидаемая дата следующей менструации (от cycle_start)."""
    return cycle_start + timedelta(days=cycle_length)


def build_cycle_state(
    cycle_start: str,
    cycle_length: int,
    period_length: Optional[int] = None,
    on_date: Optional[date] = None,
) -> dict:
    """Сводка по циклу для API и бота: день, фаза, следующая менструация."""
    if on_date is None:
        on_date = date.today()
    if not period_length:
        period_length = DEFAULT_PERIOD_LENGTH
    start = datetime.strptime(cycle_start, DATE_FORMAT).date()
    day = get_current_day(on_date, start, cycle_length)
    phase = get_phase(day, cycle_length, period_length)
    overdue = phase == PHASE_OVERDUE
    return {
        "cycle_start": cycle_start,
        "cycle_length": cycle_length,
        "period_length": period_length,
        "today": on_date.isoformat(),
        "cycle_day": None if overdue else day,
        "phase": None if overdue else phase,
        "overdue": overdue,
        "next_period": get_next_period_date(start, cycle_length).isoformat(),
    }
