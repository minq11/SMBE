import { z } from "zod";

/**
 * 연락처 입력 규칙. 가입 화면과 마이페이지 두 곳에서 같은 값을 받으므로
 * 규칙이 갈리지 않게 한 곳에 둔다. 둘 다 **선택 입력**이라 빈 문자열을 허용하고,
 * 저장할 때 빈 값은 NULL 로 내린다.
 */
export const phoneField = z
  .string()
  .trim()
  .max(30)
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine(
    (v) => v === "" || /^\+?[0-9]{7,15}$/.test(v),
    "전화번호는 7~15자리 숫자로 입력하세요.",
  );

/**
 * 로그인 계정에 메일이 없는 사람 — 카카오처럼 이메일을 넘기지 않는 provider 로
 * 가입한 경우 — 은 이 칸을 비울 수 없다.
 *
 * 비워 두면 users 의 메일 두 칸이 모두 NULL 이 되는데, 알림 쿼리들이
 * `COALESCE(contact_email, email) IS NOT NULL` 로 거르므로 **그 사람에게만 아무
 * 오류 없이 메일이 안 간다** (membership-notify, safety-meeting-reminders).
 * 안 가는 것보다 안 간 걸 아무도 모르는 것이 문제라 여기서 받아 둔다.
 *
 * 화면의 required 는 거들 뿐이다 — 판단은 서버에서 한다 (notifyEmailState).
 */
export const NOTIFY_EMAIL_REQUIRED =
  "알림 받을 메일을 입력하세요. 로그인에 쓴 계정에 메일 주소가 없어 이 주소로만 알림을 보낼 수 있습니다.";

/** 알림 받을 메일. 비워 두면 로그인 계정의 메일로 보낸다. */
export const contactEmailField = z
  .string()
  .trim()
  .max(254)
  .refine(
    (v) => v === "" || z.string().email().safeParse(v).success,
    "메일 주소를 확인하세요.",
  );

/** FormData 는 값이 없으면 null 을 준다. 선택 입력이므로 빈 문자열로 맞춘다. */
export const optionalText = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value : "";
