// Экран «Уровни» (внутри Профиля): 5 этапов роста.
// Пройденные — оливковые, текущий — терракотовый акцент,
// будущие — контурная карточка с замочком (видимы, не давят).

App.screens.levels = (() => {
    async function onShow() {
        setHTML('levels-content', emptyState(App.state.content.common.loading));
        let data;
        try {
            data = await apiGet('/api/levels');
        } catch (err) {
            setHTML('levels-content', errorState(
                `Не получилось загрузить уровни: ${apiErrorText(err)}`,
                'App.screens.levels.onShow'));
            return;
        }
        const c = App.state.content.gamification;
        const points = data.points;
        el('levels-subtitle').textContent = c.levels_subtitle;

        const rows = data.levels.map((level) => {
            const range = level.max === null
                ? `${level.min}+`
                : `${level.min}–${level.max}`;
            if (level.state === 'done') {
                return `
                <div class="card card-warm level-row level-done">
                    <div class="level-badge done">${Gamification.icon('sprout', 'icon-s')}</div>
                    <div class="level-info">
                        <p class="habit-title">${level.num}. ${level.name}</p>
                        <p class="text-muted">${level.description}</p>
                        <p class="text-muted">${range} баллов</p>
                    </div>
                    <span class="done-badge">✓</span>
                </div>`;
            }
            if (level.state === 'current') {
                return `
                <div class="card level-row level-current">
                    <div class="level-badge current">${level.num}</div>
                    <div class="level-info">
                        <p class="habit-title">${level.name} · сейчас</p>
                        <p class="text-muted">${level.description}</p>
                        <p class="text-muted">${range} баллов</p>
                    </div>
                    <span class="done-badge" style="background:var(--accent-light);color:var(--accent-dark);">${points.balance}</span>
                </div>`;
            }
            return `
            <div class="card level-row level-future">
                <div class="level-badge future">${Gamification.icon('lock', 'icon-s')}</div>
                <div class="level-info">
                    <p class="habit-title">${level.num}. ${level.name}</p>
                    <p class="text-muted">${level.description}</p>
                    <p class="text-muted">${range} баллов</p>
                </div>
            </div>`;
        });

        setHTML('levels-content', `
            <section class="card card-warm">
                <div class="flex-between">
                    <h3>${c.levels_points}</h3>
                    <span class="serif" style="font-size:26px;color:var(--accent-dark);">${points.balance}</span>
                </div>
                <p class="text-muted">${c.points_word}</p>
            </section>
            <div class="stack">${rows.join('')}</div>
        `);
    }

    return { onShow };
})();
