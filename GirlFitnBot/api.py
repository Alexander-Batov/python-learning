"""Веб-API мини-аппа: валидация initData и все /api/*-эндпоинты.

Вынесено из bot.py, чтобы точка входа осталась компактной.
Все эндпоинты требуют initData (HMAC-подпись Telegram); без неё — 401.
Дата «сегодня» всегда приходит от клиента (параметр date) — сервер может
жить в другом часовом поясе (UTC на Amvera), клиент считает день цикла сам.
"""

import hashlib
import hmac
import json
import logging
import time
import urllib.parse
from datetime import date, datetime, timedelta
from typing import Optional

from aiohttp import web

import cycle
import db
from config import config
from handlers.onboarding import (
    DEFAULT_CYCLE_LENGTH,
    DEFAULT_PERIOD_LENGTH,
    MAX_CYCLE_LENGTH,
    MIN_CYCLE_LENGTH,
    MAX_PERIOD_LENGTH,
    MIN_PERIOD_LENGTH,
)

logger = logging.getLogger(__name__)

# initData живёт сутки: старше — считаем подпись просроченной
INIT_DATA_MAX_AGE = 24 * 60 * 60

NOTIFY_KEYS = ("plan", "workout", "habit", "checkin", "period")
UNITS_VALUES = {"weight": ("kg", "lb"), "height": ("cm", "in")}


# --- initData ---

def validate_init_data(init_data: str) -> Optional[int]:
    """Проверяет HMAC-подпись initData по токену бота.

    Возвращает Telegram ID пользователя или None, если подпись невалидна
    или auth_date просрочен.
    """
    if not init_data.strip():
        return None
    try:
        pairs = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    except ValueError:
        return None

    received_hash = pairs.pop("hash", None)
    if not received_hash or "auth_date" not in pairs or "user" not in pairs:
        return None

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(pairs.items())
    )
    secret = hmac.new(
        b"WebAppData", config.bot_token.encode(), hashlib.sha256
    ).digest()
    calculated_hash = hmac.new(
        secret, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    if config.debug:
        bot_id = config.bot_token.split(":", 1)[0]
        logger.info(
            "initData: полей=%s bot_id=%s calc=%s… recv=%s…",
            len(pairs) + 1, bot_id,
            calculated_hash[:10], received_hash[:10],
        )
    if not hmac.compare_digest(calculated_hash, received_hash):
        return None

    try:
        if time.time() - int(pairs["auth_date"]) > INIT_DATA_MAX_AGE:
            return None
        user = json.loads(pairs["user"])
        return int(user["id"])
    except (ValueError, json.JSONDecodeError, KeyError, TypeError):
        return None


async def _read_body(request: web.Request) -> str:
    """Читает тело запроса один раз и кладёт в хранилище запроса."""
    if "gf_body" not in request:
        request["gf_body"] = await request.text()
    return request["gf_body"]


async def _user_id(request: web.Request) -> Optional[int]:
    """Достаёт initData из query или JSON-тела и валидирует подпись."""
    init_data = request.query.get("initData", "")
    if not init_data and request.method in ("POST", "PATCH", "PUT", "DELETE"):
        try:
            payload = json.loads(await _read_body(request))
            init_data = str(payload.get("initData", ""))
        except (json.JSONDecodeError, TypeError, ValueError):
            init_data = ""
    user_id = validate_init_data(init_data)
    if user_id is None and config.debug:
        logger.info("API %s: 401 — подпись initData не прошла", request.path)
    return user_id


async def _json_payload(request: web.Request) -> Optional[dict]:
    """Парсит JSON-тело; ValueError с текстом — для ответа 400."""
    try:
        payload = json.loads(await _read_body(request))
    except json.JSONDecodeError:
        raise ValueError("нужен JSON в теле запроса")
    if not isinstance(payload, dict):
        raise ValueError("нужен JSON-объект в теле")
    return payload


def _err(text: str, status: int = 400) -> web.Response:
    return web.json_response({"error": text}, status=status)


def _parse_date(value: str, field: str = "date") -> date:
    try:
        return datetime.strptime(str(value).strip(), cycle.DATE_FORMAT).date()
    except ValueError:
        raise ValueError(f"{field} должен быть датой в формате YYYY-MM-DD")


def _parse_int(value, lo: int, hi: int, field: str) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} должен быть целым {lo}–{hi}")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{field} должен быть целым {lo}–{hi}")
    if not lo <= num <= hi:
        raise ValueError(f"{field} должен быть {lo}–{hi}")
    return num


def _client_date(request: web.Request, payload: Optional[dict] = None) -> str:
    """Локальная дата клиента: из параметра/тела, иначе серверная сегодня."""
    day = request.query.get("date", "")
    if not day and payload:
        day = str(payload.get("date", ""))
    if day:
        return _parse_date(day).isoformat()
    return date.today().isoformat()


# --- Цикл ---

def _cycle_state(user: db.sqlite3.Row, on_date: date) -> dict:
    state = cycle.build_cycle_state(
        user["cycle_start"], user["cycle_length"], user["period_length"],
        on_date=on_date,
    )
    state["name"] = user["name"]
    return state


async def cycle_api_handler(request: web.Request) -> web.Response:
    """GET /api/cycle?initData=... — данные цикла текущего пользователя."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    row = db.get_user(user_id)
    if row is None:
        return _err("user not found", 404)
    return web.json_response(_cycle_state(row, date.today()))


async def cycle_save_handler(request: web.Request) -> web.Response:
    """POST /api/cycle — сохранение данных цикла (и профиля) из мини-аппа.

    Тело: initData, cycle_start, cycle_length, опционально period_length,
    name, goals, notify. Пустые поля не перезаписывают имеющиеся.
    """
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))

    cycle_start = str(payload.get("cycle_start", "")).strip()
    if cycle_start:
        try:
            start = _parse_date(cycle_start, "cycle_start")
        except ValueError as exc:
            return _err(str(exc))
        if start > date.today():
            return _err("cycle_start в будущем")
    else:
        row = db.get_user(user_id)
        if row is None:
            return _err("cycle_start обязателен для нового пользователя")
        cycle_start = row["cycle_start"]

    try:
        cycle_length = _parse_int(
            payload.get("cycle_length") or DEFAULT_CYCLE_LENGTH,
            MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH, "cycle_length",
        )
    except ValueError as exc:
        return _err(str(exc))

    period_length = payload.get("period_length")
    if period_length in (None, ""):
        period_length = None
    else:
        try:
            period_length = _parse_int(
                period_length, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH,
                "period_length",
            )
        except ValueError as exc:
            return _err(str(exc))

    name = str(payload.get("name") or "").strip()[:64] or None
    goals = payload.get("goals")
    if goals is not None:
        if not isinstance(goals, list) or len(goals) > 10:
            return _err("goals должен быть массивом")
        goals = [str(g)[:64] for g in goals]
    notify = payload.get("notify")
    if notify is not None:
        if not isinstance(notify, dict):
            return _err("notify должен быть объектом")

    db.save_user(
        user_id, cycle_start, cycle_length,
        name=name, period_length=period_length,
        goals=goals, notify=notify,
    )
    row = db.get_user(user_id)
    return web.json_response(_cycle_state(row, date.today()))


# --- Рекомендации ---

def _recommend_workout(phase: Optional[str], day: str) -> Optional[dict]:
    """Тренировка дня: фаза → подмножество библиотеки → выбор по дате.

    Детерминированно: одна и та же тренировка весь день для всех,
    на следующий день — следующая из подходящих. Не индивидуальный план,
    а точечная персонализация общей библиотеки (спека, раздел 4).
    """
    workouts = db.list_workouts()
    if phase:
        suitable = [w for w in workouts if phase in w["phases"]]
    else:
        suitable = [w for w in workouts if w["intensity"] == "easy"]
    if not suitable:
        suitable = workouts
    if not suitable:
        return None
    epoch_day = (datetime.strptime(day, cycle.DATE_FORMAT).date()
                 - date(1970, 1, 1)).days
    return suitable[epoch_day % len(suitable)]


# --- Сегодня ---

async def today_api_handler(request: web.Request) -> web.Response:
    """GET /api/today?initData=...&date=... — сводка для экрана «Сегодня»."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    row = db.get_user(user_id)
    if row is None:
        return _err("user not found", 404)
    day = _client_date(request)

    on_date = _parse_date(day)
    state = _cycle_state(row, on_date)

    workout = _recommend_workout(state["phase"], day) if state["phase"] else None
    workout_done = False
    if workout is not None:
        done = db.get_workout_completion(user_id, workout["id"], day)
        workout_done = done is not None
        workout = {**workout, "completed": workout_done}

    wellbeing = db.get_wellbeing(user_id, day)
    nutrition = db.get_nutrition(user_id, day)

    habits = _habits_with_progress(user_id, day, on_date)
    habit_done = any(h["done_today"] for h in habits)

    total = 3  # тренировка · чек-ин · привычка
    done_count = int(workout_done) + int(wellbeing is not None) + int(habit_done)

    return web.json_response({
        "date": day,
        "cycle": state,
        "workout": workout,
        "wellbeing": dict(wellbeing) if wellbeing else None,
        "nutrition": dict(nutrition) if nutrition else None,
        "habits": habits,
        "progress": {"done": done_count, "total": total},
    })


def _habits_with_progress(user_id: int, day: str, on_date: date) -> list:
    """Активные привычки с отметкой за день и прогрессом текущей недели."""
    result = []
    week_start = (on_date - timedelta(days=on_date.weekday())).isoformat()
    week_end = (on_date + timedelta(days=6 - on_date.weekday())).isoformat()
    completions = db.get_habit_completions_range(user_id, week_start, week_end)
    by_habit: dict = {}
    for c in completions:
        by_habit.setdefault(c["user_habit_id"], set()).add(c["date"])
    for uh in db.get_user_habits(user_id):
        target = {"daily": 7, "3_per_week": 3, "5_per_week": 5,
                  "weekdays": 5}.get(uh["frequency"], 7)
        done_days = by_habit.get(uh["id"], set())
        result.append({
            **uh,
            "done_today": day in done_days,
            "week": {"done": len(done_days), "target": target},
        })
    return result


# --- Чек-ин Wellbeing ---

async def wellbeing_handler(request: web.Request) -> web.Response:
    """GET/POST /api/wellbeing — чек-ин «Как ты себя чувствуешь?»."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)

    if request.method == "GET":
        day = request.query.get("date", "")
        if day:
            row = db.get_wellbeing(user_id, _parse_date(day).isoformat())
            return web.json_response(
                {"date": day, "wellbeing": dict(row) if row else None}
            )
        try:
            from_d = _parse_date(request.query.get("from", ""), "from").isoformat()
            to_d = _parse_date(request.query.get("to", ""), "to").isoformat()
        except ValueError as exc:
            return _err(str(exc))
        rows = db.get_wellbeing_range(user_id, from_d, to_d)
        return web.json_response({"items": [dict(r) for r in rows]})

    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    day = _client_date(request, payload)
    try:
        energy = _parse_int(payload.get("energy"), db.ENERGY_MIN, db.ENERGY_MAX,
                            "energy")
        mood = _parse_int(payload.get("mood"), db.ENERGY_MIN, db.ENERGY_MAX,
                          "mood")
        feeling = _parse_int(payload.get("feeling"), db.FEELING_MIN,
                             db.FEELING_MAX, "feeling")
    except ValueError as exc:
        return _err(str(exc))
    db.save_wellbeing(user_id, day, energy, mood, feeling)
    return web.json_response(
        {"date": day, "energy": energy, "mood": mood, "feeling": feeling}
    )


# --- Симптомы ---

async def symptoms_handler(request: web.Request) -> web.Response:
    """GET/POST /api/symptoms — отметки симптомов и дней менструации."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)

    if request.method == "GET":
        try:
            from_d = _parse_date(request.query.get("from", ""), "from").isoformat()
            to_d = _parse_date(request.query.get("to", ""), "to").isoformat()
        except ValueError as exc:
            return _err(str(exc))
        rows = db.get_symptoms_range(user_id, from_d, to_d)
        return web.json_response({"items": [dict(r) for r in rows]})

    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    day = _client_date(request, payload)

    def opt_int(field: str, lo: int, hi: int) -> Optional[int]:
        value = payload.get(field)
        if value in (None, ""):
            return None
        return _parse_int(value, lo, hi, field)

    try:
        data = {
            "is_period": 1 if payload.get("is_period") else 0,
            "period_intensity": opt_int("period_intensity",
                                        db.PERIOD_INTENSITY_MIN,
                                        db.PERIOD_INTENSITY_MAX),
            "pain": opt_int("pain", db.PAIN_MIN, db.PAIN_MAX),
            "mood": opt_int("mood", db.ENERGY_MIN, db.ENERGY_MAX),
            "energy": opt_int("energy", db.ENERGY_MIN, db.ENERGY_MAX),
            "sleep_hours": None,
            "appetite": opt_int("appetite", db.APPETITE_MIN, db.APPETITE_MAX),
            "craving": str(payload.get("craving") or "").strip()[:120] or None,
            "bloating": None if payload.get("bloating") in (None, "")
                        else (1 if payload.get("bloating") else 0),
            "other": str(payload.get("other") or "").strip()[:500] or None,
        }
        sleep = payload.get("sleep_hours")
        if sleep not in (None, ""):
            hours = round(float(sleep), 1)
            if not 0 <= hours <= 24:
                raise ValueError("sleep_hours должен быть 0–24")
            data["sleep_hours"] = hours
    except ValueError as exc:
        return _err(str(exc))

    db.save_symptoms(user_id, day, data)
    row = db.get_symptoms(user_id, day)
    return web.json_response({"date": day, "symptoms": dict(row)})


# --- Тренировки ---

def _duration_ok(duration_min: int, bucket: str) -> bool:
    limits = {"10": 15, "20": 25, "30": 35}
    if bucket in limits:
        return duration_min <= limits[bucket]
    return True  # "40" — всё, включая длинные


async def workouts_handler(request: web.Request) -> web.Response:
    """GET /api/workouts?category=&duration=&intensity=&date= — каталог.

    Отдаёт библиотеку с флагом completed для указанной даты.
    """
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    day = _client_date(request)
    category = request.query.get("category", "")
    bucket = request.query.get("duration", "")
    intensity = request.query.get("intensity", "")

    items = []
    for w in db.list_workouts():
        if category and category != "all" and w["category"] != category:
            continue
        if intensity and w["intensity"] != intensity:
            continue
        if bucket and not _duration_ok(w["duration_min"], bucket):
            continue
        done = db.get_workout_completion(user_id, w["id"], day)
        items.append({**w, "completed": done is not None})
    return web.json_response({"date": day, "items": items})


async def workout_daily_handler(request: web.Request) -> web.Response:
    """GET /api/workouts/daily?date= — тренировка дня по фазе цикла."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    row = db.get_user(user_id)
    if row is None:
        return _err("user not found", 404)
    day = _client_date(request)
    on_date = _parse_date(day)
    state = _cycle_state(row, on_date)
    if not state["phase"]:
        return web.json_response({"date": day, "phase": None, "workout": None})
    workout = _recommend_workout(state["phase"], day)
    done = (db.get_workout_completion(user_id, workout["id"], day)
            if workout else None)
    return web.json_response({
        "date": day, "phase": state["phase"],
        "cycle_day": state["cycle_day"],
        "workout": {**workout, "completed": done is not None}
        if workout else None,
    })


async def workout_complete_handler(request: web.Request) -> web.Response:
    """POST /api/workouts/complete {initData, workout_id, date} — отметка."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    try:
        workout_id = _parse_int(payload.get("workout_id"), 1, 10**9,
                                "workout_id")
    except ValueError as exc:
        return _err(str(exc))
    workout = db.get_workout(workout_id)
    if workout is None:
        return _err("тренировка не найдена", 404)
    day = _client_date(request, payload)
    db.complete_workout(user_id, workout_id, day, workout["duration_min"])
    return web.json_response(
        {"date": day, "workout_id": workout_id, "completed": True,
         "minutes": workout["duration_min"]}
    )


# --- Рецепты ---

async def recipes_handler(request: web.Request) -> web.Response:
    """GET /api/recipes?category=&tag= — библиотека рецептов."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    category = request.query.get("category", "")
    tag = request.query.get("tag", "")
    return web.json_response(
        {"items": db.list_recipes(category or None, tag or None)}
    )


async def recipe_detail_handler(request: web.Request) -> web.Response:
    """GET /api/recipes/{id} — карточка рецепта."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    try:
        recipe_id = int(request.match_info["id"])
    except ValueError:
        return _err("id должен быть числом")
    recipe = db.get_recipe(recipe_id)
    if recipe is None:
        return _err("рецепт не найден", 404)
    return web.json_response(recipe)


# --- Питание ---

async def nutrition_handler(request: web.Request) -> web.Response:
    """GET/POST /api/nutrition — трекер приёмов пищи (факт отметки, без оценок)."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)

    if request.method == "GET":
        day = _client_date(request)
        row = db.get_nutrition(user_id, day)
        return web.json_response(
            {"date": day, "meals": dict(row) if row else None}
        )

    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    day = _client_date(request, payload)
    meals = {}
    for meal in db.MEALS:
        value = payload.get(meal)
        if value in (None, ""):
            row = db.get_nutrition(user_id, day)
            meals[meal] = row[meal] if row else 0
        else:
            meals[meal] = 1 if value else 0
    db.save_nutrition(user_id, day, **meals)
    return web.json_response({"date": day, "meals": meals})


# --- Привычки ---

async def habits_handler(request: web.Request) -> web.Response:
    """GET /api/habits?date= — библиотека + мои привычки с прогрессом."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    day = _client_date(request)
    on_date = _parse_date(day)
    return web.json_response({
        "date": day,
        "library": db.list_habit_library(),
        "mine": _habits_with_progress(user_id, day, on_date),
    })


async def habit_add_handler(request: web.Request) -> web.Response:
    """POST /api/habits {habit_id, frequency, reminder_time?} — добавить."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    try:
        habit_id = _parse_int(payload.get("habit_id"), 1, 10**9, "habit_id")
    except ValueError as exc:
        return _err(str(exc))
    frequency = str(payload.get("frequency", "daily"))
    if frequency not in db.FREQUENCIES:
        return _err(f"frequency должен быть одним из {list(db.FREQUENCIES)}")
    reminder = payload.get("reminder_time")
    reminder = str(reminder).strip()[:5] if reminder else None
    if reminder and not _valid_hhmm(reminder):
        return _err("reminder_time должен быть в формате HH:MM")
    uh_id = db.add_user_habit(user_id, habit_id, frequency, reminder)
    return web.json_response({"id": uh_id, "active": True})


def _valid_hhmm(value: str) -> bool:
    try:
        hours, minutes = value.split(":")
        return 0 <= int(hours) <= 23 and 0 <= int(minutes) <= 59
    except (ValueError, AttributeError):
        return False


async def habit_toggle_handler(request: web.Request) -> web.Response:
    """POST /api/habits/{id}/toggle {date} — отметка/отмена за день."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    try:
        uh_id = int(request.match_info["id"])
    except ValueError:
        return _err("id должен быть числом")
    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    day = _client_date(request, payload)
    try:
        done = db.toggle_habit_completion(user_id, uh_id, day)
    except ValueError as exc:
        return _err(str(exc), 404)
    return web.json_response({"date": day, "done": done})


async def habit_patch_handler(request: web.Request) -> web.Response:
    """PATCH /api/habits/{id} {active?, reminder_time?}."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    try:
        uh_id = int(request.match_info["id"])
    except ValueError:
        return _err("id должен быть числом")
    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))
    active = payload.get("active")
    if active is not None:
        active = bool(active)
    reminder = payload.get("reminder_time")
    if reminder is not None:
        reminder = str(reminder).strip()[:5] or None
        if reminder and not _valid_hhmm(reminder):
            return _err("reminder_time должен быть в формате HH:MM")
    ok = db.set_user_habit(user_id, uh_id, active=active,
                           reminder_time=reminder)
    if not ok:
        return _err("привычка не найдена", 404)
    return web.json_response({"id": uh_id, "ok": True})


# --- Прогресс ---

async def progress_api_handler(request: web.Request) -> web.Response:
    """GET /api/progress?month=YYYY-MM&date=... — статистика месяца.

    Отдаёт агрегаты и покрытие по дням (workouts/nutrition/habits/wellbeing),
    чтобы фронт рисовал неделю и месяц без дополнительных запросов.
    Регулярность недели — % дней с хотя бы одной отметкой
    (сравнение только «я сейчас ↔ я раньше»).
    """
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    today = _parse_date(_client_date(request))
    month_param = request.query.get("month", "")
    if month_param:
        try:
            month_start = datetime.strptime(month_param, "%Y-%m").date()
            month_start = month_start.replace(day=1)
        except ValueError:
            return _err("month должен быть в формате YYYY-MM")
    else:
        month_start = today.replace(day=1)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)
    month_end -= timedelta(days=1)
    end = min(today, month_end)

    from_d, to_d = month_start.isoformat(), end.isoformat()
    workouts = db.get_workout_completions_range(user_id, from_d, to_d)
    nutrition = db.get_nutrition_range(user_id, from_d, to_d)
    habits = db.get_habit_completions_range(user_id, from_d, to_d)
    wellbeing = db.get_wellbeing_range(user_id, from_d, to_d)

    days: dict = {}
    for d in (month_start + timedelta(days=i)
              for i in range((end - month_start).days + 1)):
        days[d.isoformat()] = {"workouts": 0, "minutes": 0, "nutrition": 0,
                               "habits": 0, "wellbeing": False}
    total_minutes = 0
    for w in workouts:
        if w["date"] in days:
            days[w["date"]]["workouts"] += 1
            days[w["date"]]["minutes"] += w["minutes"]
            total_minutes += w["minutes"]
    nutrition_days = 0
    for n in nutrition:
        if n["date"] in days:
            count = (n["breakfast"] + n["lunch"] + n["dinner"] + n["snack"])
            days[n["date"]]["nutrition"] = count
            if count:
                nutrition_days += 1
    habit_done = 0
    for h in habits:
        if h["date"] in days:
            days[h["date"]]["habits"] += 1
            habit_done += 1
    for wb in wellbeing:
        if wb["date"] in days:
            days[wb["date"]]["wellbeing"] = True

    elapsed = (end - month_start).days + 1
    active_days = sum(
        1 for v in days.values()
        if v["workouts"] or v["nutrition"] or v["habits"] or v["wellbeing"]
    )

    # Динамика регулярности по полным неделям месяца (пн–вс)
    weeks = []
    first_monday = month_start - timedelta(days=month_start.weekday())
    w_start = first_monday
    while w_start <= end:
        w_end = w_start + timedelta(days=6)
        covered = [d for d in days if w_start.isoformat() <= d <= w_end.isoformat()]
        if covered:
            w_active = sum(1 for d in covered if any(days[d].values()))
            weeks.append({
                "from": max(w_start, month_start).isoformat(),
                "to": min(w_end, end).isoformat(),
                "pct": round(100 * w_active / len(covered)),
            })
        w_start = w_end + timedelta(days=1)

    return web.json_response({
        "month": month_start.strftime("%Y-%m"),
        "workouts_completed": len(workouts),
        "active_minutes": total_minutes,
        "nutrition_days": nutrition_days,
        "habit_completions": habit_done,
        "regularity_pct": round(100 * active_days / elapsed) if elapsed else 0,
        "weeks": weeks,
        "days": days,
    })


# --- Пользователь ---

def _user_profile(row: db.sqlite3.Row) -> dict:
    on_date = date.today()
    state = cycle.build_cycle_state(
        row["cycle_start"], row["cycle_length"], row["period_length"],
        on_date=on_date,
    )
    goals = json.loads(row["goals"]) if row["goals"] else []
    return {
        "name": row["name"],
        "goals": goals,
        "notify": {key: bool(row[f"notify_{key}"]) for key in NOTIFY_KEYS},
        "units": {"weight": row["units_weight"], "height": row["units_height"]},
        "subscription": {
            "plan": row["subscription_plan"],
            "until": row["subscription_until"],
        },
        "cycle": state,
        "created_at": row["created_at"],
    }


async def user_api_handler(request: web.Request) -> web.Response:
    """GET /api/user — профиль (цели, уведомления, подписка, цикл)."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    row = db.get_user(user_id)
    if row is None:
        return _err("user not found", 404)
    return web.json_response(_user_profile(row))


async def user_patch_handler(request: web.Request) -> web.Response:
    """PATCH /api/user — имя, цели, уведомления, единицы."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    row = db.get_user(user_id)
    if row is None:
        return _err("user not found", 404)
    try:
        payload = await _json_payload(request)
    except ValueError as exc:
        return _err(str(exc))

    goals = payload.get("goals")
    if goals is not None:
        if not isinstance(goals, list) or len(goals) > 10:
            return _err("goals должен быть массивом")
        goals = [str(g)[:64] for g in goals]
    notify = payload.get("notify")
    if notify is not None:
        if not isinstance(notify, dict):
            return _err("notify должен быть объектом")
        notify = {k: bool(v) for k, v in notify.items() if k in NOTIFY_KEYS}
    units = payload.get("units")
    if units is not None:
        if not isinstance(units, dict):
            return _err("units должен быть объектом")
        for key, allowed in UNITS_VALUES.items():
            if key in units and units[key] not in allowed:
                return _err(f"units.{key} должен быть одним из {allowed}")
    name = str(payload.get("name") or "").strip()[:64] or None

    db.save_user(
        user_id, row["cycle_start"], row["cycle_length"],
        name=name, goals=goals, notify=notify, units=units,
    )
    return web.json_response(_user_profile(db.get_user(user_id)))


async def user_delete_handler(request: web.Request) -> web.Response:
    """DELETE /api/user — полное удаление аккаунта и данных (privacy)."""
    user_id = await _user_id(request)
    if user_id is None:
        return _err("invalid initData", 401)
    db.delete_user(user_id)
    return web.json_response({"deleted": True})


# --- Регистрация маршрутов ---

def setup_routes(app: web.Application) -> None:
    """Подключает все API-маршруты к приложению aiohttp."""
    app.router.add_get("/api/cycle", cycle_api_handler)
    app.router.add_post("/api/cycle", cycle_save_handler)
    app.router.add_get("/api/today", today_api_handler)
    app.router.add_route("*", "/api/wellbeing", wellbeing_handler)
    app.router.add_route("*", "/api/symptoms", symptoms_handler)
    app.router.add_get("/api/workouts", workouts_handler)
    app.router.add_get("/api/workouts/daily", workout_daily_handler)
    app.router.add_post("/api/workouts/complete", workout_complete_handler)
    app.router.add_get("/api/recipes", recipes_handler)
    app.router.add_get("/api/recipes/{id}", recipe_detail_handler)
    app.router.add_route("*", "/api/nutrition", nutrition_handler)
    app.router.add_get("/api/habits", habits_handler)
    app.router.add_post("/api/habits", habit_add_handler)
    app.router.add_post("/api/habits/{id}/toggle", habit_toggle_handler)
    app.router.add_patch("/api/habits/{id}", habit_patch_handler)
    app.router.add_get("/api/progress", progress_api_handler)
    app.router.add_get("/api/user", user_api_handler)
    app.router.add_patch("/api/user", user_patch_handler)
    app.router.add_delete("/api/user", user_delete_handler)
