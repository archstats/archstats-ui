// Archstats Desktop design tokens: the single source of truth for both
// appearances. tailwind.config.js reads the ramp names from here and maps every
// Tailwind color family onto CSS variables; scripts/gen-tokens.cjs writes the
// variable values into src/assets/tokens.css. Edit this file, then run
// `npm run tokens`.
//
// Every ramp is listed light-first. In the dark appearance the ramps are
// re-tuned rather than inverted blindly: step 50 is always the faintest tint
// on the current ground, step 500 the "true" color, step 900 the strongest ink.

const neutralSteps = [50, 100, 200, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950];
const hueSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const light = {
  // Navy-tinted cool gray. 50 is the rail and panel ground, surface is content.
  neutral: ["#F7F8FA", "#EEF0F4", "#E3E6EC", "#CED3DC", "#B9BFCB", "#9AA1AF", "#868D9B", "#6C7280", "#5C6270", "#4B515E", "#40464F", "#343944", "#2D3139", "#262932", "#22252D", "#1E2026", "#15171B"],
  accent: ["#FFF6E8", "#FFE9C7", "#FFD596", "#FBBE5F", "#F2A33A", "#E08A19", "#C4740F", "#9F5D0C", "#7A470B", "#5A3409"],
  // Data-only ramps: blue, green, amber, red, violet never color chrome or labels.
  blue: ["#EEF3FF", "#DCE6FD", "#B9CCFB", "#8FAEF7", "#5F8BF1", "#3D74EA", "#2C5DD0", "#234AA8", "#1D3C85", "#172F66"],
  green: ["#EDF8F1", "#D5EFDF", "#AEDFC1", "#7FCA9E", "#57B27C", "#3E9B5F", "#2F7E4C", "#27663E", "#215233", "#1A4129"],
  amber: ["#FFF8E6", "#FEEFC6", "#FCDE8C", "#F5C85A", "#E7AC33", "#D48D1E", "#B37315", "#8F5B12", "#6F4711", "#55370F"],
  red: ["#FDEFEF", "#FADADA", "#F5B8B8", "#EE8F8F", "#E56A6A", "#DA4E4E", "#C03A3A", "#9B2F2F", "#7C2727", "#612020"],
  violet: ["#F3F0FD", "#E6DFFB", "#CDC0F6", "#AE9BEF", "#9078E6", "#7759DB", "#6146BE", "#4E3898", "#3E2D78", "#31245E"],
  single: {
    surface: "#FFFFFF",      // content ground
    "on-accent": "#1F2329",  // ink on the orange button
    "shadow-rgb": "15 18 28",
  },
};

const dark = {
  neutral: ["#262932", "#2B2F38", "#363A45", "#444956", "#4F5563", "#656B79", "#7A8090", "#8B919E", "#9AA0AC", "#B0B5BF", "#BDC2CB", "#CBD0D8", "#D5D9E0", "#E3E6EB", "#EDEFF3", "#F5F6F8", "#FFFFFF"],
  accent: ["#3A2A12", "#4A3413", "#6B4A17", "#8E621C", "#C48425", "#F0A033", "#F5B155", "#F8C27C", "#FBD4A3", "#FDE7CB"],
  blue: ["#1B2640", "#213052", "#2A4272", "#365699", "#4A73C6", "#6293EE", "#7FA8F3", "#9EBDF6", "#BDD2F9", "#DCE7FC"],
  green: ["#1B2E23", "#203A2A", "#2A4F38", "#34664A", "#418A5F", "#58B27A", "#77C494", "#99D4AE", "#BCE3C8", "#DDF1E3"],
  amber: ["#352A10", "#423412", "#5E4917", "#7E621E", "#B0862A", "#E0A43A", "#EAB65B", "#F1C77F", "#F6D8A5", "#FAE9CC"],
  red: ["#3A1D1D", "#4A2222", "#6A2C2C", "#8C3838", "#BC4A4A", "#E86464", "#EF8383", "#F4A2A2", "#F8C1C1", "#FBDFDF"],
  violet: ["#261F3F", "#2E2650", "#3F336F", "#524390", "#7160B8", "#9581E6", "#AC9BEC", "#C3B6F1", "#D9D1F6", "#ECE8FA"],
  single: {
    surface: "#1E2026",
    "on-accent": "#1E2026",
    "shadow-rgb": "0 0 0",
  },
};

const ramps = {
  neutral: neutralSteps,
  accent: hueSteps,
  blue: hueSteps,
  green: hueSteps,
  amber: hueSteps,
  red: hueSteps,
  violet: hueSteps,
};

module.exports = { light, dark, ramps };
