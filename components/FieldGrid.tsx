"use client";

import type { Fields } from "@/lib/types";

const ORDER = ["D", "W", "H", "qty", "combo", "colors", "method", "unit", "delivery_days", "incoterm", "artwork_ready", "surface", "customer_id"];

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export default function FieldGrid({ fields }: { fields: Fields }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {ORDER.filter((k) => k in fields).map((k) => {
        const f = fields[k];
        const lowConf = f.confidence < 0.7;
        return (
          <div
            key={k}
            className={`rounded-lg border px-3 py-2 ${
              lowConf ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
              {f.confidence < 1 && (
                <span className="text-[10px] font-medium text-amber-600">{Math.round(f.confidence * 100)}%</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{renderValue(f.value)}</div>
            {f.evidence && <div className="truncate text-[10px] text-slate-400" title={f.evidence}>“{f.evidence}”</div>}
          </div>
        );
      })}
    </div>
  );
}
