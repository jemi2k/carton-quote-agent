"use client";

import type { NodeStatus } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-500 text-white",
  error: "bg-rose-500 text-white",
  skipped: "bg-slate-300 text-slate-600",
  pending: "bg-slate-200 text-slate-500",
};

export default function NodeTimeline({ nodes }: { nodes: NodeStatus[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {nodes.map((n, i) => (
        <li key={n.id} className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm">
            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_STYLE[n.status]}`} />
            <span className="font-semibold text-slate-700">{n.id}</span>
            <span className="text-slate-500">{n.name}</span>
            <span className="font-mono text-[10px] text-slate-400">{n.ms}ms</span>
          </span>
          {i < nodes.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  );
}
