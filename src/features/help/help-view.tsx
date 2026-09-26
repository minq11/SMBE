import Link from "next/link";
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  MessageSquare,
  Scale,
} from "lucide-react";
import { BUSINESS } from "@/lib/business";

/**
 * 도움말. 사장님이 처음 앉아서 "그래서 뭘 하면 되나" 를 세 줄로 알고, 막히는 곳
 * 대여섯 가지 답을 찾고, 법 가이드·문의로 넘어가는 화면. 설명서가 아니다 — 단추
 * 이름과 확인 창이 화면에서 말하고, 여기는 길만 가리킨다. 사업자 표시는 맨 아래.
 */
const STEPS = [
  {
    title: "작업표준서 만들기",
    body: "반복 작업의 방법·위험성평가·체크리스트를 한 번 등록합니다. 표준서가 없어도 간이 위험성평가로 지시서를 낼 수 있습니다.",
    href: "/standards",
    cta: "작업표준서",
  },
  {
    title: "작업지시 발급",
    body: "표준서를 고르고 회차·작업자·장소를 적어 발급합니다. 위험작업이면 허가 항목까지 한 번에 채웁니다.",
    href: "/work-orders/new",
    cta: "새 작업지시",
  },
  {
    title: "현장에서 TBM·점검",
    body: "작업자는 QR이나 링크로 들어와 TBM을 확인하고 작업 중 점검을 남깁니다. 불량은 담당 관리자에게 바로 갑니다.",
    href: "/inspections",
    cta: "점검 기록",
  },
];

const FAQ = [
  {
    q: "작업자는 어떻게 들어오나요?",
    a: "지시서의 QR을 작업 장소에 붙이거나, 발급 때 보내지는 이메일 링크로 들어옵니다. 링크 화면에서 홈 화면에 추가하면 앱처럼 씁니다.",
  },
  {
    q: "불량이 나오면 어떻게 되나요?",
    a: "점검에서 불량을 고르면 담당 관리자의 불량 알림함에 올라갑니다. 관리자가 조치 내용을 적어 조치완료하면 종결됩니다.",
  },
  {
    q: "쉬는 날은 어떻게 빼나요?",
    a: "작업지시 작성에서 작업 회차를 만든 뒤 목록에서 그 날을 지우면 됩니다. 발급 뒤에는 회차를 바꿀 수 없어 취소 후 재발행합니다.",
  },
  {
    q: "표준서 내용을 고치려면?",
    a: "확정된 표준서는 고치지 않습니다. 표준서 개정으로 사본을 만들어 고치고 확정하면 새 판이 됩니다. 이미 발급된 지시서는 그때 판을 그대로 둡니다.",
  },
  {
    q: "무료와 유료는 무엇이 다른가요?",
    a: "인원 제한 없이 무료로 쓰고, 출력물·사진 첨부·과거 열람·모니터링이 유료입니다. 요금제 화면에 정리돼 있습니다.",
  },
];

export function HelpView() {
  return (
    <div className="help">
      <section className="help-section" aria-labelledby="help-start">
        <h2 id="help-start">시작은 세 단계</h2>
        <ol className="help-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="help-step-no">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <Link href={s.href} className="text-button">
                  {s.cta} →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="help-section" aria-labelledby="help-faq">
        <h2 id="help-faq">자주 묻는 것</h2>
        {FAQ.map((f) => (
          <details className="std-fold help-faq" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section className="help-section" aria-labelledby="help-more">
        <h2 id="help-more">더 보기</h2>
        <div className="help-links">
          <Link href="/guide" className="help-link">
            <BookOpen size={18} />
            <span>
              <strong>안전법 가이드</strong>
              <small>우리 회사 규모에 맞는 산안법·중처법 의무</small>
            </span>
          </Link>
          <Link href="/recognition-check" className="help-link">
            <ClipboardCheck size={18} />
            <span>
              <strong>인정 준비도 진단</strong>
              <small>25문항, 5분</small>
            </span>
          </Link>
          <Link href="/billing" className="help-link">
            <FileText size={18} />
            <span>
              <strong>요금제</strong>
              <small>무료·유료 차이와 이용 관리</small>
            </span>
          </Link>
          <Link href="/contact" className="help-link">
            <MessageSquare size={18} />
            <span>
              <strong>문의하기</strong>
              <small>10영업일 안에 답합니다</small>
            </span>
          </Link>
        </div>
      </section>

      {/* 사업자 표시(전자상거래법 제10조). 로그인 후에는 하단 대신 여기 한 곳. */}
      <section
        className="help-section help-provider"
        aria-labelledby="help-provider"
      >
        <h2 id="help-provider">
          <Scale size={16} /> 서비스 제공자
        </h2>
        <dl className="wo-facts wo-facts--tight">
          <div>
            <dt>상호</dt>
            <dd>{BUSINESS.name}</dd>
          </div>
          <div>
            <dt>대표</dt>
            <dd>{BUSINESS.owner}</dd>
          </div>
          <div>
            <dt>사업자등록번호</dt>
            <dd>{BUSINESS.registration}</dd>
          </div>
          <div>
            <dt>주소</dt>
            <dd>{BUSINESS.address}</dd>
          </div>
          <div>
            <dt>고객센터</dt>
            <dd>
              <a href={"tel:" + BUSINESS.phone.replaceAll("-", "")}>
                {BUSINESS.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt>이메일</dt>
            <dd>
              <a href={"mailto:" + BUSINESS.email}>{BUSINESS.email}</a>
            </dd>
          </div>
          <div>
            <dt>호스팅</dt>
            <dd>{BUSINESS.hosting}</dd>
          </div>
        </dl>
        <p className="help-legal">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
        </p>
      </section>
    </div>
  );
}
