import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const bootstrap = readFileSync("public/theme-init.js", "utf8");
function firstPaint(
  saved: string | null,
  systemDark: boolean,
  blocked = false,
) {
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  const meta: Record<string, string> = {};
  runInNewContext(bootstrap, {
    localStorage: {
      getItem: () => {
        if (blocked) throw new Error("Storage blocked");
        return saved;
      },
    },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: {
      documentElement: root,
      querySelector: () => ({
        setAttribute: (name: string, value: string) => {
          meta[name] = value;
        },
      }),
    },
  });
  return { ...root, meta };
}
describe("theme before first paint", () => {
  it("honours a saved selection before React starts, even against system preference", () => {
    expect(firstPaint("light", true).dataset.theme).toBe("light");
    const dark = firstPaint("dark", false);
    expect(dark.dataset.theme).toBe("dark");
    expect(dark.style.colorScheme).toBe("dark");
    expect(dark.style.backgroundColor).toBe("#171512");
    expect(dark.meta.content).toBe("#171512");
  });
  it("uses system appearance for new or invalid preferences", () => {
    expect(firstPaint(null, true).dataset.theme).toBe("dark");
    expect(firstPaint("unknown", false).dataset.theme).toBe("light");
  });
  it("still renders when browser storage is blocked", () => {
    expect(firstPaint(null, true, true).dataset.theme).toBe("dark");
    expect(firstPaint(null, false, true).dataset.theme).toBe("light");
  });
});
function luminance(hex: string) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
describe("theme text contrast", () => {
  const css = readFileSync("src/theme.css", "utf8");
  const blocks = [
    css.match(/:root \{([\s\S]*?)\n\}/)![1],
    css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)![1],
  ];
  const tokens = blocks.map((b) =>
    Object.fromEntries(
      [...b.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map((m) => [m[1], m[2]]),
    ),
  );
  for (const [index, own] of tokens.entries()) {
    const palette = { ...tokens[0], ...own };
    it(`${index ? "dark" : "light"} mode maintains AA contrast for text, buttons and status badges`, () => {
      const pairs = [
        ["text", "surface"],
        ["text-muted", "surface"],
        ["text-muted", "canvas"],
        ["accent-text", "accent-soft"],
        ["on-accent", "accent"],
        ...["success", "danger", "warning", "purple"].map((t) => [
          t,
          `${t}-soft`,
        ]),
      ];
      for (const [foreground, background] of pairs) {
        const a = luminance(palette[foreground]),
          b = luminance(palette[background]);
        expect(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${index ? "dark" : "light"} mode keeps input boundaries and focus indicators distinguishable`, () => {
      for (const foreground of ["border-strong", "focus"]) {
        for (const background of ["surface", "canvas", "surface-muted"]) {
          const a = luminance(palette[foreground]),
            b = luminance(palette[background]);
          expect(
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});
