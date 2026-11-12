// DeepSeek API client (OpenAI-compatible). Used only for N2 field extraction
// and N6 explanation — never for arithmetic.

import type { Fields, FieldMeta, Explanation } from "./types";

export function deepseekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export async function chatCompletion(
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number } = {}
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not configured");

  const base = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: opts.temperature ?? 0,
        stream: false,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

const EXTRACT_SYSTEM = `You are the field-extraction node of a carton-quotation agent.
Your ONLY job: read a customer inquiry and return a strict JSON object of structured fields.
Do not judge, compute, advise, or estimate any price.

Extract these fields (use null for anything missing — never invent a number):
- D, W, H: box dimensions in millimetres (length × width × height). Normalise cm→×10, inch→×25.4.
- qty: order quantity (integer)
- combo: board combination, e.g. "5BC175" (5-ply BC flute, 175 g). If the text only says "5-ply" without grammage, return "5BC175" with confidence 0.6.
- colors: number of print colours; 0 if explicitly "unprinted". If only "print logo" with no number, return null.
- method: "flexo" or "offset" (default "flexo")
- delivery_days: integer days, or null
- incoterm: "EXW" | "FOB" | "CIF" (default "EXW")
- artwork_ready: boolean, or null
- customer_id: string, or null
- surface: string, or null
- unit: original unit "mm"/"cm"/"inch" (default "mm")
- note: free text

For EVERY field return: "value" (extracted value or null), "evidence" (exact source snippet), "confidence" (0..1).

Return ONLY a JSON object shaped exactly like:
{"fields": {"D": {"value": 400, "evidence": "400×300×250 mm", "confidence": 0.98}, "W": {...}, ...}}

Hard rules:
- Never perform any multiplication, division or price estimation.
- Every number must appear verbatim in the source text (thousands separators may differ). If a number does not appear, set value null and confidence 0.
- Use null for missing values — never 0 (except colours = 0 only when the text says "unprinted").
- Dimensions with "×" but no unit are millimetres.`;

const EXTRACT_USER = (text: string) => `Customer inquiry:\n"""\n${text}\n"""\n\nExtract the fields as JSON.`;

interface RawField {
  value?: unknown;
  evidence?: unknown;
  confidence?: unknown;
}

function coerce(raw: Record<string, RawField> | undefined): Fields {
  const out: Fields = {};
  if (!raw) return out;

  const num = (v: unknown): number | null =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
  const conf = (v: unknown): number => {
    const n = typeof v === "number" ? v : 0;
    return Math.max(0, Math.min(1, n));
  };

  for (const key of ["D", "W", "H", "qty", "colors", "delivery_days"]) {
    const r = raw[key];
    if (!r) continue;
    out[key] = { value: num(r.value), evidence: str(r.evidence) ?? "", confidence: conf(r.confidence) };
  }
  for (const key of ["combo", "method", "incoterm", "customer_id", "surface", "unit", "note"]) {
    const r = raw[key];
    if (!r) continue;
    out[key] = { value: str(r.value), evidence: str(r.evidence) ?? "", confidence: conf(r.confidence) };
  }
  const art = raw["artwork_ready"];
  if (art) out["artwork_ready"] = { value: bool(art.value), evidence: str(art.evidence) ?? "", confidence: conf(art.confidence) };

  return out;
}

export async function extractFields(text: string): Promise<Fields> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const content = await chatCompletion(EXTRACT_SYSTEM, EXTRACT_USER(text), {
        json: true,
        temperature: attempt === 0 ? 0 : 0.3,
      });
      const parsed = JSON.parse(content);
      const fields = coerce(parsed?.fields);
      if (Object.keys(fields).length > 0) return fields;
      lastErr = new Error("empty extraction");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("extraction failed");
}

const EXPLAIN_SYSTEM = `You are the explanation node of a carton-quotation agent. Given a priced quote, write three short paragraphs. You may ONLY cite numbers that appear verbatim in the input JSON. Do not introduce any new number and do not compute anything.

Return ONLY a JSON object with exactly:
{"customer": "...", "internal": "...", "approval": "..."}

- "customer": 2-3 sentences a customer accepts, explaining why the price is what it is and that it falls with larger quantities.
- "internal": a cost-structure summary a sales manager can defend.
- "approval": who must approve (from the input), or "None".

Tone: professional, factual, concise. No marketing exaggeration, no guarantees about lead time.`;

export async function explainQuote(input: Record<string, unknown>): Promise<Explanation> {
  const content = await chatCompletion(EXPLAIN_SYSTEM, JSON.stringify(input, null, 2), {
    json: true,
    temperature: 0.2,
  });
  const parsed = JSON.parse(content);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    customer: s(parsed.customer),
    internal: s(parsed.internal),
    approval: s(parsed.approval),
  };
}

// Image input → plain text, via the vision model (deepseek-flash).
// We deliberately ask it only to *read*, not to map fields — its text reading
// is reliable, while its D/W/H mapping was shown to swap dimensions.
const VISION_PROMPT =
  "Extract all the text, numbers, dimensions, units, board types, colours and " +
  "quantities visible in this carton inquiry or drawing. Transcribe them exactly " +
  "as written, in reading order, preserving dimension format like \"400 x 300 x 250 mm\". " +
  "Do not interpret, compute or reorder anything.";

export async function readImageText(imageDataUrl: string): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not configured");

  const base = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DeepSeek vision ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}
