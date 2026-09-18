import { config } from "dotenv";
import { connectionStatus } from "../src/server/connections";
config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const status = await connectionStatus();
  console.log(`Neon: ${status.database}\nS3: ${status.storage}`);
  if (Object.values(status).some((value) => value !== "ok")) {
    console.error(
      "연결되지 않은 서비스의 환경변수·권한·네트워크를 확인하세요. 비밀값과 원본 오류는 출력하지 않습니다.",
    );
    process.exitCode = 1;
  }
}
void main();
