// Onboarding из 5 шагов (спека: приветствие → имя → данные цикла → цели → уведомления).
// Сохраняет профиль одним POST /api/cycle (имя + данные цикла + цели + флаг плана дня).
// Данные цикла можно пропустить («Не знаю») — ставятся стандартные 28/5,
// всё легко правится позже в Профиле.

const Onboarding = (() => {
    const DEFAULT_LENGTH = 28;
    const DEFAULT_PERIOD = 5;

    let step = 0;
    let onFinish = null;
    let data = {};

    const STEPS = 5;

    function content() {
        return App.state.content.onboarding;
    }

    function start(finishCallback) {
        step = 0;
        data = { name: '', cycle_start: '', cycle_length: DEFAULT_LENGTH,
                 period_length: DEFAULT_PERIOD, goals: [], notifyPlan: false };
        onFinish = finishCallback;
        render();
        document.getElementById('onboarding').classList.remove('hidden');
    }

    function render() {
        const c = content();
        const dots = Array.from({ length: STEPS }, (_, i) =>
            `<div class="onboarding-step${i <= step ? ' on' : ''}"></div>`).join('');
        const root = document.getElementById('onboarding');

        if (step === 0) {
            root.innerHTML = `
                <div class="onboarding-content">
                    <div class="onboarding-hero">
                        ${botanicalSVG()}
                        <h1 class="onboarding-title">${c.greeting_title}</h1>
                        <p class="subtitle">${c.greeting_text}</p>
                    </div>
                </div>
                <div class="onboarding-footer">
                    <button class="btn" id="ob-next">${c.start}</button>
                </div>`;
            bindNext(() => goto(1));
            return;
        }

        let body = '';
        let canNext = true;

        if (step === 1) {
            body = `
                <div class="onboarding-steps">${dots}</div>
                <h1 class="onboarding-title">${c.name_title}</h1>
                <p class="subtitle">${c.name_text}</p>
                <label class="field">
                    <input type="text" id="ob-name" maxlength="64"
                           placeholder="${c.name_placeholder}" value="${esc(data.name)}" autocomplete="given-name">
                </label>`;
            canNext = data.name.trim().length > 0;
        } else if (step === 2) {
            body = `
                <div class="onboarding-steps">${dots}</div>
                <h1 class="onboarding-title">${c.cycle_title}</h1>
                <p class="subtitle">${c.cycle_text}</p>
                <label class="field">
                    <span class="field-label">${c.cycle_start_label}</span>
                    <input type="date" id="ob-cycle-start" value="${data.cycle_start}" max="${todayISO()}">
                </label>
                <label class="field">
                    <span class="field-label">${c.cycle_length_label}</span>
                    <input type="number" id="ob-cycle-length" min="21" max="35" step="1" value="${data.cycle_length}">
                </label>
                <label class="field">
                    <span class="field-label">${c.period_length_label}</span>
                    <input type="number" id="ob-period-length" min="2" max="8" step="1" value="${data.period_length}">
                </label>
                <button class="link-btn" id="ob-dont-know">${c.dont_know}</button>
                <p class="form-message" id="ob-error"></p>`;
            canNext = Boolean(data.cycle_start);
        } else if (step === 3) {
            const goals = App.state.content.goals.map((g) => `
                <button class="option-chip${data.goals.includes(g.id) ? ' active' : ''}"
                        data-goal="${g.id}">${g.label}</button>`).join('');
            body = `
                <div class="onboarding-steps">${dots}</div>
                <h1 class="onboarding-title">${c.goals_title}</h1>
                <p class="subtitle">${c.goals_text}</p>
                <div class="option-row" id="ob-goals">${goals}</div>`;
            canNext = true; // цели необязательны, но хотя бы одну — мягко предложим
        } else if (step === 4) {
            body = `
                <div class="onboarding-steps">${dots}</div>
                <h1 class="onboarding-title">${c.notifications_title}</h1>
                <p class="subtitle">${c.notifications_text}</p>`;
        }

        const isLast = step === STEPS - 1;
        root.innerHTML = `
            <div class="onboarding-content">
                ${body}
            </div>
            <div class="onboarding-footer">
                ${isLast ? `
                    <button class="btn" id="ob-finish-yes">${c.notifications_yes}</button>
                    <button class="btn btn-ghost" id="ob-finish-later">${c.notifications_later}</button>
                ` : `
                    <button class="btn" id="ob-next" ${canNext ? '' : 'disabled'}>${c.next}</button>
                    <button class="btn btn-ghost" id="ob-back">${c.back}</button>
                `}
            </div>`;

        bindStep();
    }

    function bindNext(fn) {
        document.getElementById('ob-next').addEventListener('click', fn);
    }

    function goto(n) {
        collect();
        step = n;
        render();
    }

    function collect() {
        if (step === 1) {
            const input = document.getElementById('ob-name');
            if (input) data.name = input.value.trim();
        } else if (step === 2) {
            const start = document.getElementById('ob-cycle-start');
            const len = document.getElementById('ob-cycle-length');
            const per = document.getElementById('ob-period-length');
            if (start) data.cycle_start = start.value;
            if (len) data.cycle_length = parseInt(len.value, 10) || DEFAULT_LENGTH;
            if (per) data.period_length = parseInt(per.value, 10) || DEFAULT_PERIOD;
        }
    }

    function bindStep() {
        const c = content();

        const nextBtn = document.getElementById('ob-next');
        if (nextBtn) {
            if (step === 1) {
                const input = document.getElementById('ob-name');
                input.addEventListener('input', () => {
                    data.name = input.value.trim();
                    nextBtn.disabled = data.name.length === 0;
                });
            }
            if (step === 2) {
                const start = document.getElementById('ob-cycle-start');
                const len = document.getElementById('ob-cycle-length');
                const per = document.getElementById('ob-period-length');
                const validate = () => {
                    data.cycle_start = start.value;
                    data.cycle_length = parseInt(len.value, 10) || DEFAULT_LENGTH;
                    data.period_length = parseInt(per.value, 10) || DEFAULT_PERIOD;
                    nextBtn.disabled = !data.cycle_start;
                };
                [start, len, per].forEach((i) => i.addEventListener('input', validate));
                document.getElementById('ob-dont-know').addEventListener('click', () => {
                    // Стандартные значения; дата — предположительно 14 дней назад,
                    // чтобы день цикла был ориентировочно серединой цикла
                    const approx = CycleMath.toISODate(
                        new Date(Date.now() - 14 * 86400000));
                    data.cycle_start = approx;
                    data.cycle_length = DEFAULT_LENGTH;
                    data.period_length = DEFAULT_PERIOD;
                    render();
                });
            }
            if (step === 3) {
                document.querySelectorAll('#ob-goals .option-chip').forEach((chip) => {
                    chip.addEventListener('click', () => {
                        const id = chip.dataset.goal;
                        const idx = data.goals.indexOf(id);
                        if (idx >= 0) data.goals.splice(idx, 1);
                        else data.goals.push(id);
                        chip.classList.toggle('active');
                    });
                });
            }
            nextBtn.addEventListener('click', () => goto(step + 1));
        }

        const backBtn = document.getElementById('ob-back');
        if (backBtn) backBtn.addEventListener('click', () => goto(step - 1));

        const yes = document.getElementById('ob-finish-yes');
        if (yes) yes.addEventListener('click', () => finish(true));
        const later = document.getElementById('ob-finish-later');
        if (later) later.addEventListener('click', () => finish(false));
    }

    async function finish(notifyPlan) {
        data.notifyPlan = notifyPlan;
        const c = content();
        const root = document.getElementById('onboarding');
        root.querySelector('.onboarding-footer').innerHTML =
            `<button class="btn" disabled>Сохраняю…</button>`;
        try {
            await apiPost('/api/cycle', {
                name: data.name,
                cycle_start: data.cycle_start,
                cycle_length: data.cycle_length,
                period_length: data.period_length,
                goals: data.goals,
                notify: { plan: notifyPlan },
            });
            if (onFinish) await onFinish();
        } catch (err) {
            root.querySelector('.onboarding-footer').innerHTML = `
                <p class="form-message">Не получилось сохранить: ${apiErrorText(err)}</p>
                <button class="btn" id="ob-retry">${c.finish}</button>`;
            document.getElementById('ob-retry').addEventListener('click', () => finish(notifyPlan));
        }
    }

    function botanicalSVG() {
        return `
        <svg class="botanical" viewBox="0 0 120 120" fill="none"
             stroke="var(--olive)" stroke-width="1.6" stroke-linecap="round">
            <path d="M60 108 C58 80 56 55 60 18"/>
            <path d="M60 88 C48 82 38 82 30 88 C38 94 50 94 60 88Z"/>
            <path d="M60 88 C72 82 82 82 90 88 C82 94 70 94 60 88Z"/>
            <path d="M59 66 C48 60 40 60 33 65 C40 71 50 71 59 66Z"/>
            <path d="M59 66 C70 60 78 60 85 65 C78 71 68 71 59 66Z"/>
            <path d="M60 44 C51 39 45 39 39 43 C45 48 53 48 60 44Z"/>
            <path d="M60 44 C69 39 75 39 81 43 C75 48 67 48 60 44Z"/>
            <circle cx="60" cy="14" r="5"/>
            <circle cx="52" cy="20" r="3.5"/>
            <circle cx="68" cy="20" r="3.5"/>
        </svg>`;
    }

    return { start };
})();
