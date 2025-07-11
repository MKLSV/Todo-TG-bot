const TelegramBot = require('node-telegram-bot-api');
const { getData } = require('./service');

const token = "8022738459:AAHqxjyrBwhVFVAU9Q1925rzSC9gEanEtbY"
const TELEGRAM_CHAT_MT = "555207329"
const TELEGRAM_CHAT_DEA = "644190724"
const webAppUrl = 'https://tg-web-bot-app-react.vercel.app';

const bot = new TelegramBot(token, { polling: true });

const menuKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: 'Посмотреть ближайшие задачи' }], [{ text: 'Добавить задачу' }, { text: 'Задача выполнена' }]
        ],
        // resize_keyboard: true,
        one_time_keyboard: false
    }
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Показываем клавиатуру при любом сообщении, кроме команды /start
    if (text !== '/start') {
        if (['Посмотреть ближайшие задачи', 'Добавить задачу', 'Задача выполнена'].includes(text)) {
            // обработка нажатий на кнопки
            if (text === 'Посмотреть ближайшие задачи') {
                const tasks = await getData(chatId)
                if (tasks == 0) {
                    await bot.sendMessage(chatId, 'Нет задач на ближайшее время... Кайфуй, отдыхай😎');
                } else {
                    await bot.sendMessage(chatId, 'Вот ваши ближайшие задачи:');
                    await bot.sendMessage(chatId, tasks);
                }
            }
            if (text === 'Добавить задачу') {
                await bot.sendMessage(chatId, 'Добавьте задачу по кнопке ниже', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Добавить задачу', web_app: { url: webAppUrl } }]
                        ]
                    }
                });
            }
            if (text === 'Задача выполнена') {
                await bot.sendMessage(chatId, 'Выполнить задачу');
            }
        } else {
            await bot.sendMessage(chatId, 'Выберите команду с клавиатуры.', menuKeyboard);
        }

        return;
    }

    // Обработка /start
    await bot.sendMessage(chatId, 'Выберите опцию:', menuKeyboard);

    await bot.sendMessage(chatId, 'Заходи в наш интернет магазин по кнопке ниже', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
            ]
        }
    });
});
