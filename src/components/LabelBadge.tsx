export function LabelBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight"
      style={{
        borderColor: `#${color}40`,
        backgroundColor: `#${color}15`,
        color: `#${color}`,
      }}
    >
      {name}
    </span>
  );
}
