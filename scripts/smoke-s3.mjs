// S3 크리덴셜/버킷/CORS/IAM 정책 스모크 테스트.
// PutObject → GetObject → DeleteObject 순차 실행 후 결과 리포트.
import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION;
if (!bucket || !region) {
  console.error("✗ S3_BUCKET / AWS_REGION 미설정");
  process.exit(1);
}

const s3 = new S3Client({ region });
const key = "_smoke/" + randomUUID() + ".txt";
const body = "SMBE S3 smoke test " + new Date().toISOString();

const step = async (label, fn) => {
  try {
    const result = await fn();
    console.log("✓ " + label + (result ? ": " + result : ""));
  } catch (error) {
    console.error("✗ " + label + ": " + error.message);
    if (error.$metadata) console.error("  HTTP " + error.$metadata.httpStatusCode);
    process.exit(1);
  }
};

console.log("Region: " + region);
console.log("Bucket: " + bucket);
console.log("Key:    " + key);
console.log();

await step("HeadBucket (접근 · 리전 확인)", async () => {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  return "ok";
});

await step("PutObject (직접 업로드)", async () => {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain",
    }),
  );
  return body.length + " bytes";
});

await step("GetObject (직접 조회)", async () => {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const read = await res.Body.transformToString();
  return read === body ? "내용 일치" : "내용 불일치!";
});

await step("Presigned PUT URL 발급 (앱이 실제 쓸 경로)", async () => {
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key + ".signed" }),
    { expiresIn: 300 },
  );
  return url.slice(0, 80) + "...";
});

await step("Presigned GET URL 발급", async () => {
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 300 },
  );
  return url.slice(0, 80) + "...";
});

await step("DeleteObject (정리)", async () => {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return "ok";
});

console.log("\n모든 단계 통과. 앱 통합 진행 준비 완료.");
