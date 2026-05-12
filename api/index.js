const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const state = require('../lib/state');
const { isMostlyLatin, transliterate } = require('../lib/transliterate');
const { buildPrompts, callOpenRouter, parseSelection, MODEL } = require('../lib/openrouter');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

// ============ Static views ============
const VIEWS_DIR = path.join(__dirname, '..', 'views');
app.get('/', (req, res) => res.sendFile(path.join(VIEWS_DIR, 'admin.html')));
app.get('/ask', (req, res) => res.sendFile(path.join(VIEWS_DIR, 'ask.html')));
app.get('/display', (req, res) => res.sendFile(path.join(VIEWS_DIR, 'display.html')));

function publicAskUrl(req) {
  const explicit = process.env.PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, '') + '/ask';
  const host = process.env.VERCEL_URL || req.get('host');
  const proto = req.get('x-forwarded-proto') || (host && host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/ask`;
}

// ============ QR ============
app.get('/api/qr', async (req, res) => {
  try {
    const url = publicAskUrl(req);
    const qr = await QRCode.toDataURL(url, { width: 480, margin: 2 });
    res.json({ qr, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Submit a question ============
app.post('/api/questions', async (req, res) => {
  try {
    const { name, question, source } = req.body || {};
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Асуулт хэт богино байна.' });
    }
    if (question.length > 1000) {
      return res.status(400).json({ error: 'Асуулт хэт урт байна (1000 тэмдэгтээс хэтрэхгүй).' });
    }
    const rawQuestion = question.trim();
    const rawName = (name && String(name).trim().slice(0, 80)) || 'Нэргүй';
    const wasLatin = isMostlyLatin(rawQuestion);
    const finalQuestion = wasLatin ? transliterate(rawQuestion) : rawQuestion;
    const finalName = isMostlyLatin(rawName) ? transliterate(rawName) : rawName;

    const meta = await state.getMeta();
    const id = await state.getNextId();
    const entry = {
      id,
      round: meta.currentRound || 1,
      name: finalName,
      question: finalQuestion,
      originalLatin: wasLatin ? rawQuestion : null,
      source: source === 'manual' ? 'manual' : 'qr',
      createdAt: new Date().toISOString(),
    };
    await state.addQuestion(entry);
    res.json({ ok: true, id: entry.id, transliterated: wasLatin });
  } catch (err) {
    console.error('POST /api/questions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ List questions ============
app.get('/api/questions', async (req, res) => {
  try {
    const [questions, meta] = await Promise.all([state.getAllQuestions(), state.getMeta()]);
    const currentRound = meta.currentRound || 1;
    res.json({
      count: questions.length,
      currentRound,
      currentTopic: meta.currentTopic || '',
      currentRoundCount: questions.filter((q) => (q.round || 1) === currentRound).length,
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Top X ============
app.get('/api/top2', async (req, res) => {
  try {
    const meta = await state.getMeta();
    res.json({
      topTwo: meta.topTwo || null,
      currentRound: meta.currentRound || 1,
      currentTopic: meta.currentTopic || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Topic ============
app.post('/api/topic', async (req, res) => {
  try {
    const t = (req.body && typeof req.body.topic === 'string') ? req.body.topic.trim().slice(0, 200) : '';
    const meta = await state.getMeta();
    meta.currentTopic = t;
    await state.setMeta(meta);
    res.json({ ok: true, currentTopic: t });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Next round ============
app.post('/api/next-round', async (req, res) => {
  try {
    const meta = await state.getMeta();
    meta.currentRound = (meta.currentRound || 1) + 1;
    meta.topTwo = null;
    const newTopic = (req.body && typeof req.body.topic === 'string') ? req.body.topic.trim().slice(0, 200) : '';
    meta.currentTopic = newTopic;
    await state.setMeta(meta);
    res.json({ ok: true, currentRound: meta.currentRound, currentTopic: meta.currentTopic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ Reset (full wipe) ============
app.post('/api/reset', async (req, res) => {
  try {
    await state.resetAll();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ AI select (Top 3) ============
app.post('/api/select', async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY .env файлд тохируулагдаагүй байна.' });
    }
    const [questions, meta] = await Promise.all([state.getAllQuestions(), state.getMeta()]);
    const currentRound = meta.currentRound || 1;
    const currentTopic = meta.currentTopic || '';
    const roundQuestions = questions.filter((q) => (q.round || 1) === currentRound);

    if (roundQuestions.length === 0) {
      return res.status(400).json({ error: `Илтгэл #${currentRound}-д сонгох асуулт алга байна.` });
    }
    if (roundQuestions.length === 1) {
      const q = roundQuestions[0];
      const topTwo = {
        round: currentRound,
        topic: currentTopic || null,
        selectedAt: new Date().toISOString(),
        items: [{ ...q, displayQuestion: q.question, reason: 'Зөвхөн нэг асуулт ирсэн тул шууд сонгогдов.' }],
      };
      meta.topTwo = topTwo;
      await state.setMeta(meta);
      return res.json({ ok: true, topTwo });
    }

    const { systemPrompt, userPrompt } = buildPrompts(roundQuestions, currentRound, currentTopic);
    const { content } = await callOpenRouter({ systemPrompt, userPrompt });
    const items = parseSelection(content, roundQuestions);

    const topTwo = {
      round: currentRound,
      topic: currentTopic || null,
      selectedAt: new Date().toISOString(),
      model: MODEL,
      items,
    };
    meta.topTwo = topTwo;
    await state.setMeta(meta);
    res.json({ ok: true, topTwo });
  } catch (err) {
    console.error('POST /api/select error:', err);
    res.status(500).json({ error: err.message || 'AI дуудах үед алдаа гарлаа.' });
  }
});

// 404 fallback for unknown API paths
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found: ' + req.path });
});

module.exports = app;
