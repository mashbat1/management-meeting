const MODEL = process.env.MODEL || 'google/gemini-2.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function buildPrompts(roundQuestions, currentRound, currentTopic) {
  const numbered = roundQuestions
    .map((q) => `[${q.id}] (${q.name}): ${q.question}`)
    .join('\n');

  const topicLine = currentTopic
    ? `\n\nCURRENT Q&A BLOCK TOPIC: "${currentTopic}"\nThe selected questions MUST be relevant to this topic. If a question is OFF-TOPIC (e.g. about HR/personal/admin matters when the topic is "Strategy"), do NOT select it even if otherwise interesting.`
    : '';

  const systemPrompt = `ROLE: You are an experienced facilitator for executive management meetings at a Mongolian company AND a meticulous Mongolian language editor. You will:
1. Select the THREE most impactful questions from the audience pool.
2. Rewrite each selected question into clean, grammatically correct, professional Mongolian.
3. Justify your choice in clear Mongolian.${topicLine}

SELECTION CRITERIA (priority order):
1. TOPIC FIT — Question must fit the current Q&A block topic (see CURRENT Q&A BLOCK TOPIC above, if specified).
2. STRATEGIC IMPACT — Affects company direction, revenue, customers, organizational structure, or major teams.
3. BROAD RELEVANCE — Concerns most attendees, not just one person or a small group.
4. ACTIONABILITY — Leadership can give a meaningful, concrete answer in a meeting setting.
5. CLARITY — Intent is unambiguous (after you mentally clean up any spelling/transliteration noise).
6. ANGLE DIVERSITY — The three selected questions should cover DIFFERENT angles or sub-aspects within the topic, not three near-duplicates.

AVOID:
- Trivial/personal questions (cafeteria, gym, parking, weather, dress code).
- Disguised complaints or rhetorical gripes.
- Hostile, divisive, or politically charged questions.
- Among duplicates: pick ONLY the best one; never double-pick the same topic.

LANGUAGE CLEANUP (for cleaned_question field):
Some incoming questions were auto-transliterated from Latin and contain spelling errors (e.g. "тусвэг" instead of "төсөв", "сйстэм" instead of "систем", "ймар" instead of "ямар"). Your task in cleaned_question is to:
- Fix all spelling errors and broken transliterations.
- Apply correct Mongolian grammar: proper case suffixes, verb conjugations, vowel harmony.
- Use the correct Cyrillic letters — especially ө vs о, ү vs у, и vs й, е vs э.
- Replace casual or transliterated foreign terms with their proper Mongolian or commonly-accepted Cyrillic forms.
- Make the wording concise, professional, and meeting-appropriate.
- Preserve the asker's intent — do NOT add new information or change the meaning.

REASON FIELD:
- Must be 1-2 sentences in clean, grammatically correct Mongolian.
- Use proper case suffixes and vowel harmony.
- Explain CONCRETELY why this question deserves leadership's time and why you chose it over similar candidates.
- No transliterated Latin words. No spelling errors.
- Professional tone befitting an executive meeting.

OUTPUT FORMAT (EXACTLY this JSON, nothing else — no markdown fences, no extra text):
{
  "selected": [
    { "id": <id>, "cleaned_question": "<...>", "reason": "<...>" },
    { "id": <id>, "cleaned_question": "<...>", "reason": "<...>" },
    { "id": <id>, "cleaned_question": "<...>", "reason": "<...>" }
  ]
}

If fewer than 3 valid on-topic questions exist, return only the valid ones. Never invent or repeat ids.`;

  const topicHint = currentTopic
    ? `\n\nЭнэ Q&A блокын сэдэв: "${currentTopic}". Зөвхөн энэ сэдэвт хамаарах асуултуудыг сонго; сэдэв сэргээх боломжгүй асуултуудыг хая.`
    : '';

  const userPrompt = `Доорх жагсаалт нь хурлын оролцогчдоос ирсэн асуултууд. Илтгэл #${currentRound}-ийн дараа цуглуулсан. Зарим асуултын үсэг бичлэг латин транслитерациас болж буруу байж болно — тийм асуултуудыг сонгох үед "cleaned_question" талбарт зөв монгол хэлээр сайжруулна.${topicHint}

${numbered}

ШААРДЛАГА:
- Зөвхөн дээрх жагсаалтанд буй ID-уудаас сонгоно (зохиомол ID битгий гарга).
- 3 хүртэлх асуулт сонгоно (хэрэв тохирох асуулт цөөн бол цөөн буцаа).
- Сонгосон асуултууд ӨӨР ӨӨР өнцгийг хамарсан байх ёстой.
- "cleaned_question" болон "reason" талбаруудыг ЗААВАЛ грамматик зөв, алдаагүй монгол хэлээр бич.
- Зөвхөн доорх JSON форматаар хариул:

{
  "selected": [
    { "id": <ID>, "cleaned_question": "<...>", "reason": "<...>" },
    { "id": <ID>, "cleaned_question": "<...>", "reason": "<...>" },
    { "id": <ID>, "cleaned_question": "<...>", "reason": "<...>" }
  ]
}`;

  return { systemPrompt, userPrompt };
}

async function callOpenRouter({ systemPrompt, userPrompt }) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set.');
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://management-meeting.vercel.app',
      'X-Title': 'Management Meeting QR',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenRouter API error (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content || '';
  return { content: content.trim(), model: MODEL };
}

function parseSelection(raw, roundQuestions) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI-н хариунаас JSON олдсонгүй.');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed.selected) || parsed.selected.length === 0) {
    throw new Error('AI буруу формат буцаав.');
  }
  const items = parsed.selected
    .slice(0, 3)
    .map((sel) => {
      const q = roundQuestions.find((x) => x.id === sel.id);
      if (!q) return null;
      const cleaned = (sel.cleaned_question || '').trim();
      return {
        ...q,
        cleanedQuestion: cleaned || null,
        displayQuestion: cleaned || q.question,
        reason: (sel.reason || '').trim(),
      };
    })
    .filter(Boolean);
  if (items.length === 0) throw new Error('AI сонгосон асуулт жагсаалтанд олдсонгүй.');
  return items;
}

module.exports = { buildPrompts, callOpenRouter, parseSelection, MODEL };
