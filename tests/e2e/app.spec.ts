import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

test("calendar opens on next trading day's month with the headline, mood and macro strip", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("November");
  await expect(page.locator(".mood-num")).toHaveText(/\d+/);
  await expect(page.locator(".macro-ev").first()).toBeVisible();
  await expect(page.locator(".next-badge")).toContainText("NOV 02");
  await expect(page.locator(".tbtn").first()).toBeVisible();
  // The app lives under mutaafaziz.com/metaphases/: every internal link must keep the base path.
  await expect(page.locator(".nav a", { hasText: "Compass" })).toHaveAttribute("href", "/metaphases/compass");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/metaphases/manifest.webmanifest");
});

test("tapping a company opens the deep sheet with both grades and reaction history", async ({ page }) => {
  await page.goto("./");
  await page.locator(".tbtn").first().click();
  const sheet = page.locator(".sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Setup into the print", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Compass quality", { exact: true })).toBeVisible();
  await expect(sheet.locator(".rx-col")).toHaveCount(4);
  await expect(page).toHaveURL(/\?t=/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("share URLs /t/SYM open that sheet", async ({ page }) => {
  await page.goto("./t/aapl");
  await expect(page.locator(".sheet h2")).toBeVisible();
  await expect(page).toHaveURL(/\?t=AAPL/);
});

test("glossary terms explain themselves", async ({ page }) => {
  await page.goto("./");
  await page.locator(".macro-mood .term-btn").click();
  await expect(page.locator(".term-pop")).toContainText("fear-to-greed");
});

test("day drawer lists reporters by session", async ({ page }) => {
  await page.goto("./");
  await page.locator(".cell[role=button]").nth(1).locator(".cell-head").click();
  await expect(page.locator(".drawer h2")).toBeVisible();
  await expect(page.locator(".sess-head").first()).toBeVisible();
});

test("week and day views render", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "week view" }).click();
  await expect(page.locator(".wcol")).toHaveCount(5);
  await page.getByRole("button", { name: "day view" }).click();
  await expect(page.locator(".dayview")).toBeVisible();
});

test("search finds a company by name and opens it", async ({ page, isMobile }) => {
  await page.goto("./");
  if (isMobile) await page.getByRole("button", { name: /search ticker/i }).click();
  else await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/search a ticker/i).fill("microsoft");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/t=MSFT/);
});

test("Compass maps a sample portfolio's exposure through funds", async ({ page }) => {
  await page.goto("./compass");
  await page.getByRole("button", { name: /sample portfolio/i }).first().click();
  await expect(page.locator(".stat b").first()).toContainText("$");
  await expect(page.locator(".ex-row").first()).toBeVisible();
});

test("Retrace grades the month", async ({ page }) => {
  await page.goto("./retrace");
  await expect(page.locator(".big-strip")).toBeVisible();
  await expect(page.locator(".stat").first()).toContainText(/\d+/);
});

test("no horizontal scroll and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  for (const p of ["./", "./watchlist", "./compass", "./retrace", "./learn", "./about"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

// Measures the open sheet: the dialog itself must not scroll sideways, no visible descendant may poke
// past the viewport's right edge, and nothing may clip its own content (documentElement checks miss
// overflow inside dialogs, ticket 0010). Only these elements clip or scroll on purpose:
const INTENTIONAL_CLIPPERS = [".peer-row", ".street-bar span", ".tile", ".season-track", ".pchart", ".skel"];
async function sheetOverflow(page: import("@playwright/test").Page) {
  return page.evaluate((allow) => {
    const dlg = document.querySelector<HTMLElement>("[role=dialog]");
    if (!dlg) return { scroll: -1, offenders: ["no dialog"] };
    const vw = window.innerWidth;
    const offenders: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className : ""}`;
    for (const el of dlg.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden") continue;
      if (el.closest(allow.join(","))) continue;
      if (r.right > vw + 1) offenders.push(`${name(el)} right=${Math.round(r.right)}`);
      // Anything else that hides or scrolls its overflow must not actually be overflowing sideways.
      if (cs.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1) offenders.push(`${name(el)} clips its content (${el.scrollWidth} > ${el.clientWidth})`);
    }
    return { scroll: dlg.scrollWidth - dlg.clientWidth, offenders: offenders.slice(0, 8) };
  }, INTENTIONAL_CLIPPERS);
}

// The text of each next-report stat (label and value) must sit inside its own column and the viewport.
async function statTextFits(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const cell of document.querySelectorAll<HTMLElement>(".nc-stats > div")) {
      const c = cell.getBoundingClientRect();
      for (const part of cell.querySelectorAll<HTMLElement>("dt, dd")) {
        const range = document.createRange();
        range.selectNodeContents(part);
        const t = range.getBoundingClientRect();
        if (t.left < c.left - 1 || t.right > c.right + 1 || t.right > window.innerWidth) bad.push(`${part.textContent} [${Math.round(t.left)}–${Math.round(t.right)}] in [${Math.round(c.left)}–${Math.round(c.right)}]`);
      }
    }
    return bad;
  });
}

for (const w of [390, 360]) {
  test(`the ticker sheet fits a ${w}px phone without sideways scroll`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    // No slide-in animation: measure the settled layout, not a frame mid-transition.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: w, height: 844 });
    // A long company name and worst-case-width numbers, plus a partial-data warning.
    await page.route("**/api/ticker/LONGCO", async (r) => {
      const d = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"LONGCO"'));
      d.profile.name = "International Consolidated Airlines & Extraordinarily Long Holdings Group plc";
      d.next = { ...d.next, epsE: -12.3456, revE: 1.234e12 };
      d.expectedMove = 12.34;
      d.warnings = ["Price history didn't load from Yahoo Finance; the chart and setup grade are missing for now."];
      r.fulfill({ contentType: "application/json", body: JSON.stringify(d) });
    });
    for (const sym of ["AAPL", "GOOGL", "LONGCO"]) {
      await page.goto(`./?t=${sym}`);
      const sheet = page.locator(".sheet");
      await expect(sheet.locator("h2")).toBeVisible();
      await expect(sheet.locator(".nc-stats dd").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const o = await sheetOverflow(page);
      expect(o.scroll, `${sym} sheet scrolls sideways at ${w}px`).toBeLessThanOrEqual(0);
      expect(o.offenders, `${sym} elements past the right edge at ${w}px`).toEqual([]);
      expect(await statTextFits(page), `${sym} next-report stat text clipped at ${w}px`).toEqual([]);
    }
    // Glossary pops in the next-report card open fully on screen and on top, not clipped by the card.
    const terms = page.locator(".next-card .term-btn");
    for (let i = 0; i < (await terms.count()); i++) {
      await terms.nth(i).click();
      const pop = page.locator(".next-card .term-pop");
      await expect(pop).toBeVisible();
      const fits = await pop.evaluate((p) => {
        const r = p.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 4, window.innerHeight - 1));
        return { inView: r.left >= 0 && r.right <= window.innerWidth, onTop: !!hit && p.contains(hit) };
      });
      expect(fits, `glossary pop ${i} at ${w}px`).toEqual({ inView: true, onTop: true });
      await page.keyboard.press("Escape");
      await expect(pop).toBeHidden();
    }
    // Every control in the sheet's header and call-to-action is a comfortable touch target.
    const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".sheet-head button, .sheet-head a, .sheet-cta button")]
      .map((b) => ({ n: b.getAttribute("aria-label") ?? b.textContent?.trim(), r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 40 || r.height < 40)).map(({ n, r }) => `${n} ${Math.round(r.width)}×${Math.round(r.height)}`));
    expect(small, `touch targets under 40px at ${w}px`).toEqual([]);
    // The loading state (skeletons) mustn't overflow either.
    await page.route("**/api/ticker/SLOWCO", () => { /* never answers: the sheet stays loading */ });
    await page.goto("./?t=SLOWCO");
    await expect(page.locator(".sheet .sheet-body .skel").first()).toBeVisible();
    const loading = await sheetOverflow(page);
    expect(loading.scroll, `loading sheet scrolls sideways at ${w}px`).toBeLessThanOrEqual(0);
    expect(loading.offenders, `loading sheet past the right edge at ${w}px`).toEqual([]);
  });
}

test("the ticker sheet doesn't overflow on desktop either", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "desktop layout");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?t=AAPL");
  await expect(page.locator(".sheet .nc-stats dd").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  const o = await sheetOverflow(page);
  expect(o.scroll).toBeLessThanOrEqual(0);
  expect(o.offenders).toEqual([]);
  expect(await statTextFits(page)).toEqual([]);
});

test("the week's brief: open on desktop, collapsed on phone, remembered, and its reporters open the sheet", async ({ page, isMobile }) => {
  await page.goto("/");
  const brief = page.locator(".brief");
  const head = brief.locator(".brief-head");
  await expect(head).toContainText("This week");
  await expect(head).toContainText("Nov 2–6");
  await expect(head).toContainText(/\d+ popular companies report \(336 in all\)/);
  await expect(head).toHaveAttribute("aria-expanded", isMobile ? "false" : "true");
  if (isMobile) await head.click();
  await expect(brief.locator(".brief-co")).toHaveCount(5);
  await expect(brief.locator(".brief-co").first()).toContainText("AAPL");
  await expect(brief.locator(".brief-macro")).toContainText("Jobs report");
  await expect(brief.locator(".brief-stat").first()).toContainText("including 1 of the 10 largest (Apple Inc.)");
  await expect(brief).toContainText(/Market mood reads \d+/);

  // The choice survives a reload.
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.locator(".brief-head")).toHaveAttribute("aria-expanded", "false");
  await page.locator(".brief-head").click();

  await brief.locator(".brief-co").first().click();
  await expect(page).toHaveURL(/t=AAPL/);
  await expect(page.locator(".sheet")).toBeVisible();
});

test("the brief follows navigation to another week", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "week view" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const head = page.locator(".brief-head");
  await expect(head).toContainText("Week of Nov 9–13");
  await expect(head).toContainText(/\d+ popular companies report \(\d+ in all\) · (\d+|none) of the 10 largest/);
  await expect(head).not.toContainText("336 companies");
});

test("the brief is honest when a week's earnings didn't load", async ({ page }) => {
  // The recorded November fixture couldn't load Nov 26 – Dec 4 (see its warnings).
  await page.goto("/?d=2026-11-30");
  await page.getByRole("button", { name: "week view" }).click();
  const head = page.locator(".brief-head");
  await expect(head).toContainText("Week of Nov 30–Dec 4");
  await expect(head).toContainText("Earnings for this week didn't load");
  await expect(head).not.toContainText("quiet");
});
