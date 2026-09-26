import { navRoot } from "./sidebar";

/** 이 주소들에는 화면이 없다 — 중간 폴더일 뿐이라 여기로는 돌아가지 않는다. */
const NO_PAGE = new Set([
  "/admin/companies",
  "/board",
  "/company",
  "/invite",
  "/standards/*/assessments",
  "/standards/*/revisions",
  "/w/*",
]);
const pattern = (path: string) =>
  path
    .split("/")
    .map((seg, i) => (i >= 2 && seg.length > 8 ? "*" : seg))
    .join("/");

/**
 * 뒤로가기가 갈 곳. 히스토리가 아니라 구조다 — 발급 직후 지시서에서 ← 를 누르면
 * 방금 지나온 작성 폼이 아니라 목록으로 가야 한다 (사장님 결정). 한 단계 위 주소로
 * 가되, 화면이 없는 중간 폴더는 건너뛰고, 지시서 편집 화면의 위는 목록이다
 * (초안의 상세는 편집으로 되돌려 보내므로 그 사이를 오가게 된다).
 */
export function parentPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  if (segments[0] === "work-orders" && segments.at(-1) === "edit")
    return "/work-orders";
  segments.pop();
  const parent = "/" + segments.join("/");
  if (NO_PAGE.has(pattern(parent))) return navRoot(pathname).parentHref;
  return parent;
}
