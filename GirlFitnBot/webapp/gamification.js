// Геймификация: общие компоненты для «Твой путь к себе».
// Карточка уровня + «Твой день заботы» на «Сегодня», экран поздравления
// с переходом уровня, мягкая анимация начисления (лепесток «+N», 240 ms),
// библиотека линейных ботанических иконок для бейджей и каталогов.

const Gamification = (() => {

    // --- Линейные SVG-иконки (stroke, ботанический стиль) ---
    const ICONS = {
        sprout: '<path d="M12 21v-7"/><path d="M12 14c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6Z"/><path d="M12 12c0-3-2-5-6-5 0 3 2 5 6 5Z"/>',
        leaf: '<path d="M5 19C5 9 12 4 20 4c0 8-5 15-15 15Z"/><path d="M5 19c3-5 7-9 11-11"/>',
        branch: '<path d="M12 21V8"/><path d="M12 12c-3 0-5-2-5-5 3 0 5 2 5 5Z"/><path d="M12 16c3 0 5-2 5-5-3 0-5 2-5 5Z"/><circle cx="12" cy="6" r="1.6"/>',
        drop: '<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11Z"/>',
        heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
        plate: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 12l6-4M12 12l-6-4"/>',
        moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z"/>',
        flower: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="6.5" r="2.2"/><circle cx="17" cy="10" r="2.2"/><circle cx="15" cy="16" r="2.2"/><circle cx="9" cy="16" r="2.2"/><circle cx="7" cy="10" r="2.2"/>',
        chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
        gift: '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M12 10v10M4 14h16"/><path d="M12 10c-4 0-5-1.5-5-3s3-2 5 3c2-5 5-4.5 5-3s-1 3-5 3Z"/>',
        star: '<path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8Z"/>',
        lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    };

    function icon(name, cls) {
        const path = ICONS[name] || ICONS.leaf;
        return `<svg class="${cls || 'icon-s'}" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    }

    // --- Круговой индикатор уровня (тонкое кольцо, в центре номер) ---
    function ring(pct, num, size) {
        const s = size || 64;
        const r = (s - 10) / 2;
        const c = 2 * Math.PI * r;
        const done = c * Math.min(100, Math.max(0, pct)) / 100;
        return `
        <svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="flex-shrink:0;">
            <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none"
                    stroke="var(--border)" stroke-width="5"/>
            <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none"
                    stroke="var(--olive)" stroke-width="5"
                    stroke-linecap="round"
                    stroke-dasharray="${done} ${c}"
                    transform="rotate(-90 ${s / 2} ${s / 2})"/>
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
                  font-family="var(--font-head)" font-size="${s * 0.36}"
                  font-weight="600" fill="var(--text-primary)">${num}</text>
        </svg>`;
    }

    // --- Карточка уровня для «Сегодня» (по референсу Экран 1) ---
    function renderLevelCard(g) {
        const c = App.state.content.gamification;
        const p = g.points;
        const nextText = p.next
            ? `${p.balance}/${p.next_threshold}`
            : `${p.balance}`;
        return `
        <button class="card" id="gf-level-card"
            style="cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-primary);">
            <div class="flex-between">
                <div class="flex-row">
                    ${ring(p.pct, p.level.num)}
                    <div>
                        <p class="text-muted" style="font-size:12px;">${c.level_card_title}</p>
                        <p class="serif" style="font-size:22px;line-height:1.1;">${p.level.name}</p>
                        <p class="text-muted" style="font-size:12px;">${nextText}</p>
                    </div>
                </div>
                <span class="menu-chevron">›</span>
            </div>
        </button>`;
    }

    // --- «Твой день заботы»: Тренировка ✓ · Питание ✓ · Привычка ○ ---
    function renderCareDay(g) {
        const c = App.state.content.gamification;
        const cd = g.care_day;
        const items = [
            ['workout', cd.workout], ['nutrition', cd.nutrition],
            ['habit', cd.habit],
        ];
        return `
        <section class="card card-warm">
            <h3>${c.care_day_title}</h3>
            <div class="day-tasks">
                ${items.map(([key, done]) => `
                    <div class="day-task${done ? ' done' : ''}">
                        <span class="task-icon">✓</span>
                        <span>${c.care_day_items[key]}</span>
                    </div>`).join('')}
            </div>
        </section>`;
    }

    // --- Экран поздравления при переходе уровня ---
    const LEVEL_KEY = 'gf_seen_level';
    function checkLevelUp(points) {
        try {
            const seen = Number(localStorage.getItem(LEVEL_KEY) || 0);
            const current = points.level.num;
            if (seen > 0 && current > seen) {
                showLevelUp(points.level);
            }
            if (current > seen) {
                localStorage.setItem(LEVEL_KEY, String(current));
            }
        } catch (err) { /* localStorage недоступен — поздравление пропускаем */ }
    }

    function showLevelUp(level) {
        const c = App.state.content.gamification;
        openModal(`
            <div class="player-stage" style="padding:8px 0 2px;">
                <p style="font-size:40px;">⭐</p>
                <h2>${c.levelup_title}</h2>
                <p class="subtitle">${c.levelup_text.replace('{name}', level.name)}</p>
                <p class="serif" style="font-size:22px;color:var(--accent-dark);">${level.description}</p>
            </div>
            <button class="btn" id="gf-continue">${c.continue}</button>
        `);
        document.getElementById('gf-continue').addEventListener('click', closeModal);
    }

    // --- Мягкая анимация начисления: лепесток «+N» (240 ms) ---
    const BALANCE_KEY = 'gf_prev_balance';
    function petalIfIncreased(points) {
        try {
            const prev = Number(localStorage.getItem(BALANCE_KEY) || -1);
            const now = points.balance;
            if (prev >= 0 && now > prev) {
                showPetal(now - prev);
            }
            if (now !== prev) {
                localStorage.setItem(BALANCE_KEY, String(now));
            }
        } catch (err) { /* ignore */ }
    }

    function showPetal(amount) {
        const host = document.getElementById('today-greeting');
        if (!host) return;
        const petal = document.createElement('span');
        petal.className = 'petal-pop';
        petal.textContent = `+${amount}`;
        host.appendChild(petal);
        setTimeout(() => petal.remove(), 1200);
    }

    return {
        icon, ring, renderLevelCard, renderCareDay,
        checkLevelUp, petalIfIncreased,
    };
})();
