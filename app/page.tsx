"use client";

import { useEffect, useRef, useState } from "react";
import { SAMPLES } from "@/lib/samples";
import { matchedTier } from "@/lib/engine";
import type { QuoteResult } from "@/lib/types";
import NodeTimeline from "@/components/NodeTimeline";
import FieldGrid from "@/components/FieldGrid";
import RulesPanel from "@/components/RulesPanel";
import PriceBreakdown from "@/components/PriceBreakdown";

// Downscale an image data URL so it stays under the serverless body limit and
// costs fewer vision tokens (the vision model resamples to ~800px anyway).
function downscaleDataUrl(dataUrl: string, maxSide = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale === 1) return resolve(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not read this image file."));
    img.src = dataUrl;
  });
}

const NODE_NAMES = [
  "Intake & cleaning",
  "Field extraction",
  "Completeness check",
  "Pricing engine",
  "Rule verification",
  "Quote & explanation",
];

function headline(result: QuoteResult): { title: string; sub: string; tone: string } {
  if (result.status === "block") {
    return {
      title: "Refused — cannot quote yet",
      sub: "Required information is missing or out of scope.",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (result.status === "range") {
    const r = result.range!;
    return {
      title: `Estimated ${r.low.toFixed(2)} – ${r.high.toFixed(2)} CNY / pc`,
      sub: "±8% — lock the board type and colours to get a definite price.",
      tone: "border-amber-300 bg-amber-50 text-amber-800",
    };
  }
  const qty = Number(result.fields.qty?.value) || 0;
  const t = matchedTier(result.pricing!, qty);
  return {
    title: `${t.unitPrice.toFixed(2)} CNY / pc`,
    sub: `≈ ${t.unitPriceVnd.toLocaleString()} VND · ${qty.toLocaleString()} pcs (${t.tier})${result.approvalRoute ? " · needs approval" : ""}`,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
}

export default function Home() {
  const [text, setText] = useState(SAMPLES[0].text);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setRunning((r) => (r + 1) % NODE_NAMES.length), 420);
    return () => clearInterval(id);
  }, [loading]);

  async function submit(value?: string) {
    const v = (value ?? text).trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setRunning(0);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: v }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleImage(file: File) {
    setUploadingImage(true);
    setError(null);
    setResult(null);
    try {
      const raw = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("Could not read this file."));
        r.readAsDataURL(file);
      });
      const dataUrl = await downscaleDataUrl(raw);
      const res = await fetch("/api/quote/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process the image");
      setResult(data);
      if (data.ocrText) setText(data.ocrText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to process the image");
    } finally {
      setUploadingImage(false);
    }
  }

  const h = result ? headline(result) : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-kraft-600 text-lg text-white shadow-sm">📦</span>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Carton Quotation Agent</h1>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-slate-500">
            From an inquiry email to an approvable quote — extraction, pricing and rule verification in seconds.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">params {result?.paramsVersion ?? "v2026-10"}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Input panel — sticky so it stays in view while results scroll */}
        <section className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label htmlFor="inquiry" className="text-sm font-semibold text-slate-700">
              Customer inquiry
            </label>
            <textarea
              id="inquiry"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              spellCheck={false}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-slate-800 outline-none transition focus:border-kraft-400 focus:bg-white focus:ring-2 focus:ring-kraft-200"
              placeholder='e.g. Box 400×300×250 mm, 5-ply BC 175, 3-colour flexo, 10,000 pcs'
            />
            <button
              onClick={() => submit()}
              disabled={loading || !text.trim()}
              className="mt-3 w-full rounded-xl bg-kraft-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-kraft-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Working…" : "Generate quote"}
            </button>

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImage(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingImage || loading}
              className="mt-3 w-full rounded-xl border border-kraft-300 bg-kraft-50 px-4 py-2.5 text-sm font-semibold text-kraft-700 transition hover:bg-kraft-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingImage ? "Reading image…" : "📷 Upload a drawing / photo"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">Try a sample case</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setText(s.text);
                    submit(s.text);
                  }}
                  title={`${s.text} — ${s.expected}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-kraft-300 hover:bg-kraft-50 hover:text-kraft-700"
                >
                  {s.id} · {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Results panel */}
        <section className="min-w-0 space-y-4">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-kraft-500 border-t-transparent" />
                Analysing the inquiry…
              </div>
              <ol className="space-y-2">
                {NODE_NAMES.map((name, i) => {
                  const state = i < running ? "done" : i === running ? "active" : "pending";
                  return (
                    <li key={name} className="flex items-center gap-3 text-sm">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          state === "done" ? "bg-emerald-500" : state === "active" ? "animate-pulse bg-kraft-500" : "bg-slate-200"
                        }`}
                      />
                      <span className={`font-medium ${state === "pending" ? "text-slate-300" : "text-slate-600"}`}>
                        N{i + 1} · {name}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 shadow-sm">{error}</div>
          )}

          {result && !loading && (
            <div className="space-y-4 animate-fade-up">
              {/* Headline */}
              {h && (
                <div className={`rounded-2xl border p-5 shadow-sm ${h.tone}`}>
                  <div className="text-2xl font-bold tracking-tight">{h.title}</div>
                  <div className="mt-1 text-sm opacity-90">{h.sub}</div>
                </div>
              )}

              {result.source === "image" && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                  <div className="text-sm font-semibold text-amber-800">📷 Image input — needs confirmation</div>
                  <p className="mt-1 text-sm text-amber-700">
                    Transcribed from the image and filled into the text box on the left for your review.
                    Dimensions from drawings or handwriting must be verified by engineering before a quote is issued.
                  </p>
                </div>
              )}

              {/* Node timeline */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <NodeTimeline nodes={result.nodes} />
                {result.warnings.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600">⚠ {w}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Clarification / missing info */}
              {result.clarification.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-amber-800">Still needed before a definite price</h3>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-amber-700">
                    {result.clarification.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Extracted fields */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-2.5 text-sm font-semibold text-slate-700">Extracted fields</h3>
                <FieldGrid fields={result.fields} />
              </div>

              {/* Pricing */}
              {result.pricing && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <PriceBreakdown pricing={result.pricing} qty={Number(result.fields.qty?.value) || 0} />
                </div>
              )}

              {/* Rules */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <RulesPanel rules={result.rules} />
              </div>

              {/* Approval route */}
              {result.approvalRoute && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-orange-800">Approval required</h3>
                  <p className="mt-1 text-sm text-orange-700">{result.approvalRoute}</p>
                </div>
              )}

              {/* Explanation */}
              {result.explanation && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["For the customer", result.explanation.customer, "border-slate-200 bg-white"],
                    ["For the sales team", result.explanation.internal, "border-slate-200 bg-white"],
                    ["Approval routing", result.explanation.approval, "border-slate-200 bg-white"],
                  ].map(([title, body, cls]) => (
                    <div key={title as string} className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-400">
              Paste an inquiry on the left (or click a sample) and the six-node pipeline will run here.
            </div>
          )}
        </section>
      </div>

      <footer className="mt-10 border-t border-slate-200 pt-5 text-center">
        <p className="text-sm font-medium text-slate-600">
          Arithmetic lives in deterministic code — the model only reads and writes.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Same inquiry, same number, every time. Every quote is traceable to its inputs and rules.
        </p>
      </footer>
    </main>
  );
}
