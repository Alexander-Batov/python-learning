# Каркас Telegram-бота с Mini App

Многоразовая болванка для клиентских проектов: Telegram-бот на **aiogram 3** (long polling)
+ веб-сервер на **aiohttp**, отдающий статику мини-аппа. Оба компонента работают
в одном event loop.

Наполнение появится позже — в коде расставлены пометки `TODO`.

## Структура

```
├── bot.py            # точка входа: polling + веб-сервер в одном loop
├── config.py         # настройки из .env (BOT_TOKEN, WEBAPP_URL, PORT)
├── handlers/
│   ├── __init__.py   # реестр роутеров
│   ├── start.py      # /start, /help + reply-кнопка открытия мини-аппа
│   └── webapp_data.py# приём данных из мини-аппа (message.web_app_data)
├── webapp/
│   ├── index.html    # скелет мини-аппа (главный экран + экран-заглушка)
│   ├── app.js        # логика: тема, приветствие, навигация, sendData()
│   └── style.css     # стили; цвета — в CSS-переменных в начале файла
├── requirements.txt
├── .env.example      # образец .env (без реальных значений)
└── .gitignore
```

## Локальный запуск

```bash
# 1. Создайте виртуальное окружение и установите зависимости
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt

# 2. Создайте .env из образца и заполните значения
cp .env.example .env   # Windows: copy .env.example .env
```

### Почему нужен ngrok

Мини-апп открывается только по **публичному HTTPS-URL** — `http://localhost:8080`
Telegram не примет. Поэтому для локального теста поднимите туннель:

```bash
# в отдельном терминале
ngrok http 8080
```

Скопируйте выданный ngrok URL (вида `https://xxxx.ngrok-free.app`)
в `WEBAPP_URL` файла `.env` и перезапустите бота.

### Запуск

```bash
python bot.py
```

После `/start` в боте появится reply-кнопка «Открыть приложение»,
ведущая на мини-апп через ngrok.

## Как задеплоить

Бот работает через long polling — вебхук и публичный IP для самого бота **не нужны**.
Нужен только публичный HTTPS-URL для статики мини-аппа:

1. **VPS** — запустите `python bot.py` (systemd/supervisor по вкусу),
   отдайте статику через nginx + домен с валидным TLS-сертификатом
   и пропишите домен в `WEBAPP_URL`.
2. **PaaS-облако** — подойдёт любой хостинг Python-приложений
   с внешним HTTPS-доменом; `PORT` берётся из переменной окружения хостинга.

Секреты (`BOT_TOKEN` и др.) задаются переменными окружения на сервере,
файл `.env` в git не коммитится.

## Наполнение каркаса

- Новые команды и сценарии бота — в `handlers/` (по одному роутеру на сценарий),
  регистрация — в `handlers/__init__.py`.
- Экраны мини-аппа — в `webapp/`: разметка в `index.html`, логика в `app.js`.
- Перекраска под бренд клиента — CSS-переменные в начале `webapp/style.css`.
- Обработка данных от мини-аппа (БД, FSM) — в `handlers/webapp_data.py`.
