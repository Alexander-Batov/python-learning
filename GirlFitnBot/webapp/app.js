// Ядро мини-аппа: состояние, API-клиент, навигация, модалки, бутстрап.
// Экраны живут в screens/*.js и регистрируются в App.screens.

// DEV-ONLY обход для локальных скриншотов и проверок вне Telegram: на localhost
// подставляем минимальный shim WebApp, если в URL есть ?initData=.
// Официальный скрипт Telegram вне WebView создаёт WebApp с ПУСТЫМ initData —
// поэтому на localhost перекрываем его. Безопасность API не меняется:
// сервер всё равно валидирует HMAC-подпись, подделать initData на проде
// это не позволяет (условие localhost обязательно).
(function devShim() {
    const params = new URLSearchParams(location.search);
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (local && params.get('initData')) {
        window.Telegram = { WebApp: {
            initData: params.get('initData'),
            initDataUnsafe: { user: { first_name: 'Екатерина' } },
            themeParams: {},
            colorScheme: 'light',
            ready() {}, expand() {}, close() {}, sendData() {},
        } };
    }
})();

// Вне Telegram (обычный браузер) объекта WebApp нет — приложение покажет
// экран-подсказку, весь Telegram-зависимый код исполнится только при наличии tg
const tg = window.Telegram && window.Telegram.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

// --- Состояние ---
const state = {
    content: null,    // контент из content.json
    user: null,       // профиль /api/user (серверная сводка цикла)
    cycle: null,      // локально пересчитанные день/фаза (recalcLocalCycle)
    today: null,      // ответ /api/today
    cycleError: null, // видимая ошибка API (401/5xx/сеть)
    notFound: false,  // пользователя нет в базе → onboarding
};

const FETCH_TIMEOUT_MS = 10000;
const App = { state, screens: {}, tg };
window.App = App;

// --- Подстройка под тему Telegram ---
// Фон/текст/карточки берём из themeParams, акцент НЕ перекрываем —
// иначе Telegram подставит свой цвет вместо фирменной терракоты.
function applyTheme() {
    if (!tg) return;
    const params = tg.themeParams || {};
    const root = document.documentElement;
    if (params.bg_color) root.style.setProperty('--background', params.bg_color);
    if (params.text_color) root.style.setProperty('--text-primary', params.text_color);
    if (params.secondary_bg_color) root.style.setProperty('--surface', params.secondary_bg_color);
    document.body.classList.toggle('dark', tg.colorScheme === 'dark');
}

// --- Даты ---
function dateFromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatDayMonth(iso) {
    return dateFromISO(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatFullDate(iso) {
    return dateFromISO(iso).toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
}

function formatHeaderDate() {
    return new Date().toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
}

function todayISO() {
    return CycleMath.toISODate(new Date());
}

// День/фаза считаются на клиенте по локальной дате: сервер может жить
// в другом часовом поясе (UTC на Amvera), тогда серверная дата сдвинула бы
// день на 1. Серверные cycle_day/phase — запасной вариант, пересчитываем всегда.
function recalcLocalCycle() {
    state.cycle = null;
    if (!state.user || !state.user.cycle) return;
    const cycle = { ...state.user.cycle };
    const dayISO = todayISO();
    const pl = cycle.period_length || CycleMath.DEFAULT_PERIOD_LENGTH;
    const day = CycleMath.getCurrentDay(dayISO, cycle.cycle_start, cycle.cycle_length);
    const overdue = day !== null && day > cycle.cycle_length;
    state.cycle = {
        ...cycle,
        today: dayISO,
        overdue,
        cycle_day: overdue ? null : day,
        phase: (day === null || overdue)
            ? null
            : CycleMath.getPhase(day, cycle.cycle_length, pl),
    };
}

// --- API ---
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`сервер не ответил за ${timeoutMs / 1000} секунд`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function initData() {
    return (tg && tg.initData) || '';
}

async function apiGet(path) {
    const sep = path.includes('?') ? '&' : '?';
    const resp = await fetchWithTimeout(`${path}${sep}initData=${encodeURIComponent(initData())}`);
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
        const err = new Error((data && data.error) || `HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return data;
}

async function apiSend(method, path, body) {
    const resp = await fetchWithTimeout(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, initData: initData() }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
        const err = new Error((data && data.error) || `HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return data;
}

const apiPost = (path, body) => apiSend('POST', path, body || {});
const apiPatch = (path, body) => apiSend('PATCH', path, body || {});
const apiDelete = (path) => apiSend('DELETE', path, {});

function apiErrorText(err) {
    return err.message || 'что-то пошло не так';
}

// --- Загрузка данных ---
async function loadContent() {
    const resp = await fetchWithTimeout('content.json');
    if (!resp.ok) throw new Error(`content.json: HTTP ${resp.status}`);
    state.content = await resp.json();
}

async function loadUser() {
    state.user = await apiGet('/api/user');
    state.notFound = false;
    state.cycleError = null;
    recalcLocalCycle();
}

async function loadToday() {
    state.today = await apiGet(`/api/today?date=${todayISO()}`);
}

async function refreshAll() {
    await loadUser();
    try {
        await loadToday();
    } catch (err) {
        console.error('[api] /api/today:', err);
    }
}

// --- Навигация ---
const MAIN_SCREENS = ['today', 'cycle', 'activity', 'nutrition', 'habits', 'profile'];
let lastMainScreen = 'today';

function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.remove('hidden');
    if (MAIN_SCREENS.includes(name)) {
        lastMainScreen = name;
        document.querySelectorAll('.nav-item').forEach((b) => {
            b.classList.toggle('active', b.dataset.nav === name);
        });
    }
    window.scrollTo(0, 0);
    const screen = App.screens[name];
    if (screen && screen.onShow) {
        Promise.resolve(screen.onShow()).catch((err) => {
            console.error(`[screen ${name}]`, err);
        });
    }
}

function showMain(name) {
    showScreen(name);
}

function goBack() {
    showScreen(lastMainScreen);
}

function setNavVisible(visible) {
    document.getElementById('bottom-nav').classList.toggle('hidden', !visible);
}

// --- Модалки ---
function openModal(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-sheet">${html}</div>
        </div>`;
    document.getElementById('modal-overlay')
        .addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') closeModal();
        });
}

function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
}

// Подтверждение-шторка; onConfirm — async-функция, при успехе шторка закрывается
function confirmSheet({ title, text, confirmLabel, danger, onConfirm }) {
    openModal(`
        <h2>${title}</h2>
        <p class="subtitle">${text}</p>
        <button class="btn ${danger ? '' : 'btn-olive'}" id="modal-confirm"
            style="${danger ? 'background: var(--danger);' : ''}">${confirmLabel}</button>
        <button class="btn btn-ghost" id="modal-cancel">Отмена</button>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm').addEventListener('click', async () => {
        const btn = document.getElementById('modal-confirm');
        btn.disabled = true;
        try {
            await onConfirm();
            closeModal();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = `Не получилось: ${apiErrorText(err)}`;
        }
    });
}

// Простая информационная шторка
function infoSheet(title, text) {
    openModal(`
        <h2>${title}</h2>
        <p class="subtitle">${text}</p>
        <button class="btn" id="modal-ok">Понятно</button>
    `);
    document.getElementById('modal-ok').addEventListener('click', closeModal);
}

// --- Общие хелперы рендера ---
function el(id) {
    return document.getElementById(id);
}

function setHTML(id, html) {
    el(id).innerHTML = html;
}

function emptyState(text) {
    return `<p class="empty-hint">${text}</p>`;
}

function errorState(text, retryFnName) {
    return `
        <div class="error-box">
            <p>${text}</p>
            ${retryFnName ? `<button class="link-btn" onclick="${retryFnName}()">Попробовать ещё раз</button>` : ''}
        </div>`;
}

function esc(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Детерминированный выбор по дате (одно и то же весь день)
function pickByDate(list, dateISO) {
    if (!list || !list.length) return null;
    const epochDay = Math.floor(dateFromISO(dateISO).getTime() / 86400000);
    return list[epochDay % list.length];
}

function displayName() {
    if (state.user && state.user.name) return state.user.name;
    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    return user && user.first_name ? user.first_name : 'подруга';
}

function avatarLetter() {
    return esc(displayName().charAt(0).toUpperCase());
}

// --- Экран «вне Telegram» ---
function showNotgScreen() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    el('screen-notg').classList.remove('hidden');
    setNavVisible(false);
}

// --- Инициализация ---
async function main() {
    applyTheme();

    // initData пуст — приложение открыто не как Mini App: API работать не будет
    if (!tg || !tg.initData) {
        showNotgScreen();
        return;
    }

    try {
        await loadContent();
    } catch (err) {
        console.error('[api] content.json:', err);
        state.cycleError = `Не получилось загрузить контент: ${err.message}`;
    }

    try {
        await loadUser();
    } catch (err) {
        if (err.status === 404) {
            // Пользователя нет в базе — показываем onboarding 5 шагов
            state.notFound = true;
            setNavVisible(false);
            Onboarding.start(finishOnboarding);
            return;
        }
        state.cycleError = `Не получилось загрузить данные: ${apiErrorText(err)}`;
    }

    await enterApp();
}

// Onboarding завершён — профиль создан, входим в приложение
async function finishOnboarding() {
    try {
        await loadUser();
    } catch (err) {
        state.cycleError = `Не получилось загрузить данные: ${apiErrorText(err)}`;
    }
    el('onboarding').classList.add('hidden');
    setNavVisible(true);
    await enterApp();
}

async function enterApp() {
    if (state.cycleError) {
        // Контент не загрузился — показываем ошибку на «Сегодня»
        setNavVisible(true);
        renderErrorScreen();
        showScreen('today');
        return;
    }
    try {
        await loadToday();
    } catch (err) {
        console.error('[api] /api/today:', err);
    }
    setNavVisible(true);
    showScreen('today');
    // DEV-ONLY: глубокая ссылка ?screen=<имя> для локальных скриншотов/проверок
    const devScreen = new URLSearchParams(location.search).get('screen');
    if (devScreen && document.getElementById(`screen-${devScreen}`)) {
        showScreen(devScreen);
    }
}

function renderErrorScreen() {
    setHTML('today-content', `
        ${errorState(state.cycleError || 'Неизвестная ошибка', null)}
        <button class="btn" onclick="location.reload()">Обновить</button>
    `);
}

// --- Привязка навигации (не зависит от данных) ---
document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showMain(btn.dataset.nav));
});
document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
        // Уход с экрана тренировки должен гасить её таймер
        if (App.screens.activity && App.screens.activity.stopPlayer) {
            App.screens.activity.stopPlayer();
        }
        goBack();
    });
});

// Запуск: вне Telegram — только экран-подсказку; внутри — обычный старт
if (tg) {
    main();
} else {
    showNotgScreen();
}
