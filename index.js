import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from "ffmpeg-static";
import fetch from 'node-fetch';
import vosk from 'vosk';
import { getData, dateToTimestamp, formateMsg } from './service.js';

ffmpeg.setFfmpegPath(ffmpegPath);

const MODEL_PATH = "./model";
if (!fs.existsSync(MODEL_PATH)) {
    console.error("⚠️ Сначала скачай модель Vosk и распакуй в папку ./model");
    process.exit(1);
}
vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);

const token = process.env.token;
const TELEGRAM_CHAT_MT = process.env.TELEGRAM_CHAT_MT;
const TELEGRAM_CHAT_DEA = process.env.TELEGRAM_CHAT_DEA;

const bot = new Telegraf(token);


// ---------- Состояния пользователей ----------
const userStates = {};

// ---------- Главное меню ----------
const menuKeyboard = Markup.keyboard([
    ['Посмотреть ближайшие задачи'],
    ['Добавить задачу', 'Выполнить задачу']
]).resize();

// ---------- Команды ----------
bot.start((ctx) => ctx.reply('Привет! Что делаем?', menuKeyboard));

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    // Проверка пользователя
    if (chatId != TELEGRAM_CHAT_MT && chatId != TELEGRAM_CHAT_DEA) {
        return ctx.reply('Кто ты, воин? 😎');
    }

    // Если пользователь в процессе создания задачи
    if (userStates[chatId]) return handleDialogState(ctx, text);

    // Основное меню
    switch (text) {
        case 'Посмотреть ближайшие задачи':
            {
                const tasks = await getData(chatId);
                if (!tasks.length)
                    return ctx.reply('Нет задач на ближайшее время... Кайфуй 😎');
                await ctx.reply('Вот ваши ближайшие задачи:');
                await ctx.reply(await formateMsg(tasks));
            }
            break;

        case 'Добавить задачу':
            await ctx.reply(
                'Выберите получателя:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('Для всех', 'recipient_Для всех')],
                    [Markup.button.callback('Матвей', 'recipient_Матвей')],
                    [Markup.button.callback('Делайла', 'recipient_Делайла')]
                ])
            );
            break;

        case 'Выполнить задачу':
            {
                const tasks = await getData(chatId);
                if (!tasks.length)
                    return ctx.reply('Нет активных задач!');

                await ctx.reply(
                    'Выберите выполненную задачу:',
                    Markup.inlineKeyboard(
                        tasks.map((task) => [
                            Markup.button.callback(task.text, `complete_${task._id}`)
                        ])
                    )
                );
            }
            break;

        default:
            await ctx.reply('Выберите опцию:', menuKeyboard);
    }
});

// ---------- Inline callback обработчик ----------
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;

    if (data.startsWith('recipient_')) {
        const recipient = data.split('_')[1];
        userStates[chatId] = { step: 'enter_task', data: { recipient } };
        await ctx.editMessageText('Напишите задачу:');
    }

    if (data === 'date_yes') {
        userStates[chatId].step = 'enter_date';
        await ctx.editMessageText('Введите дату выполнения в формате ДД.ММ.ГГГГ:');
    }

    if (data === 'date_no') {
        userStates[chatId].data.date = null;
        userStates[chatId].step = 'confirmation';
        await sendConfirmation(ctx);
    }

    if (data === 'confirm_yes') {
        await saveTask(userStates[chatId].data);
        delete userStates[chatId];
        await ctx.editMessageText('✅ Задача успешно добавлена!');
    }

    if (data === 'confirm_no') {
        delete userStates[chatId];
        await ctx.editMessageText('❌ Создание задачи отменено');
    }

    if (data.startsWith('complete_')) {
        const id = data.split('_')[1];
        const tasks = await getData(chatId);
        const task = tasks.find((t) => t._id.toString() === id);
        if (!task) return ctx.reply('Задача не найдена.');

        const updated = { ...task, isCompleted: true, completedAt: Date.now() };
        try {
            await axios.put(
                `https://to-do-do-next-red.vercel.app/api/tasks/${updated._id}`,
                updated
            );
            await ctx.reply(`Задача "${updated.text}" выполнена! 🥳`);
            await ctx.replyWithAnimation(
                'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmNpdmNsdXliN2pucmNtcnBnaTdoMDJ2MGM2bDAxZDdhd3AzaTR6YiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/s2qXK8wAvkHTO/giphy.gif'
            );
        } catch {
            await ctx.reply('Не получилось, сорян...');
        }
    }

    await ctx.answerCbQuery();
});

// ---------- Голосовые сообщения ----------

bot.on("voice", async (ctx) => {
    try {
        const fileId = ctx.message.voice.file_id;
        const chatId = ctx.chat.id;
        const fileLink = await ctx.telegram.getFileLink(fileId);

        // 1️⃣ Скачиваем голосовое сообщение (.oga)
        const res = await fetch(fileLink.href);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync("voice.oga", buffer);

        // 2️⃣ Конвертируем в WAV (16kHz, моно)
        await new Promise((resolve, reject) => {
            ffmpeg("voice.oga")
                .audioFrequency(16000)
                .audioChannels(1)
                .format("wav")
                .on("end", resolve)
                .on("error", reject)
                .save("voice.wav");
        });

        // 3️⃣ Распознаём речь
        const rec = new vosk.Recognizer({ model: model, sampleRate: 16000 });
        const data = fs.readFileSync("voice.wav");
        rec.acceptWaveform(data);
        const result = rec.finalResult();
        rec.free();

        const text = result.text || "Не удалось распознать речь";
        if (text === "Не удалось распознать речь") {
            await ctx.reply(`"Не удалось распознать речь"`);
        } else {
            const taskData = parseTaskText(text)
            userStates[chatId] = {
                data: {
                    recipient: chatId == TELEGRAM_CHAT_MT ? "Матвей" : "Делайла",
                    task: taskData.task,
                    date: taskData.date
                }
            }
            if (taskData.type === 'добавь') {
                await sendConfirmation(ctx)
            } else {
                await ctx.reply(`🗣 Не понял задачу: ${text}`);
                await ctx.reply(`Если хочешь добавить зачачу, скажи что то в роде:`);
                await ctx.reply(`Добавь задачу на 15го октября балатироваться в призеденты`);
            }
            console.log(taskData)
        }


    } catch (e) {
        console.error(e);
        await ctx.reply("❌ Ошибка при обработке голосового сообщения");
    }
});

// ---------- Обработка состояний ----------
async function handleDialogState(ctx, text) {
    const chatId = ctx.chat.id;
    const state = userStates[chatId];

    if (state.step === 'enter_task') {
        state.data.task = text;
        state.step = 'ask_date';
        await ctx.reply(
            'Установить дату выполнения?',
            Markup.inlineKeyboard([
                [Markup.button.callback('Да', 'date_yes')],
                [Markup.button.callback('Нет', 'date_no')]
            ])
        );
    } else if (state.step === 'enter_date') {
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {

            state.data.date = text;
            state.step = 'confirmation';
            await sendConfirmation(ctx);
        } else {
            await ctx.reply('❌ Неверный формат даты! Используйте ДД.ММ.ГГГГ');
        }
    }
}

// ---------- Подтверждение ----------
async function sendConfirmation(ctx) {
    const chatId = ctx.chat.id;
    const { recipient, task, date } = userStates[chatId].data;

    const message = `Подтвердите задачу:\n\n👥 Для: ${recipient}\n📝 ${task}\n📅 ${date || 'Без даты'}`;
    await ctx.reply(
        message,
        Markup.inlineKeyboard([
            [Markup.button.callback('Подтвердить', 'confirm_yes')],
            [Markup.button.callback('Отменить', 'confirm_no')]
        ])
    );
}

// ---------- Сохранение задачи ----------
async function saveTask(taskData) {
    console.log(taskData.date)
    const timestamp = taskData.date ? dateToTimestamp(taskData.date) : null;
    const payload = {
        owner: taskData.recipient,
        type: 'задача',
        text: taskData.task,
        dueDate: timestamp,
        repeat: false,
        createdAt: Date.now(),
        isCompleted: false
    };

    try {
        await axios.post('https://to-do-do-next-red.vercel.app/api/tasks', payload);
    } catch (err) {
        console.error('Ошибка при сохранении задачи:', err.message);
    }
}

function parseTaskText(text) {
    text = text.toLowerCase().trim();

    // Тип действия
    let type = "";
    if (text.includes("добавь") || text.includes("добавить") || text.includes("добавим") || text.includes("добав") || text.includes("дбави") || text.includes("обав") || text.includes("обавь") || text.includes("создай")) type = "добавь";

    // Список месяцев
    const months = {
        января: "01", февраля: "02", марта: "03", апреля: "04",
        мая: "05", июня: "06", июля: "07", августа: "08",
        сентября: "09", октября: "10", ноября: "11", декабря: "12"
    };

    // 📅 Поиск даты (цифровая или словесная)
    let date = null;
    const dateMatch = text.match(/(\d{1,2})[.\s]*(\d{1,2})[.\s]*(\d{2,4})/);
    if (dateMatch) {
        const [_, d, m, y] = dateMatch;
        date = `${y.length === 2 ? "20" + y : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else {
        const wordDate = text.match(/(\d{1,2}|первое|второе|третье|четвертое|пятое|шестое|седьмое|восьмое|девятое|десятое|одиннадцатое|двенадцатое|тринадцатое|четырнадцатое|пятнадцатое|шестнадцатое|семнадцатое|восемнадцатое|девятнадцатое|двадцатое|двадцать первое|двадцать второе|двадцать третье|двадцать четвертое|двадцать пятое|двадцать шестое|двадцать седьмое|двадцать восьмое|двадцать девятое|тридцатое|тридцать первое)\s+([а-я]+)/);
        if (wordDate && months[wordDate[2]]) {
            const day = wordToNumber(wordDate[1]);
            const month = months[wordDate[2]];
            const year = new Date().getFullYear();
            date = `${String(day).padStart(2, "0")}.${month}.${year}`;
        }
    }

    // ✏️ Извлечение задачи (без "задача", "задачу" и т.д.)
    let task = text
        .replace(/добавь|создай/gi, "")
        .replace(/задач[ауыи]/gi, "") // ← удаляем формы слова "задача"
        .replace(/на\s+\d{1,2}[.\s]\d{1,2}[.\s]\d{2,4}/gi, "")
        .replace(/на\s+[а-я]+\s+[а-я]+/gi, "")
        .trim();

    return { type, date, task };
}

// 🔢 Вспомогательная функция для словесных чисел
function wordToNumber(word) {
    const map = {
        первое: 1, второе: 2, третье: 3, четвертое: 4, пятое: 5,
        шестое: 6, седьмое: 7, восьмое: 8, девятое: 9, десятое: 10,
        одиннадцатое: 11, двенадцатое: 12, тринадцатое: 13, четырнадцатое: 14,
        пятнадцатое: 15, шестнадцатое: 16, семнадцатое: 17, восемнадцатое: 18,
        девятнадцатое: 19, двадцатое: 20, 'двадцать первое': 21, 'двадцать второе': 22,
        'двадцать третье': 23, 'двадцать четвертое': 24, 'двадцать пятое': 25,
        'двадцать шестое': 26, 'двадцать седьмое': 27, 'двадцать восьмое': 28,
        'двадцать девятое': 29, тридцатое: 30, 'тридцать первое': 31
    };
    return map[word] || parseInt(word);
}

// ---------- Запуск ----------
bot.launch();
console.log('✅ Бот запущен на Telegraf!');
