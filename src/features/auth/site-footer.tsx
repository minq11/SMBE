import Link from "next/link";
import { BUSINESS } from "@/lib/business";

/**
 * 로그인 전 공개 화면의 하단 — 사업자 표시(전자상거래법 제10조). 요금제를 파는
 * 초기 화면에 법이 요구하는 것이라 두고, 로그인한 작업 화면에는 두지 않는다
 * (거기서는 도움말 안에 있다). 면책·단서 문구가 아니라 상호·연락처다.
 *
 * 머리는 서비스 이름이다. 상호(패밀리포차)와 대표는 초기 화면에 있어야 하므로
 * 작은 한 줄로 두고, 나머지(등록번호·신고번호·주소·연락처·호스팅)는 시행규칙이
 * 허용하는 대로 "사업자 정보" 뒤에 접는다 (사장님 결정 2026-09-29).
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-name">{BUSINESS.service}</p>
      <details className="site-footer-fold">
        <summary>
          <span className="site-footer-owner">
            상호 {BUSINESS.name} · 대표 {BUSINESS.owner}
          </span>
          <span className="site-footer-more">사업자 정보</span>
        </summary>
        <ul className="site-footer-lines">
          <li>사업자등록번호 {BUSINESS.registration}</li>
          <li>통신판매업 신고 {BUSINESS.mailOrder}</li>
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
      </details>
      <p className="site-footer-links">
        <Link href="/terms">이용약관</Link>
        <Link href="/privacy">
          <strong>개인정보 처리방침</strong>
        </Link>
      </p>
      <p className="site-footer-copy">
        © {new Date().getFullYear()} {BUSINESS.service}
      </p>
    </footer>
  );
}
