// Логика каркаса мини-аппа.
// TODO: заменить экраны-заглушки на реальные разделы по мере наполнения.

const tg = window.Telegram.WebApp;

// Сообщаем Telegram, что апп готов, и раскрываем его на весь экран
tg.ready();
tg.expand();

// --- Подстройка под тему Telegram ---
// Цвета из themeParams Telegram применяются к CSS-переменным (см. начало style.css).
// Так мини-апп автоматически следует за светлой/тёмной темой клиента.
function applyTheme() {
    const params = tg.themeParams || {};
    const root = document.documentElement;

    if (params.bg_color) root.style.setProperty('--bg-color', params.bg_color);
    if (params.text_color) root.style.setProperty('--text-color', params.text_color);
    if (params.button_color) root.style.setProperty('--accent-color', params.button_color);
    if (params.button_text_color) root.style.setProperty('--button-text-color', params.button_text_color);
    if (params.secondary_bg_color) root.style.setProperty('--secondary-bg-color', params.secondary_bg_color);

    // Флаг темы на body для стилей, не покрытых themeParams
    document.body.classList.toggle('dark', tg.colorScheme === 'dark');
}

// --- Приветствие по имени пользователя ---
// TODO: в боевом аппе initDataUnsafe заменить на валидацию initData на сервере.
function greetUser() {
    const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
    const name = user && user.first_name ? user.first_name : 'друг';
    document.getElementById('greeting').textContent = `Привет, ${name}!`;
}

// --- Навигация между экранами ---
const mainScreen = document.getElementById('screen-main');
const sectionScreen = document.getElementById('screen-section');
const sectionTitle = document.getElementById('section-title');

let currentSection = null; // название открытого раздела

function openSection(name) {
    currentSection = name;
    sectionTitle.textContent = `Здесь будет ${name.toLowerCase()}`;
    mainScreen.classList.add('hidden');
    sectionScreen.classList.remove('hidden');
}

function goBack() {
    currentSection = null;
    sectionScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
}

// Кнопки разделов на главном экране
document.querySelectorAll('.menu-button[data-section]').forEach((button) => {
    button.addEventListener('click', () => openSection(button.dataset.section));
});

document.getElementById('back').addEventListener('click', goBack);

// --- Отправка выбора боту ---
// sendData передаёт строку боту в message.web_app_data
document.getElementById('send-choice').addEventListener('click', () => {
    if (!currentSection) return;
    tg.sendData(JSON.stringify({ section: currentSection }));
    tg.close();
});

applyTheme();
greetUser();
