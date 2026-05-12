const redis = require('./redis');

const K = {
  NEXT_ID: 'meeting:next_id',
  Q_LIST: 'meeting:questions',
  META: 'meeting:meta',
};

async function getNextId() {
  return await redis.incr(K.NEXT_ID);
}

async function addQuestion(entry) {
  await redis.rpush(K.Q_LIST, JSON.stringify(entry));
}

async function getAllQuestions() {
  const raw = await redis.lrange(K.Q_LIST, 0, -1);
  return raw.map((r) => (typeof r === 'string' ? JSON.parse(r) : r));
}

async function getMeta() {
  const raw = await redis.get(K.META);
  if (!raw) {
    return { topTwo: null, currentRound: 1, currentTopic: '' };
  }
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { topTwo: null, currentRound: 1, currentTopic: '' }; }
  }
  return raw;
}

async function setMeta(meta) {
  await redis.set(K.META, JSON.stringify(meta));
}

async function resetAll() {
  await redis.del(K.NEXT_ID, K.Q_LIST, K.META);
}

module.exports = {
  getNextId,
  addQuestion,
  getAllQuestions,
  getMeta,
  setMeta,
  resetAll,
};
