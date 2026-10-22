// Экран «Сегодня» — вёрстка 1-в-1 с референсом (Экраны/Первая вкладка.jpg).
// Шапка → hero текущей фазы → чек-ин → компактная сводка активности недели.
// Фазы цикла и полная статистика живут на своих вкладках («Цикл», «Активность»).

const TODAY_PHASE_ORDER = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

const ENERGY_EMOJIS = ['😴', '😐', '🙂', '😊', '⚡'];
const MOOD_EMOJIS = ['😞', '😐', '🙂', '😊', '🤩'];
const FEELING_LABELS = ['плохо', 'нормально', 'хорошо'];

App.screens.today = (() => {

    let progressData = null;

    async function onShow() {
        if (App.state.cycleError) {
            setHTML('today-content', errorState(App.state.cycleError, 'App.screens.today.onShow'));
            return;
        }
        try {
            await loadToday();
            await loadUser();
        } catch (err) {
            setHTML('today-content', errorState(
                `Не получилось загрузить день: ${apiErrorText(err)}`,
                'App.screens.today.onShow'));
            return;
        }
        try {
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            progressData = await apiGet(`/api/progress?month=${month}&date=${todayISO()}`);
        } catch (err) {
            console.error('[today] /api/progress:', err);
            progressData = { days: {}, workouts_completed: 0, active_minutes: 0, regularity_pct: 0 };
        }
        render();
        // Геймификация: поздравление с переходом уровня и лепесток «+N» (без карточки уровня)
        const g = App.state.today && App.state.today.gamification;
        if (g && g.points) {
            Gamification.checkLevelUp(g.points);
            Gamification.petalIfIncreased(g.points);
        }
    }

    // --- Данные фазы: контент + актуальный диапазон дней из CycleMath ---
    function phaseInfo(key) {
        const cycle = App.state.cycle || {};
        const period = cycle.period_length || CycleMath.DEFAULT_PERIOD_LENGTH;
        const ranges = CycleMath.phaseRanges(cycle.cycle_length || 28, period);
        const p = (App.state.content && App.state.content.phases[key]) || {};
        const range = ranges[key] || [1, cycle.cycle_length || 28];
        return { ...p, from: range[0], to: range[1] };
    }

    function currentWeekDates() {
        const now = new Date();
        const dow = (now.getDay() + 6) % 7; // 0 = понедельник
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
        return Array.from({ length: 7 }, (_, i) =>
            CycleMath.toISODate(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
    }

    function render() {
        const cycle = App.state.cycle;
        const noCycle = !cycle || cycle.cycle_day === null || !cycle.phase;
        const parts = noCycle
            ? [renderHeader(), renderNoCycle()]
            : [renderHeader(), renderHero(), renderCheckinRow(),
               renderActivityBlock()];
        setHTML('today-content', parts.join(''));
        bindAll();
    }

    // --- 1. Шапка: приветствие + мини-карточка цикла (без фазы и декора) ---
    function renderHeader() {
        const cycle = App.state.cycle;
        const card = (cycle && cycle.cycle_day !== null && cycle.phase)
            ? Components.cycleCard(cycle.cycle_day, '', { withoutPhase: true })
            : Components.cycleCard('—', '', { withoutPhase: true });
        return `
        <header class="td-header">
            <div class="td-header-text">
                <h1 class="td-greet">Привет,<br><span class="td-name">${esc(displayName())}</span></h1>
                <p class="td-sub">Забота о себе — это не цель,<br>а образ жизни</p>
            </div>
            <div class="td-header-side">
                ${card}
            </div>
        </header>`;
    }

    function renderNoCycle() {
        const c = App.state.content.today_screen;
        return `
        <section class="card">
            <h3>${esc(c.cycle_no_data_title)}</h3>
            <p class="subtitle">${esc(c.cycle_no_data_text)}</p>
            <button class="btn btn-small" id="t-setup-cycle">${esc(c.cycle_setup)}</button>
        </section>`;
    }

    // --- 2. Hero текущей фазы (терракотовый градиент, фото справа) ---
    function renderHero() {
        const cycle = App.state.cycle;
        const p = phaseInfo(cycle.phase);
        return `
        <section class="td-hero" id="t-hero" role="button" tabindex="0"
                 aria-label="${esc(p.name || '')}">
            <img class="td-hero-img" src="${IMAGES['hero-svetlana']}" alt="">
            <div class="td-hero-inner">
                <span class="td-hero-badge">Сегодня</span>
                <h2 class="td-hero-title">${esc(p.name || '')}</h2>
                <p class="td-hero-meta">С ${p.from} по ${p.to} день цикла · Вы в середине фазы</p>
                <div class="td-hero-notes">
                    <span class="td-hero-note">${Components.icon('leaf', 16)} Энергия стабильна</span>
                    <span class="td-hero-note">${Components.icon('clock', 16)} Поддержка энергии</span>
                </div>
                ${Components.pillButton('Подробнее ›', 'hero')}
            </div>
        </section>`;
    }

    // --- 3. Строка чек-ина (открывает шторку самочувствия) ---
    function renderCheckinRow() {
        return `
        <button class="td-checkin" id="t-checkin">
            <span class="td-checkin-icon">${Components.icon('lotus', 22)}</span>
            <span class="td-checkin-text">
                <span class="td-checkin-title">Как чувствует себя ваше тело?</span>
                <span class="td-checkin-sub">Выберите, что вас сейчас беспокоит</span>
            </span>
            <span class="gf-chev">›</span>
        </button>`;
    }

    // --- 4. Фазы цикла на «Сегодня» не показываем: фазы живут на вкладке «Цикл» ---

    // --- 5. Активность недели ---
    function renderActivityBlock() {
        const labels = (App.state.content.common && App.state.content.common.day_names) || [];
        const week = currentWeekDates();
        const days = (progressData && progressData.days) || {};
        const doneIdx = week
            .map((iso, i) => (days[iso] && days[iso].workouts ? i : -1))
            .filter((i) => i >= 0);
        return `
        <section class="td-activity" id="t-activity" role="button" tabindex="0" aria-label="Активность">
            <div class="td-activity-head">
                <span class="td-activity-ic">${Components.icon('footprints', 22)}</span>
                <span class="td-activity-titles">
                    <span class="td-activity-title">Активность</span>
                    <span class="td-activity-sub">Двигайтесь к своим целям</span>
                </span>
                <span class="gf-chev">›</span>
            </div>
            <div class="td-activity-body">
                <div class="td-activity-count">
                    <span class="td-count">${doneIdx.length} / 7</span>
                    <span class="td-count-cap">дней выполнено</span>
                </div>
                <div class="td-activity-week">${Components.weekDots(labels, doneIdx, labels)}</div>
            </div>
            <p class="td-activity-note">${Components.icon('leaf', 16)} Уже лучше, чем на прошлой неделе ♡</p>
        </section>`;
    }

    // --- 6. «За месяц» на «Сегодня» не дублируем: полная статистика — на вкладке «Активность» ---

    // --- Шторка чек-ина (самочувствие + вода) ---
    function openCheckin() {
        const c = App.state.content.today_screen;
        const gc = App.state.content.gamification;
        const t = App.state.today;
        const wb = t.wellbeing;
        const g = t.gamification || { water_glasses: 0, care_day: { water_norm: 8 } };
        const norm = (g.care_day && g.care_day.water_norm) || 8;
        const glasses = g.water_glasses || 0;
        const drops = Array.from({ length: norm }, (_, i) =>
            `<span class="water-drop${i < glasses ? ' full' : ''}">💧</span>`).join('');
        const scale = (emojis, value, cls) => emojis.map((e, i) =>
            `<button class="checkin-emoji${value === i + 1 ? ' active' : ''}"
                data-scale="${cls}" data-value="${i + 1}">${e}</button>`).join('');
        openModal(`
            <h2>Как чувствует себя ваше тело?</h2>
            <p class="subtitle">Выберите, что вас сейчас беспокоит</p>
            <div>
                <p class="checkin-label">${esc(gc.water_title)} ·
                    <span id="t-water-count">${glasses}</span> ${esc(gc.water_hint.replace('{norm}', norm))}</p>
                <div class="water-row">
                    <button class="water-btn" id="t-water-minus" aria-label="Меньше">−</button>
                    <div class="water-drops" id="t-water-drops">${drops}</div>
                    <button class="water-btn" id="t-water-plus" aria-label="Больше">＋</button>
                </div>
            </div>
            <div>
                <p class="checkin-label">${esc(c.checkin_energy)}</p>
                <div class="checkin-row">${scale(ENERGY_EMOJIS, wb ? wb.energy : null, 'energy')}</div>
            </div>
            <div>
                <p class="checkin-label">${esc(c.checkin_mood)}</p>
                <div class="checkin-row">${scale(MOOD_EMOJIS, wb ? wb.mood : null, 'mood')}</div>
            </div>
            <div>
                <p class="checkin-label">${esc(c.checkin_feeling)}</p>
                <div class="feeling-row">
                    ${FEELING_LABELS.map((label, i) =>
                        `<button class="feeling-btn${wb && wb.feeling === i ? ' active' : ''}"
                            data-scale="feeling" data-value="${i}">${label}</button>`).join('')}
                </div>
            </div>
            <p class="text-muted" id="t-checkin-saved">${wb ? esc(c.checkin_saved) : ''}</p>
        `);
        const minus = el('t-water-minus');
        if (minus) {
            minus.addEventListener('click', () => changeWater(-1));
            el('t-water-plus').addEventListener('click', () => changeWater(+1));
        }
        document.querySelectorAll('#modal-root [data-scale]').forEach((btn) => {
            btn.addEventListener('click', () => saveCheckin(btn));
        });
    }

    async function changeWater(delta) {
        const g = App.state.today.gamification;
        const norm = (g.care_day && g.care_day.water_norm) || 8;
        const current = g.water_glasses || 0;
        const next = Math.max(0, Math.min(norm, current + delta));
        if (next === current) return;
        g.water_glasses = next;
        const drops = el('t-water-drops').querySelectorAll('.water-drop');
        drops.forEach((d, i) => d.classList.toggle('full', i < next));
        el('t-water-count').textContent = String(next);
        try {
            const res = await apiPost('/api/water', { date: todayISO(), glasses: next });
            g.care_day.water = res.glasses >= res.norm;
        } catch (err) {
            g.water_glasses = current;
            drops.forEach((d, i) => d.classList.toggle('full', i < current));
            el('t-water-count').textContent = String(current);
            el('t-checkin-saved').textContent = `Не сохранилось: ${apiErrorText(err)}`;
        }
    }

    async function saveCheckin(clicked) {
        const scale = clicked.dataset.scale;
        const value = parseInt(clicked.dataset.value, 10);
        document.querySelectorAll(`#modal-root [data-scale="${scale}"]`)
            .forEach((b) => b.classList.toggle('active', b === clicked));
        const c = App.state.content.today_screen;
        const current = App.state.today.wellbeing || {};
        const payload = {
            date: todayISO(),
            energy: scale === 'energy' ? value : (current.energy || 3),
            mood: scale === 'mood' ? value : (current.mood || 3),
            feeling: scale === 'feeling' ? value : (current.feeling == null ? 1 : current.feeling),
        };
        try {
            const saved = await apiPost('/api/wellbeing', payload);
            App.state.today.wellbeing = saved;
            el('t-checkin-saved').textContent = c.checkin_saved;
        } catch (err) {
            el('t-checkin-saved').textContent = `Не сохранилось: ${apiErrorText(err)}`;
        }
    }

    // --- События ---
    function bindAll() {
        const setup = el('t-setup-cycle');
        if (setup) setup.addEventListener('click', () => showMain('profile'));

        const hero = el('t-hero');
        if (hero) hero.addEventListener('click', () =>
            App.screens.cycle.openPhase(App.state.cycle.phase));

        const checkin = el('t-checkin');
        if (checkin) checkin.addEventListener('click', openCheckin);

        const activity = el('t-activity');
        if (activity) activity.addEventListener('click', () => showMain('activity'));
    }

    return { onShow, render };
})();
