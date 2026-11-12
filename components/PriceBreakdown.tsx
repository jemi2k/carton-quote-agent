"use client";

import { matchedTier } from "@/lib/engine";
import type { Pricing } from "@/lib/types";

const cny = (n: number) => `¥${n.toFixed(2)}`;
const vnd = (n: number) => `${n.toLocaleString()} ₫`;

export default function PriceBreakdown({ pricing, qty }: { pricing: Pricing; qty: number }) {
  const matched = matchedTier(pricing, qty);
  const maxPrice = Math.max(...pricing.tiers.map((t) => t.unitPrice));

  return (
    <div className="space-y-5">
      {/* Geometry strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Blank length", `${pricing.blankLengthMm.toFixed(0)} mm`],
          ["Blank width", `${pricing.blankWidthMm.toFixed(0)} mm`],
          ["Blank area", `${pricing.area.toFixed(4)} m²`],
          ["Paper price", `${pricing.paperPrice.toFixed(3)} ¥/m²`],
          ["Board price", `${pricing.boardPrice.toFixed(3)} ¥/m²`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800">{v}</div>
          </div>
        ))}
      </div>

      {/* Five-tier price table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-700">Five quantity tiers</h3>
          <p className="text-xs text-slate-400">Same box, priced at each order size — the unit price falls as volume rises.</p>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-semibold">Tier</th>
                <th className="px-3 py-2 font-semibold">Quantity</th>
                <th className="px-3 py-2 font-semibold">Unit cost</th>
                <th className="px-3 py-2 font-semibold">Unit price</th>
                <th className="px-3 py-2 font-semibold">VND</th>
                <th className="px-4 py-2 font-semibold text-right">Order value</th>
              </tr>
            </thead>
            <tbody>
              {pricing.tiers.map((t) => {
                const active = t.tier === matched.tier;
                return (
                  <tr key={t.tier} className={`border-b border-slate-50 ${active ? "bg-kraft-50" : ""}`}>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1.5 font-mono font-bold ${active ? "text-kraft-700" : "text-slate-500"}`}>
                        {t.tier}
                        {active && <span className="rounded-full bg-kraft-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">match</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {t.maxQty ? `${t.minQty.toLocaleString()}–${t.maxQty.toLocaleString()}` : `≥ ${t.minQty.toLocaleString()}`}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">{cny(t.unitCost)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-kraft-500" style={{ width: `${(t.unitPrice / maxPrice) * 100}%` }} />
                        </div>
                        <span className={`font-mono font-bold ${active ? "text-kraft-700" : "text-slate-800"}`}>{cny(t.unitPrice)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{vnd(t.unitPriceVnd)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{cny(t.orderValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matched-tier cost breakdown */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-700">
            Cost breakdown · {matched.tier} ({qty.toLocaleString()} pcs)
          </h3>
          <p className="text-xs text-slate-400">Every number is traceable to a deterministic formula.</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {matched.lines.map((l) => {
              const total = l.key === "subtotal" || l.key === "fullCost" || l.key === "unitPrice";
              return (
                <tr key={l.key} className={`border-b border-slate-50 ${total ? "bg-kraft-50 font-semibold" : ""}`}>
                  <td className="px-4 py-1.5 text-slate-600">{l.label}</td>
                  <td className="hidden px-3 py-1.5 text-right font-mono text-xs text-slate-400 md:table-cell">{l.formula}</td>
                  <td className={`px-4 py-1.5 text-right font-mono ${total ? "text-kraft-700" : "text-slate-700"}`}>
                    {l.key === "vnd" ? vnd(l.value) : cny(l.value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
