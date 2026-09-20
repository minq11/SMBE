// /work-orders 페이지의 CSS 가 모바일 폭에서 실제로 DRAFT 로우와 '작성 중' 탭을 숨기는지 검증.
// 앱 CSS(globals.css)를 실제 브라우저에서 로드한 뒤, /work-orders 마크업을 최소 재현하고
// getComputedStyle(display) 을 읽어 확인한다.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

// 1) 실제 앱 페이지 하나를 열어서 globals.css 가 로드되게 함
await page.goto("http://localhost:3001/");
await page.evaluate(() => document.fonts.ready);

// 2) /work-orders 의 관련 마크업만 body 에 재현
await page.evaluate(() => {
  document.body.innerHTML = `
    <nav class="wo-tabs" aria-label="지시서 상태">
      <a id="tab-all">전체</a>
      <a id="tab-active">예정·진행</a>
      <a id="tab-draft" class="wo-tab--desktop-only">작성 중</a>
    </nav>
    <table class="wo-table">
      <tbody>
        <tr id="row-active" data-status="ISSUED"><td>발급된 지시서</td></tr>
        <tr id="row-draft" data-status="DRAFT"><td>작성 중 초안</td></tr>
      </tbody>
    </table>`;
});

const measure = async () => {
  return page.evaluate(() => {
    const q = (id) => window.getComputedStyle(document.getElementById(id));
    return {
      viewportWidth: window.innerWidth,
      draftTabDisplay: q("tab-draft").display,
      activeTabDisplay: q("tab-active").display,
      draftRowDisplay: q("row-draft").display,
      activeRowDisplay: q("row-active").display,
    };
  });
};

console.log("MOBILE (390px):");
console.log(JSON.stringify(await measure(), null, 2));

// 3) 데스크톱 폭으로 리사이즈해서 반대로 검증
await page.setViewportSize({ width: 1200, height: 800 });
console.log("\nDESKTOP (1200px):");
console.log(JSON.stringify(await measure(), null, 2));

await page.screenshot({
  path: "test-results/mobile-draft-hide.png",
  fullPage: true,
});

await browser.close();
