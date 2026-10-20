// Экран «Питание»: фокус дня, конструктор тарелки, рецепты с фильтрами,
// трекер приёмов пищи (только факт отметки), питание по фазам, регулярность.

App.screens.nutrition = (() => {
    const filters = { category: '', tag: '' };
    let recipesCache = null;
    let progressCache = null;

    async function onShow() {
        el('nutrition-subtitle').textContent =
            App.state.content.nutrition_screen.subtitle;
        el('nutrition-info').onclick = () => {
            const c = App.state.content.nutrition_screen;
            infoSheet(c.disclaimer_title, c.disclaimer_text);
        };
        setHTML('nutrition-content', emptyState(App.state.content.common.loading));
        try {
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            [recipesCache, progressCache] = await Promise.all([
                apiGet('/api/recipes'),
                apiGet(`/api/progress?month=${month}&date=${todayISO()}`),
                loadNutrition(),
            ]);
            render();
        } catch (err) {
            setHTML('nutrition-content', errorState(
                `Не получилось загрузить питание: ${apiErrorText(err)}`,
                'App.screens.nutrition.onShow'));
        }
    }

    async function loadNutrition() {
        App.state.nutrition = await apiGet(`/api/nutrition?date=${todayISO()}`);
    }

    function render() {
        const c = App.state.content.nutrition_screen;
        setHTML('nutrition-content', [
            renderCycleCard(c),
            renderFocus(c),
            renderNotice(c),
            renderCookToday(c),
            renderRecipes(c),
            renderPhasesNav(c),
            renderTracker(c),
            renderRegularity(c),
        ].join(''));
        bindAll(c);
    }

    function renderCycleCard(c) {
        const cycle = App.state.cycle;
        if (!cycle || !cycle.phase) {
            return `
            <section class="card card-warm">
                <h3>${c.focus_title}</h3>
                <p class="subtitle">${c.plate_text}</p>
                <button class="btn btn-small" id="nu-setup">${c.no_cycle_setup}</button>
            </section>`;
        }
        const phase = App.state.content.phases[cycle.phase];
        const focus = App.state.content.nutrition_focus[cycle.phase] || '';
        return `
        <section class="card">
            <div class="flex-between">
                <div>
                    <h3>${c.focus_title}</h3>
                    <p class="text-muted">День ${cycle.cycle_day} · ${phase.name.toLowerCase()}</p>
                </div>
                <span class="legend-dot" style="background:${phase.color};width:14px;height:14px;"></span>
            </div>
            <p class="subtitle">${focus}</p>
            <button class="link-btn" id="nu-phase-more">${c.cycle_card_more} →</button>
        </section>`;
    }

    function renderFocus(c) {
        return `
        <section class="card">
            <h3>${c.plate_title}</h3>
            <div class="plate-visual">
                <div class="plate-circle"></div>
                <ul class="plate-legend">
                    <li><span class="plate-dot plate-dot-veg"></span>½ овощи и фрукты</li>
                    <li><span class="plate-dot plate-dot-protein"></span>¼ белок</li>
                    <li><span class="plate-dot plate-dot-carbs"></span>¼ сложные углеводы</li>
                    <li><span class="plate-dot plate-dot-fats"></span>+ немного полезных жиров</li>
                </ul>
            </div>
            <button class="btn btn-small btn-olive" id="nu-plate-cta">${c.plate_cta}</button>
        </section>`;
    }

    function renderNotice(c) {
        return `
        <section class="stack" style="gap:10px;">
            <h3>${c.notice_title}</h3>
            <div class="notice-scroll">
                ${c.notice.map((n) => `
                    <div class="notice-card">
                        <span class="notice-emoji">${n.emoji}</span>
                        <span class="notice-title">${n.title}</span>
                        <span class="notice-why">${n.why}</span>
                    </div>`).join('')}
            </div>
        </section>`;
    }

    function renderCookToday(c) {
        const labels = App.state.content.common.meal_labels;
        const byCat = {};
        (recipesCache.items || []).forEach((r) => {
            if (!byCat[r.category]) byCat[r.category] = r;
        });
        const emoji = { breakfast: '🍳', lunch: '🥗', dinner: '🍲', snack: '🍎' };
        return `
        <section class="stack" style="gap:10px;">
            <div class="card-title-row">
                <h3>${c.cook_title}</h3>
                <button class="link-btn" id="nu-all-recipes">${c.all_recipes} →</button>
            </div>
            <div class="meal-cards">
                ${Object.entries(labels).map(([key, label]) => {
                    const r = byCat[key];
                    return `
                    <button class="meal-card" data-cat="${key}">
                        <span class="meal-card-emoji">${emoji[key] || '🍽'}</span>
                        <span class="meal-card-title">${label}</span>
                        <span class="meal-card-meta">${r ? `${r.time_min} мин · ${r.ingredients.length} инг.` : 'скоро'}</span>
                    </button>`;
                }).join('')}
            </div>
        </section>`;
    }

    function renderRecipes(c) {
        const catRow = [{ id: '', label: 'Все' }].concat(c.categories)
            .map((f) => `<button class="filter-chip${filters.category === f.id ? ' active' : ''}"
                data-group="category" data-id="${f.id}">${f.label}</button>`).join('');
        const tagRow = [{ id: '', label: 'Все' }].concat(c.tags)
            .map((f) => `<button class="filter-chip${filters.tag === f.id ? ' active' : ''}"
                data-group="tag" data-id="${f.id}">${f.label}</button>`).join('');
        const items = (recipesCache.items || []).filter((r) => {
            if (filters.category && r.category !== filters.category) return false;
            if (filters.tag && !(r.tags || []).includes(filters.tag)) return false;
            return true;
        });
        const emoji = { breakfast: '🍳', lunch: '🥗', dinner: '🍲', snack: '🍎' };
        return `
        <section class="stack" id="nu-recipes" style="gap:10px;">
            <h3>${c.all_recipes.replace(' →', '')}</h3>
            <div class="filter-row">${catRow}</div>
            <div class="filter-row">${tagRow}</div>
            <div class="recipes-grid">
                ${items.map((r) => `
                    <button class="card recipe-card" data-recipe="${r.id}">
                        <div class="recipe-thumb">${emoji[r.category] || '🍽'}</div>
                        <p class="workout-card-title">${esc(r.title)}</p>
                        <p class="text-muted">${r.time_min} ${c.minutes_word} · ${r.ingredients.length} ${c.ingredients_word}</p>
                    </button>`).join('') || emptyState(c.empty)}
            </div>
        </section>`;
    }

    function renderPhasesNav(c) {
        const cycle = App.state.cycle;
        const current = cycle && cycle.phase;
        return `
        <section class="stack" style="gap:10px;">
            <h3>${c.phases_nav_title}</h3>
            <div class="filter-row">
                ${Object.entries(App.state.content.phases).map(([key, p]) => `
                    <button class="filter-chip${key === current ? ' active' : ''}"
                        data-phase="${key}">${p.name.replace(' фаза', '')}</button>`).join('')}
            </div>
        </section>`;
    }

    function renderTracker(c) {
        const meals = (App.state.nutrition && App.state.nutrition.meals) || {};
        const labels = App.state.content.common.meal_labels;
        return `
        <section class="card">
            <h3>${c.tracker_title}</h3>
            <p class="text-muted">${c.tracker_hint}</p>
            <div class="meal-tracker">
                ${Object.entries(labels).map(([key, label]) => `
                    <button class="meal-toggle${meals[key] ? ' active' : ''}" data-meal="${key}">${label}</button>`).join('')}
            </div>
        </section>`;
    }

    function renderRegularity(c) {
        if (!progressCache) return '';
        const days = Object.values(progressCache.days || {});
        const withFood = days.filter((d) => d.nutrition > 0).length;
        const weeksWithFood = (progressCache.weeks || []).filter((w) => {
            // неделя считается «с питанием», если хотя бы один день покрыт питанием
            const from = w.from, to = w.to;
            return Object.entries(progressCache.days).some(([date, d]) =>
                d.nutrition > 0 && date >= from && date <= to);
        }).length;
        return `
        <section class="card card-warm">
            <h3>${c.regularity_title}</h3>
            <p class="subtitle">${c.regularity_days} <b>${withFood} из ${days.length}</b> дней</p>
            <p class="text-muted">${weeksWithFood} ${c.regularity_weeks}</p>
        </section>`;
    }

    function bindAll(c) {
        const setup = el('nu-setup');
        if (setup) setup.addEventListener('click', () => App.screens.cycle.openEditSheet());

        const more = el('nu-phase-more');
        if (more) more.addEventListener('click', () => {
            const phase = App.state.cycle && App.state.cycle.phase;
            if (phase) App.screens.cycle.openPhase(phase);
        });

        el('nu-plate-cta').addEventListener('click', openPlateBuilder);

        el('nu-all-recipes').addEventListener('click', () => {
            el('nu-recipes').scrollIntoView({ behavior: 'smooth' });
        });

        document.querySelectorAll('#nutrition-content .meal-card').forEach((card) => {
            card.addEventListener('click', () => {
                filters.category = card.dataset.cat;
                filters.tag = '';
                render();
                el('nu-recipes').scrollIntoView({ behavior: 'smooth' });
            });
        });

        document.querySelectorAll('#nutrition-content .filter-chip[data-group]').forEach((chip) => {
            chip.addEventListener('click', () => {
                filters[chip.dataset.group] = chip.dataset.id;
                render();
            });
        });

        document.querySelectorAll('#nutrition-content [data-recipe]').forEach((card) => {
            card.addEventListener('click', () => openRecipe(Number(card.dataset.recipe)));
        });

        document.querySelectorAll('#nutrition-content [data-phase]').forEach((chip) => {
            chip.addEventListener('click', () => App.screens.cycle.openPhase(chip.dataset.phase));
        });

        document.querySelectorAll('#nutrition-content .meal-toggle').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const meal = btn.dataset.meal;
                const meals = { ...(App.state.nutrition.meals || {}) };
                meals[meal] = meals[meal] ? 0 : 1;
                btn.classList.toggle('active', Boolean(meals[meal]));
                try {
                    const res = await apiPost('/api/nutrition', { date: todayISO(), ...meals });
                    App.state.nutrition.meals = res.meals;
                    renderRegularityOnly(c);
                } catch (err) {
                    btn.classList.toggle('active', !meals[meal]);
                    infoSheet(c.tracker_title, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });
    }

    function renderRegularityOnly(c) {
        // После отметки приёма пищи мягко обновляем блок регулярности
        const html = renderRegularity(c);
        const cards = document.querySelectorAll('#nutrition-content > *');
        if (cards.length) {
            const last = cards[cards.length - 1];
            if (last.classList.contains('card-warm')) last.outerHTML = html;
        }
    }

    // --- Экран рецепта ---
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

    // --- Конструктор тарелки ---
    const builder = { step: 0, picked: {} };

    function openPlateBuilder() {
        const c = App.state.content.nutrition_screen;
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
