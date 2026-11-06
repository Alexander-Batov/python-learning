"""Выгрузка всех редактируемых текстов приложения в один файл для правок.

Источники:
- webapp/content.json — все тексты мини-аппа (экраны, фазы, геймификация);
- webapp/data/*.json — библиотеки (тренировки, видео, рецепты, привычки).

Тексты Telegram-бота живут в коде и сюда не входят:
- handlers/start.py (приветствие, кнопка «Открыть приложение»),
- handlers/onboarding.py, handlers/webapp_data.py,
- notify.py (тексты напоминаний).

Использование:
    python scripts/dump_texts.py [выходной_файл]
    # по умолчанию: тексты_приложения.txt в корне проекта
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "тексты_приложения.txt")

DATA_LIBS = {
    "workouts.json": ("ТРЕНИРОВКИ", ("title", "description", "equipment")),
    "videos.json": ("ВИДЕОТРЕНИРОВКИ", ("title", "description", "equipment")),
    "recipes.json": ("РЕЦЕПТЫ", ("title", "phase_note", "ingredients", "steps")),
    "habits.json": ("БИБЛИОТЕКА ПРИВЫЧЕК", ("title", "description")),
}


def flatten(node, prefix=""):
    """Плоский список (путь, значение) для всех строковых листьев."""
    items = []
    if isinstance(node, dict):
        for key, value in node.items():
            items.extend(flatten(value, f"{prefix}.{key}" if prefix else key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            items.extend(flatten(value, f"{prefix}[{i}]"))
    elif isinstance(node, str):
        items.append((prefix, node))
    return items


def dump_content(out) -> None:
    with open(os.path.join(ROOT, "webapp", "content.json"),
              encoding="utf-8") as fh:
        content = json.load(fh)
    out.write("=" * 70 + "\n")
    out.write("ТЕКСТЫ МИНИ-АППА (источник: webapp/content.json)\n")
    out.write("Формат: путь.к.ключу = текст\n")
    out.write("=" * 70 + "\n\n")
    for path, text in flatten(content):
        one_line = text.replace("\n", " ⏎ ")
        out.write(f"{path} = {one_line}\n")


def dump_libs(out) -> None:
    for filename, (title, fields) in DATA_LIBS.items():
        path = os.path.join(ROOT, "webapp", "data", filename)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            rows = json.load(fh)
        out.write("\n" + "=" * 70 + "\n")
        out.write(f"{title} (источник: webapp/data/{filename})\n")
        out.write("=" * 70 + "\n\n")
        for row in rows:
            out.write(f"--- #{row.get('id')} ---\n")
            for field in fields:
                value = row.get(field)
                if not value:
                    continue
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            parts = " · ".join(
                                str(v) for v in item.values() if v)
                            out.write(f"  {field}: {parts}\n")
                        else:
                            out.write(f"  {field}: {item}\n")
                else:
                    out.write(f"  {field}: {value}\n")


def main() -> None:
    with open(OUT, "w", encoding="utf-8") as out:
        dump_content(out)
        dump_libs(out)
    print(f"Тексты выгружены: {OUT}")


if __name__ == "__main__":
    main()
