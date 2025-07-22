const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI
const dbName = process.env.dbName
const collectionName = process.env.collectionName

 async function getDataFromMongoDB() {
  const client = new MongoClient(MONGO_URI);

  try {
    // Подключение к MongoDB
    await client.connect();

    // Получение базы данных и коллекции
    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    // Получение данных из коллекции (все документы)
    const data = await collection.find({}).toArray(); // {} - пустой фильтр, возвращает всё
    return data;
  } catch (error) {
    console.error('Ошибка подключения к MongoDB:', error);
    throw error;
  } finally {
    // Закрытие подключения
    await client.close();
  }
}

module.exports = {
  getDataFromMongoDB
};