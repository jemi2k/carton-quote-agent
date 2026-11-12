"use client";

import type { RuleResult } from "@/lib/types";

const ACTION_STYLE: Record<string, string> = {
  PASS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  BLOCK: "bg-rose-50 text-rose-700 border-rose-200",
  ASK: "bg-amber-50 text-amber-700 border-amber-200",
  WARN: "bg-orange-50 text-orange-700 border-orange-200",
  HUMAN: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

export default function RulesPanel({ rules }: { rules: RuleResult[] }) {
  const fired = rules.filter((r) => r.action !== "PASS");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Rule verification (R01–R11)</h3>
        <span className="text-xs text-slate-400">
          {fired.length} of {rules.length} rules fired
        </span>
      </div>
      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.code} className={`rounded-lg border px-3 py-2 text-sm ${ACTION_STYLE[r.action]}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold">{r.code}</span>
              <span className="font-semibold">{r.name}</span>
              <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{r.action}</span>
            </div>
            {r.threshold && (
              <div className="mt-1 font-mono text-xs opacity-90">
                threshold {r.threshold} · computed {r.computed}
              </div>
            )}
            {r.message && <div className="mt-0.5 text-xs opacity-90">{r.message}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
