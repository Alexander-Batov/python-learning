import io
import logging

import matplotlib
matplotlib.use("Agg")  # без GUI, рисуем только в буфер
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
import numpy as np

BLOCK_NAMES = ["Готовность", "Экспертность", "Аудитория", "Продукт", "Реализация"]
MAX_SCORE = 3  # максимум баллов в блоке (3 вопроса)

BRAND_COLOR = "#E8548A"  # фирменный розовый: линия и заливка многоугольника
TEXT_GRAY = "#4d4d4d"    # заголовок и подписи блоков
LIGHT_GRAY = "#b3b3b3"   # сетка, шкала в процентах, подпись агентства


def build_radar_chart(scores: list[int]) -> io.BytesIO:
    """Строит радарную диаграмму по баллам пяти блоков (0–3), возвращает PNG в BytesIO."""
    # баллы блоков (0–3) переводим в проценты заполнения
    percents = [round(s / MAX_SCORE * 100) for s in scores]
    angles = np.linspace(0, 2 * np.pi, len(BLOCK_NAMES), endpoint=False)
    # замыкаем многоугольник, добавляя первую точку в конец
    values = percents + [percents[0]]
    closed_angles = list(angles) + [angles[0]]

    fig = plt.figure(figsize=(6, 6.4))  # чуть выше, чтобы вместить заголовок
    fig.suptitle("Персональная диагностика", fontsize=16,
                 fontweight="bold", color=TEXT_GRAY)
    ax = fig.add_subplot(111, polar=True)
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_ylim(0, 115)  # запас сверху, чтобы подписи «100%» не обрезались
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.set_yticklabels(["0%", "25%", "50%", "75%", "100%"],
                       color=LIGHT_GRAY, fontsize=9)
    ax.set_xticks(angles)
    ax.set_xticklabels(BLOCK_NAMES, color=TEXT_GRAY, fontsize=11)
    ax.grid(color="#e0e0e0", linewidth=0.8)
    ax.spines["polar"].set_color("#e0e0e0")

    ax.plot(closed_angles, values, linewidth=2, color=BRAND_COLOR)
    ax.fill(closed_angles, values, alpha=0.25, color=BRAND_COLOR)

    # значения в процентах у каждой вершины многоугольника;
    # внутри — чтобы не наезжать на названия блоков, белая обводка — для читаемости на заливке
    halo = [pe.withStroke(linewidth=2.5, foreground="white")]
    for angle, value in zip(angles, percents):
        radius = value - 8 if value >= 30 else value + 7
        ax.text(angle, radius, f"{value}%", ha="center", va="center",
                fontsize=10, fontweight="bold", color=BRAND_COLOR,
                path_effects=halo)

    # фирменная подпись в левом нижнем углу картинки (привязка к фигуре, не к осям)
    fig.text(0.02, 0.02, "Spark Agency", fontsize=8, color=LIGHT_GRAY)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    buf.seek(0)
    plt.close(fig)  # чтобы не копились фигуры при повторных прохождениях
    logging.info("Построена радарная диаграмма: %s", scores)
    return buf
