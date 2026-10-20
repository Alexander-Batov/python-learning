// Экран «Активность»: тренировка дня, фильтры, каталог, статистика недели/месяца,
// плеер тренировки (до → во время → после). Пропуск дня — без негатива.

App.screens.activity = (() => {
    const filters = { category: 'all', duration: '', intensity: '' };
    let catalogCache = null;
    let progressCache = null;

    async function onShow() {
        el('activity-subtitle').textContent =
            App.state.content.activity_screen.subtitle;
        setHTML('activity-content', emptyState(App.state.content.common.loading));
        try {
            await Promise.all([loadDaily(), loadProgress()]);
            render();
        } catch (err) {
            setHTML('activity-content', errorState(
                `Не получилось загрузить активность: ${apiErrorText(err)}`,
                'App.screens.activity.onShow'));
        }
    }

    async function loadDaily() {
        catalogCache = await apiGet(`/api/workouts?date=${todayISO()}`);
    }

    async function loadProgress() {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        progressCache = await apiGet(`/api/progress?month=${month}&date=${todayISO()}`);
    }

    function render() {
        const c = App.state.content.activity_screen;
        const items = catalogCache ? catalogCache.items : [];
        const daily = pickDaily(items);
        setHTML('activity-content', [
            renderTodayCard(c, daily),
            renderAltCard(c),
            renderFilters(c),
            renderCatalog(c, items),
            renderWeek(c),
            renderMonth(c),
        ].join(''));
        bindAll(c, items);
    }

    function pickDaily(items) {
        // Та же рекомендация, что в «Сегодня» (детерминированный выбор сервера)
        if (App.state.today && App.state.today.workout) {
            return App.state.today.workout;
        }
        const cycle = App.state.cycle;
        const phase = cycle && cycle.phase;
        const suitable = items.filter((w) => (phase ? w.phases.includes(phase) : w.intensity === 'easy'));
        return pickByDate(suitable.length ? suitable : items, todayISO());
    }

    function renderTodayCard(c, daily) {
        const cycle = App.state.cycle;
        const dayLabel = cycle && cycle.cycle_day ? ` · День ${cycle.cycle_day}` : '';
        if (!daily) return '';
        const labels = App.state.content.common.intensity_labels;
        const catLabels = App.state.content.common.category_labels;
        const stateLabel = daily.completed ? c.state_completed : c.state_start;
        return `
        <section class="hero-workout">
            ${daily.completed ? `<div class="hero-done-badge">✓ ${c.completed}</div>` : ''}
            <div class="hero-workout-text">
                <span class="hero-tag">${c.today_card}${dayLabel}</span>
                <h2 class="hero-workout-title">${esc(daily.title)}</h2>
                <p class="hero-workout-meta">${daily.duration_min} мин · ${labels[daily.intensity]} · ${catLabels[daily.category]}</p>
                <p class="hero-workout-meta">${esc(daily.equipment)}</p>
            </div>
            <button class="btn btn-light" id="ac-start">${stateLabel === c.state_completed ? c.completed : c.player_start}</button>
        </section>`;
    }

    function renderAltCard(c) {
        return `
        <button class="card card-warm" id="ac-alt"
            style="cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-primary);">
            <div class="flex-between">
                <div>
                    <p class="habit-title">${c.alt_title}</p>
                    <p class="text-muted">${c.alt_text}</p>
                </div>
                <span style="color:var(--text-muted);font-size:18px;">→</span>
            </div>
        </button>`;
    }

    function renderFilters(c) {
        const row = (items, group) => items.map((f) => `
            <button class="filter-chip${filters[group] === f.id ? ' active' : ''}"
                data-group="${group}" data-id="${f.id}">${f.label}</button>`).join('');
        return `
        <section class="stack" style="gap:8px;">
            <div class="filter-row">${row(c.filters_category, 'category')}</div>
            <div class="filter-row">${row(c.filters_duration, 'duration')}</div>
            <div class="filter-row">${row(c.filters_intensity, 'intensity')}</div>
        </section>`;
    }

    function renderCatalog(c, items) {
        const labels = App.state.content.common.intensity_labels;
        const catLabels = App.state.content.common.category_labels;
        const filtered = items.filter((w) => {
            if (filters.category !== 'all' && w.category !== filters.category) return false;
            if (filters.intensity && w.intensity !== filters.intensity) return false;
            if (filters.duration) {
                const limits = { 10: 15, 20: 25, 30: 35 };
                if (filters.duration in limits && w.duration_min > limits[filters.duration]) return false;
                if (filters.duration === '40' && w.duration_min <= 35) return false;
            }
            return true;
        });
        const cards = filtered.map((w) => `
            <div class="card workout-card">
                <div class="workout-thumb t-${w.category}">
                    ${categoryIcon(w.category)}
                </div>
                <div class="workout-card-info">
                    <p class="workout-card-title">${esc(w.title)}</p>
                    <p class="workout-card-meta">${w.duration_min} мин · ${labels[w.intensity]}</p>
                    ${w.equipment === c.no_equipment || w.equipment === 'без оборудования'
                        ? `<span class="workout-tag">${c.no_equipment}</span>` : ''}
                </div>
                ${w.completed
                    ? `<span class="done-badge">✓ ${c.completed}</span>`
                    : `<button class="btn btn-small workout-open" data-id="${w.id}">${c.start}</button>`}
            </div>`).join('');
        return `
        <section class="stack">
            <h3>${c.catalog_title}</h3>
            ${cards || emptyState(c.empty)}
        </section>`;
    }

    function categoryIcon(cat) {
        const icons = {
            strength: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M6.5 6.5 17.5 17.5M4 9l3-3M17 20l3-3M2 12h4M18 12h4M4 15l3 3M17 7l3 3"/></svg>',
            cardio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>',
            yoga: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
            stretching: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4"/></svg>',
            recovery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
        };
        return icons[cat] || icons.recovery;
    }

    function renderWeek(c) {
        if (!progressCache) return '';
        // Текущая неделя (пн–вс): отметки из дневного покрытия месяца
        const today = dateFromISO(todayISO());
        const monday = new Date(today);
        monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        const names = App.state.content.common.day_names;
        let doneCount = 0;
        const dots = names.map((n, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const iso = CycleMath.toISODate(d);
            const day = progressCache.days[iso];
            const done = Boolean(day && day.workouts > 0);
            if (done && i <= (today.getDay() === 0 ? 6 : today.getDay() - 1)) doneCount += 1;
            return `
                <div class="week-day${done ? ' done' : ''}">
                    <div class="week-day-dot">${done ? '✓' : '—'}</div>
                    <span>${n}</span>
                </div>`;
        }).join('');

        // «Регулярно уже N недель» — по полным неделям текущего месяца
        const activeWeeks = (progressCache.weeks || []).filter((w) => w.pct > 0).length;
        const streakText = activeWeeks > 0
            ? `${c.regular_prefix} ${activeWeeks} ${c.weeks_word} 💛`
            : `Небольшие шаги — и первая неделя уже близко 💛`;

        return `
        <section class="card">
            <h3>${c.my_week_title}</h3>
            <div class="flex-between">
                <p class="subtitle">${c.week_progress} <b>${doneCount}/4</b> ${c.week_goal}</p>
            </div>
            <div class="week-dots">${dots}</div>
            <p class="text-muted">${streakText}</p>
        </section>`;
    }

    function renderMonth(c) {
        if (!progressCache) return '';
        const p = progressCache;
        return `
        <button class="card card-warm" id="ac-stats" style="cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-primary);">
            <div class="card-title-row">
                <h3>${c.month_title}</h3>
                <span class="text-muted">${c.all_stats} →</span>
            </div>
            <div class="stats-grid">
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.workouts_completed}</span>
                    <span class="stat-cell-label">${c.workouts_word}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.active_minutes}</span>
                    <span class="stat-cell-label">${c.minutes_word}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.regularity_pct}%</span>
                    <span class="stat-cell-label">${c.plan_completion}</span>
                </div>
            </div>
        </button>`;
    }

    function bindAll(c, items) {
        const start = el('ac-start');
        if (start) start.addEventListener('click', () => {
            const daily = pickDaily(items);
            if (daily) openWorkout(daily);
        });

        el('ac-alt').addEventListener('click', () => {
            filters.category = 'all';
            filters.intensity = 'easy';
            render();
            window.scrollTo({ top: el('activity-content').offsetTop, behavior: 'smooth' });
        });

        document.querySelectorAll('#activity-content .filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                filters[chip.dataset.group] = chip.dataset.id;
                render();
            });
        });

        document.querySelectorAll('#activity-content .workout-open').forEach((btn) => {
            btn.addEventListener('click', () => {
                const w = items.find((x) => x.id === Number(btn.dataset.id));
                if (w) openWorkout(w);
            });
        });

        const stats = el('ac-stats');
        if (stats) stats.addEventListener('click', () => App.screens.profile.openStats());
    }

    // ============ Плеер тренировки ============
    const player = { workout: null, steps: [], index: 0, remaining: 0, timer: null, paused: false };

    function flattenStructure(w) {
        const c = App.state.content.activity_screen;
        const s = w.structure || {};
        const map = (list, phase, label) => (list || []).map((e) => ({ ...e, phase, phaseLabel: label }));
        return [
            ...map(s.warmup, 'warmup', c.phase_warmup),
            ...map(s.main, 'main', c.phase_main),
            ...map(s.cooldown, 'cooldown', c.phase_cooldown),
        ];
    }

    function openWorkout(w) {
        player.workout = w;
        player.steps = flattenStructure(w);
        player.index = 0;
        player.remaining = player.steps.length ? player.steps[0].duration_sec : 0;
        player.paused = false;
        renderIntro();
        showScreen('workout');
    }

    function renderIntro() {
        const c = App.state.content.activity_screen;
        const w = player.workout;
        const s = w.structure || {};
        const block = (label, items) => `
            <div class="flex-between" style="padding:6px 0;">
                <span class="text-muted">${label}</span>
                <span style="font-weight:600;">${(items || []).reduce((a, e) => a + e.duration_sec, 0) / 60 | 0} мин</span>
            </div>`;
        setHTML('workout-player', `
            <section class="card">
                <span class="hero-tag" style="background:var(--surface-warm);color:var(--olive);">${w.duration_min} мин · ${App.state.content.common.intensity_labels[w.intensity]}</span>
                <h1 style="font-size:27px;">${esc(w.title)}</h1>
                <p class="subtitle">${esc(w.description || '')}</p>
            </section>
            <section class="card">
                <h3>${c.player_need_title}</h3>
                <div class="option-row">
                    ${['коврик', 'вода'].map((x) => `<span class="option-chip" style="cursor:default;">${x}</span>`).join('')}
                </div>
            </section>
            <section class="card">
                <h3>${c.player_structure_title}</h3>
                ${block(c.phase_warmup, s.warmup)}
                ${block(c.phase_main, s.main)}
                ${block(c.phase_cooldown, s.cooldown)}
            </section>
            <button class="btn" id="wp-begin">${c.player_start}</button>
        `);
        el('wp-begin').addEventListener('click', startPlaying);
    }

    function startPlaying() {
        player.index = 0;
        player.remaining = player.steps[0] ? player.steps[0].duration_sec : 0;
        player.paused = false;
        renderPlaying();
        runTimer();
    }

    function runTimer() {
        clearInterval(player.timer);
        player.timer = setInterval(() => {
            if (player.paused) return;
            player.remaining -= 1;
            const t = el('wp-timer');
            if (t) t.textContent = formatTime(player.remaining);
            if (player.remaining <= 0) nextStep();
        }, 1000);
    }

    function formatTime(sec) {
        const m = Math.max(0, Math.floor(sec / 60));
        const s = Math.max(0, sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function renderPlaying() {
        const c = App.state.content.activity_screen;
        const step = player.steps[player.index];
        if (!step) {
            renderDone();
            return;
        }
        const total = player.steps.length;
        const dots = player.steps.map((_, i) =>
            `<span class="habit-dot${i < player.index ? ' on' : (i === player.index ? ' on' : '')}"></span>`).join('');
        setHTML('workout-player', `
            <section class="card player-stage">
                <p class="player-phase-label">${step.phaseLabel} · ${player.index + 1}/${total}</p>
                <div class="player-progress-dots">${dots}</div>
                <div class="player-video-slot">${c.video_soon}</div>
                <div class="player-timer" id="wp-timer">${formatTime(player.remaining)}</div>
                <p class="player-exercise">${esc(step.name)}</p>
                <p class="player-hint">${esc(step.hint || '')}</p>
            </section>
            <div class="flex-row">
                <button class="btn btn-ghost" id="wp-pause" style="flex:1;">${c.player_pause}</button>
                <button class="btn btn-olive" id="wp-skip" style="flex:1;">${player.index === total - 1 ? c.player_next : c.player_skip}</button>
            </div>
        `);
        el('wp-pause').addEventListener('click', () => {
            player.paused = !player.paused;
            el('wp-pause').textContent = player.paused ? c.player_resume : c.player_pause;
        });
        el('wp-skip').addEventListener('click', nextStep);
    }

    function nextStep() {
        if (player.index >= player.steps.length - 1) {
            renderDone();
            return;
        }
        player.index += 1;
        player.remaining = player.steps[player.index].duration_sec;
        renderPlaying();
    }

    function renderDone() {
        clearInterval(player.timer);
        const c = App.state.content.activity_screen;
        const w = player.workout;
        setHTML('workout-player', `
            <section class="card player-stage">
                <p style="font-size:44px;">♡</p>
                <h1>${c.player_done_title}</h1>
                <p class="subtitle">${w.duration_min} ${c.player_done_text}</p>
            </section>
            <button class="btn" id="wp-done">${c.mark_done}</button>
            <button class="btn btn-ghost" data-back-close>Вернуться назад</button>
        `);
        el('wp-done').addEventListener('click', async () => {
            const btn = el('wp-done');
            btn.disabled = true;
            try {
                await apiPost('/api/workouts/complete', {
                    workout_id: w.id, date: todayISO(),
                });
                try {
                    App.state.today = await apiGet(`/api/today?date=${todayISO()}`);
                } catch (err) { /* сводка обновится при следующем входе */ }
                goBack();
                onShow();
            } catch (err) {
                btn.disabled = false;
                btn.textContent = `Не сохранилось: ${apiErrorText(err)}`;
            }
        });
        document.querySelector('[data-back-close]')
            .addEventListener('click', () => { clearInterval(player.timer); goBack(); });
    }

    function stopPlayer() {
        clearInterval(player.timer);
    }

    return { onShow, openWorkout, stopPlayer };
})();
