require('dotenv').config()

const axios = require('axios')
const TelegramBot = require('node-telegram-bot-api');

const { getData, dateToTimestamp, formateMsg } = require('./service');

const token = "8022738459:AAHqxjyrBwhVFVAU9Q1925rzSC9gEanEtbY"
const TELEGRAM_CHAT_MT = "555207329"
const TELEGRAM_CHAT_DEA = "644190724"

const bot = new TelegramBot(token, { polling: true });

const userStates = {};

const menuKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: 'Посмотреть ближайшие задачи' }], [{ text: 'Добавить задачу' }, { text: 'Выполнить задачу' }]
        ],
        // resize_keyboard: true,
        one_time_keyboard: false
    }
};

// Обработчики событий (должны быть объявлены один раз)
bot.on('message', async (msg) => {
    // Ваш обработчик сообщений
    const chatId = msg.chat.id;
    const text = msg.text;

    if (chatId != TELEGRAM_CHAT_MT && chatId != TELEGRAM_CHAT_DEA) {
        console.log(chatId)
        await bot.sendMessage(chatId, 'Кто ты войн???');
        return
    }
    // Если у пользователя есть активное состояние - обрабатываем диалог
    if (userStates[chatId]) {
        handleDialogState(chatId, text);
        return;
    }
    // Обработка команд основного меню
    if (text === 'Посмотреть ближайшие задачи') {
        const tasks = await getData(chatId)
        if (tasks == 0) {
            await bot.sendMessage(chatId, 'Нет задач на ближайшее время... Кайфуй, отдыхай😎');
        } else {
            const formatedTasks = await formateMsg(tasks)
            await bot.sendMessage(chatId, 'Вот ваши ближайшие задачи:');
            await bot.sendMessage(chatId, formatedTasks);
        }
    }
    if (text === 'Добавить задачу') {
        await bot.sendMessage(chatId, 'Добавьте задачу по кнопке ниже', {
            reply_markup: {
                inline_keyboard: [[{
                    text: 'Добавить задачу',
                    callback_data: 'start_task_creation'
                }]]
            }
        });
    }
    if (text === 'Выполнить задачу') {
        await bot.sendMessage(chatId, 'Выполнить задачу по кнопке ниже', {
            reply_markup: {
                inline_keyboard: [[{
                    text: 'Выполнить задачу',
                    callback_data: 'start_complited_task'
                }]]
            }
        });
    }
    else {
        await bot.sendMessage(chatId, 'Выберите опцию:', menuKeyboard);
    }
    // await bot.sendMessage(chatId, menuKeyboard);
});

bot.on('callback_query', async (callbackQuery) => {
    // Ваш обработчик inline-кнопок
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    // Запуск процесса создания задачи
    if (data === 'start_task_creation') {
        userStates[chatId] = {
            step: 'select_task',
            data: {}
        };

        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, 'Выберите задачу:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Для всех', callback_data: 'recipient_Для всех' }],
                    [{ text: 'Матвей', callback_data: 'recipient_Матвей' }],
                    [{ text: 'Делайла', callback_data: 'recipient_Делайла' }]
                ]
            }
        });
    }
    // Запуск процесса выполнения задачи
    if (data === 'start_complited_task') {
        const tasks = await getData(chatId)
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, 'Выберите выполненную задачу:', {
            reply_markup: {
                inline_keyboard: tasks.map(task => [{
                    text: task.text,
                    callback_data: `complete_${task._id}` // Используем ID вместо текста
                }])
            }
        });
    }

    // Обработка выбора получателя
    if (data.startsWith('complete_')) {
        const complitedTaskId = data.split('_')[1];
        const tasks = await getData(chatId)
        const taskToUpdate = tasks.find(task => (
            task._id == complitedTaskId
        ))
        const updatedTask = { ...taskToUpdate, isCompleted: true, completedAt: Date.now() }
        try {
            await axios.put(`https://to-do-do-next-red.vercel.app/api/tasks/${updatedTask._id}`, updatedTask);
        } catch (e) {
            console.log(e)
            await bot.answerCallbackQuery(callbackQuery.id);
            await bot.sendMessage(chatId, 'Не получилось сорян...');
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, `Задача ${updatedTask.text} выполнена!🥳`);
        await bot.sendAnimation(chatId, 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmNpdmNsdXliN2pucmNtcnBnaTdoMDJ2MGM2bDAxZDdhd3AzaTR6YiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/s2qXK8wAvkHTO/giphy.gif');
        return
    }

    if (data.startsWith('recipient_')) {
        const recipient = data.split('_')[1];
        userStates[chatId] = {
            step: 'enter_task',
            data: { recipient }
        };

        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, 'Напишите задачу:');
    }

    // Обработка решения о дате
    if (data === 'date_yes') {
        userStates[chatId].step = 'enter_date';
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, 'Введите дату выполнения в формате ДД.ММ.ГГГГ:');
    }

    if (data === 'date_no') {
        userStates[chatId].step = 'confirmation';
        userStates[chatId].data.date = null;
        await bot.answerCallbackQuery(callbackQuery.id);
        sendConfirmation(chatId);
    }

    // Обработка подтверждения
    if (data === 'confirm_yes') {
        await saveTask(userStates[chatId].data);
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, '✅ Задача успешно добавлена!');
        delete userStates[chatId];
    }

    if (data === 'confirm_no') {
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, '❌ Создание задачи отменено');
        delete userStates[chatId];
    }

});
async function handleDialogState(chatId, text) {
    const state = userStates[chatId];

    switch (state.step) {
        case 'enter_task':
            state.data.task = text;
            state.step = 'ask_date';
            await bot.sendMessage(chatId, 'Установить дату выполнения?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Да', callback_data: 'date_yes' }, { text: 'Нет', callback_data: 'date_no' }]
                    ]
                }
            });
            break;

        case 'enter_date':
            // Простая валидация даты
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
                state.data.date = text;
                state.step = 'confirmation';
                sendConfirmation(chatId);
            } else {
                await bot.sendMessage(chatId, '❌ Неверный формат даты! Используйте ДД.ММ.ГГГГ');
            }
            break;
    }
}
async function sendConfirmation(chatId) {
    const { recipient, task, date } = userStates[chatId].data;
    const recipientName = {
        all: 'Все',
        matvey: 'Матвей',
        delaila: 'Делайла'
    }[recipient] || recipient;

    const message = `Подтвердите задачу:\n\n`
        + `👥 Для: ${recipientName}\n`
        + `📝 Задача: ${task}\n`
        + `📅 Дата: ${date || 'не установлена'}`;

    await bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Подтвердить', callback_data: 'confirm_yes' }],
                [{ text: 'Отменить', callback_data: 'confirm_no' }]
            ]
        }
    });


}
async function saveTask(taskData) {
    // Здесь логика сохранения в БД
    console.log('Saving task:', taskData);
    const timestamp = taskData.date ? dateToTimestamp(taskData.date) : null
    const dataToSend = {
        owner: taskData.recipient,
        type: 'задача',
        text: taskData.task,
        dueDate: timestamp,
        repeat: false,
        createdAt: Date.now(),
        isCompleted: false
    }
    console.log('Saving task:', dataToSend);
    try {
        await axios.post("https://to-do-do-next-red.vercel.app/api/tasks", dataToSend);
        console.log('ok')
    } catch (e) {
        console.log(e)
    }
    // Возвращаем промис для асинхронной обработки
    return
}


