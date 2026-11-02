"""Хранение данных пользователей и контент-библиотек в SQLite.

Сущности по спецификации (Структура_данных.md, раздел 5):
users (расширен: цели, уведомления, подписка, единицы), wellbeing (чек-ин),
cycle_symptoms (симптомы и дни менструации), workouts + workout_completions,
recipes, nutrition_logs (трекер приёмов пищи),
habits + user_habits + habit_completions.

Библиотеки (тренировки/рецепты/привычки) сидятся из webapp/data/*.json
при первом старте, если таблицы пустые — правка контента не требует кода.
"""

import json
import logging
import sqlite3
from pathlib import Path
from typing import Optional

from config import config

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "webapp" / "data"

# Допустимые диапазоны (валидация — в api.py)
ENERGY_MIN, ENERGY_MAX = 1, 5        # чек-ин: энергия/настроение, 5 уровней
FEELING_MIN, FEELING_MAX = 0, 2      # самочувствие: плохо/нормально/хорошо
PAIN_MIN, PAIN_MAX = 0, 3            # боль: нет/лёгкая/умеренная/сильная
APPETITE_MIN, APPETITE_MAX = 0, 2    # аппетит: слабый/обычный/повышенный
PERIOD_INTENSITY_MIN, PERIOD_INTENSITY_MAX = 1, 3  # скудные/умеренные/обильные

FREQUENCIES = ("daily", "3_per_week", "5_per_week", "weekdays")


def init() -> None:
    """Создаёт таблицы (если нет), мигрирует users, сидит библиотеки."""
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                tg_id         INTEGER PRIMARY KEY,
                name          TEXT NOT NULL DEFAULT '',
                cycle_start   TEXT NOT NULL,
                cycle_length  INTEGER NOT NULL,
                period_length INTEGER NOT NULL DEFAULT 5,
                goals         TEXT,              -- JSON-массив целей
                notify_plan   INTEGER NOT NULL DEFAULT 0,
                notify_workout INTEGER NOT NULL DEFAULT 0,
                notify_habit  INTEGER NOT NULL DEFAULT 0,
                notify_vitamins INTEGER NOT NULL DEFAULT 0,
                notify_checkin INTEGER NOT NULL DEFAULT 0,
                notify_period INTEGER NOT NULL DEFAULT 0,
                subscription_plan TEXT NOT NULL DEFAULT 'free',
                subscription_until TEXT,         -- дата списания, YYYY-MM-DD
                units_weight  TEXT NOT NULL DEFAULT 'kg',
                units_height  TEXT NOT NULL DEFAULT 'cm',
                created_at    TEXT NOT NULL
            )
            """
        )
        # Миграции: колонки добавляются к существующей таблице, если ещё нет
        cols = [row[1] for row in conn.execute("PRAGMA table_info(users)")]
        migrations = {
            "name": "ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''",
            "period_length":
                "ALTER TABLE users ADD COLUMN period_length "
                "INTEGER NOT NULL DEFAULT 5",
            "goals": "ALTER TABLE users ADD COLUMN goals TEXT",
            "notify_plan":
                "ALTER TABLE users ADD COLUMN notify_plan INTEGER NOT NULL DEFAULT 0",
            "notify_workout":
                "ALTER TABLE users ADD COLUMN notify_workout "
                "INTEGER NOT NULL DEFAULT 0",
            "notify_habit":
                "ALTER TABLE users ADD COLUMN notify_habit "
                "INTEGER NOT NULL DEFAULT 0",
            "notify_vitamins":
                "ALTER TABLE users ADD COLUMN notify_vitamins "
                "INTEGER NOT NULL DEFAULT 0",
            "notify_checkin":
                "ALTER TABLE users ADD COLUMN notify_checkin "
                "INTEGER NOT NULL DEFAULT 0",
            "notify_period":
                "ALTER TABLE users ADD COLUMN notify_period "
                "INTEGER NOT NULL DEFAULT 0",
            "subscription_plan":
                "ALTER TABLE users ADD COLUMN subscription_plan "
                "TEXT NOT NULL DEFAULT 'free'",
            "subscription_until":
                "ALTER TABLE users ADD COLUMN subscription_until TEXT",
            "units_weight":
                "ALTER TABLE users ADD COLUMN units_weight "
                "TEXT NOT NULL DEFAULT 'kg'",
            "units_height":
                "ALTER TABLE users ADD COLUMN units_height "
                "TEXT NOT NULL DEFAULT 'cm'",
        }
        for col, sql in migrations.items():
            if col not in cols:
                conn.execute(sql)
                logger.info("Миграция users: добавлена колонка %s", col)

        # Чек-ин самочувствия: один день = одна запись
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wellbeing (
                tg_id  INTEGER NOT NULL,
                date   TEXT NOT NULL,  -- локальная дата клиента, YYYY-MM-DD
                energy INTEGER NOT NULL,  -- 1-5
                mood   INTEGER NOT NULL,  -- 1-5
                feeling INTEGER NOT NULL, -- 0 плохо / 1 нормально / 2 хорошо
                PRIMARY KEY (tg_id, date)
            )
            """
        )

        # Симптомы и отметки дня цикла
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cycle_symptoms (
                tg_id INTEGER NOT NULL,
                date  TEXT NOT NULL,
                is_period INTEGER NOT NULL DEFAULT 0,      -- месячные в этот день
                period_intensity INTEGER,                  -- 1-3
                pain INTEGER,                              -- 0-3
                mood INTEGER,                              -- 1-5
                energy INTEGER,                            -- 1-5
                sleep_hours REAL,                          -- часов сна
                appetite INTEGER,                          -- 0-2
                craving TEXT,                              -- тяга к продуктам
                bloating INTEGER,                          -- 0/1
                other TEXT,                                -- другие симптомы
                PRIMARY KEY (tg_id, date)
            )
            """
        )

        # Контент-библиотеки (сидятся из webapp/data/*.json ниже)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                duration_min INTEGER NOT NULL,
                intensity TEXT NOT NULL,
                equipment TEXT NOT NULL DEFAULT '',
                phases TEXT NOT NULL DEFAULT '[]',
                description TEXT NOT NULL DEFAULT '',
                structure TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workout_completions (
                tg_id INTEGER NOT NULL,
                workout_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                minutes INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tg_id, workout_id, date)
            )
            """
        )
        # Видеотренировки (Kinescope-встраивание, привязка к фазе цикла)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY,
                key TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                phase TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                equipment TEXT NOT NULL DEFAULT '',
                embed_url TEXT NOT NULL,
                poster TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS video_completions (
                tg_id INTEGER NOT NULL,
                video_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                PRIMARY KEY (tg_id, video_id, date)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                time_min INTEGER NOT NULL,
                ingredients TEXT NOT NULL DEFAULT '[]',
                steps TEXT NOT NULL DEFAULT '[]',
                tags TEXT NOT NULL DEFAULT '[]',
                phases TEXT NOT NULL DEFAULT '[]',
                phase_note TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS nutrition_logs (
                tg_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                breakfast INTEGER NOT NULL DEFAULT 0,
                lunch INTEGER NOT NULL DEFAULT 0,
                dinner INTEGER NOT NULL DEFAULT 0,
                snack INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tg_id, date)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                recommended_frequency TEXT NOT NULL DEFAULT 'daily',
                emoji TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_habits (
                id INTEGER PRIMARY KEY,
                tg_id INTEGER NOT NULL,
                habit_id INTEGER NOT NULL,
                frequency TEXT NOT NULL DEFAULT 'daily',
                reminder_time TEXT,           -- 'HH:MM' или NULL
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                UNIQUE (tg_id, habit_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS habit_completions (
                user_habit_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                PRIMARY KEY (user_habit_id, date)
            )
            """
        )

        # --- Мотивационная система «Твой путь к себе» ---
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_points (
                tg_id INTEGER PRIMARY KEY,
                balance INTEGER NOT NULL DEFAULT 0,
                total_earned INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )
        # Идемпотентность начислений: один источник + одна ссылка + один день
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS points_transactions (
                id INTEGER PRIMARY KEY,
                tg_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                source TEXT NOT NULL,
                ref_id TEXT NOT NULL DEFAULT '-',
                date TEXT NOT NULL,
                UNIQUE (tg_id, source, ref_id, date)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_achievements (
                tg_id INTEGER NOT NULL,
                achievement_id TEXT NOT NULL,
                earned_at TEXT NOT NULL,
                PRIMARY KEY (tg_id, achievement_id)
            )
            """
        )
        # price дублируется из каталога на момент обмена (каталог меняется)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_rewards (
                id INTEGER PRIMARY KEY,
                tg_id INTEGER NOT NULL,
                reward_id TEXT NOT NULL,
                price INTEGER NOT NULL DEFAULT 0,
                exchanged_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY,
                tg_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                time TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                days TEXT NOT NULL DEFAULT 'daily'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS water_logs (
                tg_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                glasses INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tg_id, date)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_plates (
                id INTEGER PRIMARY KEY,
                tg_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """
        )

        _seed_library(conn)
    logger.info("База данных готова: %s", config.db_path)


def _seed_library(conn: sqlite3.Connection) -> None:
    """Заполняет таблицы библиотек из JSON, если они пустые."""
    seeds = [
        ("workouts.json", "workouts",
         ("id, title, category, duration_min, intensity, equipment, phases,"
          " description, structure")),
        ("recipes.json", "recipes",
         ("id, title, category, time_min, ingredients, steps, tags, phases,"
          " phase_note")),
        ("habits.json", "habits",
         ("id, title, category, description, recommended_frequency, emoji")),
        ("videos.json", "videos",
         ("id, key, title, category, phase, description, equipment, embed_url,"
          " poster, sort_order")),
    ]
    for filename, table, columns in seeds:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if count:
            continue
        path = DATA_DIR / filename
        if not path.exists():
            logger.warning("Сид-файл не найден, пропускаю %s", path)
            continue
        rows = json.loads(path.read_text(encoding="utf-8"))
        json_cols = {"phases", "ingredients", "steps", "tags", "structure"}
        for row in rows:
            values = [
                json.dumps(row[col], ensure_ascii=False)
                if col in json_cols else row[col]
                for col in columns.split(", ")
            ]
            conn.execute(
                f"INSERT OR REPLACE INTO {table} ({columns}) "
                f"VALUES ({', '.join('?' * len(values))})",
                values,
            )
        logger.info("Сидирована библиотека %s: %s записей", table, len(rows))


# --- Пользователь ---

def get_user(tg_id: int) -> Optional[sqlite3.Row]:
    """Возвращает запись пользователя или None, если его нет в базе."""
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM users WHERE tg_id = ?", (tg_id,),
        ).fetchone()
    return row


def save_user(
    tg_id: int,
    cycle_start: str,
    cycle_length: int,
    name: Optional[str] = None,
    period_length: Optional[int] = None,
    goals: Optional[list] = None,
    notify: Optional[dict] = None,
    units: Optional[dict] = None,
) -> None:
    """Сохраняет или обновляет данные пользователя.

    Каждое поле обновляется только если передано: так частичные правки
    (например, только цели или только флаги уведомлений) не стирают остальное.
    """
    existing = get_user(tg_id)
    notify_cols = ("plan", "workout", "habit", "vitamins", "checkin", "period")
    # Значения для INSERT: переданные, иначе имеющиеся у пользователя
    notify_vals = {
        key: int(bool(notify.get(key))) if notify and key in notify
        else (existing[f"notify_{key}"] if existing else 0)
        for key in notify_cols
    }
    units_vals = {
        key: (units.get(key) if units and key in units
              else (existing[col] if existing else default))
        for key, col, default in (
            ("weight", "units_weight", "kg"), ("height", "units_height", "cm"),
        )
    }
    goals_val = (json.dumps(goals, ensure_ascii=False)
                 if goals is not None
                 else (existing["goals"] if existing else None))
    # INSERT требует NOT NULL даже при ON CONFLICT: кладём имеющееся/дефолт,
    # а перезапись при конфликте CASE всё равно отключена для None
    period_val = (period_length if period_length is not None
                  else (existing["period_length"] if existing else 5))
    with sqlite3.connect(config.db_path) as conn:
        sets = [
            "cycle_start = excluded.cycle_start",
            "cycle_length = excluded.cycle_length",
            "name = CASE WHEN excluded.name != ''"
            "            THEN excluded.name ELSE users.name END",
            "period_length = CASE WHEN excluded.period_length IS NOT NULL"
            "                     THEN excluded.period_length"
            "                     ELSE COALESCE(users.period_length, 5) END",
        ]
        if goals is not None:
            sets.append("goals = excluded.goals")
        if notify:
            for key in notify_cols:
                if key in notify:
                    sets.append(f"notify_{key} = excluded.notify_{key}")
        for key, col in (("weight", "units_weight"),
                         ("height", "units_height")):
            if units and key in units:
                sets.append(f"{col} = excluded.{col}")
        conn.execute(
            """
            INSERT INTO users
                (tg_id, name, cycle_start, cycle_length, period_length,
                 goals, notify_plan, notify_workout, notify_habit,
                 notify_vitamins, notify_checkin, notify_period,
                 units_weight, units_height, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(tg_id) DO UPDATE SET
            """
            + ", ".join(sets),
            [
                tg_id, (name or "").strip()[:64], cycle_start, cycle_length,
                period_val, goals_val,
                notify_vals["plan"], notify_vals["workout"],
                notify_vals["habit"], notify_vals["vitamins"],
                notify_vals["checkin"], notify_vals["period"],
                units_vals["weight"], units_vals["height"],
            ],
        )
    logger.info("Данные пользователя сохранены для tg_id=%s", tg_id)


def reset_user(tg_id: int) -> None:
    """Удаляет данные цикла (сброс, перезапуск онбординга)."""
    with sqlite3.connect(config.db_path) as conn:
        conn.execute("DELETE FROM users WHERE tg_id = ?", (tg_id,))
    logger.info("Данные цикла удалены для tg_id=%s", tg_id)


def delete_user(tg_id: int) -> None:
    """Полное удаление аккаунта и всех данных (privacy, спека п.2.9)."""
    with sqlite3.connect(config.db_path) as conn:
        conn.execute("DELETE FROM users WHERE tg_id = ?", (tg_id,))
        conn.execute("DELETE FROM wellbeing WHERE tg_id = ?", (tg_id,))
        conn.execute("DELETE FROM cycle_symptoms WHERE tg_id = ?", (tg_id,))
        conn.execute(
            "DELETE FROM workout_completions WHERE tg_id = ?", (tg_id,)
        )
        conn.execute(
            "DELETE FROM video_completions WHERE tg_id = ?", (tg_id,)
        )
        conn.execute("DELETE FROM nutrition_logs WHERE tg_id = ?", (tg_id,))
        conn.execute("DELETE FROM saved_plates WHERE tg_id = ?", (tg_id,))
        conn.execute(
            "DELETE FROM habit_completions WHERE user_habit_id IN "
            "(SELECT id FROM user_habits WHERE tg_id = ?)", (tg_id,),
        )
        conn.execute("DELETE FROM user_habits WHERE tg_id = ?", (tg_id,))
    logger.info("Аккаунт и все данные удалены для tg_id=%s", tg_id)


# --- Чек-ин самочувствия (Wellbeing) ---

def save_wellbeing(
    tg_id: int, day: str, energy: int, mood: int, feeling: int
) -> None:
    """Сохраняет чек-ин за день; повторное сохранение перезаписывает."""
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            INSERT INTO wellbeing (tg_id, date, energy, mood, feeling)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(tg_id, date) DO UPDATE SET
                energy = excluded.energy,
                mood = excluded.mood,
                feeling = excluded.feeling
            """,
            (tg_id, day, energy, mood, feeling),
        )


def get_wellbeing(tg_id: int, day: str) -> Optional[sqlite3.Row]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT date, energy, mood, feeling FROM wellbeing "
            "WHERE tg_id = ? AND date = ?",
            (tg_id, day),
        ).fetchone()


def get_wellbeing_range(
    tg_id: int, from_date: str, to_date: str
) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT date, energy, mood, feeling FROM wellbeing "
            "WHERE tg_id = ? AND date BETWEEN ? AND ? ORDER BY date",
            (tg_id, from_date, to_date),
        ).fetchall()


# --- Симптомы цикла ---

SYMPTOM_FIELDS = (
    "is_period", "period_intensity", "pain", "mood", "energy",
    "sleep_hours", "appetite", "craving", "bloating", "other",
)


def save_symptoms(tg_id: int, day: str, data: dict) -> None:
    """Сохраняет отметки симптомов за день; None-поля не перезаписываются,
    если день уже существует, — только переданные значения."""
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            f"""
            INSERT INTO cycle_symptoms (tg_id, date, {', '.join(SYMPTOM_FIELDS)})
            VALUES (?, ?, {', '.join('?' * len(SYMPTOM_FIELDS))})
            ON CONFLICT(tg_id, date) DO UPDATE SET
                {', '.join(f'{f} = excluded.{f}' for f in SYMPTOM_FIELDS)}
            """,
            [tg_id, day] + [data.get(f) for f in SYMPTOM_FIELDS],
        )


def get_symptoms(tg_id: int, day: str) -> Optional[sqlite3.Row]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            f"SELECT date, {', '.join(SYMPTOM_FIELDS)} FROM cycle_symptoms "
            "WHERE tg_id = ? AND date = ?",
            (tg_id, day),
        ).fetchone()


def get_symptoms_range(tg_id: int, from_date: str, to_date: str) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            f"SELECT date, {', '.join(SYMPTOM_FIELDS)} FROM cycle_symptoms "
            "WHERE tg_id = ? AND date BETWEEN ? AND ? ORDER BY date",
            (tg_id, from_date, to_date),
        ).fetchall()


# --- Библиотеки (read-only) ---

def _rows_to_dicts(rows: list, json_cols: tuple = ()) -> list:
    result = []
    for row in rows:
        item = dict(row)
        for col in json_cols:
            if col in item:
                item[col] = json.loads(item[col])
        result.append(item)
    return result


def list_workouts() -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM workouts ORDER BY id").fetchall()
    return _rows_to_dicts(rows, ("phases", "structure"))


def get_workout(workout_id: int) -> Optional[dict]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM workouts WHERE id = ?", (workout_id,),
        ).fetchone()
    return _rows_to_dicts([row], ("phases", "structure"))[0] if row else None


def list_recipes(category: Optional[str] = None, tag: Optional[str] = None) -> list:
    sql = "SELECT * FROM recipes"
    cond, params = [], []
    if category:
        cond.append("category = ?")
        params.append(category)
    if tag:
        cond.append("tags LIKE ?")
        params.append(f'%"{tag}"%')
    if cond:
        sql += " WHERE " + " AND ".join(cond)
    sql += " ORDER BY id"
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return _rows_to_dicts(rows, ("ingredients", "steps", "tags", "phases"))


def get_recipe(recipe_id: int) -> Optional[dict]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM recipes WHERE id = ?", (recipe_id,),
        ).fetchone()
    cols = ("ingredients", "steps", "tags", "phases")
    return _rows_to_dicts([row], cols)[0] if row else None


def list_habit_library() -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM habits ORDER BY id").fetchall()
    return _rows_to_dicts(rows)


# --- Тренировки: выполнение ---

def complete_workout(
    tg_id: int, workout_id: int, day: str, minutes: int
) -> None:
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO workout_completions
                (tg_id, workout_id, date, minutes)
            VALUES (?, ?, ?, ?)
            """,
            (tg_id, workout_id, day, minutes),
        )


def get_workout_completion(
    tg_id: int, workout_id: int, day: str
) -> Optional[sqlite3.Row]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT date, minutes FROM workout_completions "
            "WHERE tg_id = ? AND workout_id = ? AND date = ?",
            (tg_id, workout_id, day),
        ).fetchone()


def get_workout_completions_range(
    tg_id: int, from_date: str, to_date: str
) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT workout_id, date, minutes FROM workout_completions "
            "WHERE tg_id = ? AND date BETWEEN ? AND ? ORDER BY date",
            (tg_id, from_date, to_date),
        ).fetchall()


# --- Видеотренировки (Kinescope) ---

def list_videos() -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM videos ORDER BY sort_order"
        ).fetchall()
    return _rows_to_dicts(rows)


def get_video(video_id: int) -> Optional[dict]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM videos WHERE id = ?", (video_id,),
        ).fetchone()
    return _rows_to_dicts([row])[0] if row else None


def complete_video(tg_id: int, video_id: int, day: str) -> None:
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO video_completions (tg_id, video_id, date)
            VALUES (?, ?, ?)
            """,
            (tg_id, video_id, day),
        )


def get_video_completion(
    tg_id: int, video_id: int, day: str
) -> Optional[sqlite3.Row]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT date FROM video_completions "
            "WHERE tg_id = ? AND video_id = ? AND date = ?",
            (tg_id, video_id, day),
        ).fetchone()


def get_video_completions_range(
    tg_id: int, from_date: str, to_date: str
) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT video_id, date FROM video_completions "
            "WHERE tg_id = ? AND date BETWEEN ? AND ? ORDER BY date",
            (tg_id, from_date, to_date),
        ).fetchall()


# --- Питание: трекер приёмов ---

MEALS = ("breakfast", "lunch", "dinner", "snack")


def save_nutrition(
    tg_id: int, day: str, breakfast: int, lunch: int, dinner: int, snack: int
) -> None:
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            INSERT INTO nutrition_logs
                (tg_id, date, breakfast, lunch, dinner, snack)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(tg_id, date) DO UPDATE SET
                breakfast = excluded.breakfast,
                lunch = excluded.lunch,
                dinner = excluded.dinner,
                snack = excluded.snack
            """,
            (tg_id, day, breakfast, lunch, dinner, snack),
        )


def get_nutrition(tg_id: int, day: str) -> Optional[sqlite3.Row]:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT date, breakfast, lunch, dinner, snack "
            "FROM nutrition_logs WHERE tg_id = ? AND date = ?",
            (tg_id, day),
        ).fetchone()


def get_nutrition_range(tg_id: int, from_date: str, to_date: str) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT date, breakfast, lunch, dinner, snack FROM nutrition_logs "
            "WHERE tg_id = ? AND date BETWEEN ? AND ? ORDER BY date",
            (tg_id, from_date, to_date),
        ).fetchall()


# --- Привычки ---

def add_user_habit(
    tg_id: int,
    habit_id: int,
    frequency: str,
    reminder_time: Optional[str] = None,
) -> int:
    """Добавляет привычку пользователю; повторное добавление возвращает id."""
    with sqlite3.connect(config.db_path) as conn:
        conn.execute(
            """
            INSERT INTO user_habits
                (tg_id, habit_id, frequency, reminder_time, active, created_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'))
            ON CONFLICT(tg_id, habit_id) DO UPDATE SET
                frequency = excluded.frequency,
                reminder_time = excluded.reminder_time,
                active = 1
            """,
            (tg_id, habit_id, frequency, reminder_time),
        )
        row = conn.execute(
            "SELECT id FROM user_habits WHERE tg_id = ? AND habit_id = ?",
            (tg_id, habit_id),
        ).fetchone()
    return row[0]


def get_user_habits(tg_id: int) -> list:
    """Активные привычки пользователя с данными из библиотеки."""
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT uh.id, uh.habit_id, uh.frequency, uh.reminder_time,
                   uh.active, h.title, h.category, h.description,
                   h.recommended_frequency, h.emoji
            FROM user_habits uh JOIN habits h ON h.id = uh.habit_id
            WHERE uh.tg_id = ? AND uh.active = 1
            ORDER BY uh.id
            """,
            (tg_id,),
        ).fetchall()
    return _rows_to_dicts(rows)


def set_user_habit(
    tg_id: int, user_habit_id: int, active: Optional[bool] = None,
    reminder_time: Optional[str] = None,
) -> bool:
    """Обновляет активность/напоминание; False, если запись не найдена."""
    sets, params = [], []
    if active is not None:
        sets.append("active = ?")
        params.append(1 if active else 0)
    if reminder_time is not None:
        sets.append("reminder_time = ?")
        params.append(reminder_time)
    if not sets:
        return False
    params += [tg_id, user_habit_id]
    with sqlite3.connect(config.db_path) as conn:
        cur = conn.execute(
            f"UPDATE user_habits SET {', '.join(sets)} "
            "WHERE tg_id = ? AND id = ?",
            params,
        )
    return cur.rowcount > 0


def toggle_habit_completion(tg_id: int, user_habit_id: int, day: str) -> bool:
    """Переключает отметку за день. Возвращает новое состояние (True=выполнено)."""
    with sqlite3.connect(config.db_path) as conn:
        row = conn.execute(
            "SELECT id FROM user_habits WHERE tg_id = ? AND id = ?",
            (tg_id, user_habit_id),
        ).fetchone()
        if row is None:
            raise ValueError("привычка не найдена")
        done = conn.execute(
            "SELECT 1 FROM habit_completions "
            "WHERE user_habit_id = ? AND date = ?",
            (user_habit_id, day),
        ).fetchone()
        if done:
            conn.execute(
                "DELETE FROM habit_completions "
                "WHERE user_habit_id = ? AND date = ?",
                (user_habit_id, day),
            )
            return False
        conn.execute(
            "INSERT OR IGNORE INTO habit_completions "
            "(user_habit_id, date) VALUES (?, ?)",
            (user_habit_id, day),
        )
        return True


def get_habit_completions_range(
    tg_id: int, from_date: str, to_date: str
) -> list:
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            """
            SELECT hc.user_habit_id, hc.date
            FROM habit_completions hc
            JOIN user_habits uh ON uh.id = hc.user_habit_id
            WHERE uh.tg_id = ? AND hc.date BETWEEN ? AND ?
            ORDER BY hc.date
            """,
            (tg_id, from_date, to_date),
        ).fetchall()


# --- Сохранённые тарелки ---

def list_plates(tg_id: int) -> list:
    """Сохранённые тарелки пользователя, новые сверху."""
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, title, payload, created_at
            FROM saved_plates
            WHERE tg_id = ?
            ORDER BY id DESC
            """,
            (tg_id,),
        ).fetchall()
    return [
        {**dict(row), "payload": json.loads(row["payload"])}
        for row in rows
    ]


def add_plate(tg_id: int, title: str, payload: dict) -> int:
    """Сохраняет тарелку (расчёт конструктора) и возвращает её id."""
    with sqlite3.connect(config.db_path) as conn:
        cur = conn.execute(
            """
            INSERT INTO saved_plates (tg_id, title, payload, created_at)
            VALUES (?, ?, ?, datetime('now'))
            """,
            (tg_id, title, json.dumps(payload, ensure_ascii=False)),
        )
        return cur.lastrowid


def delete_plate(tg_id: int, plate_id: int) -> bool:
    """Удаляет тарелку пользователя; False, если такой нет."""
    with sqlite3.connect(config.db_path) as conn:
        cur = conn.execute(
            "DELETE FROM saved_plates WHERE id = ? AND tg_id = ?",
            (plate_id, tg_id),
        )
        return cur.rowcount > 0


# --- Уведомления ---

def list_users() -> list:
    """Все пользователи (для планировщика уведомлений)."""
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT * FROM users ORDER BY tg_id"
        ).fetchall()


def get_habit_reminders_due(hhmm: str) -> list:
    """Активные привычки с напоминанием на текущее время 'HH:MM'."""
    with sqlite3.connect(config.db_path) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            """
            SELECT uh.tg_id, uh.reminder_time, h.title, h.emoji
            FROM user_habits uh JOIN habits h ON h.id = uh.habit_id
            WHERE uh.active = 1 AND uh.reminder_time = ?
            ORDER BY uh.id
            """,
            (hhmm,),
        ).fetchall()
