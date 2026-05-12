# Management Meeting Q&A (Vercel + Upstash Redis)

Хурлын QR-аар асуулт цуглуулж, AI ашиглан хамгийн чухал 3 асуултыг сонгож харуулдаг систем.

**Annual Leadership Summit 2026** — Q&A 4 блок дараалуулан явуулах, илтгэл бүрд "Дараагийн" товчоор сэдэв шилжүүлэх боломжтой.

## Боломжууд

- 📱 QR код → утсаараа асуулт илгээх (мобайл хэлбэр)
- 🌐 Латин → Кирилл автомат хөрвүүлэгч (`marketingiin tusveg` → `маркетингийн төсөв`)
- 🤖 AI-ээр Top 3 сонголт (`google/gemini-2.5-flash`, OpenRouter-аар)
- 📝 AI грамматикийн алдааг засдаг (`тусвэг` → `төсөв`)
- 🎯 Q&A блок бүрийн сэдэв (Стратеги / Санхүү / Эрсдэл) AI-д контекст өгнө
- 🔢 Илтгэл #1, #2, #3 ... — өмнөх раунд асуултууд холилдохгүй
- 🎤 Гар оруулга (Admin өөрөө асуулт нэмэх) — оролцогчдод харагдахгүй
- 🖥 /display хуудас үзэгчдэд QR эсвэл Top 3 харуулна
- ☁️ Vercel дээр serverless, Upstash Redis-д state хадгална

## Deployment (Vercel + Upstash)

### 1. Repo-г Vercel-руу холбох

1. [Vercel.com](https://vercel.com) → Add New → Project → `mashbat1/management-meeting` repo сонгоно.
2. Build settings автомат таних.

### 2. Upstash Redis тохируулах

**Vercel KV ашиглах (хамгийн хялбар):**
1. Project Settings → Storage → Create → KV (Upstash)
2. Vercel автоматаар `KV_REST_API_URL`, `KV_REST_API_TOKEN` env-уудыг тохируулна.

**Эсвэл шууд Upstash:**
1. [console.upstash.com](https://console.upstash.com) → Create Redis database (Global/Regional)
2. REST URL ба Token-г хуулна
3. Vercel project → Settings → Environment Variables дээр:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 3. OpenRouter API key нэмэх

Vercel → Settings → Environment Variables дотор:

| Name | Value |
|------|-------|
| `OPENROUTER_API_KEY` | `sk-or-v1-...` ([openrouter.ai/keys](https://openrouter.ai/keys)) |
| `MODEL` | `google/gemini-2.5-flash` (зөвлөмж) |

### 4. Redeploy

Vercel автоматаар deployment эхэлнэ. Үүсэх URL: `https://management-meeting-xxx.vercel.app`

## Локал тест

```powershell
cd c:\Users\mashbat.b\Documents\management-meeting
npm install
copy .env.example .env
notepad .env
npm run dev
```

`.env` дотор:
```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...
OPENROUTER_API_KEY=sk-or-v1-...
MODEL=google/gemini-2.5-flash
PORT=4000
```

Дараа нь http://localhost:4000/ нээнэ.

## Файлын бүтэц

```
management-meeting/
├── api/
│   └── index.js          # Express app (Vercel serverless entry)
├── lib/
│   ├── redis.js          # Upstash Redis client
│   ├── state.js          # Redis-аар state хадгалах
│   ├── transliterate.js  # Latin → Cyrillic
│   └── openrouter.js     # AI prompt + API call
├── views/
│   ├── admin.html        # Admin хуудас
│   ├── ask.html          # Оролцогчийн утсаар нээх форм
│   └── display.html      # Projector-руу үзүүлэх дэлгэц
├── package.json
├── vercel.json
├── dev-server.js         # Локал тестийн сервер
├── .env.example
└── .gitignore
```

## Ашиглах урсгал (Annual Leadership Summit 2026)

1. **Хурлын өмнө**: Vercel deployment бэлэн болсон бол URL-ийг хадгална.
2. **Admin хуудас нээх**: `/` руу орно — өөрийн зөөврийн дэлгэц дээр.
3. **🖥 Үзүүлэх дэлгэц нээх**: Header дээрх товчийг дарж projector руу үзүүлнэ.
   - Цуглуулга үе шатанд → том QR + "Утсаараа QR кодыг скан хийнэ үү"
   - Top 3 сонгогдсон үед → 3 асуултын карт
4. **Q&A блок 1**: Сэдэв оруулна (жишээ: "Стратеги, AI/Технологи, Олон улсын зах зээл"). Оролцогчид утсаараа QR скан хийн асуултаа илгээнэ.
5. **"✓ ДУУСГАХ — AI-аар Top 3 сонгуулах"**: AI 3 асуултыг сонгож /display дэлгэц дээр гарна. Хөтлөгч уншиж, илтгэгчид хариулна.
6. **"✓ ДУУСГАХ — Дараагийн илтгэл рүү"**: Шинэ сэдэв оруулна (жишээ: "Санхүү, Борлуулалт 2026"). Илтгэл #2 эхэлнэ.
7. ... 4 блок дуустал.

## Tech stack

- **Backend**: Node.js + Express (serverless on Vercel)
- **State**: Upstash Redis (REST API)
- **AI**: OpenRouter → `google/gemini-2.5-flash`
- **Frontend**: Vanilla HTML/CSS/JS
- **QR**: `qrcode` npm package, server-side rendered
