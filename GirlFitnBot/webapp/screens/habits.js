// Экран «Привычки» — вёрстка 1-в-1 с референсом (Экраны/Пятый экран.jpg).
// Шесть трекеров: сон, питание, витамины, вода, шаги, уровень энергии.
// Данные: /api/today и /api/water (питание, вода, энергия); сон/витамины/шаги — моки.

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

    // --- Сон: неделя дней с отметками (мок: дни до сегодня выполнены) ---
    function renderSleep() {
        const t = tt();
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const dayNames = App.state.content.common.day_names;
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
        <section class="card-like ht-card">
            <div class="ht-head">
                <span class="ht-icon ht-icon-olive">${Components.icon('moon', 21)}</span>
                <div class="ht-head-txt">
                    <h3 class="ht-name">${esc(t.sleep_title)}</h3>
                    <p class="ht-sub">${esc(t.sleep_goal)}</p>
                </div>
                <div class="ht-side">
                    <span class="ht-value">${esc(t.sleep_value)}</span>
                    <span class="ht-side-sub">${esc(t.today_word)}</span>
                </div>
                <span class="gf-chev ht-chev">›</span>
            </div>
            <div class="ht-week">${cells}</div>
        </section>`;
    }

    // --- Питание: приёмы пищи из /api/today ---
    function renderNutrition() {
        const t = tt();
        const nut = (todayCache && todayCache.nutrition) || {};
        const keys = ['breakfast', 'lunch', 'dinner'];
        const doneCount = keys.filter((k) => nut[k]).length;
        const chips = keys.map((k, i) => {
            const on = !!nut[k];
            return `
            <span class="ht-meal${on ? ' done' : ''}">
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

    // --- Витамины: слоты дня (мок: утро отмечено) ---
    function renderVitamins() {
        const t = tt();
        const slots = [
            { label: t.slots[0], icon: 'sun', done: true },
            { label: t.slots[1], icon: 'sun', done: false },
            { label: t.slots[2], icon: 'moon', done: false },
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

    // --- Вода: стаканы из /api/today, «+» шлёт /api/water ---
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
        });
    }

    // --- Шаги: мок (бэкенда нет) ---
    function renderSteps() {
        const t = tt();
        const steps = 7420;
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
        });
    }

    function progressCard({ icon, iconCls, name, sub, value, pct, barCls, actionId }) {
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
