// Экран «Напоминания» (внутри Профиля): типы с тумблерами и временем,
// «+ Добавить напоминание», строка цели. Тексты — только тёплые.

App.screens.reminders = (() => {
    let cache = null;

    async function onShow() {
        el('reminders-subtitle').textContent =
            App.state.content.gamification.reminders_subtitle;
        setHTML('reminders-content', emptyState(App.state.content.common.loading));
        try {
            cache = await apiGet('/api/reminders');
        } catch (err) {
            setHTML('reminders-content', errorState(
                `Не получилось загрузить напоминания: ${apiErrorText(err)}`,
                'App.screens.reminders.onShow'));
            return;
        }
        render();
    }

    function render() {
        const c = App.state.content.gamification;
        const byType = {};
        (cache.items || []).forEach((r) => {
            if (!byType[r.type]) byType[r.type] = [];
            byType[r.type].push(r);
        });

        const rows = cache.types.map((t) => {
            const existing = byType[t.id] || [];
            if (!existing.length) {
                // тип ещё не добавлен — показываем строку-заглушку с тумблером
                return `
                <div class="switch-row">
                    <div class="flex-row">
                        <span style="color:var(--olive);">${Gamification.icon('bell', 'icon-s')}</span>
                        <div>
                            <p style="font-size:14.5px;">${t.label}</p>
                            <p class="text-muted" style="font-size:12px;">Предлагаемое время: ${t.default_time}</p>
                        </div>
                    </div>
                    <button class="switch" data-add-type="${t.id}" data-add-time="${t.default_time}"></button>
                </div>`;
            }
            return existing.map((r) => `
                <div class="switch-row">
                    <div class="flex-row">
                        <span style="color:var(--olive);">${Gamification.icon('bell', 'icon-s')}</span>
                        <div>
                            <p style="font-size:14.5px;">${t.label}</p>
                            <input type="time" class="reminder-time" value="${r.time}"
                                   data-reminder="${r.id}">
                        </div>
                    </div>
                    <button class="switch${r.enabled ? ' on' : ''}"
                        data-toggle-reminder="${r.id}" data-enabled="${r.enabled ? 1 : 0}"></button>
                </div>`).join('');
        }).join('');

        setHTML('reminders-content', `
            <section class="card">
                <h3>${App.state.content.profile_screen.notify_items ? 'Напоминания' : 'Напоминания'}</h3>
                <div class="menu-list">${rows}</div>
            </section>
            <button class="btn" id="gf-add-reminder">＋ ${c.add_reminder}</button>
            <button class="menu-row card" id="gf-goal-row" style="width:100%;">
                <span>${c.goal_row}</span><span class="menu-chevron">›</span>
            </button>
            <p class="text-muted" style="text-align:center;">Тёплые напоминания поддерживают, а не давят</p>
        `);

        bindAll();
    }

    function bindAll() {
        const c = App.state.content.gamification;

        document.querySelectorAll('[data-add-type]').forEach((sw) => {
            sw.addEventListener('click', async () => {
                sw.classList.add('on');
                sw.disabled = true;
                try {
                    await apiPost('/api/reminders', {
                        type: sw.dataset.addType,
                        time: sw.dataset.addTime,
                        enabled: true,
                    });
                    await onShow();
                } catch (err) {
                    sw.classList.remove('on');
                    sw.disabled = false;
                    infoSheet(c.reminders_subtitle, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });

        document.querySelectorAll('[data-toggle-reminder]').forEach((sw) => {
            sw.addEventListener('click', async () => {
                const id = sw.dataset.toggleReminder;
                const value = sw.dataset.enabled !== '1';
                sw.classList.toggle('on', value);
                sw.dataset.enabled = value ? '1' : '0';
                try {
                    await apiPatch(`/api/reminders/${id}`, { enabled: value });
                } catch (err) {
                    sw.classList.toggle('on', !value);
                    sw.dataset.enabled = value ? '0' : '1';
                    infoSheet(c.reminders_subtitle, `Не сохранилось: ${apiErrorText(err)}`);
                }
            });
        });

        document.querySelectorAll('.reminder-time').forEach((input) => {
            input.addEventListener('change', async () => {
                try {
                    await apiPatch(`/api/reminders/${input.dataset.reminder}`,
                        { time: input.value });
                } catch (err) {
                    infoSheet(c.reminders_subtitle, `Не сохранилось: ${apiErrorText(err)}`);
                    await onShow();
                }
            });
        });

        el('gf-add-reminder').addEventListener('click', openAddSheet);
        el('gf-goal-row').addEventListener('click', () => {
            if (App.screens.profile.openEditGoals) App.screens.profile.openEditGoals();
        });
    }

    function openAddSheet() {
        const c = App.state.content.gamification;
        const typeOptions = cache.types.map((t) => `
            <button class="option-chip" data-type="${t.id}">${t.label}</button>`).join('');
        openModal(`
            <h2>${c.add_reminder}</h2>
            <p class="checkin-label">Тип напоминания</p>
            <div class="option-row" id="rm-types">${typeOptions}</div>
            <label class="field">
                <span class="field-label">Время</span>
                <input type="time" id="rm-time" value="19:00">
            </label>
            <button class="btn" id="rm-save" disabled>Сохранить</button>
            <button class="btn btn-ghost" id="rm-cancel">Отмена</button>
            <p class="form-message" id="rm-msg"></p>
        `);
        let selected = null;
        document.querySelectorAll('#rm-types .option-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                selected = chip.dataset.type;
                document.querySelectorAll('#rm-types .option-chip')
                    .forEach((x) => x.classList.toggle('active', x === chip));
                el('rm-save').disabled = false;
            });
        });
        el('rm-cancel').addEventListener('click', closeModal);
        el('rm-save').addEventListener('click', async () => {
            const btn = el('rm-save');
            btn.disabled = true;
            try {
                await apiPost('/api/reminders', {
                    type: selected, time: el('rm-time').value, enabled: true,
                });
                closeModal();
                await onShow();
            } catch (err) {
                btn.disabled = false;
                el('rm-msg').textContent = apiErrorText(err);
            }
        });
    }

    return { onShow };
})();
