import { getDataFromMongoDB } from './mongo.js';

const TELEGRAM_CHAT_MT = "555207329"
const TELEGRAM_CHAT_DEA = "644190724"

async function getData(userId) {
    try {
        const response = await getDataFromMongoDB()
        const time = Date.now()
        const filteredData = response.filter(val => !val.isCompleted && val.dueDate && val.dueDate - time < (3 * 24 * 60 * 60 * 1000))
        const DataForAll = filteredData.filter(val => val.owner === 'Для всех')
        const DataForMT = filteredData.filter(val => val.owner === 'Матвей')
        const DataForDea = filteredData.filter(val => val.owner === 'Делайла')

        const MTtasks = [...DataForAll, ...DataForMT]
        const DEAtasks = [...DataForAll, ...DataForDea]
        let answer = "0"
        if (userId == TELEGRAM_CHAT_MT) {
            if (MTtasks.length) {
                // answer = await sendMsg(MTtasks)
                answer = MTtasks
            }
        }
        else if (userId == TELEGRAM_CHAT_DEA) {
            if (DEAtasks.length) {
                answer = DEAtasks
            }
        }

        return answer

    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function formateMsg(tasks) {
    
    const sortedTasks = sortTasks(tasks);
    // let taskMessage = 'Привет, вот задачи которые нужно выполнить в ближайшие дни:\n\n';
    let taskMessage = '\n\n';

    if (sortedTasks.overdue.length) {
        const msg = '\n🕒Просрочено:\n' + sortedTasks.overdue.map(task => {
            return '📌' + task.text + '\n';
        }).join('');
        taskMessage += msg;
    }

    if (sortedTasks.today.length) {
        const msg = '\n🕒Сегодня:\n' + sortedTasks.today.map(task => {
            return '📌' + task.text + '\n';
        }).join('');
        taskMessage += msg;
    }

    if (sortedTasks.tommorow.length) {
        const msg = '\n🕒До Завтра:\n' + sortedTasks.tommorow.map(task => {
            return '📌' + task.text + '\n';
        }).join('');
        taskMessage += msg;
    }

    if (sortedTasks.afterTomorrow.length) {
        const msg = '\n🕒До Послезавтра:\n' + sortedTasks.afterTomorrow.map(task => {
            return '📌' + task.text + '\n';
        }).join('');
        taskMessage += msg;
    }

    return (taskMessage);
}


function sortTasks(tasks) {
    const today = new Date(); // Текущая дата
    const todayDate = today.getDate()
    const todayMonth = today.getDate()
    let sortedTasks = {
        overdue: [],
        today: [],
        tommorow: [],
        afterTomorrow: [],
    }
    tasks.forEach(task => {
        const taskDate = new Date(task.dueDate); // Преобразуем в объект Date
        if (taskDate.getDate() == todayDate) sortedTasks.today.push(task)
        else if (taskDate.getDate() - todayDate === 1 || (taskDate.getMonth() > todayMonth) && taskDate.getDate() === 1) sortedTasks.tommorow.push(task)
        else if (taskDate.getDate() - todayDate === 2 || (taskDate.getMonth() > todayMonth) && taskDate.getDate() === 2) sortedTasks.afterTomorrow.push(task)
        else if (taskDate < today) sortedTasks.overdue.push(task)
    })
    return sortedTasks

}


function dateToTimestamp(dateStr) {
    const [day, month, year] = dateStr.split('.').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getTime();
}





export {
  getData,
  dateToTimestamp,
  formateMsg
};