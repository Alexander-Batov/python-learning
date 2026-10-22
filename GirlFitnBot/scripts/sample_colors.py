"""Семплирование цветов из JPG-референсов (Этап 0).

Усредняет пиксели в маленьких боксах по координатам, подобранным вручную
после просмотра мокапов (853×1280). Результат — таблица hex для сверки
с ориентирами спеки §1 и для дизайн-токенов в webapp/style.css.

Использование:
    python scripts/sample_colors.py
"""

import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCREENS = ROOT / "Экраны"

# (файл, метка, x, y, размер бокса) — координаты центра бокса в пикселях
SAMPLES = [
    # --- Первая вкладка (Сегодня) ---
    ("Первая вкладка.jpg", "bg-app (между hero и чек-ином)", 430, 470, 14),
    ("Первая вкладка.jpg", "surface (карточка чек-ина)", 430, 505, 14),
    ("Первая вкладка.jpg", "hero-terracotta (светлая часть)", 400, 300, 16),
    ("Первая вкладка.jpg", "hero-terracotta (нижняя)", 560, 420, 16),
    ("Первая вкладка.jpg", "chip-active olive (Менструация)", 250, 585, 14),
    ("Первая вкладка.jpg", "chip-bg (Фолликулярная)", 395, 585, 12),
    ("Первая вкладка.jpg", "text-primary (заголовок)", 280, 128, 8),
    ("Первая вкладка.jpg", "btn-primary terracotta (Начать)", 607, 663, 14),
    ("Первая вкладка.jpg", "cream pill (Подробнее на hero)", 300, 383, 14),
    ("Первая вкладка.jpg", "week-dot done olive", 398, 1050, 8),
    ("Первая вкладка.jpg", "week-dot todo контур", 525, 1050, 8),
    # --- Вторая вкладка (Цикл) ---
    ("Вторая вкладка.jpg", "cal olive-pastel (фолликулярная 7)", 365, 372, 10),
    ("Вторая вкладка.jpg", "cal terracotta-soft (овуляция 22)", 455, 467, 10),
    ("Вторая вкладка.jpg", "cal terracotta (менструальная 20)", 365, 467, 10),
    ("Вторая вкладка.jpg", "cal pink-pastel (лютеиновая 8)", 628, 570, 10),
    ("Вторая вкладка.jpg", "btn olive (Посмотреть)", 605, 938, 14),
    ("Вторая вкладка.jpg", "phase-pill terracotta-soft (Лютеиновая фаза)", 615, 700, 8),
    # --- Третья вкладка (Активность) ---
    ("Третья вкладка.jpg", "hero-terracotta (Активность)", 430, 500, 16),
    ("Третья вкладка.jpg", "chip-active olive (Все)", 222, 670, 10),
    ("Третья вкладка.jpg", "ring progress olive (кольцо 3/7)", 245, 262, 8),
    ("Третья вкладка.jpg", "ring bg (кольцо фон)", 330, 225, 8),
    # --- Четверный экран (Питание) ---
    ("Четверный экран.jpg", "tint-pink (карточка Менструальная)", 252, 740, 14),
    ("Четверный экран.jpg", "tint-green (карточка Фолликулярная)", 365, 740, 14),
    ("Четверный экран.jpg", "plate photo center", 375, 385, 10),
    ("Четверный экран.jpg", "btn-secondary-bg (Подробнее)", 612, 220, 10),
    ("Четверный экран.jpg", "icon-circle olive (лист в строке)", 230, 517, 10),
    # --- Пятый экран (Привычки) ---
    ("Пятый экран.jpg", "blue-water (капля)", 190, 783, 12),
    ("Пятый экран.jpg", "water progress fill", 350, 827, 10),
    ("Пятый экран.jpg", "water progress bg", 600, 827, 10),
    ("Пятый экран.jpg", "check done olive (Сон Пн)", 168, 338, 8),
    ("Пятый экран.jpg", "olive icon circle (Шаги)", 190, 885, 12),
    # --- Шестая вкладка (Профиль) ---
    ("Шестая вкладка.jpg", "avatar photo", 218, 258, 10),
    ("Шестая вкладка.jpg", "bg-app (между карточками)", 430, 465, 10),
    ("Шестая вкладка.jpg", "menu card surface", 430, 540, 12),
]


def avg_color(img: Image.Image, x: int, y: int, box: int) -> tuple:
    px = img.load()
    half = box // 2
    r = g = b = n = 0
    for yy in range(max(0, y - half), min(img.height, y + half + 1)):
        for xx in range(max(0, x - half), min(img.width, x + half + 1)):
            p = px[xx, yy]
            r += p[0]
            g += p[1]
            b += p[2]
            n += 1
    return r // n, g // n, b // n


def to_hex(c: tuple) -> str:
    return "#{:02X}{:02X}{:02X}".format(*c)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    current = None
    img = None
    for filename, label, x, y, box in SAMPLES:
        path = SCREENS / filename
        if current != filename:
            img = Image.open(path).convert("RGB")
            current = filename
            print(f"\n=== {filename} ({img.width}×{img.height}) ===")
        print(f"  {to_hex(avg_color(img, x, y, box))}  {label}  @({x},{y})")


if __name__ == "__main__":
    sys.exit(main())
