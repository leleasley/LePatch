export function categoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function categoryClass(category: string) {
  const base = "rounded-full px-2 py-1 text-xs font-medium";
  const colors: Record<string, string> = {
    media: "bg-fuchsia-400/15 text-fuchsia-200",
    identity: "bg-amber-400/15 text-amber-200",
    monitoring: "bg-emerald-400/15 text-emerald-200",
    infrastructure: "bg-cyan-400/15 text-cyan-200",
    documents: "bg-sky-400/15 text-sky-200",
  };
  return `${base} ${colors[category] || "bg-slate-400/15 text-slate-200"}`;
}
