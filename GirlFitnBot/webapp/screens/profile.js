// Экран «Профиль»: профиль, мой цикл, цели, прогресс, регулярность,
// подписка, настройки (уведомления/приватность/единицы), помощь, эксперты, юрблок.

App.screens.profile = (() => {
    let progressCache = null;

    async function onShow() {
        el('profile-title').textContent = App.state.content.profile_screen.title;
        setHTML('profile-content', emptyState(App.state.content.common.loading));
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
            renderCycle(),
            renderGoals(),
            renderProgress(),
            renderRegularity(),
            renderSubscription(),
            renderMenu(),
            renderExperts(),
            renderLegal(),
        ].join(''));
        bindAll();
    }

    function renderHead() {
        const cc = c();
        return `
        <section class="card profile-head">
            <div class="profile-avatar">${avatarLetter()}</div>
            <p class="profile-name">${esc(displayName())}</p>
            <button class="link-btn" id="pf-edit-profile">${cc.edit_profile}</button>
        </section>`;
    }

    function renderCycle() {
        const cc = c();
        const cycle = App.state.cycle;
        const cs = App.state.user.cycle;
        if (!cs || !cs.cycle_start) return '';
        const dayText = cycle && cycle.cycle_day
            ? `${cycle.cycle_day} ${cc.day_short}`
            : '—';
        return `
        <section class="card">
            <div class="card-title-row">
                <h3>🌸 ${cc.my_cycle}</h3>
                <button class="link-btn" id="pf-edit-cycle">${cc.edit_cycle}</button>
            </div>
            <div class="stats-grid">
                <div class="stat-cell">
                    <span class="stat-cell-value">${cs.cycle_length}</span>
                    <span class="stat-cell-label">${cc.cycle_length_word}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value" style="font-size:20px;padding-top:3px;">${formatDayMonth(cs.cycle_start)}</span>
                    <span class="stat-cell-label">${cc.last_period_word}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value">${dayText}</span>
                    <span class="stat-cell-label">${cc.current_day_word}</span>
                </div>
            </div>
        </section>`;
    }

    function renderGoals() {
        const cc = c();
        const goals = App.state.user.goals || [];
        const labels = {};
        App.state.content.goals.forEach((g) => { labels[g.id] = g.label; });
        const chips = goals.length
            ? goals.map((g) => `<span class="option-chip" style="cursor:default;">${labels[g] || esc(g)}</span>`).join('')
            : `<p class="text-muted">${cc.no_goals}</p>`;
        return `
        <section class="card">
            <div class="card-title-row">
                <h3>🎯 ${cc.my_goals}</h3>
                <button class="link-btn" id="pf-edit-goals">${cc.edit_goals}</button>
            </div>
            <div class="goal-chip-row">${chips}</div>
        </section>`;
    }

    function renderProgress() {
        const cc = c();
        if (!progressCache) return '';
        const p = progressCache;
        return `
        <button class="card" id="pf-progress" style="cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-primary);">
            <div class="card-title-row">
                <h3>📊 ${cc.my_progress}</h3>
                <span class="text-muted">${cc.detailed_stats} →</span>
            </div>
            <p class="text-muted">${cc.progress_month}</p>
            <div class="stats-grid">
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.workouts_completed}</span>
                    <span class="stat-cell-label">${cc.stat_workouts}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.active_minutes}</span>
                    <span class="stat-cell-label">${cc.stat_minutes}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.nutrition_days}</span>
                    <span class="stat-cell-label">${cc.stat_nutrition}</span>
                </div>
                <div class="stat-cell">
                    <span class="stat-cell-value">${p.habit_completions}</span>
                    <span class="stat-cell-label">${cc.stat_habits}</span>
                </div>
            </div>
        </button>`;
    }

    function renderRegularity() {
        const cc = c();
        if (!progressCache) return '';
        const p = progressCache.regularity_pct;
        const weeks = progressCache.weeks || [];
        const trend = weeks.map((w) => w.pct);
        return `
        <section class="card card-warm">
            <div class="flex-between">
                <h3>${cc.regularity_card_title}</h3>
                <span class="regularity-number">${p}%</span>
            </div>
            ${trend.length ? `
            <div class="week-trend">
                ${trend.map((v, i) => `
                    <div class="trend-bar${i === trend.length - 1 ? ' current' : ''}"
                        style="height:${Math.max(20, v)}%;">${v}</div>`).join('')}
            </div>` : ''}
            <p class="subtitle" style="font-style:italic;">${cc.regularity_cheer} 💛</p>
        </section>`;
    }

    function renderSubscription() {
        const cc = c();
        const sub = App.state.user.subscription || { plan: 'free' };
        if (sub.plan !== 'free') {
            return `
            <section class="card">
                <h3>⭐ ${cc.subscription_title}</h3>
                <p class="subtitle">Premium · до ${sub.until || '—'}</p>
            </section>`;
        }
        return `
        <section class="card">
            <h3>⭐ ${cc.subscription_title}</h3>
            <p class="subtitle">${cc.plan_free}</p>
            <button class="btn btn-small" id="pf-premium">${cc.premium_cta} · ${cc.premium_price}</button>
        </section>`;
    }

    function renderMenu() {
        const cc = c();
        return `
        <section class="card">
            <div class="menu-list">
                <button class="menu-row" id="pf-settings">
                    <span>⚙️ ${cc.settings_title}</span><span class="menu-chevron">›</span>
                </button>
                <button class="menu-row" id="pf-help">
                    <span>💬 ${cc.help_title}</span><span class="menu-chevron">›</span>
                </button>
            </div>
        </section>`;
    }

    function renderExperts() {
        const cc = c();
        return `
        <section class="card card-warm">
            <h3>🌿 ${cc.experts_title}</h3>
            <p class="subtitle">${cc.experts_text}</p>
        </section>`;
    }

    function renderLegal() {
        const cc = c();
        return `
        <section class="card">
            <h3>${cc.legal_title}</h3>
            <div class="menu-list">
                <button class="menu-row" data-legal="terms"><span>${cc.legal_terms}</span><span class="menu-chevron">›</span></button>
                <button class="menu-row" data-legal="privacy"><span>${cc.legal_privacy}</span><span class="menu-chevron">›</span></button>
                <button class="menu-row" data-legal="consent"><span>${cc.legal_consent}</span><span class="menu-chevron">›</span></button>
            </div>
            <p class="text-muted">${cc.version_prefix} 0.2.0-demo</p>
        </section>`;
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
                <p class="subtitle">${cc.regularity_cheer} 💛</p>
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
                <p class="text-muted">${activeDays.length} ${cc.progress_month === 'за месяц' ? '' : ''}дней с отметками</p>
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
        el('pf-edit-profile').addEventListener('click', openEditProfile);
        const editCycle = el('pf-edit-cycle');
        if (editCycle) editCycle.addEventListener('click', () => App.screens.cycle.openEditSheet());
        el('pf-edit-goals').addEventListener('click', openEditGoals);
        const progress = el('pf-progress');
        if (progress) progress.addEventListener('click', openStats);
        const premium = el('pf-premium');
        if (premium) premium.addEventListener('click', () => {
            const cc = c();
            infoSheet(`${cc.premium_cta} · ${cc.premium_price}`, cc.premium_text);
        });
        el('pf-settings').addEventListener('click', openSettings);
        el('pf-help').addEventListener('click', openFaq);
        bindLegalRows('profile-content');
    }

    return { onShow, openStats };
})();
