import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

// 표준 AWS_* env 를 SDK 가 자동 픽업 (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
// 버킷은 S3_BUCKET 명시.
export const S3_BUCKET = process.env.S3_BUCKET ?? "";
if (!S3_BUCKET && process.env.NODE_ENV !== "test") {
  // 배포 환경에서 S3 관련 액션 첫 호출 시 명시적 에러가 나도록 여기선 경고만.
  console.warn("[s3-client] S3_BUCKET 이 설정되지 않았습니다. 첨부 기능 비활성.");
}

let cachedClient: S3Client | null = null;
export function s3(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.AWS_REGION ?? "ap-northeast-2",
    });
  }
  return cachedClient;
}
