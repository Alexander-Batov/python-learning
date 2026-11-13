// Экран «Профиль» — вёрстка 1-в-1 с референсом (Экраны/Шестая вкладка.jpg).
// Шапка «Личный кабинет» + карточка профиля со статистикой месяца,
// меню настроек, выход. Подэкраны (статистика, настройки, FAQ, юрдоки) сохранены.

App.screens.profile = (() => {
    let progressCache = null;
    const RATING_MOCK = '4,8';

    async function onShow() {
        if (App.state.cycleError) {
            setHTML('profile-content', errorState(
                App.state.cycleError, 'App.screens.profile.onShow'));
            return;
        }
        try {
            await loadUser();
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            progressCache = await apiGet(`/api/progress?month=${month}&date=${todayISO()}`);
        } catch (err) {
            setHTML('profile-content', errorState(
                `Не получилось загрузить профиль: ${apiErrorText(err)}`,
                'App.screens.profile.onShow'));
            return;
        }
        render();
    }

    function c() {
        return App.state.content.profile_screen;
    }

    function render() {
        setHTML('profile-content', [
            renderHead(),
            renderProfileCard(),
            renderStats(),
            renderMenu(),
            renderLogout(),
        ].join(''));
        bindAll();
    }

    // --- Шапка: «Личный кабинет» + подпись + шестерёнка ---
    function renderHead() {
        const cc = c();
        return `
        <header class="td-header pf-head">
            <div class="td-header-text">
                <h1 class="gf-screen-title">${esc(cc.cabinet_title)}</h1>
                <p class="td-sub pf-sub">${esc(cc.cabinet_sub).replace('\n', '<br>')}</p>
            </div>
            <div class="td-header-side pf-head-side">
                <button type="button" class="pf-gear" id="pf-gear"
                    aria-label="${esc(cc.settings_title)}">${Components.icon('gear', 22)}</button>
            </div>
        </header>`;
    }

    // --- Карточка профиля: аватар + имя + цитата + компактный день цикла ---
    function renderProfileCard() {
        const cc = c();
        const cycle = App.state.cycle;
        const phase = cycle && cycle.phase
            ? (App.state.content.phases[cycle.phase] || {}).name
            : '';
        const card = (cycle && cycle.cycle_day !== null && cycle.phase)
            ? Components.cycleCard(cycle.cycle_day, phase, { compact: true })
            : Components.cycleCard('—', 'Цикл не настроен', { compact: true });
        // Аватар — фото из профиля Telegram; если его нет — локальный
        // img/avatar.jpg; под ним буква имени как последний фолбэк
        // (если фото не загрузилось, img убирается и остаётся буква)
        const photo = tgPhotoUrl() || 'img/avatar.jpg';
        return `
        <section class="card-like pf-card">
            <div class="pf-avatar">
                <span class="pf-avatar-letter" aria-hidden="true">${avatarLetter()}</span>
                ${photo ? `<img src="${esc(photo)}" alt="Фото профиля" onerror="this.remove()">` : ''}
                <button type="button" class="pf-avatar-edit" id="pf-edit-profile"
                    aria-label="${esc(cc.edit_profile)}">${Components.icon('pencil', 11)}</button>
            </div>
            <div class="pf-id">
                <p class="pf-name">${esc(displayName())}</p>
                <p class="pf-quote">${esc(cc.quote)}</p>
            </div>
            <div class="pf-cycle-side">
                ${card}
            </div>
        </section>`;
    }

    // --- Статистика месяца: 4 колонки (клик — подробная статистика) ---
    function renderStats() {
        const cc = c();
        const p = progressCache || { workouts_completed: 0, active_minutes: 0, regularity_pct: 0 };
        const cells = [
            { icon: 'dumbbell', value: p.workouts_completed, label: cc.stat_workouts },
            { icon: 'flame', value: p.active_minutes, label: cc.stat_minutes },
            { icon: 'calendar', value: `${p.regularity_pct}%`, label: cc.stat_plan },
            { icon: 'star', value: RATING_MOCK, label: cc.stat_rating },
        ].map((s) => `
            <div class="pf-stat">
                <span class="pf-stat-icon">${Components.icon(s.icon, 20)}</span>
                <span class="pf-stat-num">${esc(String(s.value))}</span>
                <span class="pf-stat-cap">${esc(s.label)}</span>
            </div>`).join('');
        return `
        <section class="card-like pf-stats" id="pf-stats" role="button" tabindex="0">
            ${cells}
        </section>`;
    }

    // --- Меню: строки-иконки ---
    const MENU_ACTIONS = {
        'edit-profile': () => openEditProfile(),
        'edit-cycle': () => App.screens.cycle.openEditSheet(),
        'edit-goals': () => openEditGoals(),
        'plates': () => openPlates(),
        'settings': () => openSettings(),
        'reminders': () => showScreen('reminders'),
        'faq': () => openFaq(),
        'about': () => {
            const cc = c();
            infoSheet(cc.about_title || 'О приложении',
                `${cc.menu.find((m) => m.action === 'about').title} · `
                + `${cc.version_prefix || 'Версия'} ${cc.version}. `
                + 'Приложение заботы о себе: цикл, активность, питание и привычки — без оценок и давления.');
        },
    };

    function renderMenu() {
        const cc = c();
        const rows = (cc.menu || []).map((m, i) => `
            <button type="button" class="card-like pf-row" data-menu="${esc(m.action)}">
                <span class="pf-row-icon">${Components.icon(m.icon || 'star', 18)}</span>
                <span class="pf-row-txt">
                    <span class="pf-row-title">${esc(m.title)}</span>
                    <span class="pf-row-sub">${esc(m.sub.replace('{version}', cc.version || ''))}</span>
                </span>
                <span class="gf-chev pf-row-chev">›</span>
            </button>`).join('');
        return `<nav class="pf-menu">${rows}</nav>`;
    }

    function renderLogout() {
        const cc = c();
        return `
        <button type="button" class="pf-logout" id="pf-logout">
            ${Components.icon('logout', 17)} ${esc(cc.logout)}
        </button>`;
    }

    // --- Сохранённые тарелки: список → просмотр → повтор/удаление ---
    async function openPlates() {
        const nc = App.state.content.nutrition_screen;
        setHTML('plates-content', emptyState(App.state.content.common.loading));
        showScreen('plates');
        let items;
        try {
            const data = await apiGet('/api/plates');
            items = data.items || [];
        } catch (err) {
            setHTML('plates-content', errorState(
                `Не удалось загрузить: ${apiErrorText(err)}`, 'App.screens.profile.openPlates'));
            return;
        }
        if (!items.length) {
            setHTML('plates-content', `<p class="empty-hint">${esc(nc.plates_empty)}</p>`);
            return;
        }
        const rows = items.map((p) => {
            const t = (p.payload && p.payload.totals) || {};
            const pct = t.pct || {};
            const meta = t.kcal
                ? `${t.kcal} ккал · Б ${pct.p || 0}% · Ж ${pct.f || 0}% · У ${pct.c || 0}%`
                : '';
            return `
            <button type="button" class="card-like pf-row" data-plate="${p.id}">
                <span class="pf-row-icon">${Components.icon('fork', 18)}</span>
                <span class="pf-row-txt">
                    <span class="pf-row-title">${esc(p.title)}</span>
                    <span class="pf-row-sub">${esc(meta)}</span>
                </span>
                <span class="gf-chev pf-row-chev">›</span>
            </button>`;
        }).join('');
        setHTML('plates-content', `<nav class="pf-menu">${rows}</nav>`);
        document.querySelectorAll('#plates-content [data-plate]').forEach((row) => {
            row.addEventListener('click', () => {
                const plate = items.find((p) => p.id === Number(row.dataset.plate));
                if (plate) openPlateDetail(plate);
            });
        });
    }

    // Просмотр сохранённой тарелки: та же диаграмма и список, что в конструкторе
    function openPlateDetail(plate) {
        const nc = App.state.content.nutrition_screen;
        const payload = plate.payload || {};
        const t = payload.totals || { kcal: 0, p: 0, f: 0, c: 0, pct: { p: 0, f: 0, c: 0 } };
        const res = {
            items: payload.items || [],
            kcal: t.kcal || 0,
            p: t.p || 0, f: t.f || 0, c: t.c || 0,
            pct: t.pct || { p: 0, f: 0, c: 0 },
        };
        const tips = (nc.plate_config || {}).phase_tips || {};
        const tip = tips[payload.subperiod] || tips[payload.phase] || '';
        const resultHtml = App.screens.nutrition.plateResultHtml
            ? App.screens.nutrition.plateResultHtml(res, tip)
            : '';
        setHTML('plates-content', `
            <section class="card">
                <h2>${esc(plate.title)}</h2>
                ${resultHtml}
                <button class="btn" id="pl-repeat">${esc(nc.plate_repeat)}</button>
                <button class="btn btn-ghost" id="pl-back">${App.state.content.common.back}</button>
                <button class="btn btn-ghost" id="pl-delete" style="color:var(--danger);">${esc(nc.plate_delete)}</button>
            </section>
        `);
        el('pl-back').addEventListener('click', openPlates);
        el('pl-repeat').addEventListener('click', () =>
            App.screens.nutrition.openPlateBuilder(payload.items || []));
        el('pl-delete').addEventListener('click', () => {
            confirmSheet({
                title: nc.plate_delete,
                text: `«${plate.title}» будет удалена безвозвратно.`,
                confirmLabel: nc.plate_delete,
                danger: true,
                onConfirm: async () => {
                    await apiDelete(`/api/plates/${plate.id}`);
                    openPlates();
                },
            });
        });
    }

    // --- Подробная статистика (подэкран) ---
    function openStats() {
        const cc = c();
        if (!progressCache) return;
        const p = progressCache;
        const entries = Object.entries(p.days || {});
        const activeDays = entries.filter(([, d]) =>
            d.workouts || d.nutrition || d.habits || d.wellbeing);
        const cells = [];
        const first = new Date();
        first.setDate(1);
        const startOffset = (first.getDay() + 6) % 7;
        for (let i = 0; i < startOffset; i += 1) cells.push('<div class="mini-day" style="visibility:hidden;"></div>');
        const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d += 1) {
            const iso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const day = (p.days || {})[iso];
            const on = day && (day.workouts || day.nutrition || day.habits || day.wellbeing);
            cells.push(`<div class="mini-day${on ? ' on' : ''}">${on ? '✓' : d}</div>`);
        }
        setHTML('stats-content', `
            <section class="card card-warm">
                <div class="flex-between">
                    <h3>${cc.regularity_card_title}</h3>
                    <span class="regularity-number">${p.regularity_pct}%</span>
                </div>
                <p class="subtitle">${cc.regularity_cheer}</p>
            </section>
            <section class="card">
                <h3>📊 ${cc.my_progress} (${p.month})</h3>
                <div class="stats-grid">
                    <div class="stat-cell"><span class="stat-cell-value">${p.workouts_completed}</span><span class="stat-cell-label">${cc.stat_workouts}</span></div>
                    <div class="stat-cell"><span class="stat-cell-value">${p.active_minutes}</span><span class="stat-cell-label">${cc.stat_minutes}</span></div>
                    <div class="stat-cell"><span class="stat-cell-value">${p.nutrition_days}</span><span class="stat-cell-label">${cc.stat_nutrition}</span></div>
                    <div class="stat-cell"><span class="stat-cell-value">${p.habit_completions}</span><span class="stat-cell-label">${cc.stat_habits}</span></div>
                </div>
            </section>
            <section class="card">
                <h3>${cc.regularity_card_title} · ${cc.progress_month}</h3>
                <div class="mini-calendar">${cells.join('')}</div>
                <p class="text-muted">${activeDays.length} дней с отметками</p>
            </section>
        `);
        showScreen('stats');
    }

    // --- Редактирование профиля (имя) ---
    function openEditProfile() {
        const cc = c();
        openModal(`
            <h2>${cc.edit_profile}</h2>
            <label class="field">
                <span class="field-label">${cc.name_label}</span>
                <input type="text" id="m-name" maxlength="64" value="${esc(displayName())}">
            </label>
            <button class="btn" id="m-save-name">${cc.save}</button>
            <button class="btn btn-ghost" id="m-cancel">Отмена</button>
            <p class="form-message" id="m-msg"></p>
        `);
        el('m-cancel').addEventListener('click', closeModal);
        el('m-save-name').addEventListener('click', async () => {
            const btn = el('m-save-name');
            btn.disabled = true;
            try {
                await apiPatch('/api/user', { name: el('m-name').value });
                await loadUser();
                closeModal();
                render();
            } catch (err) {
                btn.disabled = false;
                el('m-msg').textContent = apiErrorText(err);
            }
        });
    }

    // --- Цели (мультивыбор) ---
    function openEditGoals() {
        const cc = c();
        const current = App.state.user.goals || [];
        openModal(`
            <h2>${cc.edit_goals}</h2>
            <div class="option-row" id="m-goals">
                ${App.state.content.goals.map((g) => `
                    <button class="option-chip${current.includes(g.id) ? ' active' : ''}"
                        data-goal="${g.id}">${g.label}</button>`).join('')}
            </div>
            <button class="btn" id="m-save-goals">${cc.save}</button>
            <button class="btn btn-ghost" id="m-cancel">Отмена</button>
        `);
        const selected = new Set(current);
        document.querySelectorAll('#m-goals .option-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const id = chip.dataset.goal;
                if (selected.has(id)) selected.delete(id);
                else selected.add(id);
                chip.classList.toggle('active');
            });
        });
        el('m-cancel').addEventListener('click', closeModal);
        el('m-save-goals').addEventListener('click', async () => {
            const btn = el('m-save-goals');
            btn.disabled = true;
            try {
                await apiPatch('/api/user', { goals: [...selected] });
                await loadUser();
                closeModal();
                render();
            } catch (err) {
                btn.disabled = false;
            }
        });
    }

    // --- Настройки ---
    function openSettings() {
        const cc = c();
        const notify = App.state.user.notify || {};
        const units = App.state.user.units || { weight: 'kg', height: 'cm' };

        const notifyRows = cc.notify_items.map((n) => `
            <div class="switch-row">
                <span>${n.label}</span>
                <button class="switch${notify[n.id] ? ' on' : ''}" data-notify="${n.id}"></button>
            </div>`).join('');

        setHTML('settings-content', `
            <section class="card">
                <h3>${cc.notifications_group}</h3>
                ${notifyRows}
            </section>
            <section class="card">
                <h3>${cc.units_group}</h3>
                <div class="switch-row">
                    <span>${cc.units_weight}</span>
                    <div class="option-row">
                        <button class="option-chip${units.weight === 'kg' ? ' active' : ''}" data-unit-weight="kg">${cc.unit_kg}</button>
                        <button class="option-chip${units.weight === 'lb' ? ' active' : ''}" data-unit-weight="lb">${cc.unit_lb}</button>
                    </div>
                </div>
                <div class="switch-row">
                    <span>${cc.units_height}</span>
                    <div class="option-row">
                        <button class="option-chip${units.height === 'cm' ? ' active' : ''}" data-unit-height="cm">${cc.unit_cm}</button>
                        <button class="option-chip${units.height === 'in' ? ' active' : ''}" data-unit-height="in">${cc.unit_in}</button>
                    </div>
                </div>
            </section>
            <section class="card">
                <h3>${cc.privacy_group}</h3>
                <div class="menu-list">
                    <button class="menu-row" data-legal="privacy"><span>${cc.privacy_policy}</span><span class="menu-chevron">›</span></button>
                    <button class="menu-row" data-legal="consent"><span>${cc.data_management}</span><span class="menu-chevron">›</span></button>
                    <button class="menu-row danger" id="pf-delete"><span>${cc.delete_account}</span><span class="menu-chevron">›</span></button>
                </div>
            </section>
        `);
        showScreen('settings');

        document.querySelectorAll('#settings-content [data-notify]').forEach((sw) => {
            sw.addEventListener('click', async () => {
                const key = sw.dataset.notify;
                const value = !sw.classList.contains('on');
                sw.classList.toggle('on', value);
                try {
                    await apiPatch('/api/user', { notify: { [key]: value } });
                    if (App.state.user.notify) App.state.user.notify[key] = value;
                } catch (err) {
                    sw.classList.toggle('on', !value);
                    infoSheet(cc.notifications_group, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });

        document.querySelectorAll('#settings-content [data-unit-weight]').forEach((chip) => {
            chip.addEventListener('click', () => setUnit('weight', chip.dataset.unitWeight, chip));
        });
        document.querySelectorAll('#settings-content [data-unit-height]').forEach((chip) => {
            chip.addEventListener('click', () => setUnit('height', chip.dataset.unitHeight, chip));
        });

        el('pf-delete').addEventListener('click', () => {
            confirmSheet({
                title: cc.delete_account,
                text: cc.delete_confirm,
                confirmLabel: cc.delete_yes,
                danger: true,
                onConfirm: deleteAccount,
            });
        });

        bindLegalRows('settings-content');
    }

    async function setUnit(kind, value, chip) {
        try {
            await apiPatch('/api/user', { units: { [kind]: value } });
            document.querySelectorAll(`#settings-content [data-unit-${kind}]`)
                .forEach((x) => x.classList.toggle('active', x === chip));
            if (App.state.user.units) App.state.user.units[kind] = value;
        } catch (err) {
            infoSheet(c().units_group, `Не сохранилось: ${apiErrorText(err)}`);
        }
    }

    async function deleteAccount() {
        const cc = c();
        await apiDelete('/api/user');
        state.user = null;
        state.today = null;
        state.cycle = null;
        // Подтверждаем и перезапускаем: приложение снова покажет onboarding
        openModal(`
            <h2>Аккаунт удалён</h2>
            <p class="subtitle">${cc.deleted}</p>
            <button class="btn" onclick="location.reload()">Начать заново</button>
        `);
    }

    // --- FAQ ---
    function openFaq() {
        const cc = c();
        setHTML('faq-content', `
            <h1 style="font-size:24px;">${cc.faq_title}</h1>
            ${cc.faq.map((f, i) => `
                <section class="card">
                    <h3>${esc(f.q)}</h3>
                    <p class="subtitle">${esc(f.a)}</p>
                </section>`).join('')}
            <button class="btn" id="pf-support">${cc.support}</button>
        `);
        showScreen('faq');
        el('pf-support').addEventListener('click', () => {
            infoSheet(cc.support,
                'Напишите нам в чат бота — поддержка ответит в ближайшее время.');
        });
    }

    // --- Юридические документы ---
    function openLegal(key) {
        const cc = c();
        const titles = {
            terms: cc.legal_terms,
            privacy: cc.legal_privacy,
            consent: cc.legal_consent,
        };
        setHTML('legal-content', `
            <h1 style="font-size:24px;">${titles[key] || ''}</h1>
            <section class="card">
                <p class="subtitle">${esc(cc.legal_docs[key] || '')}</p>
            </section>
        `);
        showScreen('legal');
    }

    function bindLegalRows(containerId) {
        document.querySelectorAll(`#${containerId} [data-legal]`).forEach((row) => {
            row.addEventListener('click', () => openLegal(row.dataset.legal));
        });
    }

    function bindAll() {
        el('pf-gear').addEventListener('click', openSettings);
        el('pf-edit-profile').addEventListener('click', openEditProfile);
        el('pf-stats').addEventListener('click', openStats);
        el('pf-logout').addEventListener('click', () => {
            const cc = c();
            infoSheet(cc.logout,
                'Выход появится в одном из ближайших обновлений. Пока приложение '
                + 'живёт внутри этого чата и не требует отдельного входа.');
        });
        document.querySelectorAll('#profile-content .pf-row').forEach((row) => {
            row.addEventListener('click', () => {
                const action = MENU_ACTIONS[row.dataset.menu];
                if (action) action();
            });
        });
    }

    return { onShow, openStats, openEditGoals, openPlates };
})();
