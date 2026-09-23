// 디자인 헌법(docs/design-constitution.md) 가운데 기계가 검사할 수 있는 항목.
//
// 문서는 잊히지만 검사는 잊히지 않는다. `npm run lint` 와 `npm run build` 앞에서
// 돌고, 하나라도 어기면 실패한다. 규칙을 바꾸려면 문서를 먼저 고치고 여기를 맞춘다.
//
//   node scripts/check-constitution.mjs
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 경로 비교는 언제나 이 함수를 거친다. Windows 의 join() 은 `\` 를 주는데 아래
// 규칙들은 `src/app/globals.css` 처럼 `/` 로 적혀 있어, 그냥 비교하면 예외가 하나도
// 안 걸리고(색 규칙이 globals.css 를 통째로 위반으로 잡는다) 반대로 `/page.tsx` 는
// 아무것도 못 찾아 loading.tsx 검사가 조용히 건너뛰어진다.
const posix = (path) => relative(root, path).split(sep).join("/");
const problems = [];
const fail = (rule, file, detail) =>
  problems.push(`[${rule}] ${posix(file)}${detail ? " — " + detail : ""}`);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}
const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

// 5장 — 자식 화면을 가진 폴더마다 loading.tsx. 없으면 그 이동에는 아무 신호가 없다.
async function checkLoading() {
  const pages = (await walk(join(root, "src/app"))).filter((f) =>
    posix(f).endsWith("/page.tsx"),
  );
  const dirs = new Set(pages.map((f) => dirname(f)));
  for (const dir of dirs) {
    const hasChildScreen = [...dirs].some(
      (other) => other !== dir && other.startsWith(dir + sep),
    );
    if (hasChildScreen && !(await exists(join(dir, "loading.tsx"))))
      fail("5장 loading.tsx", dir, "자식 화면이 있는데 loading.tsx 가 없다");
  }
}

// 9장 — 브라우저 confirm/alert/prompt 금지. 확인은 useConfirm, 입력은 화면 안에서.
async function checkBrowserDialogs() {
  const files = (await walk(join(root, "src"))).filter(
    (f) => f.endsWith(".tsx") || f.endsWith(".ts"),
  );
  const pattern = /(^|[^\w.])(?:window\.)?(alert|confirm|prompt)\(/;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    // useConfirm 을 쓰는 파일의 confirm( 은 우리 시트다. 그 밖의 confirm( 은 브라우저 것.
    const ownConfirm = text.includes("useConfirm");
    text.split("\n").forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      const m = line.match(pattern);
      if (!m) return;
      if (m[2] === "confirm" && ownConfirm && !line.includes("window.confirm"))
        return;
      fail("9장 브라우저 대화상자", file, `${i + 1}행: ${trimmed}`);
    });
  }
}

// 9장 — 오류는 위에 조용히 뜨는 띠가 아니라 안내 창(FormErrorDialog). 저장은
// 아래에서 누르는데 오류가 위에 뜨면 아무 일도 없던 것처럼 보인다.
async function checkErrorBanner() {
  const files = (await walk(join(root, "src"))).filter(
    (f) => f.endsWith(".tsx") && !f.endsWith("form-error-dialog.tsx"),
  );
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (/className=["'`][^"'`]*\bform-error\b/.test(line))
        fail(
          "9장 오류 띠",
          file,
          `${i + 1}행: 오류는 FormErrorDialog 로 띄운다`,
        );
    });
  }
}

// 3장 — 색은 토큰으로. 기능 CSS 에 색 코드를 직접 쓰지 않는다 (globals.css 의
// :root 만 예외, 로그인 제공자 로고는 그 회사 색이라 예외).
async function checkRawColors() {
  const files = (await walk(join(root, "src"))).filter((f) => {
    const p = posix(f);
    return (
      (p.endsWith(".css") || p.endsWith(".tsx")) &&
      p !== "src/app/globals.css" &&
      // themeColor 는 글자 그대로여야 한다. 아래 checkThemeColor 가 --bg 와 맞춘다.
      p !== "src/app/layout.tsx" &&
      !p.includes("/brand/") &&
      !p.endsWith("provider-logos.tsx")
    );
  });
  const hex = /#[0-9a-fA-F]{3,8}\b/g;
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      const hits = (line.match(hex) ?? []).filter(
        (h) => !/^#(fff|ffffff|000|000000)$/i.test(h),
      );
      if (hits.length)
        fail("3장 색 토큰", file, `${i + 1}행: ${hits.join(", ")} → var(--…)`);
    });
  }
}

// 6장 — 공개 화면은 파는 글. 면책·단서 문구 금지.
async function checkPublicCopy() {
  const dirs = ["dashboard", "guide", "recognition-check", "contact", "auth"];
  const banned = [
    "책임을 대신",
    "책임지지",
    "참고용",
    "최종 판단",
    "정확하지 않을 수",
    "실제 인정은",
    "보장하지",
  ];
  for (const dir of dirs) {
    const base = join(root, "src/features", dir);
    if (!(await exists(base))) continue;
    for (const file of (await walk(base)).filter(
      (f) => f.endsWith(".tsx") || f.endsWith(".ts"),
    )) {
      const text = await readFile(file, "utf8");
      for (const phrase of banned)
        if (text.includes(phrase)) fail("6장 면책 문구", file, `"${phrase}"`);
    }
  }
}

// 3장 — 상태 표시줄 색은 배경색과 같다. 세 곳이 같은 값이어야 한다.
async function checkThemeColor() {
  const globals = await readFile(join(root, "src/app/globals.css"), "utf8");
  const bg = globals.match(/--bg:\s*(#[0-9a-fA-F]{6})/)?.[1]?.toLowerCase();
  const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
  const theme = layout
    .match(/themeColor:\s*"(#[0-9a-fA-F]{6})"/)?.[1]
    ?.toLowerCase();
  const manifest = JSON.parse(
    await readFile(join(root, "public/manifest.json"), "utf8"),
  );
  for (const [name, value] of [
    ["layout.tsx themeColor", theme],
    ["manifest theme_color", manifest.theme_color?.toLowerCase()],
    ["manifest background_color", manifest.background_color?.toLowerCase()],
  ])
    if (value !== bg)
      fail(
        "3장 상태 표시줄 색",
        join(root, "src/app/layout.tsx"),
        `${name} ${value} ≠ --bg ${bg}`,
      );
}

// 4장 — 글꼴은 Pretendard 하나. 다른 글꼴 파일·웹폰트 금지 (코드용 monospace 는 예외).
async function checkFonts() {
  const files = (await walk(join(root, "src"))).filter(
    (f) => f.endsWith(".css") || f.endsWith(".tsx") || f.endsWith(".ts"),
  );
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (/fonts\.googleapis|@fontsource|next\/font/.test(text))
      fail("4장 글꼴", file, "Pretendard 외 글꼴 불러오기");
  }
}

await Promise.all([
  checkLoading(),
  checkBrowserDialogs(),
  checkErrorBanner(),
  checkRawColors(),
  checkPublicCopy(),
  checkThemeColor(),
  checkFonts(),
]);

if (problems.length) {
  console.error("디자인 헌법 위반 " + problems.length + "건:\n");
  for (const p of problems) console.error("  " + p);
  console.error("\n규칙: docs/design-constitution.md");
  process.exit(1);
}
console.log(
  "디자인 헌법 검사 통과 (loading.tsx · 대화상자 · 오류 띠 · 색 토큰 · 면책 문구 · 상태 표시줄 색 · 글꼴)",
);
