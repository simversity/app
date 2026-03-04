/**
 * WCAG 2.1 AA Color Contrast Verification
 *
 * Tests that all foreground/background color pairs used in Simversity
 * meet WCAG 2.1 AA contrast requirements:
 *   - Normal text (< 18pt / < 14pt bold): 4.5:1
 *   - Large text (>= 18pt / >= 14pt bold): 3:1
 *
 * Colors are sourced from src/App.css CSS custom properties (OKLCH values)
 * and converted to linear sRGB for luminance computation.
 */
import { describe, expect, test } from 'bun:test';

// ---------------------------------------------------------------------------
// OKLCH -> sRGB conversion
// ---------------------------------------------------------------------------

/**
 * Convert OKLCH (Oklab Lightness, Chroma, Hue) to linear sRGB.
 * Uses the Oklab intermediate space.
 */
function oklchToLinearRgb(
  L: number,
  C: number,
  H: number,
): [number, number, number] {
  // OKLCH -> Oklab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // Oklab -> linear LMS (cube-root space)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  // Undo cube root
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear sRGB
  const R = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [R, G, B];
}

/**
 * Compute relative luminance per WCAG 2.1 definition.
 * Input: linear sRGB (not gamma-encoded).
 */
function relativeLuminance(linearR: number, linearG: number, linearB: number) {
  // Clamp to [0,1] — OKLCH can produce out-of-gamut values
  const r = Math.max(0, Math.min(1, linearR));
  const g = Math.max(0, Math.min(1, linearG));
  const b = Math.max(0, Math.min(1, linearB));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio between two colors.
 * Always returns a value >= 1.
 */
function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const lFg = relativeLuminance(...fg);
  const lBg = relativeLuminance(...bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Color definitions — extracted from src/App.css :root and .dark
// Format: oklch(L C H) mapped to [L, C, H]
// ---------------------------------------------------------------------------

const lightColors = {
  background: oklch(0.99, 0.002, 145),
  foreground: oklch(0.18, 0.02, 145),
  card: oklch(1, 0, 0),
  cardForeground: oklch(0.18, 0.02, 145),
  primary: oklch(0.45, 0.16, 145),
  primaryForeground: oklch(0.99, 0.01, 145),
  secondary: oklch(0.96, 0.02, 145),
  secondaryForeground: oklch(0.25, 0.04, 145),
  muted: oklch(0.96, 0.015, 145),
  mutedForeground: oklch(0.5, 0.02, 145),
  accent: oklch(0.94, 0.04, 145),
  accentForeground: oklch(0.25, 0.04, 145),
  destructive: oklch(0.577, 0.245, 27.325),
  destructiveForeground: oklch(0.577, 0.245, 27.325),
  sidebarBackground: oklch(0.97, 0.015, 145),
  sidebarForeground: oklch(0.18, 0.02, 145),
  sidebarAccent: oklch(0.94, 0.04, 145),
  sidebarAccentForeground: oklch(0.25, 0.04, 145),
  // Simversity custom tokens
  teacher: oklch(0.5, 0.18, 145),
  student: oklch(0.5, 0.16, 220),
  observer: oklch(0.75, 0.18, 85),
  observerForeground: oklch(0.55, 0.16, 55),
};

const darkColors = {
  background: oklch(0.16, 0.015, 145),
  foreground: oklch(0.95, 0.01, 145),
  card: oklch(0.19, 0.018, 145),
  cardForeground: oklch(0.95, 0.01, 145),
  primary: oklch(0.62, 0.17, 145),
  primaryForeground: oklch(0.14, 0.03, 145),
  secondary: oklch(0.24, 0.025, 145),
  secondaryForeground: oklch(0.95, 0.01, 145),
  muted: oklch(0.24, 0.02, 145),
  mutedForeground: oklch(0.65, 0.04, 145),
  accent: oklch(0.26, 0.03, 145),
  accentForeground: oklch(0.95, 0.01, 145),
  destructive: oklch(0.7, 0.22, 27.325),
  destructiveForeground: oklch(0.95, 0.01, 0),
  sidebarBackground: oklch(0.18, 0.018, 145),
  sidebarForeground: oklch(0.95, 0.01, 145),
  sidebarAccent: oklch(0.26, 0.03, 145),
  sidebarAccentForeground: oklch(0.95, 0.01, 145),
  // Simversity custom tokens
  teacher: oklch(0.65, 0.17, 145),
  student: oklch(0.6, 0.14, 220),
  observer: oklch(0.7, 0.15, 85),
  observerForeground: oklch(0.75, 0.16, 65),
};

/** Helper: convert oklch values to linear sRGB tuple */
function oklch(l: number, c: number, h: number): [number, number, number] {
  return oklchToLinearRgb(l, c, h);
}

/**
 * Apply alpha compositing for transparent foregrounds over a background.
 * Simulates e.g. `bg-observer/5` (5% opacity of observer over background).
 * Operates in linear sRGB space.
 */
function alphaComposite(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

// ---------------------------------------------------------------------------
// Color pair definitions — each maps to actual component usage
// ---------------------------------------------------------------------------

type ContrastPair = {
  name: string;
  fg: [number, number, number];
  bg: [number, number, number];
  /** True for text >= 18pt or >= 14pt bold (threshold: 3:1) */
  largeText?: boolean;
  /** True for non-text UI elements like icons (WCAG 1.4.11, threshold: 3:1) */
  nonText?: boolean;
};

function buildPairs(colors: typeof lightColors, mode: string): ContrastPair[] {
  return [
    // === General page text ===
    // Body text: text-foreground on bg-background
    {
      name: `[${mode}] foreground on background`,
      fg: colors.foreground,
      bg: colors.background,
    },

    // === Card ===
    // card-foreground on card (alerts, cards)
    {
      name: `[${mode}] card-foreground on card`,
      fg: colors.cardForeground,
      bg: colors.card,
    },

    // === Primary button ===
    // Button default: text-primary-foreground on bg-primary
    {
      name: `[${mode}] primary-foreground on primary (button)`,
      fg: colors.primaryForeground,
      bg: colors.primary,
    },

    // === Secondary button / user message bubble ===
    // message.tsx: bg-secondary text-foreground for user messages
    {
      name: `[${mode}] foreground on secondary (user message)`,
      fg: colors.foreground,
      bg: colors.secondary,
    },
    // button secondary variant: text-secondary-foreground on bg-secondary
    {
      name: `[${mode}] secondary-foreground on secondary`,
      fg: colors.secondaryForeground,
      bg: colors.secondary,
    },

    // === Muted text ===
    // text-muted-foreground on bg-background (streaming indicator, helper text)
    {
      name: `[${mode}] muted-foreground on background`,
      fg: colors.mutedForeground,
      bg: colors.background,
    },
    // text-muted-foreground on bg-card (alert descriptions)
    {
      name: `[${mode}] muted-foreground on card`,
      fg: colors.mutedForeground,
      bg: colors.card,
    },

    // === Accent ===
    // Sidebar active / hover: text-accent-foreground on bg-accent
    {
      name: `[${mode}] accent-foreground on accent`,
      fg: colors.accentForeground,
      bg: colors.accent,
    },

    // === Destructive ===
    // Alert destructive: text-destructive on bg-card
    {
      name: `[${mode}] destructive on card (alert)`,
      fg: colors.destructive,
      bg: colors.card,
    },

    // === Sidebar ===
    // sidebar-foreground on sidebar-background (logo, text)
    {
      name: `[${mode}] sidebar-foreground on sidebar-background`,
      fg: colors.sidebarForeground,
      bg: colors.sidebarBackground,
    },
    // sidebar active link: sidebar-accent-foreground on sidebar-accent
    {
      name: `[${mode}] sidebar-accent-foreground on sidebar-accent`,
      fg: colors.sidebarAccentForeground,
      bg: colors.sidebarAccent,
    },

    // === Header avatar ===
    // bg-primary text-primary-foreground (initials circle)
    {
      name: `[${mode}] primary-foreground on primary (avatar)`,
      fg: colors.primaryForeground,
      bg: colors.primary,
    },

    // === Student agent ===
    // text-student on bg-background (agent name in chat-bubble)
    {
      name: `[${mode}] student on background (agent name)`,
      fg: colors.student,
      bg: colors.background,
    },
    // text-student on bg-student/10 (icon badge — non-text per WCAG 1.4.11)
    {
      name: `[${mode}] student on student/10 (icon)`,
      fg: colors.student,
      bg: alphaComposite(colors.student, colors.background, 0.1),
      nonText: true,
    },

    // === Teacher (user) ===
    // text-primary on bg-primary/10 (user icon in chat-bubble — non-text per WCAG 1.4.11)
    {
      name: `[${mode}] primary on primary/10 (user icon)`,
      fg: colors.primary,
      bg: alphaComposite(colors.primary, colors.background, 0.1),
      nonText: true,
    },

    // === Observer ===
    // text-observer-foreground on bg-background (observer panel)
    {
      name: `[${mode}] observer-foreground on background`,
      fg: colors.observerForeground,
      bg: colors.background,
    },
    // text-observer-foreground on bg-observer/5 (nudge bubble, empty state)
    {
      name: `[${mode}] observer-foreground on observer/5`,
      fg: colors.observerForeground,
      bg: alphaComposite(colors.observer, colors.background, 0.05),
    },
    // text-observer-foreground on bg-observer/10 (observer icon badge)
    {
      name: `[${mode}] observer-foreground on observer/10 (icon)`,
      fg: colors.observerForeground,
      bg: alphaComposite(colors.observer, colors.background, 0.1),
    },

    // === Observer revision callout ===
    // text-primary on bg-primary/5 (revision section heading)
    {
      name: `[${mode}] primary on primary/5 (revision callout)`,
      fg: colors.primary,
      bg: alphaComposite(colors.primary, colors.background, 0.05),
    },

    // === Muted text on observer empty state ===
    // text-muted-foreground on bg-observer/5
    {
      name: `[${mode}] muted-foreground on observer/5 (helper text)`,
      fg: colors.mutedForeground,
      bg: alphaComposite(colors.observer, colors.background, 0.05),
    },

    // === Sidebar footer ===
    // Sidebar footer uses text-muted-foreground on sidebar-background
    {
      name: `[${mode}] muted-foreground on sidebar-bg (footer)`,
      fg: colors.mutedForeground,
      bg: colors.sidebarBackground,
    },

    // === Sidebar nav inactive ===
    // sidebar-foreground/85 on sidebar-background
    {
      name: `[${mode}] sidebar-foreground/85 on sidebar-bg (nav inactive)`,
      fg: alphaComposite(
        colors.sidebarForeground,
        colors.sidebarBackground,
        0.85,
      ),
      bg: colors.sidebarBackground,
    },
  ];
}

const NORMAL_TEXT_RATIO = 4.5;
const LARGE_TEXT_RATIO = 3.0;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WCAG 2.1 AA Color Contrast', () => {
  describe('Light mode', () => {
    const pairs = buildPairs(lightColors, 'light');

    for (const pair of pairs) {
      const threshold =
        pair.largeText || pair.nonText ? LARGE_TEXT_RATIO : NORMAL_TEXT_RATIO;
      test(`${pair.name} >= ${threshold}:1`, () => {
        const ratio = contrastRatio(pair.fg, pair.bg);
        if (ratio < threshold) {
          const fgLum = relativeLuminance(...pair.fg);
          const bgLum = relativeLuminance(...pair.bg);
          console.error(
            `  FAIL: ${pair.name}\n` +
              `    Ratio: ${ratio.toFixed(2)}:1 (need ${threshold}:1)\n` +
              `    FG luminance: ${fgLum.toFixed(4)}, BG luminance: ${bgLum.toFixed(4)}`,
          );
        }
        expect(ratio).toBeGreaterThanOrEqual(threshold);
      });
    }
  });

  describe('Dark mode', () => {
    const pairs = buildPairs(darkColors, 'dark');

    for (const pair of pairs) {
      const threshold =
        pair.largeText || pair.nonText ? LARGE_TEXT_RATIO : NORMAL_TEXT_RATIO;
      test(`${pair.name} >= ${threshold}:1`, () => {
        const ratio = contrastRatio(pair.fg, pair.bg);
        if (ratio < threshold) {
          const fgLum = relativeLuminance(...pair.fg);
          const bgLum = relativeLuminance(...pair.bg);
          console.error(
            `  FAIL: ${pair.name}\n` +
              `    Ratio: ${ratio.toFixed(2)}:1 (need ${threshold}:1)\n` +
              `    FG luminance: ${fgLum.toFixed(4)}, BG luminance: ${bgLum.toFixed(4)}`,
          );
        }
        expect(ratio).toBeGreaterThanOrEqual(threshold);
      });
    }
  });

  // Sanity-check the contrast computation itself
  describe('Utility functions', () => {
    test('black on white is ~21:1', () => {
      const black: [number, number, number] = [0, 0, 0];
      const white: [number, number, number] = [1, 1, 1];
      const ratio = contrastRatio(black, white);
      expect(ratio).toBeGreaterThan(20);
      expect(ratio).toBeLessThan(22);
    });

    test('same color has ratio 1:1', () => {
      const c: [number, number, number] = [0.5, 0.5, 0.5];
      expect(contrastRatio(c, c)).toBe(1);
    });

    test('oklch pure white (1, 0, 0) produces luminance ~1', () => {
      const white = oklchToLinearRgb(1, 0, 0);
      const lum = relativeLuminance(...white);
      expect(lum).toBeGreaterThan(0.95);
      expect(lum).toBeLessThanOrEqual(1);
    });

    test('oklch near-black (0.01, 0, 0) produces luminance ~0', () => {
      const black = oklchToLinearRgb(0.01, 0, 0);
      const lum = relativeLuminance(...black);
      expect(lum).toBeLessThan(0.01);
    });

    test('alpha composite at 0 returns background', () => {
      const fg: [number, number, number] = [1, 0, 0];
      const bg: [number, number, number] = [0, 0, 1];
      const result = alphaComposite(fg, bg, 0);
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(1);
    });

    test('alpha composite at 1 returns foreground', () => {
      const fg: [number, number, number] = [1, 0, 0];
      const bg: [number, number, number] = [0, 0, 1];
      const result = alphaComposite(fg, bg, 1);
      expect(result[0]).toBeCloseTo(1);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(0);
    });
  });
});
