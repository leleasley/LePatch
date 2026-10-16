export type ThemeId =
  | "dark"
  | "light"
  | "ocean"
  | "forest"
  | "sunset"
  | "nord"
  | "graphite"
  | "rose"
  | "matcha"
  | "midnight";

export interface ThemeColors {
  background: string;
  surface: string;
  panel: string;
  line: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentHover: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  selection: string;
  focusRing: string;
  glassBg: string;
  glassBorder: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  colors: ThemeColors;
}

export const themes: Record<ThemeId, Theme> = {
  dark: {
    id: "dark",
    label: "Dark",
    colors: {
      background: "#050b14",
      surface: "#060d19",
      panel: "#0c1424",
      line: "#1a2740",
      surfaceElevated: "#111d32",
      text: "#e5edf7",
      textMuted: "#94a3b8",
      textFaint: "#475569",
      accent: "#06b6d4",
      accentHover: "#22d3ee",
      accentText: "#050b14",
      accentBg: "rgba(6, 182, 212, 0.1)",
      accentBorder: "rgba(6, 182, 212, 0.3)",
      scrollbarTrack: "#060d19",
      scrollbarThumb: "#1a2740",
      scrollbarThumbHover: "#253a58",
      selection: "rgba(34, 211, 238, 0.2)",
      focusRing: "rgba(34, 211, 238, 0.5)",
      glassBg: "rgba(12, 20, 36, 0.7)",
      glassBorder: "rgba(26, 39, 64, 0.5)",
    },
  },
  light: {
    id: "light",
    label: "Light",
    colors: {
      background: "#f1f5f9",
      surface: "#f8fafc",
      panel: "#ffffff",
      line: "#e2e8f0",
      surfaceElevated: "#ffffff",
      text: "#0f172a",
      textMuted: "#64748b",
      textFaint: "#94a3b8",
      accent: "#0284c7",
      accentHover: "#0ea5e9",
      accentText: "#ffffff",
      accentBg: "rgba(2, 132, 199, 0.08)",
      accentBorder: "rgba(2, 132, 199, 0.25)",
      scrollbarTrack: "#f1f5f9",
      scrollbarThumb: "#cbd5e1",
      scrollbarThumbHover: "#94a3b8",
      selection: "rgba(2, 132, 199, 0.15)",
      focusRing: "rgba(2, 132, 199, 0.5)",
      glassBg: "rgba(255, 255, 255, 0.8)",
      glassBorder: "rgba(226, 232, 240, 0.8)",
    },
  },
  ocean: {
    id: "ocean",
    label: "Ocean",
    colors: {
      background: "#0a1628",
      surface: "#0c1a30",
      panel: "#0f2035",
      line: "#1a3352",
      surfaceElevated: "#142a45",
      text: "#e0f2fe",
      textMuted: "#7dd3fc",
      textFaint: "#38bdf8",
      accent: "#14b8a6",
      accentHover: "#2dd4bf",
      accentText: "#0a1628",
      accentBg: "rgba(20, 184, 166, 0.1)",
      accentBorder: "rgba(20, 184, 166, 0.3)",
      scrollbarTrack: "#0c1a30",
      scrollbarThumb: "#1a3352",
      scrollbarThumbHover: "#2563eb",
      selection: "rgba(45, 212, 191, 0.2)",
      focusRing: "rgba(45, 212, 191, 0.5)",
      glassBg: "rgba(15, 32, 53, 0.7)",
      glassBorder: "rgba(26, 51, 82, 0.5)",
    },
  },
  forest: {
    id: "forest",
    label: "Forest",
    colors: {
      background: "#0a1a0f",
      surface: "#0c1f12",
      panel: "#0f2518",
      line: "#1a3d22",
      surfaceElevated: "#15301c",
      text: "#e5f5e8",
      textMuted: "#86efac",
      textFaint: "#4ade80",
      accent: "#22c55e",
      accentHover: "#4ade80",
      accentText: "#0a1a0f",
      accentBg: "rgba(34, 197, 94, 0.1)",
      accentBorder: "rgba(34, 197, 94, 0.3)",
      scrollbarTrack: "#0c1f12",
      scrollbarThumb: "#1a3d22",
      scrollbarThumbHover: "#15803d",
      selection: "rgba(74, 222, 128, 0.2)",
      focusRing: "rgba(74, 222, 128, 0.5)",
      glassBg: "rgba(15, 37, 24, 0.7)",
      glassBorder: "rgba(26, 61, 34, 0.5)",
    },
  },
  sunset: {
    id: "sunset",
    label: "Sunset",
    colors: {
      background: "#1a0f0a",
      surface: "#1f120c",
      panel: "#251810",
      line: "#3d2618",
      surfaceElevated: "#301e14",
      text: "#fef3e2",
      textMuted: "#fdba74",
      textFaint: "#fb923c",
      accent: "#f97316",
      accentHover: "#fb923c",
      accentText: "#1a0f0a",
      accentBg: "rgba(249, 115, 22, 0.1)",
      accentBorder: "rgba(249, 115, 22, 0.3)",
      scrollbarTrack: "#1f120c",
      scrollbarThumb: "#3d2618",
      scrollbarThumbHover: "#c2410c",
      selection: "rgba(251, 146, 60, 0.2)",
      focusRing: "rgba(251, 146, 60, 0.5)",
      glassBg: "rgba(37, 24, 16, 0.7)",
      glassBorder: "rgba(61, 38, 24, 0.5)",
    },
  },
  nord: {
    id: "nord",
    label: "Nord",
    colors: {
      background: "#2e3440",
      surface: "#313845",
      panel: "#3b4252",
      line: "#434c5e",
      surfaceElevated: "#434c5e",
      text: "#eceff4",
      textMuted: "#d8dee9",
      textFaint: "#a3b1c6",
      accent: "#88c0d0",
      accentHover: "#8fbcbb",
      accentText: "#2e3440",
      accentBg: "rgba(136, 192, 208, 0.1)",
      accentBorder: "rgba(136, 192, 208, 0.3)",
      scrollbarTrack: "#313845",
      scrollbarThumb: "#434c5e",
      scrollbarThumbHover: "#4c566a",
      selection: "rgba(143, 188, 187, 0.2)",
      focusRing: "rgba(143, 188, 187, 0.5)",
      glassBg: "rgba(59, 66, 82, 0.7)",
      glassBorder: "rgba(67, 76, 94, 0.5)",
    },
  },
  graphite: {
    id: "graphite",
    label: "Graphite",
    colors: {
      background: "#111315",
      surface: "#171a1d",
      panel: "#1d2125",
      line: "#2a3138",
      surfaceElevated: "#232931",
      text: "#f3f4f6",
      textMuted: "#cbd5e1",
      textFaint: "#94a3b8",
      accent: "#f59e0b",
      accentHover: "#fbbf24",
      accentText: "#111315",
      accentBg: "rgba(245, 158, 11, 0.12)",
      accentBorder: "rgba(245, 158, 11, 0.3)",
      scrollbarTrack: "#171a1d",
      scrollbarThumb: "#2a3138",
      scrollbarThumbHover: "#3a4552",
      selection: "rgba(251, 191, 36, 0.22)",
      focusRing: "rgba(251, 191, 36, 0.45)",
      glassBg: "rgba(29, 33, 37, 0.72)",
      glassBorder: "rgba(42, 49, 56, 0.5)",
    },
  },
  rose: {
    id: "rose",
    label: "Rose",
    colors: {
      background: "#160d14",
      surface: "#1d1019",
      panel: "#24131f",
      line: "#3b2132",
      surfaceElevated: "#2d1827",
      text: "#fff1f7",
      textMuted: "#f9a8d4",
      textFaint: "#f472b6",
      accent: "#ec4899",
      accentHover: "#f472b6",
      accentText: "#160d14",
      accentBg: "rgba(236, 72, 153, 0.12)",
      accentBorder: "rgba(236, 72, 153, 0.3)",
      scrollbarTrack: "#1d1019",
      scrollbarThumb: "#3b2132",
      scrollbarThumbHover: "#9d174d",
      selection: "rgba(244, 114, 182, 0.2)",
      focusRing: "rgba(244, 114, 182, 0.45)",
      glassBg: "rgba(36, 19, 31, 0.72)",
      glassBorder: "rgba(59, 33, 50, 0.5)",
    },
  },
  matcha: {
    id: "matcha",
    label: "Matcha",
    colors: {
      background: "#12170f",
      surface: "#171d13",
      panel: "#1d2418",
      line: "#314028",
      surfaceElevated: "#25301e",
      text: "#f4f8ed",
      textMuted: "#c4d8a7",
      textFaint: "#93b36b",
      accent: "#84cc16",
      accentHover: "#a3e635",
      accentText: "#12170f",
      accentBg: "rgba(132, 204, 22, 0.12)",
      accentBorder: "rgba(132, 204, 22, 0.3)",
      scrollbarTrack: "#171d13",
      scrollbarThumb: "#314028",
      scrollbarThumbHover: "#4d7c0f",
      selection: "rgba(163, 230, 53, 0.2)",
      focusRing: "rgba(163, 230, 53, 0.45)",
      glassBg: "rgba(29, 36, 24, 0.72)",
      glassBorder: "rgba(49, 64, 40, 0.5)",
    },
  },
  midnight: {
    id: "midnight",
    label: "Midnight",
    colors: {
      background: "#070713",
      surface: "#0b0d1a",
      panel: "#101425",
      line: "#1f2744",
      surfaceElevated: "#161c33",
      text: "#eef2ff",
      textMuted: "#c7d2fe",
      textFaint: "#818cf8",
      accent: "#6366f1",
      accentHover: "#818cf8",
      accentText: "#070713",
      accentBg: "rgba(99, 102, 241, 0.14)",
      accentBorder: "rgba(99, 102, 241, 0.32)",
      scrollbarTrack: "#0b0d1a",
      scrollbarThumb: "#1f2744",
      scrollbarThumbHover: "#312e81",
      selection: "rgba(129, 140, 248, 0.22)",
      focusRing: "rgba(129, 140, 248, 0.5)",
      glassBg: "rgba(16, 20, 37, 0.72)",
      glassBorder: "rgba(31, 39, 68, 0.5)",
    },
  },
};

export const themeList = Object.values(themes);

export function isValidTheme(theme: string): theme is ThemeId {
  return theme in themes;
}
