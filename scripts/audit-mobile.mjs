import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch();
const out = "test-results/mobile-audit";
await mkdir(out, { recursive: true });
try {
  for (const width of [320, 390, 768]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    for (const route of [
      "/",
      "/login",
      "/contact",
      "/guide",
      "/recognition-check",
    ]) {
      await page.goto("http://127.0.0.1:3001" + route);
      await page.locator("h1").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const findings = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll("main *,header *")]
          .filter((el) => {
            if (el.closest(".honeypot")) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
          })
          .slice(0, 12)
          .map((el) => ({
            tag: el.tagName,
            className: el.className,
            text: el.textContent?.slice(0, 45),
          })),
      }));
      console.log(JSON.stringify({ width, route, ...findings }));
      await page.screenshot({
        path: `${out}/${width}-${route.replaceAll("/", "_") || "home"}.png`,
        fullPage: true,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
