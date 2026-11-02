"""Расчёт фаз менструального цикла.

ЗЕРКАЛО webapp/cycle.js: методика фаз описана в двух местах.
Меняйте схему только здесь и в webapp/cycle.js, остальное подстроится само.

Схема от дня начала месячных для цикла длиной L,
месячные длятся P дней (единый источник — см. раздел «Осветление» п.4):
- Менструальная: дни 1-P
- Фолликулярная: дни (P+1) - (L-14), включая день овуляции (~L-14)
- Овуляторная: дни (L-13) - (L-12), ~2 дня
- Лютеиновая: дни (L-11) - L
  · делится на два подпериода (см. get_subperiod):
    стабильная (L-11 .. L-7) и предменструальная неделя (последние 7 дней, L-6 .. L)
Пример L=28, P=5: 1-5 · 6-14 · 15-16 · 17-28 (17-21 стабильная, 22-28 предменструальная)
"""

from datetime import date, datetime, timedelta
from typing import Optional

PHASE_MENSTRUAL = "menstrual"
PHASE_FOLLICULAR = "follicular"
PHASE_OVULATORY = "ovulatory"
PHASE_LUTEAL = "luteal"
PHASE_OVERDUE = "overdue"

# Подпериоды внутри лютеиновой фазы
SUBPERIOD_LUTEAL_STABLE = "luteal_stable"
SUBPERIOD_PREMENSTRUAL = "premenstrual"

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
    if cycle_day <= cycle_length - 14:
        return PHASE_FOLLICULAR
    if cycle_day <= cycle_length - 12:
        return PHASE_OVULATORY
    return PHASE_LUTEAL


def get_next_period_date(cycle_start: date, cycle_length: int) -> date:
    """Ожидаемая дата следующей менструации (от cycle_start)."""
    return cycle_start + timedelta(days=cycle_length)


def get_subperiod(
    cycle_day: Optional[int], cycle_length: int, period_length: int
) -> Optional[str]:
    """Подпериод лютеиновой фазы по номеру дня.

    Предменструальная неделя — последние 7 дней цикла (L-6 .. L),
    стабильная — остаток лютеиновой (L-11 .. L-7).
    Вне лютеиновой фазы и для cycle_day=None возвращает None.
    """
    if get_phase(cycle_day, cycle_length, period_length) != PHASE_LUTEAL:
        return None
    if cycle_day >= cycle_length - 6:
        return SUBPERIOD_PREMENSTRUAL
    return SUBPERIOD_LUTEAL_STABLE


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
        "subperiod": None if overdue else get_subperiod(day, cycle_length, period_length),
        "overdue": overdue,
        "next_period": get_next_period_date(start, cycle_length).isoformat(),
    }
