const { MongoClient } = require('mongodb');

const getDB = url => new Promise(async (resolve, reject) => {
  const _url = url || process.env.MONGODB_URI || 'mongodb://localhost:27017/radiks-server';
  MongoClient.connect(_url, { useNewUrlParser: true }, (err, client) => {
    if (err) {
      return reject(err);
    }
    return resolve(client.db());
  });
});

module.exports = {
  getDB,
};
