import asyncio
import csv
import logging
import os


from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (BufferedInputFile, CallbackQuery, FSInputFile,
                           InlineKeyboardButton, InlineKeyboardMarkup,
                           KeyboardButton, Message, ReplyKeyboardMarkup,
                           ReplyKeyboardRemove)
import chart
import config
import db

logging.basicConfig(level=logging.INFO)
dp = Dispatcher()

yes_no_kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="✅ Да"), KeyboardButton(text="❌ Нет")],
    ],
    resize_keyboard=True,
)

menu = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="📝 Оставить контакт")],
        [KeyboardButton(text="📄 Получить прайс")],
        [KeyboardButton(text="🧠 Пройти тест")],
    ],
    resize_keyboard=True,
)


class Form(StatesGroup):
    phone = State()
    order = State()


contact_kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="📱 Поделиться контактом", request_contact=True)],
        [KeyboardButton(text="↩️ Отмена")],
    ],
    resize_keyboard=True,
)

async def is_subscribed(bot: Bot, user_id: int) -> bool:
    if not config.CHANNEL_ID:
        return True
    try:
        m = await bot.get_chat_member(config.CHANNEL_ID, user_id)
    except Exception:
        logging.exception("Не удалось проверить подписку")
        return False
    return m.status in ("member", "administrator", "creator") or (
        m.status == "restricted" and m.is_member
    )


async def require_sub(message: Message, bot: Bot) -> bool:
    if await is_subscribed(bot, message.from_user.id):
        return True
    await message.answer(
        "Чтобы продолжить, подпишитесь на наш канал 👇",
        reply_markup=sub_keyboard(),
    )
    return False


@dp.callback_query(F.data == "check_sub")
async def check_sub(call: CallbackQuery, bot: Bot):
    if await is_subscribed(bot, call.from_user.id):
        await call.message.answer("Спасибо за подписку! Выберите действие 👇", reply_markup=menu)
        await call.answer()
    else:
        await call.answer("Подписка пока не найдена", show_alert=True)

def sub_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 Подписаться на канал", url=config.CHANNEL_URL)],
        [InlineKeyboardButton(text="✅ Я подписался", callback_data="check_sub")],
    ])

@dp.message(CommandStart())
async def start(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("Здравствуйте! Чем могу помочь?", reply_markup=menu)


@dp.message(F.text == "📝 Оставить контакт")
async def ask_contact(message: Message, state: FSMContext, bot: Bot):
    if not await require_sub(message, bot):
        return
    await state.set_state(Form.phone)
    await message.answer("Нажмите кнопку ниже, чтобы поделиться контактом 👇",
                         reply_markup=contact_kb)


@dp.message(Form.phone, F.text == "↩️ Отмена")
async def cancel(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("Отменено.", reply_markup=menu)


@dp.message(Form.phone, F.contact)
async def got_contact(message: Message, state: FSMContext):
    c = message.contact
    if c.user_id != message.from_user.id:
        await message.answer("Пожалуйста, поделитесь своим контактом с помощью кнопки.")
        return
    name = " ".join(filter(None, [c.first_name, c.last_name]))
    phone = c.phone_number if c.phone_number.startswith("+") else "+" + c.phone_number
    await state.update_data(name=name, phone=phone)
    await state.set_state(Form.order)
    await message.answer("Что вас интересует / что заказывали?",
                         reply_markup=ReplyKeyboardRemove())


@dp.message(Form.phone)
async def phone_wrong(message: Message):
    await message.answer("Нажмите кнопку «Поделиться контактом» 👇", reply_markup=contact_kb)


@dp.message(Form.order)
async def save(message: Message, state: FSMContext):
    data = await state.get_data()
    db.add_client(
        message.from_user.id,
        message.from_user.username,
        data["name"],
        data["phone"],
        message.text,
    )
    await state.clear()
    await message.answer("Спасибо, данные сохранены!", reply_markup=menu)

@dp.message(F.text == "📄 Получить прайс")
@dp.message(Command("materials"))
async def send_materials(message: Message, bot: Bot):
    if not await require_sub(message, bot):
        return
    await message.answer_document(FSInputFile(config.MATERIALS_PATH))


@dp.message(Command("export"))
async def export(message: Message):
    if message.from_user.id not in config.ADMIN_IDS:
        await message.answer("Нет доступа: ваш ID не в списке админов.")
        return  # молча игнорируем чужих
    rows = db.all_clients()
    path = os.path.join(os.path.dirname(db.DB_PATH) or ".", "clients_export.csv")
    # utf-8-sig и ; нужны, чтобы Excel правильно открыл кириллицу
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ID", "Имя", "Телефон", "Заказ", "Username", "Дата"])
        w.writerows(rows)
    await message.answer_document(FSInputFile(path), caption=f"Клиентов: {len(rows)}")

QUIZ_QUESTIONS = [
    "1/15. У меня достаточно времени и энергии, чтобы заниматься созданием продукта.",
    "2/15. Я готов(а) проявляться и действовать, даже если есть страхи и сомнения.",
    "3/15. В моей жизни сейчас есть место для нового проекта, а не только желание его иметь.",
    "4/15. У меня достаточно знаний и опыта, чтобы решать конкретную задачу клиента.",
    "5/15. У меня есть кейсы, результаты или подтверждения моей экспертизы.",
    "6/15. Я понимаю, в чём моя сильная сторона и за чем ко мне приходят люди.",
    "7/15. Я хорошо понимаю, для кого мой продукт и какую проблему он решает.",
    "8/15. У меня есть доступ к своей аудитории или понятный способ её привлечения.",
    "9/15. Я понимаю, как буду рассказывать о продукте и приводить в него клиентов.",
    "10/15. Я понимаю, какой конкретный результат получит человек благодаря моему продукту.",
    "11/15. Я могу сформулировать оффер и концепцию продукта.",
    "12/15. Я понимаю, как провести человека от точки А к точке Б: программа, этапы, инструменты, логика.",
    "13/15. Я понимаю, как технически и организационно создать и запустить продукт.",
    "14/15. У меня есть необходимые ресурсы, бюджет и время на реализацию.",
    "15/15. Я понимаю, что буду делать после запуска: продажи, сопровождение, обратная связь, улучшение продукта.",
]

QUIZ_RESULTS = [
    (6, "🌱 Пока не все пазлы на месте — и это нормальная стартовая точка.\n"
     "Стоит начать с того блока, где ответов «нет» больше всего: скорее всего, именно там сейчас главный тормоз."),
    (9, "🧩 Часть картины уже сложилась, но есть слабые звенья, которые тормозят запуск.\n"
     "Разберите по отдельности блоки, где чаще звучало «нет» — обычно 1-2 из них решают всё."),
    (12, "💪 Хорошая база: экспертность и понимание аудитории на месте.\n"
     "Осталось дожать методологию и реализацию, чтобы продукт из идеи стал предложением."),
    (15, "🏆 Все пазлы почти сложены: у вас есть и экспертность, и понимание аудитории, и план реализации.\n"
     "Можно смело двигаться к запуску, оттачивая детали на практике."),
]



def get_quiz_result(total: int) -> str:
    for threshold, text in QUIZ_RESULTS:
        if total <= threshold:
            return text
    return QUIZ_RESULTS[-1][1]

class Quiz(StatesGroup):
    answering = State()

@dp.message(F.text == "🧠 Пройти тест")
async def quiz_start(message: Message, state: FSMContext):
    await state.set_state(Quiz.answering)
    await state.update_data(idx=0, answers=[])
    await message.answer(
        "🧩 Пройдём тест «5 пазлов эксперта»!\n\n"
        "Отвечайте «Да» или «Нет» на каждое утверждение. Погнали! 🚀\n\n" + QUIZ_QUESTIONS[0],
        reply_markup=yes_no_kb,
    )


@dp.message(Quiz.answering)
async def quiz_step(message: Message, state: FSMContext):
    text = message.text.strip()
    if text == "✅ Да":
        value = 1
    elif text == "❌ Нет":
        value = 0
    else:
        await message.answer("Пожалуйста, выберите «Да» или «Нет» на клавиатуре ниже.")
        return

    data = await state.get_data()
    idx = data["idx"]
    answers = data["answers"] + [value]

    if idx + 1 < len(QUIZ_QUESTIONS):
        await state.update_data(idx=idx + 1, answers=answers)
        await message.answer(QUIZ_QUESTIONS[idx + 1])
        return

    total = sum(answers)
    result_text = get_quiz_result(total)
    # баллы по блокам: по 3 вопроса на блок (Готовность, Экспертность, Аудитория, Продукт, Реализация)
    scores = [sum(answers[i * 3:(i + 1) * 3]) for i in range(5)]
    await state.clear()

    try:
        buf = chart.build_radar_chart(scores)
        await message.answer_photo(
            BufferedInputFile(buf.read(), filename="radar.png"),
            caption=result_text,
            reply_markup=menu,
        )
    except Exception:
        logging.exception("Не удалось построить диаграмму, отправляем только текст")
        await message.answer(result_text, reply_markup=menu)

async def main():
    db.init()
    bot = Bot(token=config.BOT_TOKEN)
    await dp.start_polling(bot)
if __name__ == "__main__":
    asyncio.run(main())