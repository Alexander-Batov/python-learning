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
            renderPhasesFood(),
            renderHandRule(),
        ].join(''));
        bindAll();
    }

    // --- Шапка: «Питание» + веточка + карточка цикла + подпись ---
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
                ${Components.branch(54, 84)}
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
        return `
        <section>
            <div class="gf-section-header">
                <h2 class="gf-section-title">${esc(r.title)}</h2>
                <button type="button" class="gf-pill gf-pill-secondary gf-pill-sm" id="nt-plate-more">Подробнее ›</button>
            </div>
            <p class="nt-plate-sub">${esc(r.sub)}</p>
            <div class="nt-plate">
                <div class="nt-plate-left">
                    <div class="nt-plate-txt">
                        <span class="nt-plate-pct">50%</span>
                        <span class="nt-plate-cap">${esc(r.veg_label)}</span>
                    </div>
                    ${Components.icon('arrow', 24)}
                </div>
                <img class="nt-plate-img" src="img/plate.jpg" alt="Тарелка по правилу 50/25/25">
                <div class="nt-plate-right">
                    <div class="nt-plate-item">
                        ${Components.icon('arrow', 24)}
                        <div class="nt-plate-txt">
                            <span class="nt-plate-pct">25%</span>
                            <span class="nt-plate-name">${esc(r.protein_label)}</span>
                            <span class="nt-plate-desc">${esc(r.protein_sub)}</span>
                        </div>
                    </div>
                    <div class="nt-plate-item">
                        ${Components.icon('arrow', 24)}
                        <div class="nt-plate-txt">
                            <span class="nt-plate-pct">25%</span>
                            <span class="nt-plate-name">${esc(r.carbs_label)}</span>
                            <span class="nt-plate-desc">${esc(r.carbs_sub)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="nt-note">
                <span class="nt-note-icon">${Components.icon('leaf', 18)}</span>
                <p>${esc(r.note)}</p>
            </div>
        </section>`;
    }

    // --- Питание по фазам цикла ---
    const PHASE_ICON = { menstrual: 'drop', follicular: 'leaf', ovulatory: 'sun', luteal: 'moon' };
    const PHASE_TINT = { menstrual: 'nt-pink', follicular: 'nt-green', ovulatory: 'nt-pink', luteal: 'nt-pink' };

    function renderPhasesFood() {
        const ns = App.state.content.nutrition_screen;
        const phases = App.state.content.phases;
        const cards = TODAY_PHASE_ORDER.map((key) => `
            <div class="nt-phase-card ${PHASE_TINT[key]}" data-phase="${key}" role="button" tabindex="0">
                <span class="nt-phase-icon">${Components.icon(PHASE_ICON[key] || 'leaf', 22)}</span>
                <span class="nt-phase-name">${esc((phases[key] || {}).name || '')}</span>
                <span class="nt-phase-text">${esc((phases[key] || {}).food_focus || '')}</span>
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

        const plateMore = el('nt-plate-more');
        if (plateMore) plateMore.addEventListener('click', openPlateBuilder);

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

    // --- Конструктор тарелки (сохранён) ---
    const builder = { step: 0, picked: {} };

    function openPlateBuilder() {
        builder.step = 0;
        builder.picked = {};
        renderBuilder();
        showScreen('plate');
    }

    const BUILDER_KEYS = ['proteins', 'veg', 'carbs', 'fats'];

    function renderBuilder() {
        const c = App.state.content.nutrition_screen;
        const key = BUILDER_KEYS[builder.step];
        const stepLabels = c.plate_builder_steps;
        const done = builder.step >= BUILDER_KEYS.length;
        const stepsBar = stepLabels.map((_, i) =>
            `<div class="builder-step${i < builder.step || done ? ' on' : ''}"></div>`).join('');
        const pickedSummary = BUILDER_KEYS
            .filter((k) => builder.picked[k])
            .map((k, i) => `${stepLabels[i].toLowerCase()}: <b>${esc(builder.picked[k])}</b>`).join(' · ');

        if (done) {
            setHTML('plate-builder', `
                <section class="card">
                    <h2>${c.plate_ready} ✓</h2>
                    <div class="plate-visual">
                        <div class="plate-circle"></div>
                        <p class="subtitle">${pickedSummary}</p>
                    </div>
                    <button class="btn" id="pb-save">${c.plate_save}</button>
                    <button class="btn btn-ghost" id="pb-restart">${c.plate_restart}</button>
                    <p class="form-message" id="pb-msg"></p>
                </section>
            `);
            el('pb-save').addEventListener('click', () => {
                el('pb-msg').textContent = c.plate_saved;
                el('pb-msg').classList.add('ok');
                el('pb-save').disabled = true;
            });
            el('pb-restart').addEventListener('click', openPlateBuilder);
            return;
        }

        const options = c.plate_items[key] || [];
        setHTML('plate-builder', `
            <section class="card">
                <div class="builder-steps">${stepsBar}</div>
                <h2>${stepLabels[builder.step]}</h2>
                <p class="subtitle">${c.plate_builder_hint}</p>
                <div class="option-row">
                    ${options.map((o) => `
                        <button class="option-chip${builder.picked[key] === o ? ' active' : ''}"
                            data-pick="${esc(o)}">${esc(o)}</button>`).join('')}
                </div>
                ${pickedSummary ? `<div class="builder-picked">${pickedSummary}</div>` : ''}
                <button class="btn" id="pb-next" ${builder.picked[key] ? '' : 'disabled'}>${App.state.content.onboarding.next}</button>
            </section>
        `);
        document.querySelectorAll('#plate-builder [data-pick]').forEach((chip) => {
            chip.addEventListener('click', () => {
                builder.picked[key] = chip.dataset.pick;
                document.querySelectorAll('#plate-builder [data-pick]')
                    .forEach((x) => x.classList.toggle('active', x === chip));
                el('pb-next').disabled = false;
            });
        });
        el('pb-next').addEventListener('click', () => {
            builder.step += 1;
            renderBuilder();
        });
    }

    return { onShow, openRecipe, openPlateBuilder };
})();
