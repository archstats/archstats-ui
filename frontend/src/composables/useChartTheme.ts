import { computed, onBeforeUnmount, onMounted, ref } from "vue";

// Theme values for D3 canvas and SVG code, read from the design tokens on
// :root so diagrams follow the light/dark appearance instead of hardcoding
// hex. `version` bumps when the OS appearance flips; watch it to redraw.

export interface ChartTheme {
  surface: string;
  ground: string;
  hairline: string;
  hairlineStrong: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  accent: string;
  accentSoft: string;
  blue: string;
  blueSoft: string;
  green: string;
  greenSoft: string;
  amber: string;
  amberSoft: string;
  red: string;
  redSoft: string;
  violet: string;
  violetSoft: string;
  fontSans: string;
  fontMono: string;
  /** Sequential heat ramp, cool to hot. */
  heat: string[];
}

const TOKENS: Record<keyof Omit<ChartTheme, "fontSans" | "fontMono" | "heat">, string> = {
  surface: "--c-surface",
  ground: "--c-neutral-50",
  hairline: "--c-neutral-200",
  hairlineStrong: "--c-neutral-300",
  ink: "--c-neutral-900",
  inkSecondary: "--c-neutral-600",
  inkMuted: "--c-neutral-400",
  accent: "--c-accent-500",
  accentSoft: "--c-accent-200",
  blue: "--c-blue-500",
  blueSoft: "--c-blue-200",
  green: "--c-green-500",
  greenSoft: "--c-green-200",
  amber: "--c-amber-500",
  amberSoft: "--c-amber-200",
  red: "--c-red-500",
  redSoft: "--c-red-200",
  violet: "--c-violet-500",
  violetSoft: "--c-violet-200",
};

function readToken(style: CSSStyleDeclaration, name: string): string {
  const raw = style.getPropertyValue(name).trim();
  // Comma syntax: SVG presentation attributes and canvas reject the
  // space-separated form.
  return raw ? `rgb(${raw.split(/\s+/).join(", ")})` : "#808080";
}

export function readChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const t = Object.fromEntries(
    Object.entries(TOKENS).map(([key, name]) => [key, readToken(style, name)]),
  ) as Record<keyof typeof TOKENS, string>;
  const step = (ramp: string, s: number) => readToken(style, `--c-${ramp}-${s}`);
  return {
    ...t,
    fontSans: '"Inter", system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    heat: [step("neutral", 300), step("accent", 200), step("accent", 400), step("red", 400), step("red", 700)],
  };
}

/** Alpha variant of a token color string returned by readChartTheme. */
export function withAlpha(color: string, alpha: number): string {
  const m = color.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return color;
  const [r, g, b] = m[1].split(",").map((v) => v.trim());
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function useChartTheme() {
  const version = ref(0);
  const theme = computed<ChartTheme>(() => {
    void version.value;
    return readChartTheme();
  });
  const isDark = computed(() => {
    void version.value;
    return media?.matches ?? false;
  });
  const bump = () => {
    // Tokens change on the next frame after the media query flips.
    requestAnimationFrame(() => version.value++);
  };
  onMounted(() => media?.addEventListener("change", bump));
  onBeforeUnmount(() => media?.removeEventListener("change", bump));
  return { theme, isDark, version };
}

let cached: ChartTheme | null = null;
media?.addEventListener("change", () => {
  cached = null;
});

/** Cached theme for draw loops; call anywhere, no component scope needed. */
export function chartTheme(): ChartTheme {
  if (!cached) cached = readChartTheme();
  return cached;
}

/** Drop the cache (after tokens change at runtime). */
export function refreshChartTheme(): void {
  cached = null;
}
