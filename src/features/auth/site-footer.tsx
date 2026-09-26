import Link from "next/link";
import { BUSINESS } from "@/lib/business";

/**
 * 로그인 전 공개 화면의 하단 — 사업자 표시(전자상거래법 제10조). 요금제를 파는
 * 초기 화면에 법이 요구하는 것이라 두고, 로그인한 작업 화면에는 두지 않는다
 * (거기서는 마이페이지 안에 있다). 면책·단서 문구가 아니라 상호·연락처다.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-name">{BUSINESS.name}</p>
      <ul className="site-footer-lines">
        <li>대표 {BUSINESS.owner}</li>
        <li>사업자등록번호 {BUSINESS.registration}</li>
        <li>{BUSINESS.address}</li>
        <li>
          고객센터{" "}
          <a href={"tel:" + BUSINESS.phone.replaceAll("-", "")}>
            {BUSINESS.phone}
          </a>
        </li>
        <li>
          <a href={"mailto:" + BUSINESS.email}>{BUSINESS.email}</a>
        </li>
        <li>호스팅 {BUSINESS.hosting}</li>
      </ul>
      <p className="site-footer-links">
        <Link href="/terms">이용약관</Link>
        <Link href="/privacy">
          <strong>개인정보 처리방침</strong>
        </Link>
      </p>
      <p className="site-footer-copy">
        © {new Date().getFullYear()} {BUSINESS.name} · {BUSINESS.service}
      </p>
    </footer>
  );
}
