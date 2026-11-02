// Общие компоненты рендера (Этап 0) — единые для всех 6 вкладок.
// Каждый компонент возвращает HTML-строку; экраны вставляют её в свой
// контейнер через setHTML и сами привязывают события (по классам/ data-атрибутам).
// Все цвета — только через var(--токены) из style.css.
//
// Доступно:
//   Components.cycleCard(day, phaseName, {compact})
//   Components.branch(width, height)
//   Components.sectionHeader(title, linkText)
//   Components.chips(items, activeIndex)
//   Components.pillButton(label, variant, small)   // variant: primary|secondary|hero
//   Components.rowCard({img, title, meta, note, button, chevron, borderless})
//       // note — строка или {icon, text} (icon — сырая SVG-строка)
//   Components.weekDots(days, completedSet, labels)
//   Components.statBlock(items)

const Components = (() => {

    // --- Карточка цикла (круг): «День цикла» / число / фаза (спека §1) ---
    // opts.withoutPhase — не рендерить строку фазы (мини-карточка в шапке)
    function cycleCard(day, phaseName, opts = {}) {
        const compact = Boolean(opts.compact);
        const cls = 'gf-cycle-card' + (compact ? ' gf-cycle-card-compact' : '');
        const label = opts.label || 'День цикла';
        return `
        <div class="${cls}" role="group" aria-label="${esc(label)} ${esc(day)}">
            <span class="gf-cycle-card-label">${esc(label)}</span>
            <span class="gf-cycle-card-day">${esc(day)}</span>
            ${opts.withoutPhase ? '' : `<span class="gf-cycle-card-phase">${esc(phaseName || '')}</span>`}
        </div>`;
    }

    // --- Декоративная SVG-веточка (стебель оливковый, листья olive/terracotta) ---
    function branch(width = 56, height = 88) {
        return `
        <svg class="gf-branch" width="${width}" height="${height}" viewBox="0 0 100 150"
             fill="none" aria-hidden="true">
            <path d="M50 148 C46 110 54 70 48 8" stroke="var(--olive)"
                  stroke-width="2.4" stroke-linecap="round"/>
            <path d="M50 124 C 38 118, 30 105, 31 88 C 44 95, 51 108, 50 124 Z"
                  fill="var(--olive)" opacity="0.85"/>
            <path d="M51 104 C 63 98, 71 85, 70 68 C 57 75, 50 88, 51 104 Z"
                  fill="var(--terracotta-soft)" opacity="0.9"/>
            <path d="M49 82 C 37 76, 29 63, 30 46 C 43 53, 50 66, 49 82 Z"
                  fill="var(--olive)" opacity="0.75"/>
            <path d="M50 62 C 62 56, 69 44, 68 28 C 56 34, 49 47, 50 62 Z"
                  fill="var(--terracotta-soft)" opacity="0.8"/>
            <path d="M48 42 C 39 37, 33 27, 34 14 C 44 19, 49 29, 48 42 Z"
                  fill="var(--olive)" opacity="0.65"/>
            <circle cx="48" cy="10" r="3.4" fill="var(--accent)" opacity="0.85"/>
            <circle cx="60" cy="36" r="2.2" fill="var(--accent)" opacity="0.5"/>
        </svg>`;
    }

    // --- Заголовок секции: serif слева + опциональная ссылка справа ---
    function sectionHeader(title, linkText) {
        return `
        <div class="gf-section-header">
            <h2 class="gf-section-title">${esc(title)}</h2>
            ${linkText ? `<button type="button" class="gf-section-link">${esc(linkText)} <span class="gf-chev">›</span></button>` : ''}
        </div>`;
    }

    // --- Чип-фильтры: активный — заливка olive/белый текст, иначе chip-bg ---
    function chips(items, activeIndex = 0) {
        const list = (items || []).map((item, i) => {
            const label = typeof item === 'string' ? item : item.label;
            const cls = 'gf-chip' + (i === activeIndex ? ' active' : '');
            return `<button type="button" class="${cls}" data-chip-index="${i}">${esc(label)}</button>`;
        }).join('');
        return `<div class="gf-chips" role="tablist">${list}</div>`;
    }

    // --- Pill-кнопка: primary (terracotta) / secondary (cream/olive) / hero (cream на терракоте) ---
    function pillButton(label, variant = 'primary', small = false) {
        const v = ['primary', 'secondary', 'hero'].includes(variant) ? variant : 'primary';
        const cls = `gf-pill gf-pill-${v}` + (small ? ' gf-pill-sm' : '');
        return `<button type="button" class="${cls}">${esc(label)}</button>`;
    }

    // --- Карточка-строка: фото слева, заголовок/меты, справа pill + шеврон ---
    function rowCard({ img, title, meta, note, button, chevron } = {}) {
        const metas = Array.isArray(meta) ? meta : (meta ? [meta] : []);
        const metaHtml = metas
            .map((m) => `<p class="gf-row-meta">${esc(m)}</p>`).join('');
        const noteHtml = note ? `<p class="gf-row-note">${note}</p>` : '';
        const btnHtml = button
            ? pillButton(button.label || button, button.variant || 'primary', true)
            : '';
        const chevHtml = chevron ? `<span class="gf-chev gf-row-chev">›</span>` : '';
        return `
        <div class="gf-row-card">
            ${img ? `<img class="gf-row-img" src="${esc(img)}" alt="" loading="lazy">` : ''}
            <div class="gf-row-body">
                <h3 class="gf-row-title">${esc(title || '')}</h3>
                ${metaHtml}
                ${noteHtml}
            </div>
            <div class="gf-row-side">
                ${btnHtml}
                ${chevHtml}
            </div>
        </div>`;
    }

    // --- Ряд кружков дней недели: выполненные — olive с галочкой ---
    // days — массив ключей (например ['Пн',…] или даты), completedSet — Set/массив
    // индексов выполненных, labels — подписи под кружками (опционально).
    function weekDots(days, completedSet, labels) {
        const done = completedSet instanceof Set
            ? completedSet
            : new Set(completedSet || []);
        const cells = (days || []).map((d, i) => {
            const on = done.has(i) || done.has(d);
            const label = labels && labels[i] != null ? labels[i] : d;
            return `
            <div class="gf-week-cell">
                <span class="gf-dot${on ? ' done' : ''}">${on ? '✓' : ''}</span>
                <span class="gf-dot-label">${esc(label)}</span>
            </div>`;
        }).join('');
        return `<div class="gf-week">${cells}</div>`;
    }

    // --- «За месяц»: ряд число serif + подпись ---
    function statBlock(items) {
        const cells = (items || []).map((it) => `
        <div class="gf-stat">
            <span class="gf-stat-num">${esc(it.value)}</span>
            <span class="gf-stat-cap">${esc(it.label)}</span>
        </div>`).join('');
        return `<div class="gf-stats">${cells}</div>`;
    }

    // --- Линейные иконки (Lucide-стиль): stroke = currentColor ---
    const ICONS = {
        lotus: '<path d="M12 16.5c-1.7-1.9-1.7-4.8 0-6.9 1.7 2.1 1.7 5 0 6.9z"/><path d="M7.6 15.6C5.2 14.6 3.7 12.5 3.7 9.8c2.4.8 4.2 2.6 4.9 5"/><path d="M16.4 15.6c2.4-1 3.9-3.1 3.9-5.8-2.4.8-4.2 2.6-4.9 5"/><path d="M12 16.6v3.4"/>',
        leaf: '<path d="M5 19C5 10.7 10.7 5 19 5c0 8.3-5.7 14-14 14z"/><path d="M5 19c2.8-4.6 6.6-8.4 10-10.4"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
        footprints: '<path d="M7 15.5c-1.5-.8-2.3-2.4-2.3-4.2 0-1.5 1-2.6 2.4-2.6 1.5 0 2.6 1.2 2.6 3 0 2-.8 3.1-2.7 3.8z"/><path d="M15.5 10.5c-1.5-.8-2.3-2.4-2.3-4.2 0-1.5 1-2.6 2.4-2.6 1.5 0 2.6 1.2 2.6 3 0 2-.8 3.1-2.7 3.8z"/><path d="M7 15.5v2.2M15.5 10.5v2.2"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-1.2A5.8 5.8 0 0 1 10.3 14h3.4a5.8 5.8 0 0 1 5.8 5.8V21"/>',
        dumbbell: '<path d="M7 7v10M17 7v10M4 9.5v5M20 9.5v5M7 12h10"/>',
        drop: '<path d="M12 3.5c3.5 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2.5-6 6-10z"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        moon: '<path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z"/>',
        arrow: '<path d="M4 12h14"/><path d="M13 6l6 6-6 6"/>',
        fork: '<path d="M4 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2"/><path d="M8 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
        pill: '<path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7Z"/><path d="m8.5 8.5 7 7"/>',
        zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
        flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
        shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
        bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
        doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
        pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
        gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    };

    function icon(name, size = 20) {
        const body = ICONS[name] || ICONS.leaf;
        return `<svg class="gf-icon" width="${size}" height="${size}" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }

    // --- KinescopePlayer: постер 16:9 + play; iframe встраивается только по тапу
    // (без автовоспроизведения до жеста — требование webview Telegram).
    // Постер — video.poster или заглушка категории в стиле приложения. ---
    const VIDEO_POSTER_DEFAULT = {
        mobility: 'img/workout-stretch.jpg',
        strength: 'img/rec-workout.jpg',
        stretch: 'img/workout-yoga.jpg',
        massage: 'img/rec-evening.jpg',
    };

    function videoPosterUrl(video) {
        return video.poster
            || VIDEO_POSTER_DEFAULT[video.category]
            || 'img/rec-evening.jpg';
    }

    function kinescopePlayer(video) {
        return `
        <div class="kin-player" data-embed="${esc(video.embed_url)}">
            <img class="kin-poster" src="${esc(videoPosterUrl(video))}" alt="" loading="lazy">
            <button type="button" class="kin-play" aria-label="Смотреть видео">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"
                     aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
            </button>
        </div>`;
    }

    // Привязка тапа: заменяет постер на iframe-плеер. Вызывать после setHTML.
    function bindKinescopePlayers(root) {
        (root || document).querySelectorAll('.kin-player').forEach((box) => {
            box.addEventListener('click', () => {
                if (box.dataset.loaded) return;
                box.dataset.loaded = '1';
                const src = `${box.dataset.embed}?autoplay=1`;
                box.innerHTML = `<iframe class="kin-iframe" src="${esc(src)}"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowfullscreen frameborder="0"></iframe>`;
            }, { once: true });
        });
    }

    return {
        cycleCard, branch, sectionHeader, chips,
        pillButton, rowCard, weekDots, statBlock, icon,
        kinescopePlayer, bindKinescopePlayers, videoPosterUrl,
    };
})();

window.Components = Components;
