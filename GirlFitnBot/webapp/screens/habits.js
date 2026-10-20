// Привычки (живут в «Сегодня» и «Профиле»): фокус недели, мои привычки,
// добавление (категория → частота → напоминание), прогресс.
// Принцип спеки: 1–3 привычки одновременно, постепенное наращивание,
// никаких «серий прервана» — только «Ты становишься регулярнее».

App.screens.habits = (() => {
    let habitsCache = null;
    let progressCache = null;

    async function load() {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        [habitsCache, progressCache] = await Promise.all([
            apiGet(`/api/habits?date=${todayISO()}`),
            apiGet(`/api/progress?month=${month}&date=${todayISO()}`),
        ]);
    }

    // Блок для экрана «Профиль»
    async function renderBlock(containerId) {
        const c = App.state.content.habits_screen;
        try {
            await load();
        } catch (err) {
            setHTML(containerId, errorState(
                `Не получилось загрузить привычки: ${apiErrorText(err)}`,
                `App.screens.habits.renderBlock('${containerId}')`));
            return;
        }
        renderInto(containerId);
    }

    function renderInto(containerId) {
        const c = App.state.content.habits_screen;
        const mine = habitsCache.mine || [];
        setHTML(containerId, `
            ${renderFocus(c, mine)}
            ${renderMyHabits(c, mine)}
            ${renderProgress(c, mine)}
            ${renderAdapt(c)}
        `);
        bindBlock(containerId, c, mine);
    }

    // --- Фокус недели ---
    function renderFocus(c, mine) {
        if (!mine.length) return '';
        const h = mine[0];
        const pct = h.week.target ? Math.min(1, h.week.done / h.week.target) : 0;
        const dots = Array.from({ length: 5 }, (_, i) =>
            `<span class="habit-dot${i < Math.round(pct * 5) ? ' on' : ''}"></span>`).join('');
        return `
        <section class="card">
            <div class="card-title-row">
                <h3>🌱 ${c.focus_title}</h3>
                <span class="text-muted">${c.focus_goal}</span>
            </div>
            <div class="habit-check-card">
                <div class="habit-emoji-lg">${h.emoji || '🌱'}</div>
                <div class="habit-info">
                    <p class="habit-title">${esc(h.title)}</p>
                    <div class="habit-progress-dots">${dots}</div>
                    <p class="text-muted" id="hb-focus-caption">${h.done_today
                        ? `${c.focus_done} ${h.week.done} из ${h.week.target} 💛`
                        : `${h.week.done} из ${h.week.target}`}</p>
                </div>
                <button class="habit-toggle${h.done_today ? ' done' : ''}"
                    data-toggle="${h.id}">✓</button>
            </div>
        </section>`;
    }

    // --- Мои привычки ---
    function renderMyHabits(c, mine) {
        const freqLabels = {};
        c.frequencies.forEach((f) => { freqLabels[f.id] = f.label; });
        const rows = mine.map((h) => `
            <div class="card workout-card" style="padding:12px;">
                <div class="habit-emoji-lg" style="width:42px;height:42px;font-size:20px;">${h.emoji || '🌱'}</div>
                <div class="workout-card-info">
                    <p class="workout-card-title">${esc(h.title)}</p>
                    <p class="workout-card-meta">${freqLabels[h.frequency] || ''} · ${h.week.done}/${h.week.target}</p>
                </div>
                <button class="habit-toggle${h.done_today ? ' done' : ''}"
                    data-toggle="${h.id}" style="width:44px;height:44px;">✓</button>
            </div>`).join('');
        return `
        <section class="stack" style="gap:10px;">
            <div class="card-title-row">
                <h3>${c.my_title}</h3>
                <button class="link-btn" id="hb-add">${c.add_title} →</button>
            </div>
            ${rows || emptyState(c.empty)}
        </section>`;
    }

    // --- Прогресс ---
    function renderProgress(c, mine) {
        if (!mine.length || !progressCache) return '';
        const days = progressCache.days || {};
        const entries = Object.entries(days);
        const doneTotal = progressCache.habit_completions || 0;
        const regularity = progressCache.regularity_pct || 0;

        // Мини-календарь месяца
        const first = new Date();
        first.setDate(1);
        const startOffset = (first.getDay() + 6) % 7;
        const cells = [];
        for (let i = 0; i < startOffset; i += 1) cells.push('<div class="mini-day" style="visibility:hidden;"></div>');
        const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d += 1) {
            const iso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const day = days[iso];
            cells.push(`<div class="mini-day${day && day.habits > 0 ? ' on' : ''}">${day && day.habits > 0 ? '✓' : d}</div>`);
        }

        // Самая стабильная привычка (по текущей неделе)
        let stable = null;
        mine.forEach((h) => {
            if (!stable || h.week.done > stable.week.done) stable = h;
        });

        return `
        <section class="card card-warm">
            <h3>${c.progress_title}</h3>
            <div class="flex-between">
                <p class="serif" style="font-size:26px;color:var(--accent-dark);">${doneTotal} ${c.completions_word}</p>
                <p class="serif" style="font-size:26px;color:var(--accent-dark);">${regularity}% ${c.regularity_word}</p>
            </div>
            ${stable ? `<p class="subtitle">${c.most_stable}: ${stable.emoji || ''} ${esc(stable.title)} — ${stable.week.done} из ${stable.week.target}</p>` : ''}
            <div class="mini-calendar">${cells.join('')}</div>
            <p class="text-muted">${c.summary_active}: ${mine.length} · ${c.summary_done}: ${doneTotal} · ${c.summary_regularity}: ${regularity}%</p>
            <p class="subtitle" style="font-style:italic;">${c.main_phrase} 💛</p>
        </section>`;
    }

    // --- Мягкая адаптация к фазе ---
    function renderAdapt(c) {
        const cycle = App.state.cycle;
        if (!cycle || !cycle.phase || cycle.phase !== 'luteal') return '';
        const phase = App.state.content.phases[cycle.phase];
        return `
        <section class="card">
            <h3>${c.adapt_title}</h3>
            <p class="subtitle">Сейчас ${phase.name.toLowerCase()}. ${c.adapt_text}</p>
            <button class="link-btn" id="hb-adapt">${c.adapt_button} →</button>
        </section>`;
    }

    function bindBlock(containerId, c, mine) {
        const add = el('hb-add');
        if (add) add.addEventListener('click', openAdd);

        const adapt = el('hb-adapt');
        if (adapt) adapt.addEventListener('click', () => {
            // Мягкое действие: открываем сегодняшний день с текстом поддержки
            infoSheet(c.adapt_title, c.comfort_text);
        });

        document.querySelectorAll(`#${containerId} [data-toggle]`).forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.toggle);
                btn.disabled = true;
                try {
                    const res = await apiPost(`/api/habits/${id}/toggle`, { date: todayISO() });
                    const h = (habitsCache.mine || []).find((x) => x.id === id);
                    if (h) {
                        h.done_today = res.done;
                        h.week.done += res.done ? 1 : -1;
                        if (h.week.done < 0) h.week.done = 0;
                    }
                    renderInto(containerId);
                } catch (err) {
                    btn.disabled = false;
                    infoSheet(c.my_title, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });
    }

    // --- Добавление привычки: категория → привычка → частота → напоминание ---
    const addState = { step: 0, category: '', habitId: null, frequency: 'daily', reminder: '' };

    function openAdd() {
        addState.step = 0;
        addState.category = '';
        addState.habitId = null;
        addState.frequency = 'daily';
        addState.reminder = '';
        renderAdd();
        showScreen('habit-add');
    }

    function renderAdd() {
        const c = App.state.content.habits_screen;
        const library = (habitsCache && habitsCache.library) || [];
        let body = '';

        if (addState.step === 0) {
            const cats = [...new Set(library.map((h) => h.category))];
            const catLabels = {
                sleep: '😴 Сон', nutrition: '🥗 Питание',
                movement: '🚶 Движение', recovery: '🕯 Восстановление',
            };
            body = `
                <section class="card">
                    <h2>${c.add_title}</h2>
                    <p class="checkin-label mt-8">${c.add_category_title}</p>
                    <div class="option-row">
                        ${cats.map((cat) => `
                            <button class="option-chip${addState.category === cat ? ' active' : ''}"
                                data-cat="${cat}">${catLabels[cat] || cat}</button>`).join('')}
                    </div>
                    <p class="checkin-label mt-12">Привычка</p>
                    <div class="stack" style="gap:8px;" id="ha-list">
                        ${library.filter((h) => !addState.category || h.category === addState.category)
                            .map((h) => `
                            <button class="card workout-card" data-habit="${h.id}"
                                style="cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-primary);padding:12px;${addState.habitId === h.id ? 'border-color:var(--olive);border-width:2px;' : ''}">
                                <div class="habit-emoji-lg" style="width:40px;height:40px;font-size:18px;">${h.emoji || '🌱'}</div>
                                <div class="workout-card-info">
                                    <p class="workout-card-title">${esc(h.title)}</p>
                                    <p class="text-muted">${esc(h.description)}</p>
                                </div>
                            </button>`).join('')}
                    </div>
                    <button class="btn" id="ha-next" ${addState.habitId ? '' : 'disabled'}>${App.state.content.onboarding.next}</button>
                </section>`;
        } else if (addState.step === 1) {
            body = `
                <section class="card">
                    <h2>${c.add_frequency_title}</h2>
                    <div class="option-row" style="margin-top:8px;">
                        ${c.frequencies.map((f) => `
                            <button class="option-chip${addState.frequency === f.id ? ' active' : ''}"
                                data-freq="${f.id}">${f.label}</button>`).join('')}
                    </div>
                    <p class="checkin-label mt-12">${c.add_reminder_title}</p>
                    <div class="flex-row">
                        <button class="option-chip${!addState.reminder ? ' active' : ''}" data-remind="">${c.reminder_none}</button>
                        <input type="time" id="ha-time" class="option-chip" style="flex:1;text-align:left;"
                            value="${addState.reminder}">
                    </div>
                    <button class="btn mt-12" id="ha-add">${c.add_button}</button>
                    <p class="form-message" id="ha-msg"></p>
                </section>`;
        }

        setHTML('habit-add-content', body);

        if (addState.step === 0) {
            document.querySelectorAll('#ha-list [data-cat]').forEach((chip) => {
                chip.addEventListener('click', () => {
                    addState.category = chip.dataset.cat;
                    renderAdd();
                });
            });
            document.querySelectorAll('#habit-add-content [data-habit]').forEach((card) => {
                card.addEventListener('click', () => {
                    addState.habitId = Number(card.dataset.habit);
                    renderAdd();
                });
            });
            el('ha-next').addEventListener('click', () => {
                addState.step = 1;
                renderAdd();
            });
        } else {
            document.querySelectorAll('#habit-add-content [data-freq]').forEach((chip) => {
                chip.addEventListener('click', () => {
                    addState.frequency = chip.dataset.freq;
                    renderAdd();
                });
            });
            document.querySelectorAll('#habit-add-content [data-remind]').forEach((chip) => {
                chip.addEventListener('click', () => {
                    addState.reminder = '';
                    renderAdd();
                });
            });
            const timeInput = el('ha-time');
            timeInput.addEventListener('change', () => {
                addState.reminder = timeInput.value;
                document.querySelector('#habit-add-content [data-remind]')
                    .classList.toggle('active', !addState.reminder);
            });
            el('ha-add').addEventListener('click', async () => {
                const btn = el('ha-add');
                btn.disabled = true;
                try {
                    await apiPost('/api/habits', {
                        habit_id: addState.habitId,
                        frequency: addState.frequency,
                        reminder_time: addState.reminder || null,
                    });
                    await load();
                    goBack();
                    if (App.screens.profile && App.screens.profile.refreshHabits) {
                        App.screens.profile.refreshHabits();
                    }
                } catch (err) {
                    btn.disabled = false;
                    el('ha-msg').textContent = apiErrorText(err);
                }
            });
        }
    }

    return { renderBlock, openAdd, load };
})();
