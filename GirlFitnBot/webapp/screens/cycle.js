// Экран «Цикл» — вёрстка 1-в-1 с референсом (Экраны/Вторая вкладка.jpg).
// Шапка «Мой цикл» → календарь месяца с фазовой раскраской → рекомендации.
// Фазы/дни — из CycleMath; открытия фазы/дня и редактирование цикла сохранены.

App.screens.cycle = (() => {
    let symptomsByDate = {}; // 'YYYY-MM-DD' -> запись симптомов (карточка дня)
    let viewYear = null;     // просматриваемый месяц календаря (по умолчанию текущий)
    let viewMonth = null;
    let dailyWorkout = null; // тренировка дня для блока рекомендаций

    const PHASE_CLASS = {
        menstrual: 'cy-menstrual',
        follicular: 'cy-follicular',
        ovulatory: 'cy-ovulatory',
        luteal: 'cy-luteal',
    };

    async function onShow() {
        if (App.state.cycleError) {
            setHTML('cycle-content', errorState(
                App.state.cycleError, 'App.screens.cycle.onShow'));
            return;
        }
        if (!App.state.user) {
            try {
                await loadUser();
            } catch (err) {
                setHTML('cycle-content', errorState(
                    `Не получилось загрузить: ${apiErrorText(err)}`,
                    'App.screens.cycle.onShow'));
                return;
            }
        }
        const now = new Date();
        if (viewYear === null) {
            viewYear = now.getFullYear();
            viewMonth = now.getMonth();
        }
        setHTML('cycle-content', emptyState(App.state.content.common.loading));
        await loadSymptoms();
        await loadDailyWorkout();
        render();
    }

    async function loadSymptoms() {
        symptomsByDate = {};
        if (!App.state.user) return;
        const now = new Date();
        const first = CycleMath.toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
        const last = CycleMath.toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        try {
            const data = await apiGet(`/api/symptoms?from=${first}&to=${last}`);
            (data.items || []).forEach((row) => { symptomsByDate[row.date] = row; });
        } catch (err) {
            console.error('[api] symptoms:', err);
        }
    }

    async function loadDailyWorkout() {
        dailyWorkout = null;
        try {
            const data = await apiGet(`/api/workouts/daily?date=${todayISO()}`);
            dailyWorkout = data.workout || null;
        } catch (err) {
            console.error('[api] workouts/daily:', err);
        }
    }

    function render() {
        const cycle = App.state.cycle;
        const parts = [renderHeader()];

        if (!cycle || (!cycle.phase && !cycle.overdue)) {
            const c = App.state.content.cycle_screen;
            parts.push(`
                <section class="card">
                    <h2>${esc(c.no_data_title)}</h2>
                    <p class="subtitle">${esc(c.no_data_text)}</p>
                    <button class="btn" id="cy-setup">${esc(c.setup_button)}</button>
                </section>`);
        } else {
            parts.push(renderCalendarIntro());
            parts.push(renderCalendar());
            if (cycle.overdue) parts.push(renderOverdue());
            parts.push(renderRecommendations());
        }

        setHTML('cycle-content', parts.join(''));
        bindAll();
    }

    // --- Шапка: «Мой цикл» по центру + иконка профиля ---
    function renderHeader() {
        return `
        <header class="cy-head">
            <h1 class="cy-title">Мой цикл</h1>
            <button class="cy-profile" id="cy-profile" aria-label="Профиль">
                ${Components.icon('user', 24)}
            </button>
        </header>`;
    }

    function renderCalendarIntro() {
        const cycle = App.state.cycle;
        const today = new Date();
        const dateStr = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        const dayStr = cycle.cycle_day
            ? ` · ${cycle.cycle_day}-й день цикла`
            : '';
        return `
        <div class="cy-intro">
            <h2 class="cy-cal-title">Твой календарь</h2>
            <p class="cy-today-line">Сегодня, ${esc(dateStr)}${esc(dayStr)}</p>
        </div>`;
    }

    // --- Календарь месяца ---
    function renderCalendar() {
        const cycle = App.state.cycle;
        const titleRaw = new Date(viewYear, viewMonth, 1)
            .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const title = (titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1))
            .replace(' г.', '');
        const weeks = CycleMath.buildCalendarMonth(
            viewYear, viewMonth,
            cycle.cycle_start, cycle.cycle_length, cycle.period_length,
        );
        const names = App.state.content.common.day_names;
        const cells = weeks.map((week) => week.map((cell) => {
            const cls = ['cy-day'];
            if (!cell.inMonth) cls.push('cy-other');
            if (cell.isToday) cls.push('cy-today');
            const phaseKey = cell.phase === CycleMath.PHASE.OVERDUE ? null : cell.phase;
            if (phaseKey && PHASE_CLASS[phaseKey]) cls.push(PHASE_CLASS[phaseKey]);
            return `<button class="${cls.join(' ')}" data-date="${cell.date}">${cell.day}</button>`;
        }).join('')).join('');

        return `
        <section class="cy-cal">
            <div class="cy-cal-head">
                <h2 class="cy-cal-month">${esc(title)}</h2>
                <div class="cy-cal-nav">
                    <button class="cy-nav-btn" id="cy-prev" aria-label="Предыдущий месяц">‹</button>
                    <button class="cy-nav-btn" id="cy-next" aria-label="Следующий месяц">›</button>
                </div>
            </div>
            <div class="cy-weekdays">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>
            <div class="cy-grid">${cells}</div>
            <div class="cy-legend">
                ${TODAY_PHASE_ORDER.map((key) => `
                    <button class="cy-legend-item" data-phase="${key}">
                        <span class="cy-legend-dot ${PHASE_CLASS[key]}"></span>
                        ${esc(((App.state.content.phases[key] || {}).short_name) || key)}
                    </button>`).join('')}
            </div>
        </section>`;
    }

    // --- Рекомендации на сегодня ---
    function renderRecommendations() {
        const cycle = App.state.cycle;
        const phases = App.state.content.phases || {};
        const subperiods = App.state.content.subperiods || {};
        const sub = subperiods[cycle.subperiod] || null;
        // Для предменструальной недели — свой фокус питания
        const focusKey = cycle.subperiod === CycleMath.SUBPERIOD.PREMENSTRUAL
            ? 'premenstrual'
            : cycle.phase;
        const focus = (App.state.content.nutrition_focus || {})[focusKey] || '';
        const phaseName = sub ? sub.name : ((phases[cycle.phase] || {}).name || '');

        const w = dailyWorkout;
        const intensityWord = { easy: 'лёгкая', medium: 'умеренная', high: 'высокая' };
        const catLabels = (App.state.content.common || {}).category_labels || {};
        const workoutMeta1 = w
            ? `${w.duration_min} мин · ${intensityWord[w.intensity] || ''} нагрузка`
            : '';
        const workoutMeta2 = w
            ? `${catLabels[w.category] || ''}${w.equipment ? ` + ${w.equipment}` : ''}`
            : '';

        const cards = [];
        if (w) {
            cards.push(recCard({
                img: 'img/rec-workout.jpg',
                title: 'Тренировка для тебя',
                meta: workoutMeta1,
                note: workoutMeta2,
                cta: 'Начать',
                variant: 'primary',
                action: 'workout',
            }));
        }
        cards.push(recCard({
            img: 'img/rec-food.jpg',
            title: 'Питание для тебя',
            meta: focus,
            note: '',
            cta: 'Посмотреть',
            variant: 'secondary',
            action: 'nutrition',
        }));
        cards.push(recCard({
            img: 'img/rec-evening.jpg',
            title: 'Вечернее восстановление',
            meta: '10 минут без экрана перед сном',
            note: 'Поможет поддержать расслабление и сон',
            cta: 'Добавить привычку',
            variant: 'secondary',
            action: 'habits',
        }));

        // Контент предменструальной недели: «Режим экономии энергии» и «Работа со стрессом»
        const topicsHtml = (sub && sub.topics)
            ? `<div class="cy-topics">
                ${sub.topics.map((t) => `
                    <div class="card card-warm cy-topic">
                        <h3>${esc(t.title)}</h3>
                        <p class="subtitle">${esc(t.text)}</p>
                    </div>`).join('')}
            </div>`
            : '';

        return `
        <section>
            <div class="cy-rec-head">
                <h2 class="gf-section-title">Рекомендации на сегодня</h2>
                <span class="cy-phase-pill">${esc(phaseName)}</span>
            </div>
            ${sub ? `<p class="cy-rec-sub">${esc(sub.status)}</p>` : ''}
            <p class="cy-rec-sub">Поддержи энергию, сон и спокойный ритм</p>
            <div class="cy-rec-list">${cards.join('')}</div>
            ${topicsHtml}
        </section>`;
    }

    function recCard({ img, title, meta, note, cta, variant, action }) {
        return `
        <div class="cy-rec" data-action="${action}" role="button" tabindex="0">
            <img class="cy-rec-img" src="${esc(img)}" alt="" loading="lazy">
            <div class="cy-rec-body">
                <h3 class="cy-rec-title">${esc(title)}</h3>
                <p class="cy-rec-meta">${esc(meta)}</p>
                ${note ? `<p class="cy-rec-note">${esc(note)}</p>` : ''}
            </div>
            <div class="cy-rec-side">
                ${Components.pillButton(cta, variant, true)}
                <span class="gf-chev">›</span>
            </div>
        </div>`;
    }

    // --- Задержка цикла: заботливая карточка ---
    function renderOverdue() {
        const o = App.state.content.overdue;
        return `
        <section class="card card-warm">
            <h2>${esc(o.title)}</h2>
            <p class="subtitle">${esc(o.intro)}</p>
            <ul class="cy-overdue-list">
                ${o.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
            </ul>
            <p class="text-muted" style="font-style:italic">${esc(o.disclaimer)}</p>
            <div class="flex-row">
                <button class="btn btn-small" id="cy-overdue-started">${esc(o.button_started)}</button>
                <button class="btn btn-small btn-ghost" id="cy-overdue-edit">${esc(o.button_edit)}</button>
            </div>
        </section>`;
    }

    function shiftMonth(delta) {
        const d = new Date(viewYear, viewMonth + delta, 1);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        render();
    }

    function bindAll() {
        const profile = el('cy-profile');
        if (profile) profile.addEventListener('click', () => showMain('profile'));

        const setup = el('cy-setup');
        if (setup) setup.addEventListener('click', openEditSheet);

        const prev = el('cy-prev');
        if (prev) prev.addEventListener('click', () => shiftMonth(-1));
        const next = el('cy-next');
        if (next) next.addEventListener('click', () => shiftMonth(1));

        document.querySelectorAll('#cycle-content .cy-day').forEach((btn) => {
            btn.addEventListener('click', () => openDay(btn.dataset.date));
        });
        document.querySelectorAll('#cycle-content .cy-legend-item').forEach((chip) => {
            chip.addEventListener('click', () => openPhase(chip.dataset.phase));
        });

        document.querySelectorAll('#cycle-content .cy-rec').forEach((card) => {
            card.addEventListener('click', () => {
                const action = card.dataset.action;
                if (action === 'workout' && dailyWorkout) {
                    App.screens.activity.openWorkout(dailyWorkout);
                } else if (action === 'nutrition') {
                    showMain('nutrition');
                } else if (action === 'habits') {
                    showMain('habits');
                }
            });
        });

        const started = el('cy-overdue-started');
        if (started) started.addEventListener('click', async () => {
            started.disabled = true;
            try {
                await apiPost('/api/cycle', {
                    cycle_start: todayISO(),
                    cycle_length: App.state.cycle.cycle_length,
                });
                await refreshAll();
                onShow();
            } catch (err) {
                started.disabled = false;
                started.textContent = `Не сохранилось: ${apiErrorText(err)}`;
            }
        });
        const overdueEdit = el('cy-overdue-edit');
        if (overdueEdit) overdueEdit.addEventListener('click', openEditSheet);
    }

    // Блок «Два периода фазы» для страницы лютеиновой фазы
    function lutealSubperiodsSection() {
        const subs = App.state.content.subperiods || {};
        const stable = subs.luteal_stable;
        const pre = subs.premenstrual;
        if (!stable || !pre) return '';
        const item = (s) => `
            <div style="margin-top:10px;">
                <p style="font-weight:600;">${esc(s.name)}</p>
                <p class="subtitle">${esc(s.status)}</p>
                <p class="subtitle">${esc(s.short)}</p>
            </div>`;
        const topics = (pre.topics || []).map((t) =>
            `<li style="font-size:13.5px;"><b>${esc(t.title)}</b> — ${esc(t.text)}</li>`).join('');
        return `<div class="card"><h3>Два периода фазы</h3>${item(stable)}${item(pre)}
            ${topics ? `<ul style="padding-left:18px;display:flex;flex-direction:column;gap:6px;margin-top:10px;">${topics}</ul>` : ''}
        </div>`;
    }

    // --- Страница фазы (подэкран, сохранён) ---
    async function openPhase(key) {
        const phase = App.state.content.phases[key];
        const header = el('phase-header');
        header.style.background = phase.color;
        header.innerHTML = `
            <h1>${esc(phase.name)}</h1>
            ${phase.slogan_detail ? `<p class="phase-slogan">${esc(phase.slogan_detail)}</p>` : ''}
            <p class="phase-days">${phase.days}</p>`;

        const section = (title, body) => `<div class="card"><h3>${title}</h3>${body}</div>`;

        let workoutsHtml = '';
        try {
            const data = await apiGet(`/api/workouts?date=${todayISO()}`);
            const items = (data.items || []).filter((w) => w.phases.includes(key)).slice(0, 3);
            if (items.length) {
                workoutsHtml = items.map((w) => `
                    <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border);">
                        <div>
                            <p class="workout-card-title">${esc(w.title)}</p>
                            <p class="text-muted">${w.duration_min} мин</p>
                        </div>
                        <button class="btn btn-small btn-ghost workout-open" data-id="${w.id}">Открыть</button>
                    </div>`).join('');
            }
        } catch (err) {
            console.error('[api] workouts:', err);
        }

        // Разделы — тексты заказчицы из content.json (phases.*.details),
        // порядок как в её файле; «Видео» — текстовый анонс без плеера
        if (Array.isArray(phase.details) && phase.details.length) {
            setHTML('phase-sections', phase.details.map((d, i) => {
                let html = '';
                if (d.video) {
                    html = `<div class="card phase-video">
                        <h3>${esc(d.title)} <span class="phase-video-soon">Скоро</span></h3>
                        <p class="subtitle">${esc(d.text)}</p>
                    </div>`;
                } else {
                    const isTraining = d.title === 'Тренировки' || d.title === 'Активность';
                    html = section(esc(d.title),
                        `<p class="subtitle">${esc(d.text)}</p>${isTraining ? workoutsHtml : ''}`);
                }
                if (i === 0 && key === 'luteal') html += lutealSubperiodsSection();
                return html;
            }).join(''));
        } else {
            setHTML('phase-sections',
                section('О фазе', `<p class="subtitle">${esc(phase.description || '')}</p>`)
                + (key === 'luteal' ? lutealSubperiodsSection() : '')
                + section('Движение', `<p class="subtitle">${esc(phase.movement || '')}</p>${workoutsHtml}`)
                + section('Питание', `<p class="subtitle">${esc(phase.nutrition || '')}</p>`)
                + `<div class="card"><h3>Рекомендации</h3>
                    <ul style="padding-left:18px;display:flex;flex-direction:column;gap:6px;">
                        ${(phase.recommendations || []).map((r) => `<li style="font-size:13.5px;">${esc(r)}</li>`).join('')}
                    </ul></div>`);
        }

        document.querySelectorAll('.workout-open').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    const list = await apiGet(`/api/workouts?date=${todayISO()}`);
                    const w = (list.items || []).find((x) => x.id === Number(btn.dataset.id));
                    if (w) App.screens.activity.openWorkout(w);
                } catch (err) {
                    console.error(err);
                }
            });
        });
        showScreen('phase');
    }

    // --- Карточка дня: фаза + симптомы (подэкран, сохранён) ---
    async function openDay(dateISO) {
        const c = App.state.content.cycle_screen;
        const cycle = App.state.cycle;
        const container = el('day-card');
        container.innerHTML = emptyState(App.state.content.common.loading);
        showScreen('day');

        const dayNum = CycleMath.getCycleDay(dateISO, cycle.cycle_start, cycle.cycle_length);
        let symptoms = null;
        try {
            const data = await apiGet(`/api/symptoms?date=${dateISO}`);
            symptoms = data.symptoms;
        } catch (err) {
            console.error('[api] symptoms:', err);
        }

        if (dayNum === null) {
            container.innerHTML = `
                <div class="card">
                    <h2 style="text-transform:capitalize">${formatFullDate(dateISO)}</h2>
                    <p class="empty-hint">Здесь ещё нет данных — отслеживание цикла начинается
                    позже. Выбери другой день</p>
                </div>`;
            return;
        }

        const phaseKey = CycleMath.getPhaseForDate(
            dateISO, cycle.cycle_start, cycle.cycle_length, cycle.period_length);
        const phase = phaseKey && App.state.content.phases[phaseKey]
            ? App.state.content.phases[phaseKey] : null;
        const s = symptoms || {};
        const isOverdueDay = phaseKey === CycleMath.PHASE.OVERDUE;

        let head = '';
        if (isOverdueDay) {
            head = `
                <div class="card">
                    <h2 style="text-transform:capitalize">${formatFullDate(dateISO)}</h2>
                    <p class="subtitle">${App.state.content.overdue.day_text}</p>
                    <button class="btn" id="day-mark">${App.state.content.calendar.mark_period}</button>
                </div>`;
        } else if (phase) {
            head = `
                <div class="card">
                    <h2 style="text-transform:capitalize">${formatFullDate(dateISO)}</h2>
                    <button class="option-chip" data-phase-open-day="${phaseKey}"
                        style="background:${phase.color};border-color:${phase.color};color:var(--olive);">
                        ${phase.name}
                    </button>
                </div>`;
        }

        const chipRow = (name, options, current) => options.map((label, i) => `
            <button class="option-chip${current === i ? ' active' : ''}"
                data-field="${name}" data-value="${i}">${label}</button>`).join('');

        const intensityChips = (options, current, field) => options.map((label, i) => `
            <button class="option-chip${current === i + 1 ? ' active' : ''}"
                data-field="${field}" data-value="${i + 1}">${label}</button>`).join('');

        container.innerHTML = head + `
            <div class="card">
                <h3>${c.day_symptoms_title}</h3>
                <label class="switch-row">
                    <span>${c.is_period}</span>
                    <button class="switch${s.is_period ? ' on' : ''}" data-field="is_period" data-value="${s.is_period ? 1 : 0}"></button>
                </label>
                <div id="day-period-extra" class="${s.is_period ? '' : 'hidden'}">
                    <p class="checkin-label">${c.period_intensity}</p>
                    <div class="option-row" data-group="period_intensity">
                        ${intensityChips(c.period_intensity_options, s.period_intensity, 'period_intensity')}
                    </div>
                </div>
                <div>
                    <p class="checkin-label">${c.pain}</p>
                    <div class="option-row">${chipRow('pain', c.pain_options, s.pain)}</div>
                </div>
                <div class="flex-row" style="align-items:flex-start;">
                    <div style="flex:1;">
                        <p class="checkin-label">${c.sleep}</p>
                        <input type="number" id="day-sleep" class="option-chip" style="width:100%;text-align:left;"
                            min="0" max="24" step="0.5" value="${s.sleep_hours == null ? '' : s.sleep_hours}" placeholder="7.5">
                    </div>
                </div>
                <div>
                    <p class="checkin-label">${c.appetite}</p>
                    <div class="option-row">${chipRow('appetite', c.appetite_options, s.appetite)}</div>
                </div>
                <label class="field">
                    <span class="field-label">${c.craving}</span>
                    <input type="text" id="day-craving" maxlength="120" value="${esc(s.craving || '')}"
                           placeholder="${c.craving_placeholder}">
                </label>
                <label class="switch-row">
                    <span>${c.bloating}</span>
                    <button class="switch${s.bloating ? ' on' : ''}" data-field="bloating" data-value="${s.bloating ? 1 : 0}"></button>
                </label>
                <label class="field">
                    <span class="field-label">${c.other}</span>
                    <textarea id="day-other" rows="2" maxlength="500" placeholder="${c.other_placeholder}">${esc(s.other || '')}</textarea>
                </label>
                <button class="btn" id="day-save">${c.save_symptoms}</button>
                <p class="form-message" id="day-msg"></p>
            </div>`;

        bindDay(dateISO, s);

        if (isOverdueDay) {
            el('day-mark').addEventListener('click', async () => {
                try {
                    await apiPost('/api/cycle', {
                        cycle_start: dateISO,
                        cycle_length: App.state.cycle.cycle_length,
                    });
                    await refreshAll();
                    goBack();
                } catch (err) {
                    el('day-msg').textContent = apiErrorText(err);
                }
            });
        }
        const phaseBtn = container.querySelector('[data-phase-open-day]');
        if (phaseBtn) phaseBtn.addEventListener('click', () => openPhase(phaseBtn.dataset.phaseOpenDay));
    }

    function bindDay(dateISO, existing) {
        const values = {
            is_period: existing.is_period ? 1 : 0,
            period_intensity: existing.period_intensity == null ? null : existing.period_intensity,
            pain: existing.pain == null ? null : existing.pain,
            appetite: existing.appetite == null ? null : existing.appetite,
            bloating: existing.bloating == null ? null : existing.bloating,
        };
        const c = App.state.content.cycle_screen;

        document.querySelectorAll('#day-card .option-chip[data-field]').forEach((chip) => {
            chip.addEventListener('click', () => {
                const field = chip.dataset.field;
                const val = parseInt(chip.dataset.value, 10);
                values[field] = (values[field] === val) ? null : val;
                document.querySelectorAll(`#day-card .option-chip[data-field="${field}"]`)
                    .forEach((x) => x.classList.toggle('active',
                        values[field] === parseInt(x.dataset.value, 10)));
            });
        });
        document.querySelectorAll('#day-card .switch').forEach((sw) => {
            sw.addEventListener('click', () => {
                const field = sw.dataset.field;
                values[field] = values[field] ? 0 : 1;
                sw.classList.toggle('on', Boolean(values[field]));
                if (field === 'is_period') {
                    el('day-period-extra').classList.toggle('hidden', !values.is_period);
                }
            });
        });

        el('day-save').addEventListener('click', async () => {
            const btn = el('day-save');
            btn.disabled = true;
            const payload = {
                date: dateISO,
                is_period: Boolean(values.is_period),
                period_intensity: values.period_intensity,
                pain: values.pain,
                appetite: values.appetite,
                bloating: values.bloating == null ? '' : Boolean(values.bloating),
                craving: el('day-craving').value,
                other: el('day-other').value,
                sleep_hours: el('day-sleep').value,
                mood: existing.mood,
                energy: existing.energy,
            };
            try {
                await apiPost('/api/symptoms', payload);
                el('day-msg').textContent = c.saved;
                el('day-msg').classList.add('ok');
                symptomsByDate[dateISO] = true;
            } catch (err) {
                el('day-msg').textContent = apiErrorText(err);
            } finally {
                btn.disabled = false;
            }
        });
    }

    // --- Редактирование данных цикла ---
    function openEditSheet() {
        const c = App.state.content.cycle_screen;
        const cycle = App.state.cycle || (App.state.user && App.state.user.cycle) || {};
        openModal(`
            <h2>${c.edit_cycle}</h2>
            <label class="field">
                <span class="field-label">${App.state.content.onboarding.cycle_start_label}</span>
                <input type="date" id="m-cycle-start" value="${cycle.cycle_start || ''}" max="${todayISO()}">
            </label>
            <label class="field">
                <span class="field-label">${App.state.content.onboarding.cycle_length_label}</span>
                <input type="number" id="m-cycle-length" min="21" max="35" step="1" value="${cycle.cycle_length || 28}">
            </label>
            <label class="field">
                <span class="field-label">${App.state.content.onboarding.period_length_label}</span>
                <input type="number" id="m-period-length" min="2" max="8" step="1" value="${cycle.period_length || 5}">
            </label>
            <button class="btn" id="m-save">Сохранить</button>
            <button class="btn btn-ghost" id="m-cancel">Отмена</button>
            <p class="form-message" id="m-msg"></p>
        `);
        el('m-cancel').addEventListener('click', closeModal);
        el('m-save').addEventListener('click', async () => {
            const btn = el('m-save');
            btn.disabled = true;
            // Пустые поля не отправляем вовсе: сервер сохранит текущие
            // значения, а не сбросит их на дефолт
            const payload = {};
            const startVal = el('m-cycle-start').value;
            const lengthVal = parseInt(el('m-cycle-length').value, 10);
            const periodVal = parseInt(el('m-period-length').value, 10);
            if (startVal) payload.cycle_start = startVal;
            if (lengthVal) payload.cycle_length = lengthVal;
            if (periodVal) payload.period_length = periodVal;
            try {
                await apiPost('/api/cycle', payload);
                closeModal();
                await refreshAll();
                onShow();
            } catch (err) {
                btn.disabled = false;
                el('m-msg').textContent = apiErrorText(err);
            }
        });
    }

    return { onShow, openEditSheet, openPhase, openDay };
})();
