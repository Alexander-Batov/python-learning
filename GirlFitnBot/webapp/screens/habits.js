// Экран «Привычки» — вёрстка 1-в-1 с референсом (Экраны/Пятый экран.jpg).
// Шесть трекеров: сон (ввод числом или интервалом, локально), питание,
// витамины (слоты дня, локально), вода («+» и ручной ввод мл/л через /api/water),
// шаги (ручной ввод, локально), уровень энергии. Питание — отметки через /api/nutrition.

App.screens.habits = (() => {
    let todayCache = null;
    let waterNorm = 8;

    async function onShow() {
        if (App.state.cycleError) {
            setHTML('habits-content', errorState(
                App.state.cycleError, 'App.screens.habits.onShow'));
            return;
        }
        try {
            const day = todayISO();
            [todayCache] = await Promise.all([
                apiGet(`/api/today?date=${day}`),
                apiGet(`/api/water?date=${day}`).then((w) => {
                    waterNorm = w.norm || 8;
                }).catch(() => {}),
            ]);
        } catch (err) {
            setHTML('habits-content', errorState(
                `Не получилось загрузить: ${apiErrorText(err)}`,
                'App.screens.habits.onShow'));
            return;
        }
        render();
    }

    function tt() { return App.state.content.habits_screen.trackers; }

    function render() {
        setHTML('habits-content', [
            renderHeader(),
            renderSleep(),
            renderNutrition(),
            renderVitamins(),
            renderWater(),
            renderSteps(),
            renderEnergy(),
        ].join(''));
        bindAll();
    }

    // --- Шапка: «Привычки» + веточка + карточка цикла ---
    function renderHeader() {
        const cycle = App.state.cycle;
        const phase = cycle && cycle.phase
            ? (App.state.content.phases[cycle.phase] || {}).name
            : '';
        const card = (cycle && cycle.cycle_day !== null && cycle.phase)
            ? Components.cycleCard(cycle.cycle_day, phase)
            : Components.cycleCard('—', 'Цикл не настроен');
        return `
        <header class="td-header">
            <div class="td-header-text">
                <h1 class="gf-screen-title">Привычки</h1>
                <p class="td-sub hb-sub">${esc(tt().subtitle).replace('\n', '<br>')}</p>
            </div>
            <div class="td-header-side">
                ${Components.branch(38, 64)}
                ${card}
            </div>
        </header>`;
    }

    // --- Сон: неделя дней с отметками; ввод часов — числом или интервалом (мок) ---
    function sleepToday() {
        try {
            return JSON.parse(localStorage.getItem(`gf_sleep_${todayISO()}`) || 'null');
        } catch (err) { return null; }
    }

    function formatSleepHours(h) {
        const whole = Math.floor(h);
        const mins = Math.round((h - whole) * 60);
        return mins ? `${whole} ч ${mins} мин` : `${whole} ч`;
    }

    // Длительность интервала «со скольки до скольки» в часах (ночь: до < от)
    function intervalHours(from, to) {
        const [fh, fm] = from.split(':').map(Number);
        const [th, tm] = to.split(':').map(Number);
        let diff = (th * 60 + tm) - (fh * 60 + fm);
        if (diff <= 0) diff += 24 * 60;
        return Math.round(diff / 30) / 2;
    }

    function renderSleep() {
        const t = tt();
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const dayNames = App.state.content.common.day_names;
        const saved = sleepToday();
        const value = saved ? formatSleepHours(saved.hours) : t.sleep_value;
        const cells = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const isToday = d.toDateString() === now.toDateString();
            const done = d <= now;
            return `
            <div class="ht-day${isToday ? ' today' : ''}">
                <span class="ht-day-week">${esc(dayNames[i] || '')}</span>
                <span class="ht-day-date">${d.getDate()}</span>
                <span class="ht-day-dot${done ? ' done' : ''}">${done ? '✓' : ''}</span>
            </div>`;
        }).join('');
        return `
        <section class="card-like ht-card" id="ht-sleep" role="button" tabindex="0"
                 aria-label="${esc(t.sleep_title)}">
            <div class="ht-head">
                <span class="ht-icon ht-icon-olive">${Components.icon('moon', 21)}</span>
                <div class="ht-head-txt">
                    <h3 class="ht-name">${esc(t.sleep_title)}</h3>
                    <p class="ht-sub">${esc(t.sleep_goal)}</p>
                </div>
                <div class="ht-side">
                    <span class="ht-value">${esc(value)}</span>
                    <span class="ht-side-sub">${esc(t.today_word)}</span>
                </div>
                <span class="gf-chev ht-chev">›</span>
            </div>
            <div class="ht-week">${cells}</div>
        </section>`;
    }

    // --- Шторка сна: число часов ИЛИ интервал, с переключателем ---
    function openSleepSheet() {
        const t = tt();
        const saved = sleepToday() || {};
        let mode = saved.mode || 'hours';
        openModal(`
            <h2>${esc(t.sleep_sheet_title)}</h2>
            <div class="option-row" id="hs-modes">
                <button type="button" class="option-chip${mode === 'hours' ? ' active' : ''}"
                    data-mode="hours">${esc(t.sleep_mode_hours)}</button>
                <button type="button" class="option-chip${mode === 'interval' ? ' active' : ''}"
                    data-mode="interval">${esc(t.sleep_mode_interval)}</button>
            </div>
            <div id="hs-body"></div>
            <button class="btn" id="hs-save">${esc(t.sleep_save)}</button>
            <button class="btn btn-ghost" id="hs-cancel">Отмена</button>
        `);
        const renderBody = () => {
            if (mode === 'hours') {
                el('hs-body').innerHTML = `
                    <label class="field">
                        <span class="field-label">${esc(t.sleep_hours_label)}</span>
                        <input type="number" id="hs-hours" min="0" max="24" step="0.5"
                               inputmode="decimal" value="${saved.hours != null ? saved.hours : ''}">
                    </label>`;
            } else {
                el('hs-body').innerHTML = `
                    <div class="flex-row">
                        <label class="field" style="flex:1;min-width:0;">
                            <span class="field-label">${esc(t.sleep_from_label)}</span>
                            <input type="time" id="hs-from" value="${esc(saved.from || '23:00')}">
                        </label>
                        <label class="field" style="flex:1;min-width:0;">
                            <span class="field-label">${esc(t.sleep_to_label)}</span>
                            <input type="time" id="hs-to" value="${esc(saved.to || '07:00')}">
                        </label>
                    </div>`;
            }
        };
        renderBody();
        document.querySelectorAll('#hs-modes .option-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                mode = chip.dataset.mode;
                document.querySelectorAll('#hs-modes .option-chip')
                    .forEach((x) => x.classList.toggle('active', x === chip));
                renderBody();
            });
        });
        el('hs-cancel').addEventListener('click', closeModal);
        el('hs-save').addEventListener('click', () => {
            let data;
            if (mode === 'hours') {
                const h = parseFloat(el('hs-hours').value);
                if (!(h > 0) || h > 24) return;
                data = { mode, hours: Math.round(h * 2) / 2 };
            } else {
                const from = el('hs-from').value;
                const to = el('hs-to').value;
                if (!from || !to) return;
                data = { mode, from, to, hours: intervalHours(from, to) };
            }
            try {
                localStorage.setItem(`gf_sleep_${todayISO()}`, JSON.stringify(data));
            } catch (err) { /* localStorage недоступен — просто закрываем */ }
            closeModal();
            render();
        });
    }

    // --- Питание: приёмы пищи из /api/today, переключение шлёт /api/nutrition ---
    function renderNutrition() {
        const t = tt();
        const nut = (todayCache && todayCache.nutrition) || {};
        const keys = ['breakfast', 'lunch', 'dinner'];
        const doneCount = keys.filter((k) => nut[k]).length;
        const chips = keys.map((k, i) => {
            const on = !!nut[k];
            return `
            <span class="ht-meal${on ? ' done' : ''}" data-meal="${k}"
                  role="button" tabindex="0">
                <span class="ht-meal-dot">${on ? '✓' : ''}</span>${esc(t.meals[i] || k)}
            </span>`;
        }).join('');
        return `
        <section class="card-like ht-card">
            <div class="ht-head">
                <span class="ht-icon ht-icon-accent">${Components.icon('fork', 21)}</span>
                <div class="ht-head-txt">
                    <h3 class="ht-name">${esc(t.nutrition_title)}</h3>
                    <p class="ht-sub">${esc(t.nutrition_progress
                        .replace('{done}', doneCount).replace('{total}', keys.length))}</p>
                </div>
                <button type="button" class="gf-pill gf-pill-secondary gf-pill-sm"
                    id="ht-nutrition-more">${esc(t.more)} ›</button>
            </div>
            <div class="ht-nutrition-body">
                <div class="ht-meals">${chips}</div>
                <div class="ht-plate">
                    ${Components.branch(20, 38)}
                    <img src="img/plate.jpg" alt="Тарелка дня">
                </div>
            </div>
        </section>`;
    }

    // --- Витамины: слоты дня (утро/день/вечер), мультивыбор, хранится локально ---
    function vitaminsToday() {
        try {
            const saved = JSON.parse(localStorage.getItem(`gf_vitamins_${todayISO()}`) || 'null');
            if (Array.isArray(saved)) return [0, 1, 2].map((i) => !!saved[i]);
        } catch (err) { /* localStorage недоступен */ }
        return [false, false, false];
    }

    function saveVitamins(done) {
        try {
            localStorage.setItem(`gf_vitamins_${todayISO()}`, JSON.stringify(done));
        } catch (err) { /* localStorage недоступен — состояние живёт до перерисовки */ }
    }

    function renderVitamins() {
        const t = tt();
        const done = vitaminsToday();
        const slots = [
            { label: t.slots[0], icon: 'sun', done: done[0] },
            { label: t.slots[1], icon: 'sun', done: done[1] },
            { label: t.slots[2], icon: 'moon', done: done[2] },
        ];
        const pills = slots.map((s, i) => `
            <span class="ht-slot${s.done ? ' done' : ''}" data-slot="${i}" role="button" tabindex="0">
                ${Components.icon(s.icon, 14)}
                <span>${esc(s.label)}</span>
                <span class="ht-slot-check">✓</span>
            </span>`).join('');
        return `
        <section class="card-like ht-card">
            <div class="ht-head">
                <span class="ht-icon ht-icon-olive">${Components.icon('pill', 21)}</span>
                <div class="ht-head-txt">
                    <h3 class="ht-name">${esc(t.vitamins_title)}</h3>
                    <p class="ht-sub">${esc(t.today_word)}</p>
                </div>
                <button type="button" class="gf-pill gf-pill-secondary gf-pill-sm"
                    id="ht-vitamins-more">${esc(t.more)} ›</button>
            </div>
            <div class="ht-slots">${pills}</div>
        </section>`;
    }

    // --- Вода: стаканы из /api/today, «+» шлёт /api/water; есть ручной ввод (мл/л) ---
    function renderWater() {
        const t = tt();
        const glasses = (todayCache && todayCache.gamification
            && todayCache.gamification.water_glasses) || 0;
        const litres = String((glasses * 0.25).toFixed(2)).replace('.', ',')
            .replace(/0$/, '').replace(/,$/, ',0');
        const pct = Math.min(100, Math.round((glasses / waterNorm) * 100));
        const goalLitres = String((waterNorm * 0.25).toFixed(1)).replace('.', ',');
        return progressCard({
            icon: Components.icon('drop', 21),
            iconCls: 'ht-icon-blue',
            name: t.water_title,
            sub: t.water_goal.replace('{goal}', goalLitres),
            value: t.litres.replace('{value}', litres === '0,0' ? '0' : litres),
            pct,
            barCls: 'ht-bar-blue',
            actionId: 'ht-water-plus',
            manual: {
                inputId: 'ht-water-input',
                unitId: 'ht-water-unit',
                confirmId: 'ht-water-apply',
                placeholder: t.water_manual_placeholder,
            },
        });
    }

    async function submitWaterManual() {
        const input = el('ht-water-input');
        const val = parseFloat(String(input.value).replace(',', '.'));
        if (!(val > 0)) return;
        const unit = el('ht-water-unit').dataset.unit || 'ml';
        const ml = unit === 'l' ? val * 1000 : val;
        const glasses = Math.max(1, Math.round(ml / 250));
        const current = (todayCache.gamification && todayCache.gamification.water_glasses) || 0;
        input.disabled = true;
        try {
            const res = await apiPost('/api/water', { date: todayISO(), glasses: current + glasses });
            todayCache.gamification.water_glasses = res.glasses;
            render();
        } catch (err) {
            input.disabled = false;
            infoSheet(tt().water_title, `Не сохранилось: ${apiErrorText(err)}`);
        }
    }

    // --- Шаги: мок (бэкенда нет), значение — из ручного ввода, хранится локально ---
    function stepsToday() {
        try {
            return Number(localStorage.getItem(`gf_steps_${todayISO()}`) || 0);
        } catch (err) { return 0; }
    }

    function renderSteps() {
        const t = tt();
        const steps = stepsToday() || 7420;
        const pct = Math.min(100, Math.round((steps / 10000) * 100));
        return progressCard({
            icon: Components.icon('footprints', 21),
            iconCls: 'ht-icon-olive',
            name: t.steps_title,
            sub: t.steps_goal,
            value: steps.toLocaleString('ru-RU').replace(/,/g, ' '),
            pct,
            barCls: 'ht-bar-olive',
            actionId: 'ht-steps-info',
            manual: {
                inputId: 'ht-steps-input',
                confirmId: 'ht-steps-apply',
                placeholder: t.steps_manual_placeholder,
            },
        });
    }

    function submitStepsManual() {
        const input = el('ht-steps-input');
        const val = parseInt(input.value, 10);
        if (!(val > 0)) return;
        try {
            localStorage.setItem(`gf_steps_${todayISO()}`, String(val));
        } catch (err) { /* localStorage недоступен */ }
        render();
    }

    function progressCard({ icon, iconCls, name, sub, value, pct, barCls, actionId, manual }) {
        return `
        <section class="card-like ht-card">
            <div class="ht-head">
                <span class="ht-icon ${iconCls}">${icon}</span>
                <div class="ht-head-txt">
                    <h3 class="ht-name">${esc(name)}</h3>
                    <p class="ht-sub">${esc(sub)}</p>
                </div>
                <div class="ht-side">
                    <span class="ht-value">${esc(value)}</span>
                    <span class="ht-side-sub">${pct}%</span>
                </div>
                <span class="gf-chev ht-chev">›</span>
            </div>
            <div class="ht-progress">
                <div class="ht-bar"><span class="ht-bar-fill ${barCls}" style="width:${pct}%"></span></div>
                <button type="button" class="ht-plus" id="${actionId}" aria-label="Добавить">+</button>
            </div>
            ${manual ? `
            <div class="ht-manual-form">
                <input type="number" class="ht-manual" id="${manual.inputId}" min="0"
                       inputmode="decimal" placeholder="${esc(manual.placeholder)}">
                ${manual.unitId
                    ? `<button type="button" class="ht-unit" id="${manual.unitId}" data-unit="ml">мл</button>`
                    : ''}
                <button type="button" class="ht-unit" id="${manual.confirmId}">ОК</button>
            </div>` : ''}
        </section>`;
    }

    // --- Уровень энергии: чек-ин из /api/today, выбор шлёт /api/wellbeing ---
    const SMILE_MOUTH = { 1: 10.5, 2: 12.5, 3: 15, 4: 17, 5: 18.5 };

    function smileySvg(level, active) {
        const y = SMILE_MOUTH[level];
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="9" cy="10" r="0.6" fill="currentColor"/>
            <circle cx="15" cy="10" r="0.6" fill="currentColor"/>
            <path d="M8 ${15 - (y - 12) * 0.4} Q12 ${y} 16 ${15 - (y - 12) * 0.4}"/>
        </svg>`;
    }

    function renderEnergy() {
        const t = tt();
        const wb = (todayCache && todayCache.wellbeing) || null;
        const level = wb ? wb.energy : 3;
        const faces = t.energy_levels.map((label, i) => {
            const lv = i + 1;
            return `
            <div class="ht-face${lv === level ? ' active' : ''}" data-energy="${lv}"
                role="button" tabindex="0">
                <span class="ht-face-circle">${smileySvg(lv, lv === level)}</span>
                <span class="ht-face-label">${esc(label)}</span>
            </div>`;
        }).join('');
        return `
        <section class="card-like ht-card">
            <div class="ht-head">
                <span class="ht-icon ht-icon-accent">${Components.icon('zap', 21)}</span>
                <div class="ht-head-txt">
                    <h3 class="ht-name">${esc(t.energy_title)}</h3>
                    <p class="ht-sub">${esc(t.energy_question)}</p>
                </div>
                <span class="gf-pill gf-pill-secondary gf-pill-sm ht-energy-pill">
                    ${esc(t.energy_levels[level - 1] || '')} ›</span>
            </div>
            <div class="ht-energy-scale">${faces}</div>
        </section>`;
    }

    // --- События ---
    function bindAll() {
        const nutMore = el('ht-nutrition-more');
        if (nutMore) {
            nutMore.addEventListener('click', () => {
                const t = tt();
                infoSheet(t.nutrition_title,
                    'Отмечай приёмы пищи в течение дня — без оценок и подсчётов. '
                    + 'Это помогает заметить ритм питания и поддерживать стабильную энергию.');
            });
        }
        // Клик по приёму пищи — переключение и сохранение через /api/nutrition
        document.querySelectorAll('#habits-content .ht-meal').forEach((chip) => {
            chip.addEventListener('click', async () => {
                const meal = chip.dataset.meal;
                const nut = (todayCache && todayCache.nutrition) || {};
                chip.style.pointerEvents = 'none';
                try {
                    const res = await apiPost('/api/nutrition', {
                        date: todayISO(), [meal]: nut[meal] ? 0 : 1,
                    });
                    todayCache.nutrition = { ...nut, ...res.meals };
                    render();
                } catch (err) {
                    chip.style.pointerEvents = '';
                    infoSheet(tt().nutrition_title, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });
        // Клик по слоту витаминов — независимый переключатель (можно несколько)
        document.querySelectorAll('#habits-content .ht-slot').forEach((slot) => {
            slot.addEventListener('click', () => {
                const done = vitaminsToday();
                done[Number(slot.dataset.slot)] = !done[Number(slot.dataset.slot)];
                saveVitamins(done);
                render();
            });
        });
        const vitMore = el('ht-vitamins-more');
        if (vitMore) {
            vitMore.addEventListener('click', () => {
                const t = tt();
                infoSheet(t.vitamins_title,
                    'Отмечай приём витаминов по слотам дня. Мягкое напоминание '
                    + 'придёт в удобное время, если оно настроено.');
            });
        }
        const plus = el('ht-water-plus');
        if (plus) {
            plus.addEventListener('click', async () => {
                plus.disabled = true;
                const glasses = (todayCache.gamification && todayCache.gamification.water_glasses) || 0;
                try {
                    const res = await apiPost('/api/water', { date: todayISO(), glasses: glasses + 1 });
                    todayCache.gamification.water_glasses = res.glasses;
                    render();
                } catch (err) {
                    plus.disabled = false;
                    infoSheet(tt().water_title, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        }
        // Ручной ввод воды: число + переключатель мл/л
        const waterUnit = el('ht-water-unit');
        if (waterUnit) {
            waterUnit.addEventListener('click', () => {
                const next = waterUnit.dataset.unit === 'ml' ? 'l' : 'ml';
                waterUnit.dataset.unit = next;
                waterUnit.textContent = next === 'ml' ? 'мл' : 'л';
                el('ht-water-input').placeholder = next === 'ml'
                    ? tt().water_manual_placeholder : tt().water_manual_placeholder_l;
            });
        }
        const waterApply = el('ht-water-apply');
        if (waterApply) waterApply.addEventListener('click', submitWaterManual);
        const waterInput = el('ht-water-input');
        if (waterInput) {
            waterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submitWaterManual();
            });
        }
        // Ручной ввод шагов
        const stepsApply = el('ht-steps-apply');
        if (stepsApply) stepsApply.addEventListener('click', submitStepsManual);
        const stepsInput = el('ht-steps-input');
        if (stepsInput) {
            stepsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submitStepsManual();
            });
        }
        // Карточка сна — ввод часов/интервала
        const sleepCard = el('ht-sleep');
        if (sleepCard) sleepCard.addEventListener('click', openSleepSheet);
        const stepsInfo = el('ht-steps-info');
        if (stepsInfo) {
            stepsInfo.addEventListener('click', () => infoSheet(tt().steps_title, tt().steps_hint));
        }
        document.querySelectorAll('#habits-content .ht-face').forEach((face) => {
            face.addEventListener('click', async () => {
                const lv = Number(face.dataset.energy);
                const wb = todayCache.wellbeing;
                try {
                    const res = await apiPost('/api/wellbeing', {
                        date: todayISO(),
                        energy: lv,
                        mood: wb ? wb.mood : 3,
                        feeling: wb ? wb.feeling : 1,
                    });
                    todayCache.wellbeing = { energy: res.energy, mood: res.mood, feeling: res.feeling };
                    render();
                } catch (err) {
                    infoSheet(tt().energy_title, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });
    }

    return { onShow };
})();
