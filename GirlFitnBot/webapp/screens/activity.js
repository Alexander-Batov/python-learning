// Экран «Активность» — вёрстка 1-в-1 с референсом (Экраны/Третья вкладка.jpg).
// Шапка → «Твоя активность» (кольцо недели) → hero тренировки дня → каталог с
// фильтрами-категориями → блок «Активность на сегодня» и месяц.
// Плеер тренировки (до → во время → после) сохранён без изменений.

App.screens.activity = (() => {
    const filters = { category: 'all', duration: '', intensity: '' };
    let catalogCache = null;
    let progressCache = null;
    let showAll = false;

    const CATEGORY_IMG = {
        yoga: 'img/workout-yoga.jpg',
        stretching: 'img/workout-stretch.jpg',
        cardio: 'img/workout-cardio.jpg',
        strength: 'img/rec-workout.jpg',
        recovery: 'img/rec-evening.jpg',
    };

    async function onShow() {
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
        const items = catalogCache ? catalogCache.items : [];
        setHTML('activity-content', [
            renderHeader(),
            renderWeekCard(),
            renderTodayCard(items),
            renderCatalogHead(),
            renderCatalog(items),
            renderBottomBlock(),
        ].join(''));
        bindAll(items);
    }

    // --- Шапка: «Активность 🌱» + профиль + веточка + подзаголовок ---
    function renderHeader() {
        return `
        <header class="ac-head">
            <div class="ac-head-text">
                <h1 class="cy-title">Активность <span class="cy-sprout">🌱</span></h1>
                <p class="ac-sub">Движение — это забота о себе.
                Физическая активность поддерживает энергию,
                улучшает настроение и помогает чувствовать баланс.</p>
            </div>
            <div class="ac-head-side">
                <button class="cy-profile" id="ac-profile" aria-label="Профиль">
                    ${Components.icon('user', 24)}
                </button>
                ${Components.branch(54, 84)}
            </div>
        </header>`;
    }

    // --- «Твоя активность»: кольцо недели + кружки дней ---
    function weekStats() {
        const names = App.state.content.common.day_names;
        const today = dateFromISO(todayISO());
        const dow = (today.getDay() + 6) % 7;
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
        const days = (progressCache && progressCache.days) || {};
        const doneIdx = [];
        names.forEach((_, i) => {
            const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
            const iso = CycleMath.toISODate(d);
            if (days[iso] && days[iso].workouts > 0) doneIdx.push(i);
        });
        return { names, doneIdx };
    }

    function renderWeekCard() {
        if (!progressCache) return '';
        const { names, doneIdx } = weekStats();
        const pct = doneIdx.length / 7;
        const R = 38;
        const CIRC = 2 * Math.PI * R;
        return `
        <section class="ac-week card-like" id="ac-week">
            <div class="ac-week-top">
                <div class="ac-ring">
                    <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                        <circle cx="46" cy="46" r="${R}" stroke="var(--border)" stroke-width="7" fill="none"/>
                        <circle cx="46" cy="46" r="${R}" stroke="var(--olive)" stroke-width="7" fill="none"
                            stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}"
                            stroke-dashoffset="${(CIRC * (1 - pct)).toFixed(1)}"
                            transform="rotate(-90 46 46)"/>
                    </svg>
                    <div class="ac-ring-center">
                        <span class="ac-ring-num">${doneIdx.length}/7</span>
                        <span class="ac-ring-cap">дней выполнено</span>
                    </div>
                </div>
                <div class="ac-week-side">
                    <p class="ac-week-title">Твоя активность</p>
                    <p class="ac-week-sub">На этой неделе</p>
                    ${Components.weekDots(names, doneIdx, names)}
                </div>
            </div>
            <div class="ac-week-note">
                ${Components.icon('leaf', 16)}
                <span>Ты на верном пути! ${doneIdx.length} ${doneIdx.length === 1 ? 'день' : 'дня'} из 7 — уже отлично!</span>
                <span class="gf-chev">›</span>
            </div>
        </section>`;
    }

    // --- Hero тренировки дня ---
    function pickDaily(items) {
        if (App.state.today && App.state.today.workout) {
            return App.state.today.workout;
        }
        const cycle = App.state.cycle;
        const phase = cycle && cycle.phase;
        const suitable = items.filter((w) => (phase ? w.phases.includes(phase) : w.intensity === 'easy'));
        return pickByDate(suitable.length ? suitable : items, todayISO());
    }

    function renderTodayCard(items) {
        const daily = pickDaily(items);
        if (!daily) return '';
        const labels = App.state.content.common.intensity_labels;
        const noEquipment = !daily.equipment || daily.equipment === 'без оборудования';
        return `
        <section class="td-hero ac-hero" id="ac-hero" role="button" tabindex="0"
                 aria-label="Начать тренировку">
            <img class="td-hero-img" src="img/hero-workout.jpg" alt="">
            <div class="td-hero-inner">
                <span class="td-hero-badge">Сегодня</span>
                <h2 class="td-hero-title">Твоя активность на сегодня</h2>
                <p class="td-hero-meta">${esc(daily.title)} · ${daily.duration_min} минут · ${labels[daily.intensity]} интенсивность</p>
                <div class="td-hero-notes">
                    <span class="td-hero-note">${Components.icon('dumbbell', 16)} ${noEquipment ? 'Без оборудования' : esc(daily.equipment)}</span>
                    <span class="td-hero-note">${Components.icon('clock', 16)} ${daily.duration_min} мин</span>
                </div>
                ${Components.pillButton('Начать тренировку ›', 'hero')}
                <span class="ac-hero-more">Подробнее ›</span>
            </div>
        </section>`;
    }

    // --- Каталог: заголовок + чипы категорий ---
    const CHIP_ORDER = ['all', 'yoga', 'cardio', 'stretching', 'strength', 'recovery'];

    function renderCatalogHead() {
        const c = App.state.content.activity_screen;
        const available = c.filters_category || [];
        const ordered = CHIP_ORDER
            .map((id) => available.find((f) => f.id === id))
            .filter(Boolean);
        return `
        <section>
            <div class="gf-section-header">
                <h2 class="gf-section-title">Все тренировки</h2>
                <button class="gf-section-link" id="ac-show-all">Смотреть все <span class="gf-chev">›</span></button>
            </div>
            <div class="td-chips" id="ac-chips"></div>
        </section>`;
    }

    // Три карточки каталога — с разнообразием категорий (как в референсе):
    // берём первые йогу, растяжку и кардио из списка, недостающее добираем любым.
    function pickThree(items) {
        const byCat = {};
        items.forEach((w) => { (byCat[w.category] = byCat[w.category] || []).push(w); });
        const picked = [];
        ['yoga', 'stretching', 'cardio'].forEach((cat) => {
            const w = (byCat[cat] || []).find((x) => !picked.includes(x));
            if (w) picked.push(w);
        });
        items.forEach((w) => { if (picked.length < 3 && !picked.includes(w)) picked.push(w); });
        return picked.slice(0, 3);
    }

    function renderCatalog(items) {
        const c = App.state.content.activity_screen;
        const labels = App.state.content.common.intensity_labels;
        const intensityWord = { easy: 'лёгкая', medium: 'средняя', high: 'высокая' };
        const filtered = items.filter((w) => {
            if (filters.category !== 'all' && w.category !== filters.category) return false;
            return true;
        });
        const list = showAll ? filtered.slice(0, 8) : pickThree(filtered);
        const cards = list.map((w) => `
            <div class="td-phase ac-workout" data-wid="${w.id}" role="button" tabindex="0">
                <img class="td-phase-img" src="${CATEGORY_IMG[w.category] || CATEGORY_IMG.recovery}" alt="" loading="lazy">
                <span class="td-phase-body">
                    <span class="td-phase-name">${esc(w.title)}</span>
                    <span class="td-phase-meta">${w.duration_min} мин · ${intensityWord[w.intensity] || labels[w.intensity]} интенсивность</span>
                    ${(!w.equipment || w.equipment === 'без оборудования')
                        ? `<span class="td-phase-note">${Components.icon('dumbbell', 15)} Без оборудования</span>`
                        : ''}
                </span>
                <span class="td-phase-side">
                    ${w.completed
                        ? '<span class="ac-done">✓ Выполнено</span>'
                        : Components.pillButton('Начать', 'primary', true)}
                    <span class="gf-chev">›</span>
                </span>
            </div>`).join('');
        return `
        <div class="td-phase-list ac-list">
            ${cards || emptyState(c.empty)}
        </div>`;
    }

    // --- Нижний блок: активность на сегодня + за месяц ---
    function renderBottomBlock() {
        if (!progressCache) return '';
        const c = App.state.content.activity_screen;
        const p = progressCache;
        const { names, doneIdx } = weekStats();
        const pastWeeks = (p.weeks || []).slice(0, -1).filter((w) => w.pct > 0).length;
        return `
        <section class="td-activity" id="ac-today-block" role="button" tabindex="0" aria-label="Активность на сегодня">
            <div class="td-activity-head">
                <span class="td-checkin-icon ac-shoe">${Components.icon('footprints', 22)}</span>
                <span class="td-activity-titles">
                    <span class="td-activity-title">Активность на сегодня</span>
                </span>
            </div>
            <div class="td-activity-body">
                <div class="td-activity-count">
                    <span class="td-count">${doneIdx.length} / 7</span>
                    <span class="td-count-cap">дней выполнено</span>
                </div>
                <div class="td-activity-week">${Components.weekDots(names, doneIdx, names)}</div>
            </div>
            <p class="td-activity-note">${Components.icon('leaf', 16)}
                <span>Ты занимаешься регулярно уже ${pastWeeks} ${pastWeeks === 1 ? 'неделю' : pastWeeks < 5 ? 'недели' : 'недель'}</span>
            </p>
            <div class="ac-month">
                <span class="td-month-cap">За месяц</span>
                <span class="ac-month-stats">
                    <b>${p.workouts_completed}</b> ${c.workouts_word} ·
                    <b>${p.active_minutes}</b> ${c.minutes_word} ·
                    <b>${p.regularity_pct}%</b> ${c.plan_completion}
                </span>
                <span class="gf-chev">›</span>
            </div>
        </section>`;
    }

    function bindAll(items) {
        const profile = el('ac-profile');
        if (profile) profile.addEventListener('click', () => showMain('profile'));

        const week = el('ac-week');
        if (week) week.addEventListener('click', () => App.screens.profile.openStats());

        const hero = el('ac-hero');
        if (hero) hero.addEventListener('click', () => {
            const daily = pickDaily(items);
            if (daily) openWorkout(daily);
        });

        // Чипы категорий: порядок как в референсе, подписи — из контента
        const c = App.state.content.activity_screen;
        const available = c.filters_category || [];
        const catFilters = CHIP_ORDER
            .map((id) => available.find((f) => f.id === id))
            .filter(Boolean);
        const chipsWrap = el('ac-chips');
        if (chipsWrap) {
            const activeIdx = Math.max(0, catFilters.findIndex((f) => f.id === filters.category));
            chipsWrap.innerHTML = Components.chips(catFilters.map((f) => f.label), activeIdx);
            chipsWrap.querySelectorAll('.gf-chip').forEach((chip) => {
                chip.addEventListener('click', () => {
                    filters.category = catFilters[Number(chip.dataset.chipIndex)].id;
                    render();
                });
            });
        }

        const showAllBtn = el('ac-show-all');
        if (showAllBtn) showAllBtn.addEventListener('click', () => {
            showAll = !showAll;
            render();
        });

        document.querySelectorAll('#activity-content .ac-workout').forEach((card) => {
            card.addEventListener('click', () => {
                const w = items.find((x) => x.id === Number(card.dataset.wid));
                if (w) openWorkout(w);
            });
        });

        const todayBlock = el('ac-today-block');
        if (todayBlock) todayBlock.addEventListener('click', () => App.screens.profile.openStats());
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
