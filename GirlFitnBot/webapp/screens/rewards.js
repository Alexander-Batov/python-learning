// Экран «Мои призы» (внутри Профиля): шапка «Твои баллы: {N}» + «Как получать»,
// фильтры (Все/Полезное/Красота/Скидки), обмен баллов.
// Недостаточно баллов — карточка активна, мягкая кнопка «Не хватает {N} ♡».

App.screens.rewards = (() => {
    let filter = 'all';

    async function onShow() {
        el('rewards-subtitle').textContent =
            App.state.content.gamification.rewards_subtitle;
        setHTML('rewards-content', emptyState(App.state.content.common.loading));
        let data;
        try {
            data = await apiGet('/api/rewards');
        } catch (err) {
            setHTML('rewards-content', errorState(
                `Не получилось загрузить призы: ${apiErrorText(err)}`,
                'App.screens.rewards.onShow'));
            return;
        }
        render(data);
    }

    function render(data) {
        const c = App.state.content.gamification;
        const balance = data.points.balance;
        const items = data.items.filter((r) =>
            filter === 'all' || r.category === filter);
        const filters = c.reward_filters.map((f) => `
            <button class="filter-chip${filter === f.id ? ' active' : ''}"
                data-reward-filter="${f.id}">${f.label}</button>`).join('');

        const cards = items.map((r) => {
            const afford = balance >= r.price;
            const btn = r.owned
                ? `<span class="done-badge">✓ ${c.owned}</span>`
                : afford
                    ? `<button class="btn btn-small reward-exchange"
                        data-reward="${r.id}">${c.exchange} · ${r.price}</button>`
                    : `<button class="btn btn-small btn-ghost" disabled
                        style="opacity:.75;">${c.not_enough.replace('{N}', r.price - balance)}</button>`;
            return `
            <div class="card workout-card">
                <div class="workout-thumb t-recovery reward-thumb">
                    ${Gamification.icon(r.icon, '')}
                </div>
                <div class="workout-card-info">
                    <p class="workout-card-title">${esc(r.title)}</p>
                    <p class="text-muted">${esc(r.description)}</p>
                </div>
                ${btn}
            </div>`;
        }).join('');

        setHTML('rewards-content', `
            <section class="card card-warm">
                <div class="flex-between">
                    <div>
                        <h3>${c.your_points}</h3>
                        <span class="serif" style="font-size:34px;color:var(--accent-dark);">${balance}</span>
                    </div>
                    <button class="btn btn-small" id="gf-how-earn">${c.how_to_earn}</button>
                </div>
            </section>
            <div class="filter-row">${filters}</div>
            <div class="stack">${cards || emptyState('В этой категории пока пусто.')}</div>
        `);

        el('gf-how-earn').addEventListener('click', () => {
            infoSheet(c.how_to_earn, c.how_to_earn_text);
        });
        document.querySelectorAll('[data-reward-filter]').forEach((chip) => {
            chip.addEventListener('click', () => {
                filter = chip.dataset.rewardFilter;
                render(data);
            });
        });
        document.querySelectorAll('.reward-exchange').forEach((btn) => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                try {
                    await apiPost(`/api/rewards/${btn.dataset.reward}/exchange`);
                    await onShow();
                } catch (err) {
                    btn.disabled = false;
                    infoSheet(c.rewards_subtitle, apiErrorText(err));
                }
            });
        });
    }

    return { onShow };
})();
