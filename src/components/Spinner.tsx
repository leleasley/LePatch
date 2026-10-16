const sizes = { sm: 16, md: 24, lg: 32 };

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = sizes[size];
  return (
    <svg
      className="animate-spin text-accent"
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
