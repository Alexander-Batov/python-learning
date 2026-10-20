// Экран «Цикл»: статус, календарь с отметками, симптомы по дням,
// карточки 4 фаз, редактирование данных цикла. Календарная математика —
// из cycle.js (CycleMath), рендер календаря перенесён из прежнего app.js.

App.screens.cycle = (() => {
    let symptomsByDate = {}; // 'YYYY-MM-DD' -> строка симптомов (точки в календаре)

    async function onShow() {
        const c = App.state.content.cycle_screen;
        if (App.state.cycleError) {
            el('cycle-status').textContent = App.state.cycleError;
            setHTML('cycle-content', '');
            return;
        }
        if (!App.state.user) {
            try {
                await loadUser();
            } catch (err) {
                el('cycle-status').textContent = `Не получилось загрузить: ${apiErrorText(err)}`;
                return;
            }
        }
        renderStatus(c);
        setHTML('cycle-content', emptyState(App.state.content.common.loading));
        await loadSymptoms();
        render();
    }

    function renderStatus(c) {
        const cycle = App.state.cycle;
        if (!cycle) {
            el('cycle-status').textContent = c.status_loading;
            return;
        }
        if (cycle.overdue) {
            el('cycle-status').textContent = App.state.content.overdue.short_text;
        } else if (!cycle.phase) {
            el('cycle-status').textContent =
                `Отслеживание начнётся ${formatDayMonth(cycle.cycle_start)} — загляни в этот день 🌷`;
        } else {
            const phase = App.state.content.phases[cycle.phase];
            el('cycle-status').textContent =
                `${c.current_status}: ${cycle.cycle_day}-й день цикла · ${phase.name.toLowerCase()}`;
        }
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
            console.error('[api] symptoms:', err); // точки — украшение, не ломаем экран
        }
    }

    function render() {
        const c = App.state.content.cycle_screen;
        const cycle = App.state.cycle;
        const parts = [];

        if (!cycle || (!cycle.phase && !cycle.overdue)) {
            parts.push(`
                <section class="card">
                    <h2>${c.no_data_title}</h2>
                    <p class="subtitle">${c.no_data_text}</p>
                    <button class="btn" id="cy-setup">${c.setup_button}</button>
                </section>`);
        }

        if (cycle && cycle.overdue) {
            parts.push(renderOverdue());
        }

        if (cycle && cycle.phase) {
            parts.push(renderCalendar());
            parts.push(renderCurrentPhase());
        }

        parts.push(renderPhaseCards());
        setHTML('cycle-content', parts.join(''));
        bindAll();
    }

    // --- Календарь месяца ---
    function renderCalendar() {
        const cycle = App.state.cycle;
        const now = new Date();
        // ru-RU даёт «октябрь 2026 г.» строчными — капитализируем первую букву
        const titleRaw = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const title = titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1);
        const weeks = CycleMath.buildCalendarMonth(
            now.getFullYear(), now.getMonth(),
            cycle.cycle_start, cycle.cycle_length, cycle.period_length,
        );
        const names = App.state.content.common.day_names;
        const cells = weeks.map((week) => week.map((cell) => {
            const classes = ['day'];
            if (!cell.inMonth) classes.push('other-month');
            if (cell.isToday) classes.push('today');
            const phase = cell.phase === CycleMath.PHASE.OVERDUE ? null : cell.phase;
            const color = phase ? App.state.content.phases[phase].color : 'var(--surface-muted)';
            const mark = symptomsByDate[cell.date] ? '<span class="symptom-mark"></span>' : '';
            return `<button class="${classes.join(' ')}" style="background:${color};"
                    data-date="${cell.date}">${cell.day}${mark}</button>`;
        }).join('')).join('');

        return `
        <section class="card">
            <div class="card-title-row">
                <h2>${title}</h2>
            </div>
            <div class="calendar-weekdays">${names.map((n) => `<span>${n}</span>`).join('')}</div>
            <div class="calendar-grid">${cells}</div>
            <div class="phase-legend" id="cy-legend">
                ${Object.entries(App.state.content.phases).map(([key, p]) => `
                    <button class="legend-chip" data-phase="${key}">
                        <span class="legend-dot" style="background:${p.color};"></span>${p.name.replace(' фаза', '')}
                    </button>`).join('')}
            </div>
        </section>`;
    }

    // --- Карточка текущей фазы ---
    // Диапазон дней берём из CycleMath.phaseRanges — единый источник
    // границ фаз (совпадает с раскраской календаря и серверным cycle.py)
    function phaseDayRange(phaseKey, cycleLength, periodLength) {
        const range = CycleMath.phaseRanges(cycleLength, periodLength)[phaseKey];
        return range ? `Дни ${range[0]}–${range[1]}` : '';
    }

    function renderCurrentPhase() {
        const c = App.state.content.cycle_screen;
        const cycle = App.state.cycle;
        const phase = App.state.content.phases[cycle.phase];
        return `
        <section class="card">
            <div class="phase-card-head" style="background:${phase.color};">
                <span class="phase-name">${phase.name}</span>
                <span class="phase-days">${phaseDayRange(cycle.phase, cycle.cycle_length, cycle.period_length)}</span>
            </div>
            <p class="subtitle">${phase.short || phase.description}</p>
            <button class="btn btn-small" data-phase-open="${cycle.phase}">Подробнее</button>
        </section>
        <button class="btn btn-ghost" id="cy-edit">${c.edit_cycle}</button>`;
    }

    // --- 4 карточки фаз ---
    function renderPhaseCards() {
        const c = App.state.content.cycle_screen;
        return `
        <section class="card">
            <h3>${c.phases_title}</h3>
            <div class="stack">
                ${Object.entries(App.state.content.phases).map(([key, p]) => `
                    <button class="card card-warm" data-phase-open="${key}"
                        style="cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-primary);padding:14px;">
                        <div class="flex-between">
                            <div>
                                <p class="habit-title">${p.name}</p>
                                <p class="text-muted">${p.days}</p>
                            </div>
                            <div class="flex-row" style="gap:8px;flex-shrink:0;">
                                <span class="legend-dot" style="background:${p.color};width:14px;height:14px;"></span>
                                <span class="link-btn" style="padding:0;">Подробнее →</span>
                            </div>
                        </div>
                    </button>`).join('')}
            </div>
        </section>`;
    }

    // --- Задержка: заботливая карточка (перенесена из прежнего демо) ---
    function renderOverdue() {
        const o = App.state.content.overdue;
        return `
        <section class="card card-warm">
            <h2>${o.title}</h2>
            <p class="subtitle">${o.intro}</p>
            <ul style="padding-left:18px;display:flex;flex-direction:column;gap:6px;">
                ${o.reasons.map((r) => `<li style="font-size:13.5px;">${r}</li>`).join('')}
            </ul>
            <p class="text-muted" style="font-style:italic">${o.disclaimer}</p>
            <div class="flex-row">
                <button class="btn btn-small" id="cy-overdue-started">${o.button_started}</button>
                <button class="btn btn-small btn-ghost" id="cy-overdue-edit">${o.button_edit}</button>
            </div>
        </section>`;
    }

    function bindAll() {
        const setup = el('cy-setup');
        if (setup) setup.addEventListener('click', openEditSheet);

        document.querySelectorAll('#cycle-content .day').forEach((btn) => {
            btn.addEventListener('click', () => openDay(btn.dataset.date));
        });
        document.querySelectorAll('#cy-legend .legend-chip').forEach((chip) => {
            chip.addEventListener('click', () => openPhase(chip.dataset.phase));
        });
        document.querySelectorAll('[data-phase-open]').forEach((btn) => {
            btn.addEventListener('click', () => openPhase(btn.dataset.phaseOpen));
        });

        const edit = el('cy-edit');
        if (edit) edit.addEventListener('click', openEditSheet);

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

    // --- Страница фазы ---
    async function openPhase(key) {
        const phase = App.state.content.phases[key];
        const header = el('phase-header');
        header.style.background = phase.color;
        header.innerHTML = `
            <h1>${phase.name}</h1>
            <p class="phase-days">${phase.days}</p>`;

        const section = (title, body) => `<div class="card"><h3>${title}</h3>${body}</div>`;

        // Тренировки фазы — из общей библиотеки (не индивидуальный план)
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

        setHTML('phase-sections',
            section('О фазе', `<p class="subtitle">${phase.description}</p>`)
            + section('Движение', `<p class="subtitle">${phase.movement}</p>${workoutsHtml}`)
            + section('Питание', `<p class="subtitle">${phase.nutrition}</p>`)
            + `<div class="card"><h3>Рекомендации</h3>
                <ul style="padding-left:18px;display:flex;flex-direction:column;gap:6px;">
                    ${phase.recommendations.map((r) => `<li style="font-size:13.5px;">${r}</li>`).join('')}
                </ul></div>`);

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

    // --- Карточка дня: фаза + симптомы ---
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
                    позже. Выбери другой день 🌷</p>
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
                        style="background:${phase.color};border-color:${phase.color};color:#373723;">
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

    // --- Редактирование данных цикла (дата, длина, длительность) ---
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
            try {
                await apiPost('/api/cycle', {
                    cycle_start: el('m-cycle-start').value,
                    cycle_length: parseInt(el('m-cycle-length').value, 10) || 28,
                    period_length: parseInt(el('m-period-length').value, 10) || 5,
                });
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
