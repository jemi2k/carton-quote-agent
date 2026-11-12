# Carton Quotation Agent

Turn a customer's inquiry — free text or a photo of a drawing — into an *approvable* corrugated-carton quote in seconds, instead of 1–3 days.

**Core principle:** the arithmetic never touches the LLM. Pricing and rule verification are deterministic code; DeepSeek only *reads* the inquiry (field extraction) and *writes* the explanation.

## How it works

Six nodes run per request:

| Node | Job | Runs on |
|------|-----|---------|
| N1 | Intake & cleaning (units → mm; image OCR) | Rules / vision model |
| N2 | Extract 12 fields → JSON (evidence + confidence) | DeepSeek text |
| N3 | Completeness gate (R01–R03, R08) | Rules |
| N4 | Pricing — 17-line cost + 5 quantity tiers | Code (`lib/engine.ts`) |
| N5 | Rule verification (R04–R07, R09–R11) | Rules |
| N6 | "Why this price" explanation + approval routing | DeepSeek + template |

A definite price is emitted only when the input is complete **and** every rule passes. Otherwise the agent returns a ±8% range, or a refusal (BLOCK / ASK / HUMAN).

## Run locally

```bash
npm install
cp .env.example .env   # then add your DEEPSEEK_API_KEY
npm run dev
```

Open <http://localhost:3000>. Without a key the app still runs in a rules-only fallback mode.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Text model for extraction & explanation (default `deepseek-chat`) |
| `DEEPSEEK_VISION_MODEL` | Vision model for image OCR (default `deepseek-flash`) |

## Deploy to Vercel

Import the repository on Vercel and set the four environment variables above. It's a standard Next.js app — no extra build config.

## Stack

Next.js 14 · TypeScript · Tailwind CSS · DeepSeek API. The pricing and rule engines are pure functions in `lib/`, fully deterministic and independently testable.
