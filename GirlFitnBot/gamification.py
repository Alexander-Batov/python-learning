"""Мотивационная система «Твой путь к себе» (Мотивационная_система.md).

Единый конфиг начислений, порогов и каталогов (уровни, достижения, призы)
+ сервис award_points() с идемпотентностью и проверкой достижений.

Абсолютные правила:
- прогресс не обнуляется: баллы не списываются за снятые отметки;
  списание только при обмене призов — и только из баланса,
  уровень (от total_earned) не понижается;
- никакой вины в текстах и механиках.
"""

import json
import logging
import sqlite3
from datetime import date, timedelta
from typing import Optional

import db
from config import config

logger = logging.getLogger(__name__)

# --- Начисления «лепестки заботы» (константы — не хардкодить в компонентах) ---
POINTS = {
    "workout": 30,      # тренировка выполнена
    "nutrition": 15,    # питание отмечено (день полностью)
    "water": 10,        # норма воды за день
    "habit": 10,        # привычка выполнена
    "checkin": 5,       # чек-ин самочувствия
    "day_bonus": 20,    # день полностью закрыт (бонус)
    "levelup": 0,       # служебный источник (переход уровня не начисляет)
    "admin": 0,         # ручная корректировка
}

WATER_NORM_GLASSES = 8   # норма воды за день (стаканы по ~250 мл)
WATER_GLASS_ML = 250

# --- Уровни — этапы роста. Уровень считается от total_earned,
# обмен призов списывает баланс и НЕ понижает уровень ---
LEVELS = [
    {"num": 1, "name": "Начало", "min": 0, "max": 100,
     "description": "Первые шаги к заботе о себе"},
    {"num": 2, "name": "Баланс", "min": 101, "max": 250,
     "description": "Формируешь привычки"},
    {"num": 3, "name": "Энергия", "min": 251, "max": 450,
     "description": "Чувствуешь себя лучше"},
    {"num": 4, "name": "Гармония", "min": 451, "max": 700,
     "description": "Живёшь в ресурсе"},
    {"num": 5, "name": "Расцвет", "min": 701, "max": None,
     "description": "Твоя сила в регулярности"},
]

# --- Достижения: стартовый набор (расширяемый).
# condition: {type, threshold} — типы см. _condition_progress() ---
ACHIEVEMENTS = [
    {"id": "care_3", "title": "3 дня заботы", "category": "activity",
     "description": "Три дня с заботой о себе — отличное начало",
     "condition": {"type": "active_days_total", "threshold": 3},
     "icon": "sprout"},
    {"id": "streak_7", "title": "7 дней подряд", "category": "activity",
     "description": "Неделя ежедневной заботы — это уже привычка",
     "condition": {"type": "streak_days", "threshold": 7},
     "icon": "leaf"},
    {"id": "streak_14", "title": "14 дней подряд", "category": "activity",
     "description": "Две недели рядом с собой — гордимся тобой",
     "condition": {"type": "streak_days", "threshold": 14},
     "icon": "branch"},
    {"id": "water_5l", "title": "Вода", "category": "nutrition",
     "description": "5 литров воды суммарно — тело благодарит",
     "condition": {"type": "water_ml", "threshold": 5000},
     "icon": "drop"},
    {"id": "workouts_10", "title": "Тренировка", "category": "activity",
     "description": "10 выполненных тренировок",
     "condition": {"type": "workouts_total", "threshold": 10},
     "icon": "heart"},
    {"id": "nutrition_7", "title": "Питание", "category": "nutrition",
     "description": "7 дней с отмеченным питанием",
     "condition": {"type": "nutrition_days", "threshold": 7},
     "icon": "plate"},
    {"id": "calm_3", "title": "Спокойствие", "category": "other",
     "description": "3 восстанавливающие практики",
     "condition": {"type": "recovery_workouts", "threshold": 3},
     "icon": "moon"},
    {"id": "selflove_7", "title": "Любовь к себе", "category": "cycle",
     "description": "7 дней чек-инов подряд — ты в контакте с собой",
     "condition": {"type": "checkin_streak", "threshold": 7},
     "icon": "flower"},
]

# --- Призы: стартовый каталог ---
REWARDS = [
    {"id": "guide_nutrition", "title": "Гайд по питанию для твоей фазы цикла",
     "description": "Материал с мягкими рекомендациями по фазам",
     "category": "полезное", "price": 500, "icon": "plate"},
    {"id": "stats_pro", "title": "Доступ к расширенной статистике",
     "description": "Глубже видеть свою динамику заботы о себе",
     "category": "полезное", "price": 700, "icon": "chart"},
    {"id": "yoga_discount", "title": "Скидка 15% на йога-курс",
     "description": "Промокод для партнёрского курса",
     "category": "скидки", "price": 1000, "icon": "gift"},
    {"id": "meditation_lesson", "title": "Урок медитации",
     "description": "Спокойная практика на 15 минут для любого дня",
     "category": "красота", "price": 300, "icon": "moon"},
]

REMINDER_TYPES = [
    {"id": "workout", "label": "Тренировка", "default_time": "19:00"},
    {"id": "nutrition", "label": "Питание", "default_time": "12:30"},
    {"id": "water", "label": "Вода", "default_time": "14:00"},
    {"id": "vitamins", "label": "Витамины", "default_time": "09:00"},
    {"id": "cycle_start", "label": "Начало цикла", "default_time": "09:00"},
    {"id": "habit", "label": "Привычка", "default_time": "20:00"},
    {"id": "checkin", "label": "Чек-ин", "default_time": "21:00"},
    {"id": "day_plan", "label": "План дня", "default_time": "09:00"},
]


# --- Уровни ---

def level_for(total_earned: int) -> dict:
    for level in LEVELS:
        if level["max"] is None or total_earned <= level["max"]:
            return level
    return LEVELS[-1]


def next_level(level: dict) -> Optional[dict]:
    for item in LEVELS:
        if item["num"] == level["num"] + 1:
            return item
    return None


# --- Начисление ---

def award_points(
    tg_id: int, source: str, ref_id: Optional[str] = None, day: Optional[str] = None
) -> dict:
    """Начисляет баллы за действие. Идемпотентно: повторное начисление
    за тот же (source, ref_id, day) игнорируется (unique-индекс).
    Возвращает {"awarded", "amount", "balance", "total_earned", "leveled_up"}.
    """
    amount = POINTS.get(source, 0)
    ref = str(ref_id if ref_id is not None else day or "-")
    day = day or date.today().isoformat()
    leveled_up = None
    with sqlite3.connect(config.db_path) as conn:
        before = _get_points(conn, tg_id)
        if amount > 0:
            try:
                conn.execute(
                    "INSERT INTO points_transactions "
                    "(tg_id, amount, source, ref_id, date) VALUES (?, ?, ?, ?, ?)",
                    (tg_id, amount, source, ref, day),
                )
            except sqlite3.IntegrityError:
                # уже начислено за это действие — не дублируем
                row = _get_points(conn, tg_id)
                return {"awarded": False, "amount": 0, "balance": row["balance"],
                        "total_earned": row["total_earned"], "leveled_up": None}
        _recalc_points(conn, tg_id)
        after = _get_points(conn, tg_id)
        lvl_before = level_for(before["total_earned"])
        lvl_after = level_for(after["total_earned"])
        if lvl_after["num"] > lvl_before["num"]:
            leveled_up = lvl_after
    return {"awarded": amount > 0, "amount": amount,
            "balance": after["balance"], "total_earned": after["total_earned"],
            "leveled_up": leveled_up}


def _get_points(conn: sqlite3.Connection, tg_id: int) -> sqlite3.Row:
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT balance, total_earned FROM user_points WHERE tg_id = ?",
        (tg_id,),
    ).fetchone()
    if row is None:
        conn.execute(
            "INSERT OR IGNORE INTO user_points (tg_id, balance, total_earned,"
            " updated_at) VALUES (?, 0, 0, datetime('now'))", (tg_id,))
        row = conn.execute(
            "SELECT balance, total_earned FROM user_points WHERE tg_id = ?",
            (tg_id,),
        ).fetchone()
    return row


def _recalc_points(conn: sqlite3.Connection, tg_id: int) -> None:
    conn.execute(
        """
        INSERT INTO user_points (tg_id, balance, total_earned, updated_at)
        SELECT ?, 0, 0, datetime('now')
        WHERE NOT EXISTS (SELECT 1 FROM user_points WHERE tg_id = ?)
        """,
        (tg_id, tg_id),
    )
    conn.execute(
        """
        UPDATE user_points SET
            balance = COALESCE((SELECT SUM(amount) FROM points_transactions
                                WHERE tg_id = ?), 0)
                      - COALESCE((SELECT SUM(price) FROM user_rewards
                                  WHERE tg_id = ? AND status = 'active'), 0),
            total_earned = COALESCE((SELECT SUM(amount) FROM points_transactions
                                     WHERE tg_id = ? AND amount > 0), 0),
            updated_at = datetime('now')
        WHERE tg_id = ?
        """,
        (tg_id, tg_id, tg_id, tg_id),
    )


def get_points(tg_id: int) -> dict:
    with sqlite3.connect(config.db_path) as conn:
        row = _get_points(conn, tg_id)
    return {"balance": row["balance"], "total_earned": row["total_earned"]}


def points_payload(tg_id: int) -> dict:
    """Баланс, уровень и прогресс для карточки уровня."""
    pts = get_points(tg_id)
    level = level_for(pts["total_earned"])
    nxt = next_level(level)
    balance = max(0, pts["balance"])
    threshold = nxt["min"] if nxt else None
    pct = 0
    if nxt:
        span = nxt["min"] - level["min"]
        done = min(max(balance - level["min"], 0), span)
        pct = round(100 * done / span) if span else 0
    return {
        "balance": balance,
        "total_earned": pts["total_earned"],
        "level": level,
        "next": nxt,
        "next_threshold": threshold,
        "pct": pct,
        "levels_total": len(LEVELS),
    }


# --- Достижения ---

def _streak_days(conn: sqlite3.Connection, tg_id: int) -> int:
    """Дней подряд с любым начислением баллов (по датам транзакций)."""
    rows = conn.execute(
        "SELECT DISTINCT date FROM points_transactions WHERE tg_id = ? AND amount > 0",
        (tg_id,),
    ).fetchall()
    days = sorted((r[0] for r in rows), reverse=True)
    if not days:
        return 0
    streak = 1
    current = date.fromisoformat(days[0])
    for d in days[1:]:
        prev = date.fromisoformat(d)
        if (current - prev).days == 1:
            streak += 1
            current = prev
        elif (current - prev).days > 1:
            break
    return streak


def _checkin_streak(conn: sqlite3.Connection, tg_id: int) -> int:
    rows = conn.execute(
        "SELECT date FROM points_transactions WHERE tg_id = ? AND source = 'checkin'",
        (tg_id,),
    ).fetchall()
    days = sorted((r[0] for r in rows), reverse=True)
    if not days:
        return 0
    streak = 1
    current = date.fromisoformat(days[0])
    for d in days[1:]:
        prev = date.fromisoformat(d)
        if (current - prev).days == 1:
            streak += 1
            current = prev
        elif (current - prev).days > 1:
            break
    return streak


def _condition_progress(conn: sqlite3.Connection, tg_id: int, cond: dict) -> int:
    ctype = cond["type"]
    if ctype == "active_days_total":
        row = conn.execute(
            "SELECT COUNT(DISTINCT date) FROM points_transactions "
            "WHERE tg_id = ? AND amount > 0", (tg_id,)).fetchone()
        return row[0]
    if ctype == "streak_days":
        return _streak_days(conn, tg_id)
    if ctype == "water_ml":
        row = conn.execute(
            "SELECT COALESCE(SUM(glasses), 0) FROM water_logs WHERE tg_id = ?",
            (tg_id,)).fetchone()
        return row[0] * WATER_GLASS_ML
    if ctype == "workouts_total":
        row = conn.execute(
            "SELECT COUNT(*) FROM workout_completions WHERE tg_id = ?",
            (tg_id,)).fetchone()
        return row[0]
    if ctype == "nutrition_days":
        row = conn.execute(
            "SELECT COUNT(*) FROM nutrition_logs WHERE tg_id = ? "
            "AND (breakfast + lunch + dinner + snack) > 0", (tg_id,)).fetchone()
        return row[0]
    if ctype == "recovery_workouts":
        row = conn.execute(
            """
            SELECT COUNT(*) FROM workout_completions wc
            JOIN workouts w ON w.id = wc.workout_id
            WHERE wc.tg_id = ? AND w.category = 'recovery'
            """,
            (tg_id,)).fetchone()
        return row[0]
    if ctype == "checkin_streak":
        return _checkin_streak(conn, tg_id)
    return 0


def check_achievements(tg_id: int) -> list:
    """Выдаёт новые достижения (вернёт список полученных сейчас)."""
    earned_now = []
    with sqlite3.connect(config.db_path) as conn:
        for ach in ACHIEVEMENTS:
            exists = conn.execute(
                "SELECT 1 FROM user_achievements WHERE tg_id = ? "
                "AND achievement_id = ?", (tg_id, ach["id"])).fetchone()
            if exists:
                continue
            progress = _condition_progress(conn, tg_id, ach["condition"])
            if progress >= ach["condition"]["threshold"]:
                conn.execute(
                    "INSERT OR IGNORE INTO user_achievements "
                    "(tg_id, achievement_id, earned_at) VALUES (?, ?, datetime('now'))",
                    (tg_id, ach["id"]),
                )
                earned_now.append(ach)
    if earned_now:
        logger.info("Достижения выданы tg_id=%s: %s",
                    tg_id, [a["id"] for a in earned_now])
    return earned_now


def achievements_payload(tg_id: int) -> dict:
    """Каталог с флагами earned и прогрессом; ближайшее неполученное — для баннера."""
    with sqlite3.connect(config.db_path) as conn:
        earned_rows = conn.execute(
            "SELECT achievement_id, earned_at FROM user_achievements WHERE tg_id = ?",
            (tg_id,),
        ).fetchall()
        earned_map = {r[0]: r[1] for r in earned_rows}
        items = []
        for ach in ACHIEVEMENTS:
            progress = _condition_progress(conn, tg_id, ach["condition"])
            threshold = ach["condition"]["threshold"]
            items.append({
                **ach,
                "earned": ach["id"] in earned_map,
                "earned_at": earned_map.get(ach["id"]),
                "progress": min(progress, threshold),
                "threshold": threshold,
            })
    nxt = next((a for a in items if not a["earned"]), None)
    return {"items": items, "next": nxt}


# --- Призы ---

def rewards_payload(tg_id: int) -> dict:
    with sqlite3.connect(config.db_path) as conn:
        rows = conn.execute(
            "SELECT reward_id, exchanged_at, status FROM user_rewards "
            "WHERE tg_id = ? AND status = 'active'", (tg_id,),
        ).fetchall()
        owned = {r[0]: {"exchanged_at": r[1], "status": r[2]} for r in rows}
    return {
        "points": get_points(tg_id),
        "items": [{**r, "owned": r["id"] in owned} for r in REWARDS],
    }


def exchange_reward(tg_id: int, reward_id: str) -> dict:
    """Обмен баллов на приз: списывает баланс, уровень НЕ понижает
    (уровень от total_earned). Недостаточно баллов — ValueError."""
    reward = next((r for r in REWARDS if r["id"] == reward_id), None)
    if reward is None:
        raise ValueError("приз не найден")
    with sqlite3.connect(config.db_path) as conn:
        owned = conn.execute(
            "SELECT 1 FROM user_rewards WHERE tg_id = ? AND reward_id = ? "
            "AND status = 'active'", (tg_id, reward_id)).fetchone()
        if owned:
            raise ValueError("приз уже получен")
        _recalc_points(conn, tg_id)
        row = _get_points(conn, tg_id)
        if row["balance"] < reward["price"]:
            raise ValueError(f"не хватает {reward['price'] - row['balance']}")
        conn.execute(
            "INSERT INTO user_rewards (tg_id, reward_id, price, exchanged_at,"
            " status) VALUES (?, ?, ?, datetime('now'), 'active')",
            (tg_id, reward_id, reward["price"]),
        )
        _recalc_points(conn, tg_id)
        after = _get_points(conn, tg_id)
    return {"exchanged": True, "reward": reward, "balance": after["balance"]}


# --- Напоминания (экран «Напоминания») ---

def get_reminders(tg_id: int) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, type, time, enabled, days FROM reminders "
            "WHERE tg_id = ? ORDER BY time", (tg_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def upsert_reminder(
    tg_id: int, rtype: str, time: str, enabled: bool = True,
    days: str = "daily", reminder_id: Optional[int] = None,
) -> int:
    if rtype not in {t["id"] for t in REMINDER_TYPES}:
        raise ValueError("неизвестный тип напоминания")
    with sqlite3.connect(config.db_path) as conn:
        if reminder_id:
            conn.execute(
                "UPDATE reminders SET time = ?, enabled = ?, days = ? "
                "WHERE id = ? AND tg_id = ?",
                (time, 1 if enabled else 0, days, reminder_id, tg_id),
            )
            return reminder_id
        cur = conn.execute(
            "INSERT INTO reminders (tg_id, type, time, enabled, days) "
            "VALUES (?, ?, ?, ?, ?)",
            (tg_id, rtype, time, 1 if enabled else 0, days),
        )
        return cur.lastrowid


def delete_reminder(tg_id: int, reminder_id: int) -> None:
    with sqlite3.connect(config.db_path) as conn:
        conn.execute("DELETE FROM reminders WHERE id = ? AND tg_id = ?",
                     (reminder_id, tg_id))


def patch_reminder(
    tg_id: int, reminder_id: int,
    time: Optional[str] = None, enabled: Optional[bool] = None,
) -> None:
    """Обновляет время/включённость; ValueError, если запись не найдена."""
    sets, params = [], []
    if time is not None and time != "":
        sets.append("time = ?")
        params.append(time)
    if enabled is not None:
        sets.append("enabled = ?")
        params.append(1 if enabled else 0)
    if not sets:
        return
    params += [tg_id, reminder_id]
    with sqlite3.connect(config.db_path) as conn:
        cur = conn.execute(
            f"UPDATE reminders SET {', '.join(sets)} "
            "WHERE tg_id = ? AND id = ?",
            params,
        )
    if cur.rowcount == 0:
        raise ValueError("напоминание не найдено")


# --- Вода ---

def save_water(tg_id: int, day: str, glasses: int) -> int:
    glasses = max(0, min(glasses, 16))
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            INSERT INTO water_logs (tg_id, date, glasses) VALUES (?, ?, ?)
            ON CONFLICT(tg_id, date) DO UPDATE SET glasses = excluded.glasses
            """,
            (tg_id, day, glasses),
        )
    return glasses


def get_water(tg_id: int, day: str) -> int:
    with sqlite3.connect(config.db_path) as conn:
        row = conn.execute(
            "SELECT glasses FROM water_logs WHERE tg_id = ? AND date = ?",
            (tg_id, day),
        ).fetchone()
    return row[0] if row else 0


# --- Бонус за закрытый день ---

def check_day_bonus(tg_id: int, day: str) -> None:
    """+20, если закрыты все блоки дня: тренировка, питание (≥1 приёма),
    вода (норма), привычка, чек-ин. Не вычитается никогда."""
    with sqlite3.connect(config.db_path) as conn:
        workout = conn.execute(
            "SELECT 1 FROM workout_completions WHERE tg_id = ? AND date = ?",
            (tg_id, day)).fetchone()
        nutrition = conn.execute(
            "SELECT 1 FROM nutrition_logs WHERE tg_id = ? AND date = ? "
            "AND (breakfast + lunch + dinner + snack) > 0", (tg_id, day)).fetchone()
        water = conn.execute(
            "SELECT 1 FROM water_logs WHERE tg_id = ? AND date = ? AND glasses >= ?",
            (tg_id, day, WATER_NORM_GLASSES)).fetchone()
        habit = conn.execute(
            "SELECT 1 FROM habit_completions hc JOIN user_habits uh "
            "ON uh.id = hc.user_habit_id WHERE uh.tg_id = ? AND hc.date = ?",
            (tg_id, day)).fetchone()
        checkin = conn.execute(
            "SELECT 1 FROM wellbeing WHERE tg_id = ? AND date = ?",
            (tg_id, day)).fetchone()
    if all([workout, nutrition, water, habit, checkin]):
        award_points(tg_id, "day_bonus", day=day)


def care_day_status(tg_id: int, day: str) -> dict:
    """Флаги блоков дня для «Твой день заботы» и карточки уровня."""
    with sqlite3.connect(config.db_path) as conn:
        workout = bool(conn.execute(
            "SELECT 1 FROM workout_completions WHERE tg_id = ? AND date = ?",
            (tg_id, day)).fetchone())
        nutrition_row = conn.execute(
            "SELECT (breakfast + lunch + dinner + snack) AS meals "
            "FROM nutrition_logs WHERE tg_id = ? AND date = ?",
            (tg_id, day)).fetchone()
        nutrition = bool(nutrition_row and nutrition_row[0] > 0)
        water_row = conn.execute(
            "SELECT glasses FROM water_logs WHERE tg_id = ? AND date = ?",
            (tg_id, day)).fetchone()
        glasses = water_row[0] if water_row else 0
        habit = bool(conn.execute(
            "SELECT 1 FROM habit_completions hc JOIN user_habits uh "
            "ON uh.id = hc.user_habit_id WHERE uh.tg_id = ? AND hc.date = ?",
            (tg_id, day)).fetchone())
        checkin = bool(conn.execute(
            "SELECT 1 FROM wellbeing WHERE tg_id = ? AND date = ?",
            (tg_id, day)).fetchone())
    return {
        "workout": workout,
        "nutrition": nutrition,
        "water": glasses >= WATER_NORM_GLASSES,
        "water_glasses": glasses,
        "water_norm": WATER_NORM_GLASSES,
        "habit": habit,
        "checkin": checkin,
    }


def gamification_summary(tg_id: int, day: str) -> dict:
    return {
        "points": points_payload(tg_id),
        "care_day": care_day_status(tg_id, day),
        "water_glasses": get_water(tg_id, day),
    }
