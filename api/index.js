const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const state = require('../lib/state');
const { isMostlyLatin, transliterate } = require('../lib/transliterate');
const { buildPrompts, callOpenRouter, parseSelection, cleanQuestionWithAI, MODEL } = require('../lib/openrouter');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

// Health check — useful for diagnosing missing env vars on Vercel
app.get('/api/health', (req, res) => {
  const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)
    && !!(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN);
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  res.json({
    ok: hasRedis && hasOpenRouter,
    redis: hasRedis ? 'configured' : 'MISSING — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN',
    openrouter: hasOpenRouter ? 'configured' : 'MISSING — set OPENROUTER_API_KEY',
    model: process.env.MODEL || 'openai/gpt-4o-mini',
    vercelUrl: process.env.VERCEL_URL || null,
  });
});

// ============ Static views ============
const VIEWS_DIR = path.join(__dirname, '..', 'views');
// Root → /display (audience-facing). Admin is at /admin (private).
app.get('/', (req, res) => res.redirect('/display'));
app.get('/admin', (req, res) => res.sendFile(path.join(VIEWS_DIR, 'admin.html')));
app.get('/ask', (req, res) => res.sendFile(path.join(VIEWS_DIR, 'ask.html')));
app.get('/display', (req, res) => res.sendFile(path.join(VIEWS_DIR, 'display.html')));

function publicAskUrl(req) {
  // Explicit override always wins
  const explicit = process.env.PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, '') + '/ask';
  // Prefer the actual host the request came in on (main alias like
  // management-meeting.vercel.app) over VERCEL_URL (which is the per-deployment
  // preview hostname like management-meeting-p9o4jy6i1-mashbat1s-projects.vercel.app
  // — that hostname can be subject to Vercel Deployment Protection).
  const host = req.get('host') || process.env.VERCEL_URL;
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
async function cleanQuestionSafely(raw) {
  // Prefer AI cleaning (handles transliteration + grammar correctly).
  // Fall back to simple letter-by-letter transliteration if AI fails.
  try {
    if (process.env.OPENROUTER_API_KEY) {
      const cleaned = await cleanQuestionWithAI(raw);
      if (cleaned && cleaned.trim()) return cleaned.trim();
    }
  } catch (err) {
    console.warn('AI clean failed, falling back to transliteration:', err.message);
  }
  return isMostlyLatin(raw) ? transliterate(raw) : raw;
}

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

    // AI translates/cleans the question to proper Mongolian (handles 'cinii ner hen be' → 'Чиний нэр хэн бэ?')
    const finalQuestion = await cleanQuestionSafely(rawQuestion);
    // Names are usually short and ambiguous — keep simple transliteration for them
    const finalName = isMostlyLatin(rawName) ? transliterate(rawName) : rawName;

    const meta = await state.getMeta();
    const id = await state.getNextId();
    const entry = {
      id,
      round: meta.currentRound || 1,
      name: finalName,
      question: finalQuestion,
      originalRaw: rawQuestion !== finalQuestion ? rawQuestion : null,
      source: source === 'manual' ? 'manual' : 'qr',
      createdAt: new Date().toISOString(),
    };
    await state.addQuestion(entry);
    res.json({ ok: true, id: entry.id, finalQuestion });
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
    const thinkingUntil = meta.thinkingUntil || 0;
    const thinkingRemainingMs = Math.max(0, thinkingUntil - Date.now());
    res.json({
      topTwo: meta.topTwo || null,
      currentRound: meta.currentRound || 1,
      currentTopic: meta.currentTopic || '',
      thinking: thinkingRemainingMs > 0,
      thinkingRemainingMs,
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
    meta.thinkingUntil = 0;
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

// ============ MANUAL select (admin picks IDs themselves) ============
app.post('/api/select-manual', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Сонгох асуулт алга байна.' });
    }
    if (ids.length > 6) {
      return res.status(400).json({ error: 'Хамгийн ихдээ 6 асуулт сонгоно.' });
    }
    const [questions, meta] = await Promise.all([state.getAllQuestions(), state.getMeta()]);
    const currentRound = meta.currentRound || 1;
    const currentTopic = meta.currentTopic || '';
    const roundQuestions = questions.filter((q) => (q.round || 1) === currentRound);

    // Preserve user-given order
    const items = ids
      .map((id) => roundQuestions.find((q) => q.id === Number(id)))
      .filter(Boolean)
      .map((q) => ({
        ...q,
        displayQuestion: q.question,
        reason: 'Зохион байгуулагч гар аргаар сонгов.',
      }));

    if (items.length === 0) {
      return res.status(400).json({ error: 'Сонгосон асуултын ID олдсонгүй.' });
    }

    const topTwo = {
      round: currentRound,
      topic: currentTopic || null,
      selectedAt: new Date().toISOString(),
      manual: true,
      items,
    };
    meta.topTwo = topTwo;
    meta.thinkingUntil = 0; // skip the AI-thinking animation for manual picks
    await state.setMeta(meta);
    res.json({ ok: true, topTwo });
  } catch (err) {
    console.error('POST /api/select-manual error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ AI select (Top 3) ============
const MIN_THINKING_MS = 10500; // 10 секундын турш display дээр AI thinking харагдана

// Fallback when AI fails — pick the most substantive questions by length+word count.
// Garbage like "Хахаха" or "Хүндэтгэе?" naturally falls to the bottom.
function pickFallbackByLength(roundQuestions, max) {
  const scored = roundQuestions
    .map((q) => {
      const text = String(q.question || '');
      const words = text.trim().split(/\s+/).filter(Boolean);
      // Heuristic substance score: words × log(length) — penalize 1-3 word answers
      const score = words.length >= 4 ? words.length * Math.log(text.length + 1) : 0;
      return { q, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ q }) => ({
      ...q,
      displayQuestion: q.question,
      reason: 'AI сонголт хийгээгүй тул хамгийн утга чанартай асуултуудыг сонгов.',
    }));
  return scored;
}

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

    // Mark thinking state immediately so /display can switch view
    meta.thinkingUntil = Date.now() + MIN_THINKING_MS;
    meta.topTwo = null;
    await state.setMeta(meta);

    // ALWAYS run AI selection — even for 1 question — so garbage like
    // "jajajjaj" or "хахаха" gets filtered out instead of being shown verbatim.
    let items;
    const { systemPrompt, userPrompt } = buildPrompts(roundQuestions, currentRound, currentTopic);
    const { content } = await callOpenRouter({ systemPrompt, userPrompt });
    console.log('[/api/select] AI raw response:', content.slice(0, 400));
    try {
      items = parseSelection(content, roundQuestions);
    } catch (parseErr) {
      // Fallback: AI couldn't parse — pick by substance (longer = more likely meaningful)
      console.error('[/api/select] parseSelection failed, using length-based fallback:', parseErr.message);
      items = pickFallbackByLength(roundQuestions, 3);
    }

    // AI returned [] — try length-based fallback first. If THAT also returns
    // nothing (i.e. all questions are short / garbage like 'jajajjaj'), don't
    // pretend we found something — show admin a clear error.
    if (items.length === 0) {
      console.log('[/api/select] AI returned empty — trying length-based fallback');
      items = pickFallbackByLength(roundQuestions, 2);
    }

    // Re-fetch meta in case other writes happened
    const meta2 = await state.getMeta();
    const topTwo = {
      round: currentRound,
      topic: currentTopic || null,
      selectedAt: new Date().toISOString(),
      model: MODEL,
      items,
      noQuestions: items.length === 0, // signal to /display: show "no questions" card
    };
    meta2.topTwo = topTwo;
    // Keep thinkingUntil — display will honor the 5.5s minimum
    await state.setMeta(meta2);

    if (items.length === 0) {
      console.log('[/api/select] No substantive questions — showing empty-state card');
    }

    const thinkingRemainingMs = Math.max(0, (meta2.thinkingUntil || 0) - Date.now());
    res.json({ ok: true, topTwo, thinkingRemainingMs });
  } catch (err) {
    console.error('POST /api/select error:', err);
    // Clear thinking flag on error
    try {
      const m = await state.getMeta();
      m.thinkingUntil = 0;
      await state.setMeta(m);
    } catch {}
    res.status(500).json({ error: err.message || 'AI дуудах үед алдаа гарлаа.' });
  }
});

// 404 fallback for unknown API paths
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found: ' + req.path });
});

module.exports = app;
