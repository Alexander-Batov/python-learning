"""Вырезка фото-ассетов из JPG-референсов (Этап 0).

Координаты подобраны вручную по мокапам (853×1280), область приложения
примерно x 150–705. Каждый кроп проверен визуально (contact sheet):
scripts/_contact_sheet.png. Скругление — на стороне CSS (border-radius).

Использование:
    python scripts/crop_assets.py            # вырезать всё
    python scripts/crop_assets.py contact    # + собрать лист предпросмотра
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SCREENS = ROOT / "Экраны"
OUT = ROOT / "webapp" / "img"

# имя файла → (исходник, x1, y1, x2, y2)
CROPS = {
    # --- Первая вкладка (Сегодня) ---
    "hero-today":       ("Первая вкладка.jpg", 512, 232, 652, 446),
    "phase-menstrual":  ("Первая вкладка.jpg", 204, 630, 297, 695),
    "phase-follicular": ("Первая вкладка.jpg", 204, 722, 297, 787),
    "phase-ovulation":  ("Первая вкладка.jpg", 204, 812, 297, 877),
    "phase-luteal":     ("Первая вкладка.jpg", 204, 904, 297, 971),
    # --- Вторая вкладка (Цикл): рекомендации ---
    "rec-workout":      ("Вторая вкладка.jpg", 206, 765, 318, 858),
    "rec-food":         ("Вторая вкладка.jpg", 206, 889, 318, 983),
    "rec-evening":      ("Вторая вкладка.jpg", 206, 1012, 318, 1106),
    # --- Третья вкладка (Активность) ---
    "hero-workout":     ("Третья вкладка.jpg", 535, 400, 655, 600),
    "workout-yoga":     ("Третья вкладка.jpg", 206, 707, 296, 778),
    "workout-stretch":  ("Третья вкладка.jpg", 206, 792, 296, 863),
    "workout-cardio":   ("Третья вкладка.jpg", 206, 882, 296, 950),
    # --- Четверный экран (Питание) ---
    "plate":            ("Четверный экран.jpg", 290, 286, 460, 444),
    "hand-palm":        ("Четверный экран.jpg", 208, 908, 292, 998),
    "hand-fist":        ("Четверный экран.jpg", 332, 908, 416, 998),
    "hand-palms":       ("Четверный экран.jpg", 456, 908, 540, 998),
    "hand-thumb":       ("Четверный экран.jpg", 578, 908, 662, 998),
    # --- Шестая вкладка (Профиль) ---
    "avatar":           ("Шестая вкладка.jpg", 165, 206, 270, 311),
}

CELL = 170  # размер ячейки в contact sheet
COLS = 6


def crop_all() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    cache: dict = {}
    for name, (src, x1, y1, x2, y2) in CROPS.items():
        if src not in cache:
            cache[src] = Image.open(SCREENS / src).convert("RGB")
        img = cache[src]
        img.crop((x1, y1, x2, y2)).save(OUT / f"{name}.jpg", quality=92)
        print(f"img/{name}.jpg  ({x2 - x1}×{y2 - y1})  ← {src}")


def contact_sheet() -> None:
    names = list(CROPS)
    rows = (len(names) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + 22)), "#DDDDDD")
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        thumb = Image.open(OUT / f"{name}.jpg").convert("RGB")
        thumb.thumbnail((CELL - 8, CELL - 8))
        cx = (i % COLS) * CELL
        cy = (i // COLS) * (CELL + 22)
        sheet.paste(thumb, (cx + 4, cy + 4))
        draw.text((cx + 6, cy + CELL + 2), name, fill="#222222")
    sheet.save(ROOT / "scripts" / "_contact_sheet.png")
    print("scripts/_contact_sheet.png")


if __name__ == "__main__":
    crop_all()
    if len(sys.argv) > 1 and sys.argv[1] == "contact":
        contact_sheet()
