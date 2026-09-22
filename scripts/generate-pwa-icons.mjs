// PWA 아이콘 생성. components/brand/app-icon.tsx 와 같은 그림(SVG)을
// 384·192·512·180 PNG 로 굽는다. 매번 재생성해도 되도록 idempotent.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#0f5b3c"/>
  <path d="M19 33.5l9 9 18-19" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="47.5" cy="16.5" r="5.5" fill="#f2b705"/>
</svg>`);
const outputs = [
  { path: "public/brand/logo.png", size: 384 },
  { path: "public/icon-192.png", size: 192 },
  { path: "public/icon-512.png", size: 512 },
  { path: "public/apple-touch-icon.png", size: 180 },
];
for (const { path, size } of outputs) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, path));
  console.log(`✓ ${path} (${size}x${size})`);
}
// maskable 아이콘: 원형·라운드로 crop 해도 안전하게 12% 패딩, 배경은 브랜드색.
await sharp(svg, { density: 384 })
  .resize(410, 410)
  .extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: { r: 15, g: 91, b: 60, alpha: 1 },
  })
  .png({ compressionLevel: 9 })
  .toFile(resolve(root, "public/icon-maskable-512.png"));
console.log("✓ public/icon-maskable-512.png (512x512, maskable)");
