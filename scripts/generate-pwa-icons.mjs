// 앱 아이콘 생성. components/brand/app-icon.tsx 와 같은 그림(SVG)을 PNG·ICO 로
// 굽는다. 매번 재생성해도 되도록 idempotent.
//
//   node scripts/generate-pwa-icons.mjs
//
// 두 종류가 있다.
// - 여백 있는 아이콘 (icon-192·512, logo, favicon): 초록 둥근 사각형 바깥이 투명.
//   브라우저 탭·바탕화면 설치처럼 배경 위에 그대로 놓이는 자리용.
// - 가득 찬 아이콘 (apple-touch-icon, maskable): 캔버스 전체가 초록. iOS 는
//   투명을 검정으로 채우고 모서리를 알아서 둥글리므로 투명 여백이 있으면 둘레가
//   까맣게 보인다. 안드로이드 maskable 도 같은 이유로 가득 채우고, 어떤 모양으로
//   잘려도 안전하게 그림을 가운데 80% 안에 둔다.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GLYPH = `
  <path d="M19 33.5l9 9 18-19" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="47.5" cy="16.5" r="5.5" fill="#f2b705"/>`;

/** 투명 여백 + 둥근 초록 사각형 (화면의 AppIcon 과 같은 그림) */
const padded =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#0f5b3c"/>${GLYPH}
</svg>`);

/** 캔버스 전체가 초록. scale 로 그림을 가운데로 모은다 (maskable 안전 영역). */
const fullBleed = (scale) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0f5b3c"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${GLYPH}</g>
</svg>`);

const png = (svg, size) =>
  sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 });

const outputs = [
  { path: "public/brand/logo.png", size: 384, svg: padded },
  { path: "public/icon-192.png", size: 192, svg: padded },
  { path: "public/icon-512.png", size: 512, svg: padded },
  { path: "public/apple-touch-icon.png", size: 180, svg: fullBleed(0.92) },
  { path: "public/icon-maskable-512.png", size: 512, svg: fullBleed(0.8) },
];
for (const { path, size, svg } of outputs) {
  await png(svg, size).toFile(resolve(root, path));
  console.log(`✓ ${path} (${size}x${size})`);
}

// SVG 파비콘 — 크기에 상관없이 선명하다 (Safari 는 대신 PNG 를 쓴다).
await writeFile(resolve(root, "public/icon.svg"), padded);
console.log("✓ public/icon.svg");

// favicon.ico — 주소를 직접 요청하는 브라우저·북마크용. ICO 안에 PNG 를 담는다
// (Vista 이후 표준, 모든 현행 브라우저가 읽는다). 16·32·48.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(padded, s).toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
const dir = Buffer.alloc(16 * images.length);
let offset = 6 + dir.length;
images.forEach((buf, i) => {
  const s = sizes[i];
  const e = i * 16;
  dir.writeUInt8(s === 256 ? 0 : s, e); // width
  dir.writeUInt8(s === 256 ? 0 : s, e + 1); // height
  dir.writeUInt8(0, e + 2); // palette
  dir.writeUInt8(0, e + 3); // reserved
  dir.writeUInt16LE(1, e + 4); // planes
  dir.writeUInt16LE(32, e + 6); // bpp
  dir.writeUInt32LE(buf.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
await writeFile(
  resolve(root, "public/favicon.ico"),
  Buffer.concat([header, dir, ...images]),
);
console.log("✓ public/favicon.ico (16·32·48)");
