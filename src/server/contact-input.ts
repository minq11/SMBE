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
