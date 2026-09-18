import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Assemble Next standalone static assets for local production-mode testing.
// Docker copies the same directories during its image build.
const root = process.cwd();
const standalone = resolve(root, ".next/standalone");
if (!existsSync(resolve(standalone, "server.js"))) {
  console.error("먼저 npm run build를 실행하세요.");
  process.exit(1);
}
for (const file of [".env.local", ".env"]) {
  if (existsSync(resolve(root, file))) process.loadEnvFile(resolve(root, file));
}
const portIndex = process.argv.indexOf("--port");
if (portIndex !== -1) process.env.PORT = process.argv[portIndex + 1];
process.env.HOSTNAME = "0.0.0.0";
cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), {
  recursive: true,
});
cpSync(resolve(root, "public"), resolve(standalone, "public"), {
  recursive: true,
});
await import(pathToFileURL(resolve(standalone, "server.js")).href);
