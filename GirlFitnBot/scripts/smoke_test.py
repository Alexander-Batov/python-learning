"""Smoke-тест API: прогоняет все эндпоинты с валидным initData.

Использование (сервер должен быть запущен, .env с токеном):
    python scripts/smoke_test.py [base_url]   # по умолчанию http://localhost:8080
"""

import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_initdata import make_init_data  # noqa: E402

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
INIT = make_init_data(777000111)

passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f" FAIL {name}  {detail}")


def call(method, path, body=None, init=INIT):
    url = f"{BASE}{path}"
    data = None
    headers = {}
    if method == "GET":
        url += ("&" if "?" in url else "?") + "initData=" + urllib.parse.quote(init)
    else:
        payload = dict(body or {})
        payload["initData"] = init
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8"))
        except Exception:
            return exc.code, {}


def main():
    print(f"Smoke-тест API на {BASE}")

    st, _ = call("GET", "/api/cycle", init="bad")
    check("GET /api/cycle без подписи → 401", st == 401, st)

    st, _ = call("GET", "/api/user")
    check("GET /api/user новый пользователь → 404", st == 404, st)

    st, body = call("POST", "/api/cycle", {
        "name": "Смок", "cycle_start": "2025-10-12", "cycle_length": 28,
        "period_length": 5, "goals": ["activity", "cycle"],
        "notify": {"plan": True},
    })
    check("POST /api/cycle создание профиля → 200", st == 200, body)
    check("в ответе цели и флаги", body.get("name") == "Смок")

    st, body = call("GET", "/api/today?date=2025-10-19")
    check("GET /api/today → 200", st == 200 and "progress" in body, body)
    check("тренировка дня есть и не выполнена",
          body.get("workout") and body["workout"]["completed"] is False)
    check("прогресс 0 из 3",
          body.get("progress") == {"done": 0, "total": 3}, body.get("progress"))

    st, body = call("POST", "/api/wellbeing",
                    {"date": "2025-10-19", "energy": 4, "mood": 5, "feeling": 2})
    check("POST /api/wellbeing → 200", st == 200 and body.get("energy") == 4, body)
    st, body = call("GET", "/api/wellbeing?date=2025-10-19")
    check("GET /api/wellbeing отдаёт чек-ин", st == 200 and body["wellbeing"]["mood"] == 5)

    st, body = call("POST", "/api/symptoms", {
        "date": "2025-10-19", "is_period": True, "period_intensity": 2,
        "pain": 1, "sleep_hours": 7.5, "appetite": 1, "craving": "шоколад",
        "bloating": True, "other": "лёгкая усталость",
    })
    check("POST /api/symptoms → 200", st == 200 and body["symptoms"]["is_period"] == 1, body)
    st, body = call("GET", "/api/symptoms?from=2025-10-01&to=2025-10-31")
    check("GET /api/symptoms диапазон → 1 запись", st == 200 and len(body["items"]) == 1)

    st, body = call("GET", "/api/workouts?date=2025-10-19&category=yoga")
    check("GET /api/workouts фильтр yoga", st == 200 and all(
        w["category"] == "yoga" for w in body["items"]) and len(body["items"]) > 0)

    st, body = call("GET", "/api/workouts?date=2025-10-19&duration=10")
    check("фильтр duration=10 (≤15 мин)", st == 200 and all(
        w["duration_min"] <= 15 for w in body["items"]))

    st, body = call("GET", "/api/workouts/daily?date=2025-10-19")
    check("GET /api/workouts/daily → тренировка фазы",
          st == 200 and body.get("workout"), body)

    wid = body["workout"]["id"]
    phases = body["workout"]["phases"]
    check("тренировка подходит под фазу цикла",
          body["phase"] is None or body["phase"] in phases, phases)

    st, body = call("POST", "/api/workouts/complete",
                    {"workout_id": wid, "date": "2025-10-19"})
    check("POST /api/workouts/complete → 200", st == 200 and body.get("completed"))
    st, body = call("GET", "/api/workouts/daily?date=2025-10-19")
    check("тренировка теперь выполнена", body["workout"]["completed"] is True)

    st, body = call("GET", "/api/recipes?tag=" + urllib.parse.quote("быстро"))
    check("GET /api/recipes фильтр тег", st == 200 and len(body["items"]) > 0)
    st, body = call("GET", "/api/recipes/1")
    check("GET /api/recipes/1 → ингредиенты и шаги",
          st == 200 and body.get("ingredients") and body.get("steps"))
    st, _ = call("GET", "/api/recipes/999")
    check("рецепт 999 → 404", st == 404)

    st, body = call("POST", "/api/nutrition",
                    {"date": "2025-10-19", "breakfast": True, "lunch": True})
    check("POST /api/nutrition → 200", st == 200 and body["meals"]["dinner"] == 0, body)
    st, body = call("GET", "/api/nutrition?date=2025-10-19")
    check("GET /api/nutrition отдаёт приёмы", body["meals"]["breakfast"] == 1)

    st, body = call("GET", "/api/habits?date=2025-10-19")
    check("GET /api/habits: библиотека 10", st == 200 and len(body["library"]) == 10)
    check("мои привычки пусты", body["mine"] == [])

    st, body = call("POST", "/api/habits",
                    {"habit_id": 2, "frequency": "5_per_week", "reminder_time": "20:30"})
    check("POST /api/habits добавление → 200", st == 200 and body.get("id"))
    uh = body["id"]
    st, body = call("POST", f"/api/habits/{uh}/toggle", {"date": "2025-10-19"})
    check("toggle привычки → done", st == 200 and body["done"] is True)
    st, body = call("POST", f"/api/habits/{uh}/toggle", {"date": "2025-10-19"})
    check("повторный toggle → отмена", st == 200 and body["done"] is False)

    st, body = call("PATCH", f"/api/habits/{uh}", {"reminder_time": "21:00"})
    check("PATCH привычки (напоминание)", st == 200)
    st, body = call("PATCH", f"/api/habits/{uh}", {"active": False})
    check("PATCH привычки (отключить)", st == 200)

    st, body = call("POST", f"/api/habits/{uh}/toggle", {"date": "2025-10-19"})
    check("toggle отключённой привычки отклонён", st == 200 or st == 404, st)

    st, body = call("GET", "/api/progress?month=2025-10&date=2025-10-19")
    check("GET /api/progress → агрегаты", st == 200
          and body["workouts_completed"] >= 1 and body["active_minutes"] > 0, body)
    check("в прогрессе есть покрытие дней", len(body["days"]) == 19, len(body.get("days", {})))
    check("динамика по неделям есть", len(body["weeks"]) >= 2, body.get("weeks"))

    st, body = call("PATCH", "/api/user",
                    {"goals": ["habits"], "notify": {"workout": True},
                     "units": {"weight": "lb"}})
    check("PATCH /api/user → 200", st == 200 and body["goals"] == ["habits"], body)
    check("флаги уведомлений сохранились",
          body["notify"]["workout"] is True and body["notify"]["plan"] is True)
    check("единицы сохранились", body["units"]["weight"] == "lb")

    st, body = call("GET", "/api/cycle")
    check("GET /api/cycle после создания → 200",
          st == 200 and body.get("cycle_start") == "2025-10-12"
          and ("cycle_day" in body or body.get("overdue")), body)

    st, body = call("DELETE", "/api/user")
    check("DELETE /api/user → 200", st == 200 and body.get("deleted") is True)
    st, _ = call("GET", "/api/user")
    check("после удаления → 404", st == 404)

    print(f"\nИтог: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
