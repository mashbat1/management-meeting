const MODEL = process.env.MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function buildPrompts(roundQuestions, currentRound, currentTopic) {
  const numbered = roundQuestions
    .map((q) => `[${q.id}] (${q.name}): ${q.question}`)
    .join('\n');

  const topicLine = currentTopic
    ? `\n\nCURRENT Q&A BLOCK TOPIC: "${currentTopic}"\nThe selected questions MUST be relevant to this topic. If a question is OFF-TOPIC (e.g. about HR/personal/admin matters when the topic is "Strategy"), do NOT select it even if otherwise interesting.`
    : '';

  const systemPrompt = `ROLE: You are an experienced facilitator for executive management meetings at a Mongolian company AND a meticulous Mongolian language editor. You will:
1. Select UP TO THREE genuinely valuable questions from the audience pool.
2. Rewrite each selected question into clean, grammatically correct, professional Mongolian.
3. Justify your choice in clear Mongolian.${topicLine}

═══ STEP 1: REJECT GARBAGE FIRST (MOST IMPORTANT) ═══

Before scoring anything, ELIMINATE all questions that are:
- Just laughter, emoji, or gibberish ("хахаха", "lol", "asdf", "🙂", "?", ".")
- Single ambiguous word ("Хүндэтгэе?", "Сайн?", "Яаж?")
- Empty or near-empty (under 4 meaningful words)
- Personal trivia about specific people ("Хуншагай хэдтэй вэ?", "Захирлын цалин хэд?", "Ямар машинтай?")
- Off-topic / personal complaints (cafeteria, gym, parking, dress code, weather)
- **COMPLAINTS DISGUISED AS QUESTIONS** (most important — see below)
- Compliments ("Сайн илтгэл байлаа", "Баярлалаа")
- Tests / placeholders ("test", "тест", "123", "asdf")

— RECOGNIZING "COMPLAINT DISGUISED AS QUESTION" —

A question is actually a COMPLAINT (reject!) if:
- It expresses dissatisfaction with style/format rather than seeking information.
- It implies the presenter did something wrong without proposing an alternative.
- It is rhetorical — the asker is not really expecting a useful answer.
- It would embarrass or shame the presenter rather than help them.

Examples to REJECT:
- "Илүү хөгжилтэй тавьж болохгүй юу?" → COMPLAINT about presentation style.
- "Яагаад ийм урт болоо вэ?" → COMPLAINT about length.
- "Илүү ойлгомжтой ярьж болохгүй юу?" → COMPLAINT about clarity.
- "Дахин нэг удаа ярих уу?" (sarcastic) → COMPLAINT.

— ACCEPTABLE "ENGAGEMENT QUESTIONS" —

Questions that invite reflection, summary, or dialogue ARE acceptable (just
score them BELOW substantive strategic questions). They build interaction
without being criticism.

Examples to ACCEPT as engagement (score low-medium):
- "Илтгэлийг нэг үгээр дүгнэвэл?" → ENGAGEMENT, invites summary.
- "Та хувийн бодлоор гол сургамж юу гэж бодож байна?" → ENGAGEMENT, invites reflection.
- "Та нараас юу хүсэх вэ?" → ENGAGEMENT, builds dialogue.

PRIORITY ORDER for selection:
1. SUBSTANTIVE STRATEGIC questions (strategy / finance / risk / customer / tech) — HIGHEST
2. SUBSTANTIVE OPERATIONAL questions (concrete process / decision questions) — HIGH
3. ENGAGEMENT questions (reflection / summary / dialogue invites) — MEDIUM/LOW
4. COMPLAINTS, garbage, off-topic — REJECT

If NONE of the questions pass this filter, return { "selected": [] }.

═══ STEP 2: DEDUPLICATE (CRITICAL) ═══

Group questions by what they're really asking. If TWO OR MORE questions are
asking the same thing — even with different wording — keep ONLY ONE (the
best-phrased / most specific). NEVER select two near-duplicates.

Examples that count as duplicates (pick ONE):
- "Маркетингийн төсөв хэд вэ?" ≈ "2026 онд маркетингт хэдэн төгрөг зарцуулах вэ?"
  → Both ask about marketing budget. Pick the clearer one only.
- "CRM системийг хэзээ солих вэ?" ≈ "Шинэ CRM хэзээ нэвтрэх вэ?"
  → Both ask about CRM timeline. Pick the better one only.
- "Хүний нөөц яаж сайжруулах вэ?" ≈ "HR стратеги ямар вэ?"
  → Both ask about HR. Pick the clearer one only.

When in doubt about whether two are duplicates: read both and ask yourself
"would the leader's answer to one ALSO answer the other?" — if yes, they're
duplicates.

Special case — MANY DUPLICATES (e.g. 5 questions all asking about the same
topic): pick ONLY THE SINGLE BEST-PHRASED ONE (most specific, clearest,
most actionable). Then look for OTHER, UNRELATED substantive questions to
fill up to 3. If no other substantive questions exist, return just that 1.

Example: If 5 questions are all about "What's the marketing budget for
2026?", pick only the clearest one. Do NOT pick 2 or 3 versions of the
same question — that wastes the audience's time.

═══ STEP 3: AMONG SURVIVING NON-DUPLICATES, SCORE BY ═══

1. TOPIC FIT — fits the Q&A block topic.
2. STRATEGIC IMPACT — affects company direction, revenue, customers, structure, major teams.
3. BROAD RELEVANCE — interests most attendees, not one person.
4. ACTIONABILITY — leadership can give a concrete answer in a meeting.
5. CLARITY — well-formed question with clear intent.
6. ANGLE DIVERSITY — the final 2-3 picks MUST cover DIFFERENT subject areas
   (e.g. one about strategy, one about operations, one about people) — NEVER
   three questions on the same theme.

═══ STEP 4: RETURN AT MOST 3 ═══

- It is **MUCH BETTER to return 1 excellent question** than 3 mediocre ones.
- It is **MUCH BETTER to return 2 good questions** than to pad with a weak third.
- NEVER include a question just to reach 3. Quality > quantity.
- If only 1 substantive question exists, return that 1.
- If 0 substantive questions exist, return [].

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
    { "id": <id>, "cleaned_question": "<...>", "reason": "<...>" }
  ]
}

The "selected" array can have 0, 1, 2, or 3 items — NEVER more than 3.
Return an empty array [] if NO questions are substantive enough.
Never invent or repeat ids. Use ONLY the integer IDs shown in the input list.`;

  const topicHint = currentTopic
    ? `\n\nЭнэ Q&A блокын сэдэв: "${currentTopic}". Зөвхөн энэ сэдэвт хамаарах асуултуудыг сонго; сэдэв сэргээх боломжгүй асуултуудыг хая.`
    : '';

  const userPrompt = `Доорх нь хурлын оролцогчдоос ирсэн асуултууд. Илтгэл #${currentRound}-ийн дараа цуглуулсан.${topicHint}

${numbered}

ХАТУУ ШААРДЛАГА:
1. ⛔ ЭХЛЭЭД хаягдал асуултыг шүүж хая: "хахаха", "тест", нэг үгтэй асуулт ("Хүндэтгэе?"), инээдэм, мэндчилгээ, хувийн тоомжгүй асуулт ("X хүн хэдтэй вэ"), off-topic.
2. 🚫 **Ижил утгатай 2 асуултыг хэзээ ч зэрэг сонгох ёсгүй.** Хоёр асуулт ижил зүйл асууж байвал зөвхөн **нэгийг** (илүү тодорхой/тохирсон) сонго.
3. ✅ Дараа нь зөвхөн **бодит чухал, ойлгомжтой, удирдлагаас хариулт хүлээж буй** асуултыг сонго.
4. **3-ыг хүчээр гүйцээх ёсгүй.** 1 чанартай байвал 1, 2 байвал 2, 0 байвал хоосон массив [] буцаа.
5. Сонгосон асуултууд **ӨӨР ӨӨР сэдэв** хамарсан байх ёстой (стратеги/санхүү/харилцагч гэх мэт).
6. ID нь жагсаалтад байгаа integer-уудаас л байх ёстой.
7. "cleaned_question" болон "reason" — алдаагүй монгол хэлээр.

Зөвхөн дараах JSON форматаар хариул:

{ "selected": [ { "id": <ID>, "cleaned_question": "...", "reason": "..." } ] }

(0–3 item-тэй массив. Зэрэг чанартай биш бол ХАСААД хэвээр үлдээгээрэй.)`;

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
  if (!raw || typeof raw !== 'string') {
    console.error('[parseSelection] empty/non-string raw:', raw);
    throw new Error('AI хариу хоосон байна.');
  }

  // Strip markdown code fences if AI wrapped output
  let cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Find the outermost JSON — either object or array
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e1) {
    // Try greedy match for object
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]); }
      catch (e2) {
        console.error('[parseSelection] JSON parse failed. Raw:', raw.slice(0, 500));
        throw new Error('AI-н хариунаас JSON олдсонгүй: ' + e2.message);
      }
    } else {
      // Try array match
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { parsed = JSON.parse(arrMatch[0]); }
        catch (e3) {
          console.error('[parseSelection] JSON parse failed. Raw:', raw.slice(0, 500));
          throw new Error('AI-н хариунаас JSON олдсонгүй.');
        }
      } else {
        console.error('[parseSelection] No JSON in raw:', raw.slice(0, 500));
        throw new Error('AI хариунд JSON олдсонгүй. Raw: ' + raw.slice(0, 100));
      }
    }
  }

  // Extract selection array — try multiple field names + top-level array
  let selectedArr = null;
  if (Array.isArray(parsed)) {
    selectedArr = parsed;
  } else if (parsed && typeof parsed === 'object') {
    selectedArr = parsed.selected || parsed.items || parsed.questions
      || parsed.results || parsed.choices || parsed.result
      || (parsed.data && (parsed.data.selected || parsed.data.items));
    // Sometimes nested one more level
    if (selectedArr && !Array.isArray(selectedArr) && typeof selectedArr === 'object') {
      selectedArr = selectedArr.selected || selectedArr.items || null;
    }
  }

  if (!Array.isArray(selectedArr)) {
    console.error('[parseSelection] No valid selection array. Parsed:', JSON.stringify(parsed).slice(0, 500));
    throw new Error('AI буруу формат буцаав. Хариу: ' + JSON.stringify(parsed).slice(0, 200));
  }
  // Empty array is valid: AI judged no question worth selecting
  if (selectedArr.length === 0) {
    console.log('[parseSelection] AI returned empty selection — no substantive questions');
    return [];
  }

  const items = selectedArr
    .slice(0, 3)
    .map((sel) => {
      if (!sel || typeof sel !== 'object') return null;
      // ID might be under different names
      const id = sel.id ?? sel.question_id ?? sel.qid;
      const q = roundQuestions.find((x) => x.id === Number(id));
      if (!q) {
        console.warn('[parseSelection] selection id', id, 'not found in round questions');
        return null;
      }
      const cleanedQ = String(sel.cleaned_question || sel.question || sel.text || '').trim();
      const reason = String(sel.reason || sel.explanation || sel.why || '').trim();
      return {
        ...q,
        cleanedQuestion: cleanedQ || null,
        displayQuestion: cleanedQ || q.question,
        reason,
      };
    })
    .filter(Boolean);

  // If AI returned IDs but none matched, that's a bug worth surfacing
  if (items.length === 0 && selectedArr.length > 0) {
    console.error('[parseSelection] No matched ids. selectedArr:', JSON.stringify(selectedArr).slice(0, 300), 'round ids:', roundQuestions.map((q) => q.id));
    throw new Error('AI сонгосон асуултын ID жагсаалтанд таарсангүй.');
  }
  return items;
}

// ============================================================
// SINGLE QUESTION CLEANER (called at submit time)
// Latin-transliterated or messy Cyrillic → clean Mongolian
// ============================================================
async function cleanQuestionWithAI(text) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing');

  const systemPrompt = `You are a Mongolian language editor for a corporate Q&A system. Your only job: take ONE incoming question and return its clean, grammatically correct Mongolian Cyrillic form.

Examples of what you must do:
- "cinii ner hen be" → "Чиний нэр хэн бэ?"
- "Marketingiin tusveg ymar baigaa ve?" → "Маркетингийн төсөв ямар байгаа вэ?"
- "Bid CRM systemee solih uu?" → "Бид CRM системээ солих уу?"
- "Сайн байна уу?" → "Сайн байна уу?" (already correct, return as-is)
- "тусвэг" → "төсөв" (fix transliteration artifacts)
- "What is the marketing budget?" → "Маркетингийн төсөв хэд вэ?" (translate English to Mongolian)

Rules:
- Apply correct Mongolian grammar (case suffixes — харьяалал/үйлдэх/гарах/чиглэх/орших/үзэгдэх; vowel harmony; verb conjugations).
- Use the correct Cyrillic letters — ESPECIALLY: ө vs о, ү vs у, и vs й, е vs э, ё vs ьо.
- DO NOT do letter-by-letter substitution; understand the meaning first.
- Common Latin shortcuts: "ci"="чи", "ts"="ц", "ch"="ч", "sh"="ш", "kh"="х", "yo"="ё", "yu"="ю", "ya"="я".
- Preserve the asker's intent. Do not add new information.
- Fix typos. Add ending question mark (уу?/үү?/вэ?) if grammatically warranted.
- Keep proper nouns/English acronyms as-is when appropriate (CRM, ROI, AI, KPI...).

CRITICAL OUTPUT FORMAT:
Return ONLY the cleaned Mongolian Cyrillic text — one line, no quotes, no JSON, no markdown, no preamble, no explanation. Just the cleaned text.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://management-meeting.vercel.app',
      'X-Title': 'Management Meeting QR Cleaner',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Cleaner API error (${res.status}): ${raw.slice(0, 200)}`);
  const data = JSON.parse(raw);
  let cleaned = (data.choices?.[0]?.message?.content || '').trim();
  // Strip wrapping quotes if AI returned with them
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Strip "Cleaned:" / "Output:" prefixes if AI added them
  cleaned = cleaned.replace(/^(Cleaned|Output|Result|Answer)\s*[:\-]\s*/i, '').trim();
  return cleaned || text;
}

module.exports = { buildPrompts, callOpenRouter, parseSelection, cleanQuestionWithAI, MODEL };
