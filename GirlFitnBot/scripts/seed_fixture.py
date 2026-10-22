"""Сидинг фикстурного пользователя 777000111 «Екатерина» и мок-отметок.

Цифры подобраны под референсы: день цикла 19 (лютеиновая фаза),
3/7 дней активности на этой неделе, 12 тренировок / 360 мин / 75% за месяц,
питание 2 из 3 приёмов, вода 6/8, чек-ин энергия 3 (Средний), 2 привычки.

Работает через прямые INSERT в SQLite (users.db) — идемпотентно
(перед повторным прогоном старые данные фикстуры удаляются).

Использование:
    python scripts/seed_fixture.py
"""

import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8")

import db  # noqa: E402  (путь к БД — из config)
from config import config  # noqa: E402

TG_ID = 777000111
NAME = "Екатерина"
CYCLE_LENGTH = 28
PERIOD_LENGTH = 5
TODAY = date.today()


def seed_user(conn: sqlite3.Connection) -> str:
    """Создаёт/обновляет пользователя; возвращает cycle_start (сегодня − 18 дн)."""
    start = (TODAY - timedelta(days=18)).isoformat()
    conn.execute(
        """
        INSERT INTO users
            (tg_id, name, cycle_start, cycle_length, period_length, goals,
             notify_plan, notify_workout, notify_habit, notify_checkin,
             notify_period, subscription_plan, units_weight, units_height,
             created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 0, 'free', 'kg', 'cm', datetime('now'))
        ON CONFLICT(tg_id) DO UPDATE SET
            name = excluded.name,
            cycle_start = excluded.cycle_start,
            cycle_length = excluded.cycle_length,
            period_length = excluded.period_length,
            goals = excluded.goals
        """,
        (TG_ID, NAME, start, CYCLE_LENGTH, PERIOD_LENGTH,
         '["activity","nutrition","habits"]'),
    )
    return start


def seed_workouts(conn: sqlite3.Connection) -> None:
    """12 тренировок × 30 мин: дни 1,3,…,17 месяца + Пн–Ср текущей недели
    (недельные дни могут лежать в будущем — это фикстура для скриншотов)."""
    days = set()
    day_num = 1
    while day_num <= 17 and len(days) < 9:  # 9 тренировок в начале месяца
        days.add(TODAY.replace(day=day_num).isoformat())
        day_num += 2
    days.add((TODAY - timedelta(days=2)).isoformat())  # 10-я, до Пн текущей недели
    monday = TODAY - timedelta(days=TODAY.weekday())
    for i in range(3):  # Пн, Вт, Ср — «3/7 на этой неделе» (Ср может быть в будущем)
        days.add((monday + timedelta(days=i)).isoformat())
    rows = [(TG_ID, 1 + i % 8, d, 30) for i, d in enumerate(sorted(days))]
    conn.executemany(
        "INSERT OR REPLACE INTO workout_completions"
        " (tg_id, workout_id, date, minutes) VALUES (?, ?, ?, ?)", rows)
    print(f"workout_completions: {len(rows)} строк"
          f" (итого {sum(r[3] for r in rows)} мин)")


def seed_nutrition(conn: sqlite3.Connection) -> None:
    """Сегодня: завтрак + обед (2 из 3), ужин не отмечен."""
    conn.execute(
        "INSERT OR REPLACE INTO nutrition_logs"
        " (tg_id, date, breakfast, lunch, dinner, snack) VALUES (?, ?, 1, 1, 0, 0)",
        (TG_ID, TODAY.isoformat()),
    )
    print("nutrition_logs: сегодня завтрак+обед (2 из 3)")


def seed_water(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO water_logs (tg_id, date, glasses)"
        " VALUES (?, ?, 6)",
        (TG_ID, TODAY.isoformat()),
    )
    print("water_logs: сегодня 6 стаканов")


def seed_wellbeing(conn: sqlite3.Connection) -> None:
    """Чек-ин: энергия 3 (Средний), настроение 4, самочувствие 2 (хорошо)."""
    conn.execute(
        "INSERT OR REPLACE INTO wellbeing (tg_id, date, energy, mood, feeling)"
        " VALUES (?, ?, 3, 4, 2)",
        (TG_ID, TODAY.isoformat()),
    )
    print("wellbeing: сегодня energy=3 (Средний)")


def seed_habits(conn: sqlite3.Connection) -> list:
    """2 привычки из библиотеки + отметки на несколько дней (включая сегодня)."""
    habits = conn.execute(
        "SELECT id FROM habits ORDER BY id LIMIT 2").fetchall()
    if not habits:
        print("БИБЛИОТЕКА habits ПУСТА — привычки не засеяны!")
        return []
    uh_ids = []
    for (habit_id,) in habits:
        conn.execute(
            "INSERT INTO user_habits"
            " (tg_id, habit_id, frequency, reminder_time, active, created_at)"
            " VALUES (?, ?, 'daily', NULL, 1, datetime('now'))"
            " ON CONFLICT(tg_id, habit_id) DO UPDATE SET active = 1",
            (TG_ID, habit_id),
        )
        uh_id = conn.execute(
            "SELECT id FROM user_habits WHERE tg_id = ? AND habit_id = ?",
            (TG_ID, habit_id)).fetchone()[0]
        uh_ids.append(uh_id)
        # Отметки: сегодня и раз в 2 дня назад (5 дней — для регулярности 75%)
        for back in (0, 2, 4, 6, 8):
            conn.execute(
                "INSERT OR IGNORE INTO habit_completions"
                " (user_habit_id, date) VALUES (?, ?)",
                (uh_id, (TODAY - timedelta(days=back)).isoformat()),
            )
    print(f"user_habits: {len(uh_ids)} привычки, отметки за 5 дней (вкл. сегодня)")
    return uh_ids


def clean_previous(conn: sqlite3.Connection) -> None:
    """Удаляет прошлые данные фикстуры, чтобы прогоны были идемпотентны."""
    conn.execute("DELETE FROM workout_completions WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM nutrition_logs WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM water_logs WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM wellbeing WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM cycle_symptoms WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM user_points WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM points_transactions WHERE tg_id = ?", (TG_ID,))
    conn.execute("DELETE FROM user_achievements WHERE tg_id = ?", (TG_ID,))
    conn.execute(
        "DELETE FROM habit_completions WHERE user_habit_id IN"
        " (SELECT id FROM user_habits WHERE tg_id = ?)", (TG_ID,))
    conn.execute("DELETE FROM user_habits WHERE tg_id = ?", (TG_ID,))


def main() -> None:
    db.init()  # убедиться, что таблицы и библиотеки есть
    conn = sqlite3.connect(config.db_path)
    try:
        clean_previous(conn)
        start = seed_user(conn)
        seed_workouts(conn)
        seed_nutrition(conn)
        seed_water(conn)
        seed_wellbeing(conn)
        seed_habits(conn)
        conn.commit()
        print(f"user: tg_id={TG_ID} name={NAME} cycle_start={start}"
              f" (день 19, лютеиновая фаза)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
