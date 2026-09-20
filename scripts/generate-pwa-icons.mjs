// PWA 아이콘 생성. logo.png(384x384) 를 192·512·180 으로 리사이즈.
// 512 는 lanczos3 로 업스케일. 매번 재생성해도 되도록 idempotent.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "public/brand/logo.png");
const outputs = [
  { path: "public/icon-192.png", size: 192 },
  { path: "public/icon-512.png", size: 512 },
  { path: "public/apple-touch-icon.png", size: 180 },
];

for (const { path, size } of outputs) {
  await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, path));
  console.log(`✓ ${path} (${size}x${size})`);
}

// maskable 아이콘: 사파리/크롬이 원형·라운드로 crop 해도 안전하게 12% 패딩.
await sharp(src)
  .resize(410, 410, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(resolve(root, "public/icon-maskable-512.png"));
console.log("✓ public/icon-maskable-512.png (512x512, maskable)");
