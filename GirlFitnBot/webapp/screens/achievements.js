// Экран «Достижения» (внутри Профиля): фильтры, сетка круглых бейджей
// (полученные — оливковая заливка, нет — контур #D7CBB9),
// баннер «Твоё следующее достижение».

App.screens.achievements = (() => {
    let filter = 'all';

    async function onShow() {
        el('achievements-subtitle').textContent =
            App.state.content.gamification.achievements_subtitle;
        setHTML('achievements-content', emptyState(App.state.content.common.loading));
        let data;
        try {
            data = await apiGet('/api/achievements');
        } catch (err) {
            setHTML('achievements-content', errorState(
                `Не получилось загрузить достижения: ${apiErrorText(err)}`,
                'App.screens.achievements.onShow'));
            return;
        }
        render(data);
    }

    function render(data) {
        const c = App.state.content.gamification;
        const items = data.items.filter((a) =>
            filter === 'all' || a.category === filter);
        const filters = c.achievements_filters.map((f) => `
            <button class="filter-chip${filter === f.id ? ' active' : ''}"
                data-ach-filter="${f.id}">${f.label}</button>`).join('');

        const grid = items.map((a) => `
            <div class="ach-cell${a.earned ? ' earned' : ''}">
                <div class="ach-badge${a.earned ? ' earned' : ''}">
                    ${Gamification.icon(a.icon, '')}
                </div>
                <p class="ach-title">${esc(a.title)}</p>
                <p class="text-muted" style="font-size:11px;">${a.progress}/${a.threshold}</p>
            </div>`).join('');

        const nxt = data.next;
        const banner = nxt ? `
            <section class="card card-warm">
                <div class="flex-row">
                    <div class="ach-badge next">${Gamification.icon(nxt.icon, '')}</div>
                    <div>
                        <h3>${c.next_achievement}</h3>
                        <p class="subtitle">${esc(nxt.title)} · ${c.left_word}
                            ${Math.max(0, nxt.threshold - nxt.progress)}</p>
                    </div>
                </div>
            </section>` : `
            <section class="card card-warm">
                <h3>Все достижения получены</h3>
                <p class="subtitle">Ты заботишься о себе блестяще — каталог пополнится новыми целями.</p>
            </section>`;

        setHTML('achievements-content', `
            ${banner}
            <div class="filter-row">${filters}</div>
            <div class="ach-grid">${grid || emptyState('В этой категории пока пусто — загляни в «Все».')}</div>
        `);

        document.querySelectorAll('[data-ach-filter]').forEach((chip) => {
            chip.addEventListener('click', () => {
                filter = chip.dataset.achFilter;
                render(data);
            });
        });
    }

    return { onShow };
})();
