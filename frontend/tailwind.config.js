/** @type {import('tailwindcss').Config} */
const { ramps } = require("./design/tokens.cjs");

// Every color family the codebase uses resolves to one of seven CSS-variable
// ramps (design/tokens.cjs), so light and dark appearances and the world's
// palette apply to existing utility classes without rewriting them.
function ramp(name) {
    const out = {};
    for (const step of ramps[name]) {
        out[step] = `rgb(var(--c-${name}-${step}) / <alpha-value>)`;
    }
    return out;
}

const neutral = ramp("neutral");
const accent = ramp("accent");
const blue = ramp("blue");
const green = ramp("green");
const amber = ramp("amber");
const red = ramp("red");
const violet = ramp("violet");

module.exports = {
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
    darkMode: "media",
    theme: {
        container: { padding: "2rem", center: true },
        fontFamily: {
            sans: ['"Inter"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
            mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        },
        // Product-UI scale: 13px base, tight steps. Existing text-sm/base/lg
        // usages land in the denser register automatically.
        fontSize: {
            "2xs": ["10px", { lineHeight: "14px" }],
            xs: ["11px", { lineHeight: "16px" }],
            sm: ["12px", { lineHeight: "16px" }],
            base: ["13px", { lineHeight: "18px" }],
            md: ["13px", { lineHeight: "18px" }],
            lg: ["15px", { lineHeight: "20px" }],
            xl: ["17px", { lineHeight: "24px" }],
            "2xl": ["20px", { lineHeight: "26px" }],
            "3xl": ["24px", { lineHeight: "30px" }],
            "4xl": ["28px", { lineHeight: "34px" }],
            "5xl": ["32px", { lineHeight: "40px" }],
        },
        // Two weight steps only. Heavier requests collapse to 600.
        fontWeight: {
            thin: "400",
            extralight: "400",
            light: "400",
            normal: "400",
            medium: "500",
            semibold: "600",
            bold: "600",
            extrabold: "600",
            black: "600",
        },
        letterSpacing: {
            tighter: "-0.02em",
            tight: "-0.01em",
            normal: "0",
            wide: "0.02em",
            wider: "0.04em",
            widest: "0.06em",
        },
        borderRadius: {
            none: "0",
            xs: "2px",
            sm: "3px",
            DEFAULT: "4px",
            md: "4px",
            lg: "6px",
            xl: "6px",
            "2xl": "6px",
            "3xl": "8px",
            full: "9999px",
        },
        boxShadow: {
            none: "none",
            "4xs": "none",
            "3xs": "none",
            "2xs": "none",
            xs: "none",
            sm: "none",
            DEFAULT: "0 0 0 1px rgb(var(--c-neutral-200))",
            md: "0 0 0 1px rgb(var(--c-neutral-200))",
            lg: "var(--shadow-float)",
            xl: "var(--shadow-float)",
            "2xl": "var(--shadow-float)",
            float: "var(--shadow-float)",
            inner: "inset 0 1px 0 rgb(var(--c-neutral-200))",
        },
        colors: {
            transparent: "transparent",
            current: "currentColor",
            inherit: "inherit",
            black: "#000",
            white: "rgb(var(--c-surface) / <alpha-value>)",
            surface: "rgb(var(--c-surface) / <alpha-value>)",
            "on-accent": "rgb(var(--c-on-accent) / <alpha-value>)",
            ink: neutral[900],
            hairline: neutral[200],
            // Neutral families.
            neutral,
            slate: neutral,
            gray: neutral,
            zinc: neutral,
            stone: neutral,
            archstats: neutral,
            // The one accent.
            accent,
            secondary: accent,
            // Semantic and data ramps.
            blue,
            tertiary: blue,
            indigo: blue,
            sky: blue,
            cyan: blue,
            green,
            emerald: green,
            teal: green,
            lime: green,
            amber,
            orange: amber,
            yellow: amber,
            red,
            rose: red,
            pink: red,
            violet,
            purple: violet,
            fuchsia: violet,
        },
        extend: {
            zIndex: { 45: "45", 55: "55" },
            transitionDuration: { DEFAULT: "150ms" },
            transitionTimingFunction: { DEFAULT: "cubic-bezier(0.2, 0, 0, 1)" },
        },
    },
    plugins: [],
};
