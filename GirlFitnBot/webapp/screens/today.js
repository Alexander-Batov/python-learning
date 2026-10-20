// Экран «Сегодня»: карточка цикла → фраза дня → активность → питание →
// привычка → чек-ин → прогресс дня. Визуальная иерархия спеки соблюдена.

const ENERGY_EMOJIS = ['😴', '😐', '🙂', '😊', '⚡'];
const MOOD_EMOJIS = ['😞', '😐', '🙂', '😊', '🤩'];
const FEELING_LABELS = ['плохо', 'нормально', 'хорошо'];

App.screens.today = (() => {

    async function onShow() {
        renderHeader();
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
        render();
    }

    function renderHeader() {
        const c = App.state.content ? App.state.content.today_screen : null;
        const hour = new Date().getHours();
        const greet = !c ? 'Привет'
            : hour < 5 ? c.greeting_evening
            : hour < 11 ? c.greeting_morning
            : hour < 18 ? c.greeting_day
            : c.greeting_evening;
        el('today-greeting').textContent = `${greet}, ${displayName()} ♡`;
        el('today-date').textContent = formatHeaderDate();
        el('today-avatar').textContent = avatarLetter();
    }

    function render() {
        const c = App.state.content.today_screen;
        const t = App.state.today;
        if (!t) {
            setHTML('today-content', emptyState(c.loading));
            return;
        }
        const parts = [
            renderCycleCard(c),
            renderPhrase(c),
            renderActivity(c, t),
            renderNutrition(c),
            renderHabit(c, t),
            renderCheckin(c, t),
            renderProgress(c, t),
        ];
        setHTML('today-content', parts.join(''));
        bindAll(c, t);
    }

    // --- Карточка цикла (самая заметная) ---
    function renderCycleCard(c) {
        const cycle = App.state.cycle;
        if (!cycle || cycle.cycle_day === null || !cycle.phase) {
            return `
            <section class="cycle-card">
                <div class="cycle-card-top">
                    <div class="cycle-badge">
                        <span class="cycle-badge-label">🌸</span>
                    </div>
                    <div class="cycle-card-info">
                        <p class="cycle-phase-name">${c.cycle_no_data_title}</p>
                        <p class="cycle-next">${c.cycle_no_data_text}</p>
                    </div>
                </div>
                <button class="btn btn-small" id="t-setup-cycle">${c.cycle_setup}</button>
            </section>`;
        }
        const phase = App.state.content.phases[cycle.phase];
        const pos = Math.min(100, Math.max(0, (cycle.cycle_day / cycle.cycle_length) * 100));
        return `
        <section class="cycle-card">
            <div class="cycle-card-top">
                <div class="cycle-badge">
                    <span class="cycle-badge-label">${c.cycle_day_prefix}</span>
                    <span class="cycle-badge-day">${cycle.cycle_day}</span>
                </div>
                <div class="cycle-card-info">
                    <p class="cycle-phase-name">${phase.name}</p>
                    <p class="cycle-next">${c.next_period_prefix} ≈ ${daysUntil(cycle.next_period)} ${c.days_word}</p>
                </div>
            </div>
            <div>
                <div class="cycle-track">
                    <div class="cycle-track-line"></div>
                    <div class="cycle-track-fill" style="width: calc(${pos}% - 4px);"></div>
                    <div class="cycle-track-dot" style="left: calc(${pos}% );"></div>
                </div>
                <div class="cycle-track-marks">
                    <span>1</span><span>${cycle.cycle_length}</span>
                </div>
            </div>
            <button class="link-btn" id="t-more-cycle">${c.more_cycle} →</button>
        </section>`;
    }

    function daysUntil(iso) {
        const diff = dateFromISO(iso) - dateFromISO(todayISO());
        return Math.max(0, Math.round(diff / 86400000));
    }

    // --- Фраза дня (по фазе, детерминированно) ---
    function renderPhrase(c) {
        const cycle = App.state.cycle;
        const phrases = (App.state.content.phrases || {})[cycle && cycle.phase];
        const text = pickByDate(phrases, todayISO())
            || pickByDate(App.state.content.wishes, todayISO());
        if (!text) return '';
        return `
        <section class="card card-warm">
            <h3>${c.phrase_title}</h3>
            <p class="subtitle" style="font-style:italic">${text}</p>
        </section>`;
    }

    // --- Карточка активности (главная карточка тренировки по референсу) ---
    function renderActivity(c, t) {
        const w = t.workout;
        if (!w) {
            return `
            <section class="card">
                <h3>${c.activity_title}</h3>
                <p class="empty-hint">${App.state.content.activity_screen.alt_text}</p>
            </section>`;
        }
        const labels = App.state.content.common.intensity_labels;
        const catLabels = App.state.content.common.category_labels;
        const doneBadge = w.completed ? `<div class="hero-done-badge">✓ ${App.state.content.activity_screen.completed}</div>` : '';
        return `
        <section class="hero-workout" id="t-hero">
            ${doneBadge}
            <div class="hero-workout-text">
                <span class="hero-tag">${c.activity_recommendation}</span>
                <h2 class="hero-workout-title">${esc(w.title)}</h2>
                <p class="hero-workout-meta">${w.duration_min} мин · ${labels[w.intensity] || ''} · ${catLabels[w.category] || ''}</p>
                <p class="hero-workout-meta">${esc(w.equipment)}</p>
            </div>
            <button class="btn btn-light" id="t-start-workout">${c.start_workout}</button>
            <button class="link-btn" id="t-choose-other"
                style="color:#FFF9F1;opacity:.9;position:relative;z-index:1;align-self:flex-start">
                ${c.choose_other} →
            </button>
        </section>`;
    }

    // --- Карточка питания ---
    function renderNutrition(c) {
        const cycle = App.state.cycle;
        const focus = (App.state.content.nutrition_focus || {})[cycle && cycle.phase]
            || App.state.content.nutrition_screen.plate_text;
        return `
        <section class="card">
            <h3>${c.nutrition_title}</h3>
            <p class="subtitle">${focus}</p>
            <button class="link-btn" id="t-nutrition-cta">${c.nutrition_cta} →</button>
        </section>`;
    }

    // --- Карточка привычки дня ---
    function renderHabit(c, t) {
        const habits = t.habits || [];
        if (!habits.length) {
            return `
            <section class="card">
                <h3>${c.habit_title}</h3>
                <p class="empty-hint">${App.state.content.habits_screen.empty}</p>
                <button class="link-btn" id="t-add-habit">${App.state.content.habits_screen.add_title} →</button>
            </section>`;
        }
        const h = habits[0];
        const dots = Array.from({ length: h.week.target }, (_, i) =>
            `<span class="habit-dot${i < h.week.done ? ' on' : ''}"></span>`).join('');
        return `
        <section class="card">
            <h3>${c.habit_title}</h3>
            <div class="habit-check-card">
                <div class="habit-emoji-lg">${h.emoji || '🌱'}</div>
                <div class="habit-info">
                    <p class="habit-title">${esc(h.title)}</p>
                    <div class="habit-progress-dots" title="${h.week.done}/${h.week.target}">${dots}</div>
                    <p class="text-muted" id="t-habit-caption">${h.done_today ? c.habit_done : ''}</p>
                </div>
                <button class="habit-toggle${h.done_today ? ' done' : ''}" id="t-habit-toggle">✓</button>
            </div>
        </section>`;
    }

    // --- Мини-чек-ин (автосохранение) ---
    function renderCheckin(c, t) {
        const wb = t.wellbeing;
        const energy = wb ? wb.energy : null;
        const mood = wb ? wb.mood : null;
        const feeling = wb ? wb.feeling : null;
        const scale = (emojis, value, cls) => emojis.map((e, i) =>
            `<button class="checkin-emoji${value === i + 1 ? ' active' : ''}"
                data-scale="${cls}" data-value="${i + 1}">${e}</button>`).join('');
        return `
        <section class="card">
            <div class="card-title-row">
                <h3>${c.checkin_title}</h3>
                <span class="text-muted" id="t-checkin-saved">${wb ? c.checkin_saved : ''}</span>
            </div>
            <div>
                <p class="checkin-label">${c.checkin_energy}</p>
                <div class="checkin-row" id="t-energy">${scale(ENERGY_EMOJIS, energy, 'energy')}</div>
            </div>
            <div>
                <p class="checkin-label">${c.checkin_mood}</p>
                <div class="checkin-row" id="t-mood">${scale(MOOD_EMOJIS, mood, 'mood')}</div>
            </div>
            <div>
                <p class="checkin-label">${c.checkin_feeling}</p>
                <div class="feeling-row" id="t-feeling">
                    ${FEELING_LABELS.map((label, i) =>
                        `<button class="feeling-btn${feeling === i ? ' active' : ''}"
                            data-scale="feeling" data-value="${i}">${label}</button>`).join('')}
                </div>
            </div>
        </section>`;
    }

    // --- Прогресс дня ---
    function renderProgress(c, t) {
        const p = t.progress;
        const items = [
            { key: 'workout', done: Boolean(t.workout && t.workout.completed) },
            { key: 'checkin', done: Boolean(t.wellbeing) },
            { key: 'habit', done: (t.habits || []).some((h) => h.done_today) },
        ];
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        return `
        <section class="card card-warm">
            <div class="progress-line">
                <h3>${c.progress_title}</h3>
                <span class="progress-count">${p.done} ${c.progress_of} ${p.total}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="day-tasks">
                ${items.map((i) => `
                    <div class="day-task${i.done ? ' done' : ''}">
                        <span class="task-icon">✓</span>
                        <span>${c.progress_items[i.key]}</span>
                    </div>`).join('')}
            </div>
        </section>`;
    }

    // --- Привязка событий ---
    function bindAll(c, t) {
        const setupBtn = el('t-setup-cycle');
        if (setupBtn) setupBtn.addEventListener('click', () => showMain('profile'));

        const moreBtn = el('t-more-cycle');
        if (moreBtn) moreBtn.addEventListener('click', () => showMain('cycle'));

        const startBtn = el('t-start-workout');
        if (startBtn) startBtn.addEventListener('click', () => {
            App.screens.activity.openWorkout(t.workout);
        });
        const chooseBtn = el('t-choose-other');
        if (chooseBtn) chooseBtn.addEventListener('click', () => showMain('activity'));

        const nutriBtn = el('t-nutrition-cta');
        if (nutriBtn) nutriBtn.addEventListener('click', () => showMain('nutrition'));

        const addHabit = el('t-add-habit');
        if (addHabit) addHabit.addEventListener('click', () => App.screens.habits.openAdd());

        const habitToggle = el('t-habit-toggle');
        if (habitToggle) habitToggle.addEventListener('click', async () => {
            const h = (App.state.today.habits || [])[0];
            if (!h) return;
            habitToggle.disabled = true;
            try {
                const res = await apiPost(`/api/habits/${h.id}/toggle`, { date: todayISO() });
                h.done_today = res.done;
                if (res.done) h.week.done += 1;
                else h.week.done = Math.max(0, h.week.done - 1);
                App.state.today.progress.done = [
                    Boolean(App.state.today.workout && App.state.today.workout.completed),
                    Boolean(App.state.today.wellbeing),
                    (App.state.today.habits || []).some((x) => x.done_today),
                ].filter(Boolean).length;
                render();
            } catch (err) {
                habitToggle.disabled = false;
                const cap = el('t-habit-caption');
                if (cap) cap.textContent = `Не сохранилось: ${apiErrorText(err)}`;
            }
        });

        // Чек-ин: выбор сразу сохраняет (~30 секунд на весь чек-ин, без кнопки)
        document.querySelectorAll('#today-content [data-scale]').forEach((btn) => {
            btn.addEventListener('click', () => saveCheckin(c, btn));
        });
    }

    async function saveCheckin(c, clicked) {
        const scale = clicked.dataset.scale;
        const value = parseInt(clicked.dataset.value, 10);
        document.querySelectorAll(`#today-content [data-scale="${scale}"]`)
            .forEach((b) => b.classList.toggle('active', b === clicked));

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
            App.state.today.progress.done = [
                Boolean(App.state.today.workout && App.state.today.workout.completed),
                true,
                (App.state.today.habits || []).some((x) => x.done_today),
            ].filter(Boolean).length;
            const savedEl = el('t-checkin-saved');
            if (savedEl) savedEl.textContent = c.checkin_saved;
            const progressCard = el('today-content').lastElementChild;
            if (progressCard) {
                const t = App.state.today;
                progressCard.outerHTML = renderProgress(
                    App.state.content.today_screen, t);
            }
        } catch (err) {
            const savedEl = el('t-checkin-saved');
            if (savedEl) savedEl.textContent = `Не сохранилось: ${apiErrorText(err)}`;
        }
    }

    return { onShow, render };
})();
