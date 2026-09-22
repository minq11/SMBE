import { LoadingLogo } from "@/components/brand/loading-logo";

/**
 * 이동 중 전체화면 로고.
 *
 * `loading.tsx` 는 **같은 폴더의 자식 세그먼트가 새로 들어올 때만** 뜬다. 홈에서
 * `/work-orders/new` 로 가면 루트 아래에 `work-orders` 가 새로 들어오니 이 파일이
 * 걸리지만, `/work-orders` 에서 `/work-orders/[id]` 로 가면 바뀌는 건 `work-orders`
 * 안쪽이라 루트 경계는 반응하지 않는다. 그래서 자식 화면을 가진 폴더마다 이
 * 파일을 그대로 재수출한 `loading.tsx` 를 둔다 — 어디서 어디로 가든 같은 표시.
 */
export default function RootLoading() {
  return <LoadingLogo />;
}
