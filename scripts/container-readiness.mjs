// Read secrets inside the container, never interpolate them into shell text.
const token = process.env.HEALTHCHECK_TOKEN;
if (!token || token.length < 32) {
  console.error("HEALTHCHECK_TOKEN에 32자 이상 토큰을 설정하세요.");
  process.exit(1);
}
try {
  const response = await fetch("http://127.0.0.1:3000/api/health/ready", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  console.log(response.status, await response.json());
  process.exitCode = response.ok ? 0 : 1;
} catch {
  console.error("진단 API에 연결하지 못했습니다. 컨테이너 상태를 확인하세요.");
  process.exitCode = 1;
}
