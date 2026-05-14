const redis = require('./redis');

const K = {
  NEXT_ID: 'meeting:next_id',
  Q_LIST: 'meeting:questions',
  META: 'meeting:meta',
  ARCHIVES: 'meeting:archives',          // list of archive keys (most recent first)
  ARCHIVE_PREFIX: 'meeting:archive:',    // each archive stored under archive:<timestamp>
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

// Before destroying data, dump everything to a timestamped archive key.
// Archive is kept indefinitely; index list keeps the most-recent 50.
async function snapshot() {
  const questions = await getAllQuestions();
  const meta = await getMeta();
  if (questions.length === 0 && !meta.topTwo && (meta.currentRound || 1) === 1) {
    // Nothing meaningful to archive
    return null;
  }
  const ts = new Date().toISOString();
  const key = K.ARCHIVE_PREFIX + ts;
  const payload = { archivedAt: ts, questions, meta };
  await redis.set(key, JSON.stringify(payload));
  await redis.lpush(K.ARCHIVES, key);
  await redis.ltrim(K.ARCHIVES, 0, 49); // keep 50 most recent
  return key;
}

async function resetAll() {
  // Always snapshot before deleting so a misclick/misCALL doesn't lose data.
  const archiveKey = await snapshot();
  await redis.del(K.NEXT_ID, K.Q_LIST, K.META);
  return archiveKey;
}

async function listArchives() {
  return await redis.lrange(K.ARCHIVES, 0, -1);
}

async function getArchive(key) {
  const raw = await redis.get(key);
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

module.exports = {
  getNextId,
  addQuestion,
  getAllQuestions,
  getMeta,
  setMeta,
  resetAll,
  snapshot,
  listArchives,
  getArchive,
};
