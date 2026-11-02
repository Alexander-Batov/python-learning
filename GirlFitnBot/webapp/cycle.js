// Расчёт фаз менструального цикла.
// ЗЕРКАЛО cycle.py: методика фаз описана в двух местах.
// Меняйте схему только здесь и в cycle.py, остальное подстроится само.
//
// Схема от дня начала месячных для цикла длиной L,
// месячные длятся P дней (единый источник — см. раздел «Осветление» п.4):
// - Менструальная: дни 1-P
// - Фолликулярная: дни (P+1) - (L-14), включая день овуляции (~L-14)
// - Овуляторная: дни (L-13) - (L-12), ~2 дня
// - Лютеиновая: дни (L-11) - L
//   · делится на два подпериода (см. getSubperiod):
//     стабильная (L-11 .. L-7) и предменструальная неделя (последние 7 дней, L-6 .. L)
// Пример L=28, P=5: 1-5 · 6-14 · 15-16 · 17-28 (17-21 стабильная, 22-28 предменструальная)

const CycleMath = (() => {
    const PHASE = {
        MENSTRUAL: 'menstrual',
        FOLLICULAR: 'follicular',
        OVULATORY: 'ovulatory',
        LUTEAL: 'luteal',
        OVERDUE: 'overdue',
    };

    // Подпериоды внутри лютеиновой фазы
    const SUBPERIOD = {
        LUTEAL_STABLE: 'luteal_stable',
        PREMENSTRUAL: 'premenstrual',
    };

    // Длительность месячных по умолчанию (если пользователь её не указывал)
    const DEFAULT_PERIOD_LENGTH = 5;

    const DAY_MS = 24 * 60 * 60 * 1000;

    // Приводим дату к полуночи локального времени — считаем в целых днях
    function stripTime(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    // Принимает Date или строку 'YYYY-MM-DD' (локальное время, без смещения UTC)
    function toDate(value) {
        if (value instanceof Date) return stripTime(value);
        const [y, m, d] = value.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // Номер дня цикла для даты с учётом повторяющихся циклов.
    // День 1 — день начала месячных. Используется для раскраски календаря
    // и карточек дат: даты после конца цикла заворачиваются в следующий.
    // Дата раньше cycleStart → null.
    function getCycleDay(onDate, cycleStart, cycleLength) {
        const diff = Math.round((stripTime(toDate(onDate)) - toDate(cycleStart)) / DAY_MS);
        if (diff < 0) return null;
        return (diff % cycleLength) + 1;
    }

    // Сколько дней прошло от начала отслеживаемого цикла, без заворота.
    // Может вернуть число больше cycleLength — это «просроченный» цикл
    // (getPhase тогда вернёт overdue). Дата раньше cycleStart → null.
    function getCurrentDay(onDate, cycleStart, cycleLength) {
        const diff = Math.round((stripTime(toDate(onDate)) - toDate(cycleStart)) / DAY_MS);
        if (diff < 0) return null;
        return diff + 1;
    }

    // Фаза по номеру дня: menstrual / follicular / ovulatory / luteal.
    // Менструальная фаза длится periodLength дней (длительность месячных
    // пользователя). Если день больше длины цикла — цикл «просрочен»
    // (overdue) — деликатный статус, не ошибка.
    // Для cycleDay = null вернёт null.
    function getPhase(cycleDay, cycleLength, periodLength) {
        if (cycleDay === null || cycleDay === undefined) return null;
        const period = periodLength || DEFAULT_PERIOD_LENGTH;
        if (cycleDay > cycleLength) return PHASE.OVERDUE;
        if (cycleDay <= period) return PHASE.MENSTRUAL;
        if (cycleDay <= cycleLength - 14) return PHASE.FOLLICULAR;
        if (cycleDay <= cycleLength - 12) return PHASE.OVULATORY;
        return PHASE.LUTEAL;
    }

    // Диапазоны дней фаз — единый источник для карточек и подписей в UI.
    // Должен сходиться с getPhase: границы здесь и в ветвлении выше — одни.
    function phaseRanges(cycleLength, periodLength) {
        const P = periodLength || DEFAULT_PERIOD_LENGTH;
        const L = cycleLength;
        return {
            [PHASE.MENSTRUAL]: [1, P],
            [PHASE.FOLLICULAR]: [P + 1, L - 14],
            [PHASE.OVULATORY]: [L - 13, L - 12],
            [PHASE.LUTEAL]: [L - 11, L],
        };
    }

    // Подпериод лютеиновой фазы по номеру дня:
    // предменструальная неделя — последние 7 дней цикла (L-6 .. L),
    // стабильная — остаток лютеиновой (L-11 .. L-7).
    // Вне лютеиновой фазы и для null возвращает null.
    function getSubperiod(cycleDay, cycleLength, periodLength) {
        const phase = getPhase(cycleDay, cycleLength, periodLength);
        if (phase !== PHASE.LUTEAL) return null;
        return cycleDay >= cycleLength - 6
            ? SUBPERIOD.PREMENSTRUAL
            : SUBPERIOD.LUTEAL_STABLE;
    }

    // Фаза для конкретной даты (для раскраски календаря и карточки дня)
    function getPhaseForDate(onDate, cycleStart, cycleLength, periodLength) {
        return getPhase(
            getCycleDay(onDate, cycleStart, cycleLength), cycleLength, periodLength,
        );
    }

    // Ожидаемая дата следующей менструации (от cycleStart)
    function getNextPeriodDate(cycleStart, cycleLength) {
        const d = toDate(cycleStart);
        d.setDate(d.getDate() + cycleLength);
        return d;
    }

    // Форматирует Date как 'YYYY-MM-DD'
    function toISODate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Сетка календаря месяца: недели с понедельника, по 7 ячеек.
    // Каждая ячейка: { date: 'YYYY-MM-DD', day: число, inMonth: bool,
    //                  phase: ключ фазы или null, isToday: bool }
    function buildCalendarMonth(
        year, month, cycleStart, cycleLength, periodLength,
    ) {
        const todayISO = toISODate(new Date());
        const first = new Date(year, month, 1);
        // Сдвиг до ближайшего понедельника (getDay: 0 = воскресенье)
        const offset = (first.getDay() + 6) % 7;
        const start = new Date(year, month, 1 - offset);

        const weeks = [];
        for (let w = 0; w < 6; w += 1) {
            const week = [];
            for (let i = 0; i < 7; i += 1) {
                const cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
                const iso = toISODate(cellDate);
                week.push({
                    date: iso,
                    day: cellDate.getDate(),
                    inMonth: cellDate.getMonth() === month,
                    phase: getPhaseForDate(cellDate, cycleStart, cycleLength, periodLength),
                    isToday: iso === todayISO,
                });
            }
            // Не тащим лишнюю пустую неделю в конец месяца
            if (w === 4 && week.every((c) => !c.inMonth)) break;
            weeks.push(week);
        }
        return weeks;
    }

    return {
        PHASE,
        SUBPERIOD,
        DEFAULT_PERIOD_LENGTH,
        toDate,
        toISODate,
        getCycleDay,
        getCurrentDay,
        getPhase,
        getSubperiod,
        getPhaseForDate,
        getNextPeriodDate,
        buildCalendarMonth,
        phaseRanges,
    };
})();
