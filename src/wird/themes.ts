// Theme palettes. Each colour list is: bg, surface, ink, muted, line, accent, done, done-ink, warn.
// Every theme also has a signature background motif, drawn faintly behind the app in the accent colour.
export type Motif = "star" | "lattice" | "petal" | "dune" | "grid" | "arch" | "ember";
export type Palette = { name: string; motif: Motif; light: string[]; dark: string[] };

export const PAL: Record<string, Palette> = {
  sage: {
    name: "Sage", motif: "star",
    light: ["#EDF1EC", "#F8FAF7", "#1D332E", "#5A6C65", "#CBD6CF", "#826419", "#2F5C4F", "#F3F6F2", "#A8473A"],
    dark: ["#101916", "#18231F", "#E2E9E4", "#93A59D", "#2A3933", "#D3B05A", "#4E8C79", "#0F1714", "#E0806F"],
  },
  ocean: {
    name: "Ocean", motif: "lattice",
    light: ["#EAF0F4", "#F7FAFC", "#13293D", "#54697A", "#C9D6E0", "#256C87", "#1F5F7A", "#F2F7FA", "#B0473A"],
    dark: ["#0D1720", "#15222D", "#E1EAF0", "#8FA3B3", "#243646", "#6CB6D0", "#3F86A6", "#0B141B", "#E0806F"],
  },
  rose: {
    name: "Rose", motif: "petal",
    light: ["#F5EEEF", "#FCF8F8", "#3A1F27", "#735860", "#E2D2D5", "#A3485E", "#7A3346", "#FBF4F5", "#B04A3A"],
    dark: ["#1A1214", "#241A1D", "#F0E4E7", "#B39AA0", "#3A2A2F", "#E08DA0", "#C46A80", "#150E10", "#E0806F"],
  },
  sand: {
    name: "Sand", motif: "dune",
    light: ["#F3EFE6", "#FBF9F4", "#2E2A22", "#6D6454", "#DED6C6", "#7F6019", "#5E6B3A", "#F7F6EF", "#A8473A"],
    dark: ["#17150F", "#211E17", "#ECE6D8", "#A89E8A", "#37322A", "#D6B45E", "#8A9A58", "#13120C", "#E0806F"],
  },
  plum: {
    name: "Plum", motif: "arch",
    light: ["#F0EEF5", "#FAF9FC", "#2A2140", "#665E7A", "#D8D3E3", "#6A4FA3", "#4E3A80", "#F6F4FA", "#B0473A"],
    dark: ["#14111C", "#1D1928", "#E7E3F0", "#A39CB6", "#302A40", "#A993DB", "#9179CC", "#110E18", "#E0806F"],
  },
  dusk: {
    name: "Dusk", motif: "lattice",
    light: ["#ECEEF6", "#F8F9FD", "#1B2140", "#5C6482", "#CDD2E6", "#9A5416", "#2C3E7A", "#F4F6FC", "#B0473A"],
    dark: ["#0E1226", "#171C36", "#E4E7F5", "#98A0C4", "#2A3159", "#F0B45C", "#6C88DD", "#0B0E20", "#E0806F"],
  },
  ember: {
    name: "Ember", motif: "ember",
    light: ["#F6EEE9", "#FDF8F5", "#3A1E12", "#77594C", "#E6D3C9", "#A63F1B", "#8A3B1E", "#FBF4F0", "#A02C2C"],
    dark: ["#1A110D", "#251814", "#F3E5DD", "#B89C8E", "#3B2921", "#F09A6B", "#C0673D", "#150D0A", "#F08A7A"],
  },
  mono: {
    name: "Mono", motif: "grid",
    light: ["#F2F2F2", "#FFFFFF", "#1A1A1A", "#666666", "#D6D6D6", "#1A1A1A", "#333333", "#FFFFFF", "#B3261E"],
    dark: ["#111111", "#1B1B1B", "#EEEEEE", "#9A9A9A", "#2E2E2E", "#EEEEEE", "#CFCFCF", "#111111", "#F2807A"],
  },
};

export const VARS = ["--bg", "--surface", "--ink", "--muted", "--line", "--accent", "--done", "--done-ink", "--warn"];
export const DEFAULT_THEME = { pal: "sage", mode: "auto" };

// ---- contrast helpers (also used by the tests) ----
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---- background motifs: small tiles of thin lines, tinted with the accent ----
const enc = (svg: string) => "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
export function motifTile(motif: Motif, color: string): { image: string; size: number } {
  const c = color;
  const open = (s: number) => `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${s} ${s}' fill='none' stroke='${c}' stroke-width='1'>`;
  switch (motif) {
    case "star": // eight-pointed khatam: two squares, one turned
      return { size: 64, image: enc(open(64) + "<rect x='14' y='14' width='36' height='36'/><rect x='14' y='14' width='36' height='36' transform='rotate(45 32 32)'/></svg>") };
    case "lattice": // mashrabiya diamonds
      return { size: 48, image: enc(open(48) + "<path d='M24 2 46 24 24 46 2 24Z'/><path d='M24 12 36 24 24 36 12 24Z'/></svg>") };
    case "petal": // overlapping circles
      return { size: 56, image: enc(open(56) + "<circle cx='28' cy='28' r='14'/><circle cx='0' cy='0' r='14'/><circle cx='56' cy='0' r='14'/><circle cx='0' cy='56' r='14'/><circle cx='56' cy='56' r='14'/></svg>") };
    case "dune": // rolling waves
      return { size: 60, image: enc(open(60) + "<path d='M0 20Q15 6 30 20T60 20'/><path d='M0 46Q15 32 30 46T60 46'/></svg>") };
    case "arch": // pointed arches
      return { size: 52, image: enc(open(52) + "<path d='M6 48V26Q6 8 26 4Q46 8 46 26V48'/></svg>") };
    case "ember": // hexagons
      return { size: 56, image: enc(open(56) + "<path d='M28 4 48 16V40L28 52 8 40V16Z'/></svg>") };
    default: // grid of crosses
      return { size: 40, image: enc(open(40) + "<path d='M20 14V26M14 20H26'/></svg>") };
  }
}

export function themeCss(themeIn: { pal?: string; mode?: string } | undefined, prefersDark: boolean): { css: string; bg: string; dark: boolean } {
  const t = { ...DEFAULT_THEME, ...(themeIn || {}) };
  const p = PAL[t.pal as string] || PAL.sage;
  const dark = t.mode === "dark" || (t.mode === "auto" && prefersDark);
  const c = dark ? p.dark : p.light;
  const tile = motifTile(p.motif, c[5]);
  const css =
    ":root{" + VARS.map((v, i) => v + ":" + c[i]).join(";") + ";--motif:" + tile.image + ";--motif-size:" + tile.size + "px;--motif-alpha:" + (dark ? 0.1 : 0.14) + ";color-scheme:" + (dark ? "dark" : "light") + "}";
  return { css, bg: c[0], dark };
}
