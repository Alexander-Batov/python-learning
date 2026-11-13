// Экран «Питание» — вёрстка 1-в-1 с референсом (Экраны/Четверный экран.jpg).
// Шапка с карточкой цикла → правило тарелки → питание по фазам (скролл) →
// правило «ладошка — кулак». Конструктор тарелки и рецепты сохранены.

App.screens.nutrition = (() => {

    async function onShow() {
        if (App.state.cycleError) {
            setHTML('nutrition-content', errorState(
                App.state.cycleError, 'App.screens.nutrition.onShow'));
            return;
        }
        if (!App.state.user) {
            try {
                await loadUser();
            } catch (err) {
                setHTML('nutrition-content', errorState(
                    `Не получилось загрузить: ${apiErrorText(err)}`,
                    'App.screens.nutrition.onShow'));
                return;
            }
        }
        render();
    }

    function render() {
        const cycle = App.state.cycle;
        const noCycle = !cycle || cycle.cycle_day === null || !cycle.phase;
        setHTML('nutrition-content', [
            renderHeader(),
            noCycle ? renderNoCycle() : renderPlateRule(),
            renderWhatToEat(),
            renderPhasesFood(),
            renderHandRule(),
        ].join(''));
        bindAll();
    }

    // --- Блок «Что поесть?»: понимание вариантов, а не диета ---
    function renderWhatToEat() {
        const ns = App.state.content.nutrition_screen;
        if (!ns.what_to_eat_title) return '';
        return `
        <section class="card nt-what">
            <h3>${esc(ns.what_to_eat_title)}</h3>
            <p class="subtitle">${esc(ns.what_to_eat_text)}</p>
            <button type="button" class="btn btn-small" id="nt-what-cta">${esc(ns.what_to_eat_cta || 'Собрать тарелку →')}</button>
        </section>`;
    }

    // --- Шапка: «Питание» + карточка цикла + подпись ---
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
                <h1 class="gf-screen-title">Питание</h1>
                <p class="td-sub">Забота о себе — это энергия<br>для твоих целей</p>
            </div>
            <div class="td-header-side">
                ${card}
            </div>
        </header>`;
    }

    function renderNoCycle() {
        const c = App.state.content.cycle_screen;
        return `
        <section class="card">
            <h3>${esc(c.no_data_title)}</h3>
            <p class="subtitle">${esc(c.no_data_text)}</p>
            <button class="btn btn-small" id="nt-setup">${esc(c.setup_button)}</button>
        </section>`;
    }

    // --- Правило тарелки ---
    function renderPlateRule() {
        const r = App.state.content.nutrition_screen.plate_rule;
        const cta = App.state.content.nutrition_screen.plate_cta;
        return `
        <section>
            <div class="gf-section-header">
                <h2 class="gf-section-title">${esc(r.title)}</h2>
            </div>
            <p class="nt-plate-sub">${esc(r.sub)}</p>
            <div class="nt-plate">
                <div class="nt-plate-left">
                    <div class="nt-plate-txt">
                        <span class="nt-plate-pct">½ тарелки</span>
                        <span class="nt-plate-cap">${esc(r.veg_label)}</span>
                    </div>
                    ${Components.icon('arrow', 24)}
                </div>
                <img class="nt-plate-img" src="img/plate.jpg" alt="Тарелка по правилу ½/¼/¼"
                     role="button" tabindex="0" id="nt-plate-img"
                     aria-label="${esc(cta || 'Сформировать тарелку')}">
                <div class="nt-plate-right">
                    <div class="nt-plate-item">
                        ${Components.icon('arrow', 24)}
                        <div class="nt-plate-txt">
                            <span class="nt-plate-pct">¼ тарелки</span>
                            <span class="nt-plate-name">${esc(r.protein_label)}</span>
                            <span class="nt-plate-desc">${esc(r.protein_sub)}</span>
                        </div>
                    </div>
                    <div class="nt-plate-item">
                        ${Components.icon('arrow', 24)}
                        <div class="nt-plate-txt">
                            <span class="nt-plate-pct">¼ тарелки</span>
                            <span class="nt-plate-name">${esc(r.carbs_label)}</span>
                            <span class="nt-plate-desc">${esc(r.carbs_sub)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <button type="button" class="btn" id="nt-plate-cta">${esc(cta || 'Сформировать тарелку')}</button>
            <div class="nt-note">
                <span class="nt-note-icon">${Components.icon('sun', 18)}</span>
                <p>${esc(r.note)}</p>
            </div>
        </section>`;
    }

    // --- Питание по фазам цикла ---
    const PHASE_ICON = { menstrual: 'drop', follicular: 'zap', ovulatory: 'sun', luteal: 'moon' };
    const PHASE_TINT = { menstrual: 'nt-pink', follicular: 'nt-green', ovulatory: 'nt-pink', luteal: 'nt-pink' };

    function renderPhasesFood() {
        const ns = App.state.content.nutrition_screen;
        const phases = App.state.content.phases;
        const cards = TODAY_PHASE_ORDER.map((key) => `
            <div class="nt-phase-card ${PHASE_TINT[key]}" data-phase="${key}" role="button" tabindex="0">
                <span class="nt-phase-icon">${Components.icon(PHASE_ICON[key] || 'sun', 22)}</span>
                <span class="nt-phase-name">${esc((phases[key] || {}).name || '')}</span>
                <span class="nt-phase-text">${esc((phases[key] || {}).food_focus || '')}</span>
                <span class="nt-phase-tip">${esc((phases[key] || {}).food_tip || '')}</span>
            </div>`).join('');
        return `
        <section>
            <h2 class="gf-section-title">${esc(ns.phases_food_title)}</h2>
            <p class="nt-plate-sub">${esc(ns.phases_food_sub)}</p>
            <div class="nt-phases-wrap">
                <div class="nt-phases-scroll" id="nt-phases-scroll">
                    <div class="nt-phases-track">${cards}</div>
                </div>
                <div class="nt-dots" id="nt-dots">
                    ${TODAY_PHASE_ORDER.map((_, i) => `<span class="nt-dot${i === 0 ? ' active' : ''}"></span>`).join('')}
                </div>
            </div>
        </section>`;
    }

    // --- Правило ладошка — кулак ---
    function renderHandRule() {
        const hr = App.state.content.nutrition_screen.hand_rule;
        return `
        <section>
            <div class="gf-section-header">
                <h2 class="gf-section-title">${esc(hr.title)}</h2>
                <button type="button" class="gf-pill gf-pill-secondary gf-pill-sm" id="nt-hand-more">Подробнее ›</button>
            </div>
            <p class="nt-plate-sub">${esc(hr.sub)}</p>
            <div class="nt-hands">
                ${hr.items.map((it) => `
                    <div class="nt-hand">
                        <span class="nt-hand-circle"><img src="${esc(it.img)}" alt="" loading="lazy"></span>
                        <span class="nt-hand-caption">${esc(it.caption)}</span>
                        <span class="nt-hand-detail">${esc(it.detail)}</span>
                        <span class="nt-hand-note">${esc(it.note)}</span>
                    </div>`).join('')}
            </div>
        </section>`;
    }

    function bindAll() {
        const setup = el('nt-setup');
        if (setup) setup.addEventListener('click', () => App.screens.cycle.openEditSheet());

        // Тарелка-иллюстрация и CTA открывают конструктор
        const plateImg = el('nt-plate-img');
        if (plateImg) plateImg.addEventListener('click', () => openPlateBuilder());
        const plateCta = el('nt-plate-cta');
        if (plateCta) plateCta.addEventListener('click', () => openPlateBuilder());
        const whatCta = el('nt-what-cta');
        if (whatCta) whatCta.addEventListener('click', () => openPlateBuilder());

        document.querySelectorAll('#nutrition-content .nt-phase-card').forEach((card) => {
            card.addEventListener('click', () => App.screens.cycle.openPhase(card.dataset.phase));
        });

        // Пагинационные точки следят за скроллом карточек фаз
        const scroller = el('nt-phases-scroll');
        if (scroller) {
            scroller.addEventListener('scroll', () => {
                const card = scroller.querySelector('.nt-phase-card');
                if (!card) return;
                const step = card.offsetWidth + 10;
                const idx = Math.min(
                    TODAY_PHASE_ORDER.length - 1,
                    Math.round(scroller.scrollLeft / step));
                document.querySelectorAll('#nt-dots .nt-dot').forEach((d, i) => {
                    d.classList.toggle('active', i === idx);
                });
            }, { passive: true });
        }

        const handMore = el('nt-hand-more');
        if (handMore) {
            handMore.addEventListener('click', () => {
                const hr = App.state.content.nutrition_screen.hand_rule;
                infoSheet(hr.title,
                    'Ориентируйся на размер своей ладони: белок — одна ладонь, '
                    + 'сложные углеводы — кулак, овощи — две ладони, жиры — большой палец. '
                    + 'Это мягкий ориентир, который помогает собирать сбалансированную тарелку '
                    + 'без взвешивания и подсчётов.');
            });
        }
    }

    // --- Экран рецепта (сохранён) ---
    async function openRecipe(id) {
        setHTML('recipe-card', emptyState(App.state.content.common.loading));
        showScreen('recipe');
        let r;
        try {
            r = await apiGet(`/api/recipes/${id}`);
        } catch (err) {
            setHTML('recipe-card', errorState(`Не удалось открыть рецепт: ${apiErrorText(err)}`, null));
            return;
        }
        const c = App.state.content.nutrition_screen;
        const labels = App.state.content.common.meal_labels;
        const emoji = { breakfast: '🍳', lunch: '🥗', dinner: '🍲', snack: '🍎' };
        setHTML('recipe-card', `
            <section class="card">
                <div class="recipe-thumb" style="height:140px;font-size:44px;">${emoji[r.category] || '🍽'}</div>
                <h1 style="font-size:27px;">${esc(r.title)}</h1>
                <p class="subtitle">${labels[r.category] || ''} · ${r.time_min} ${c.minutes_word} · ${r.ingredients.length} ${c.ingredients_word}</p>
                ${r.phase_note ? `<p class="text-muted" style="font-style:italic;">${esc(r.phase_note)}</p>` : ''}
            </section>
            <section class="card">
                <h3>${c.ingredients_title}</h3>
                <ul style="padding-left:18px;display:flex;flex-direction:column;gap:5px;">
                    ${r.ingredients.map((i) => `<li style="font-size:14px;">${esc(i)}</li>`).join('')}
                </ul>
            </section>
            <section class="card">
                <h3>${c.steps_title}</h3>
                <ol style="padding-left:18px;display:flex;flex-direction:column;gap:7px;">
                    ${r.steps.map((s) => `<li style="font-size:14px;">${esc(s)}</li>`).join('')}
                </ol>
            </section>
        `);
    }

    // --- Конструктор тарелки: мультивыбор продуктов + свой вариант в каждой
    // категории → пара уточняющих вопросов → результат с расчётом КБЖУ.
    // Формула простая и прозрачная: суммируем порции-ориентиры продуктов
    // (константы в content.json plate_items/plate_config), итог умножаем
    // на поправки аппетита и цели. Проценты Б/Ж/У — от калорий макросов
    // (Б·4, Ж·9, У·4 ккал/г). Свой вариант считается по средней порции группы.
    const BUILDER_KEYS = ['proteins', 'veg', 'carbs', 'fats'];
    const builder = {
        step: 0,
        picked: {},     // cat -> [имена продуктов из каталога]
        other: {},      // cat -> свой вариант (строка)
        goal: 'maintain',
        appetite: 'normal',
    };

    function plateCfg() {
        return App.state.content.nutrition_screen.plate_config || {};
    }

    function openPlateBuilder(restoreItems) {
        builder.step = 0;
        builder.picked = {};
        builder.other = {};
        builder.goal = 'maintain';
        builder.appetite = 'normal';
        builder.showOtherKey = null;
        if (restoreItems) {
            // «Повторить набор» из сохранённой тарелки: каталожные продукты
            // возвращаем в чипы, свои варианты — в поле «Другое» категории
            restoreItems.forEach((it) => {
                if (!BUILDER_KEYS.includes(it.cat)) return;
                // Имён из старых сохранённых тарелок может не быть в новом
                // каталоге — отправляем их в «Другое», чтобы не потерять
                if (!it.custom && catalogItem(it.cat, it.name)) {
                    builder.picked[it.cat] = builder.picked[it.cat] || [];
                    if (!builder.picked[it.cat].includes(it.name)) {
                        builder.picked[it.cat].push(it.name);
                    }
                } else {
                    builder.other[it.cat] = builder.other[it.cat]
                        ? `${builder.other[it.cat]}, ${it.name}`
                        : it.name;
                    builder.showOtherKey = it.cat;
                }
            });
            builder.step = BUILDER_KEYS.length; // сразу к уточняющим вопросам
        }
        renderBuilder();
        showScreen('plate');
    }

    // Карточка продукта из каталога по имени; null, если это свой вариант
    function catalogItem(cat, name) {
        const items = App.state.content.nutrition_screen.plate_items[cat] || [];
        return items.find((o) => o.name === name) || null;
    }

    // Выбранное в категории: отмеченные продукты + (опционально) свой вариант
    function pickedNames(key) {
        const items = [...(builder.picked[key] || [])];
        const custom = (builder.other[key] || '').trim();
        if (custom) items.push(custom);
        return items;
    }

    // Все выбранные позиции с порциями и макросами (custom — по средней группы)
    function collectedItems() {
        const cfg = plateCfg();
        const items = [];
        BUILDER_KEYS.forEach((cat) => {
            pickedNames(cat).forEach((name) => {
                const found = catalogItem(cat, name);
                if (found) {
                    items.push({ cat, name, custom: false, ...found });
                } else {
                    const def = (cfg.default_portion || {})[cat] || {};
                    items.push({ cat, name, custom: true, ...def });
                }
            });
        });
        return items;
    }

    // Итог расчёта: позиции с учётом поправок, суммы и проценты Б/Ж/У
    function computeResult() {
        const cfg = plateCfg();
        const mult = ((cfg.appetite_adjust || {})[builder.appetite] || 1)
            * ((cfg.goal_adjust || {})[builder.goal] || 1);
        const items = collectedItems().map((it) => ({
            ...it,
            grams: Math.round(it.grams * mult),
            kcal: Math.round(it.kcal * mult),
            p: Math.round(it.p * mult * 10) / 10,
            f: Math.round(it.f * mult * 10) / 10,
            c: Math.round(it.c * mult * 10) / 10,
        }));
        const sum = (k) => Math.round(items.reduce((acc, it) => acc + (it[k] || 0), 0));
        const kcalFrom = { p: sum('p') * 4, f: sum('f') * 9, c: sum('c') * 4 };
        const totalMacroKcal = kcalFrom.p + kcalFrom.f + kcalFrom.c || 1;
        return {
            items,
            kcal: sum('kcal'),
            p: sum('p'), f: sum('f'), c: sum('c'),
            pct: {
                p: Math.round((kcalFrom.p / totalMacroKcal) * 100),
                f: Math.round((kcalFrom.f / totalMacroKcal) * 100),
                c: Math.round((kcalFrom.c / totalMacroKcal) * 100),
            },
        };
    }

    // Круговая диаграмма Б/Ж/У: три дуги, в центре суммарные ккал
    function macroDonut(res, kcalWord) {
        const size = 148;
        const r = (size - 18) / 2;
        const cx = size / 2;
        const circ = 2 * Math.PI * r;
        const segs = [
            { pct: res.pct.p, color: 'var(--olive)' },
            { pct: res.pct.f, color: 'var(--accent)' },
            { pct: res.pct.c, color: 'var(--accent-warm)' },
        ];
        let offset = 0;
        const arcs = segs.map((s) => {
            const len = (circ * s.pct) / 100;
            const arc = len > 0 ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none"
                stroke="${s.color}" stroke-width="14"
                stroke-dasharray="${len} ${circ - len}"
                stroke-dashoffset="${-offset}"
                transform="rotate(-90 ${cx} ${cx})"/>` : '';
            offset += len;
            return arc;
        }).join('');
        return `
        <svg class="pb-donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
             role="img" aria-label="Белки ${res.p} г, жиры ${res.f} г, углеводы ${res.c} г">
            <circle cx="${cx}" cy="${cx}" r="${r}" fill="none"
                    stroke="var(--border)" stroke-width="14"/>
            ${arcs}
            <text x="50%" y="48%" text-anchor="middle" class="pb-donut-num">${res.kcal}</text>
            <text x="50%" y="60%" text-anchor="middle" class="pb-donut-cap">${esc(kcalWord)}</text>
        </svg>`;
    }

    // Текущая фаза/подпериод строкой и совет по фазе
    function platePhaseInfo() {
        const cycle = App.state.cycle || {};
        const phases = App.state.content.phases || {};
        const subs = App.state.content.subperiods || {};
        const tips = (plateCfg().phase_tips) || {};
        const sub = subs[cycle.subperiod] || null;
        if (!cycle.phase) return { label: '', tip: tips.luteal || '' };
        if (sub) {
            return {
                label: `${(phases[cycle.phase] || {}).name || ''} · ${sub.name}`.replace(/^ · /, ''),
                tip: tips[cycle.subperiod] || tips[cycle.phase] || '',
            };
        }
        return {
            label: (phases[cycle.phase] || {}).name || '',
            tip: tips[cycle.phase] || '',
        };
    }

    // Разметка результата (общая для конструктора и просмотра сохранённой)
    function plateResultHtml(res, phaseTip) {
        const c = App.state.content.nutrition_screen;
        const names = c.plate_macro_names || { p: 'Белки', f: 'Жиры', c: 'Углеводы' };
        const row = (key, grams, color) => `
            <div class="pb-macro">
                <span class="pb-macro-dot" style="background:${color};"></span>
                <span class="pb-macro-name">${esc(names[key])}</span>
                <span class="pb-macro-val">${grams} г</span>
            </div>`;
        return `
            <div class="pb-result">
                ${macroDonut(res, c.plate_kcal_word || 'ккал')}
                <div class="pb-macros">
                    ${row('p', res.p, 'var(--olive)')}
                    ${row('f', res.f, 'var(--accent)')}
                    ${row('c', res.c, 'var(--accent-warm)')}
                </div>
            </div>
            <ul class="pb-items">
                ${res.items.map((it) => `<li>${esc(it.name)} — ~${it.grams} г</li>`).join('')}
            </ul>
            ${phaseTip ? `<p class="pb-tip">${esc(phaseTip)}</p>` : ''}`;
    }

    function renderBuilder() {
        const c = App.state.content.nutrition_screen;
        const key = BUILDER_KEYS[builder.step];
        const stepLabels = c.plate_builder_steps;
        const isQuestions = builder.step === BUILDER_KEYS.length;
        const isResult = builder.step > BUILDER_KEYS.length;
        const stepsBar = stepLabels.map((_, i) =>
            `<div class="builder-step${i < builder.step ? ' on' : ''}"></div>`).join('');
        const pickedSummary = BUILDER_KEYS
            .filter((k) => pickedNames(k).length)
            .map((k, i) => `${stepLabels[i].toLowerCase()}: <b>${esc(pickedNames(k).join(', '))}</b>`).join(' · ');

        // --- Финальный шаг: результат с расчётом ---
        if (isResult) {
            const res = computeResult();
            const phase = platePhaseInfo();
            setHTML('plate-builder', `
                <section class="card">
                    <div class="builder-steps">${stepsBar}</div>
                    <h2>${esc(c.plate_ready)} ✓</h2>
                    ${plateResultHtml(res, phase.tip)}
                    <button class="btn" id="pb-save">${esc(c.plate_save)}</button>
                    <button class="btn btn-ghost" id="pb-restart">${esc(c.plate_restart)}</button>
                    <p class="form-message" id="pb-msg"></p>
                </section>
            `);
            el('pb-save').addEventListener('click', async () => {
                const btn = el('pb-save');
                btn.disabled = true;
                const cycle = App.state.cycle || {};
                const title = `Тарелка · ${formatDayMonth(todayISO())}`;
                const plate = {
                    created: todayISO(),
                    phase: cycle.phase || null,
                    subperiod: cycle.subperiod || null,
                    goal: builder.goal,
                    appetite: builder.appetite,
                    items: res.items,
                    totals: { kcal: res.kcal, p: res.p, f: res.f, c: res.c, pct: res.pct },
                };
                try {
                    await apiPost('/api/plates', { title, plate });
                    el('pb-msg').textContent = c.plate_saved;
                    el('pb-msg').classList.add('ok');
                } catch (err) {
                    btn.disabled = false;
                    el('pb-msg').textContent = `Не сохранилось: ${apiErrorText(err)}`;
                }
            });
            el('pb-restart').addEventListener('click', () => openPlateBuilder());
            return;
        }

        // --- Шаг уточняющих вопросов (цель + аппетит, фаза — автоматически) ---
        if (isQuestions) {
            const phase = platePhaseInfo();
            const chipRow = (opts, current, field) => opts.map((o) => `
                <button class="option-chip${current === o.id ? ' active' : ''}"
                    data-q="${field}" data-value="${o.id}">${esc(o.label)}</button>`).join('');
            setHTML('plate-builder', `
                <section class="card">
                    <div class="builder-steps">${stepsBar}</div>
                    <h2>${esc(c.plate_questions_title)}</h2>
                    ${phase.label ? `<p class="subtitle">${esc(c.plate_phase_prefix)}: <b>${esc(phase.label)}</b></p>` : ''}
                    <p class="checkin-label">${esc(c.plate_goal_title)}</p>
                    <div class="option-row">${chipRow(c.plate_goal_options, builder.goal, 'goal')}</div>
                    <p class="checkin-label">${esc(c.plate_appetite_title)}</p>
                    <div class="option-row">${chipRow(c.plate_appetite_options, builder.appetite, 'appetite')}</div>
                    ${pickedSummary ? `<div class="builder-picked">${pickedSummary}</div>` : ''}
                    <button class="btn" id="pb-calc">${esc(c.plate_calc)}</button>
                </section>
            `);
            document.querySelectorAll('#plate-builder [data-q]').forEach((chip) => {
                chip.addEventListener('click', () => {
                    builder[chip.dataset.q] = chip.dataset.value;
                    document.querySelectorAll(`#plate-builder [data-q="${chip.dataset.q}"]`)
                        .forEach((x) => x.classList.toggle('active', x === chip));
                });
            });
            el('pb-calc').addEventListener('click', () => {
                builder.step += 1;
                renderBuilder();
            });
            return;
        }

        // --- Шаги категорий ---
        const options = c.plate_items[key] || [];
        const custom = builder.other[key] || '';
        const showOther = builder.showOtherKey === key;
        const hasPick = pickedNames(key).length > 0;

        // Группировка вариантов по подзаголовкам (поле group в plate_items)
        const groups = [];
        options.forEach((o) => {
            const g = o.group || '';
            let bucket = groups.find((x) => x.name === g);
            if (!bucket) { bucket = { name: g, items: [] }; groups.push(bucket); }
            bucket.items.push(o);
        });
        const chip = (o) => `
                        <button class="option-chip${(builder.picked[key] || []).includes(o.name) ? ' active' : ''}"
                            data-pick="${esc(o.name)}">${esc(o.name)}</button>`;
        const groupsHtml = groups.map((g) => `
                ${g.name ? `<p class="pb-group-label">${esc(g.name)}</p>` : ''}
                <div class="option-row">${g.items.map(chip).join('')}</div>`).join('');

        const catHint = (c.plate_items_hint || {})[key] || '';
        setHTML('plate-builder', `
            <section class="card">
                <div class="builder-steps">${stepsBar}</div>
                <h2>${stepLabels[builder.step]}</h2>
                <p class="subtitle">${c.plate_builder_hint}</p>
                ${groupsHtml}
                <div class="option-row">
                    <button class="option-chip${showOther ? ' active' : ''}"
                        data-pick="__other">${esc(c.plate_other || 'Другое')}</button>
                </div>
                ${catHint ? `<p class="pb-cat-hint">${esc(catHint)}</p>` : ''}
                ${showOther ? `
                <label class="field">
                    <span class="field-label">${esc(c.plate_other_label || 'Свой вариант')}</span>
                    <input type="text" id="pb-other" maxlength="64"
                           placeholder="${esc(c.plate_other_placeholder || '')}"
                           value="${esc(custom)}">
                </label>` : ''}
                ${pickedSummary ? `<div class="builder-picked">${pickedSummary}</div>` : ''}
                <button class="btn" id="pb-next" ${hasPick ? '' : 'disabled'}>${App.state.content.onboarding.next}</button>
            </section>
        `);

        const updateNext = () => {
            el('pb-next').disabled = pickedNames(key).length === 0;
        };

        document.querySelectorAll('#plate-builder [data-pick]').forEach((chip) => {
            chip.addEventListener('click', () => {
                const val = chip.dataset.pick;
                if (val === '__other') {
                    // переключение поля своего варианта
                    builder.showOtherKey = showOther ? null : key;
                    if (showOther) builder.other[key] = '';
                    renderBuilder();
                    const input = el('pb-other');
                    if (input) input.focus();
                    return;
                }
                builder.picked[key] = builder.picked[key] || [];
                const arr = builder.picked[key];
                const idx = arr.indexOf(val);
                if (idx >= 0) arr.splice(idx, 1);
                else arr.push(val);
                chip.classList.toggle('active');
                updateNext();
            });
        });

        const otherInput = el('pb-other');
        if (otherInput) {
            otherInput.addEventListener('input', () => {
                builder.other[key] = otherInput.value;
                updateNext();
            });
        }

        el('pb-next').addEventListener('click', () => {
            builder.step += 1;
            renderBuilder();
        });
    }

    return { onShow, openRecipe, openPlateBuilder, plateResultHtml, macroDonut };
})();
