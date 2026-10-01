import Link from "next/link";
import {
  ArrowRight,
  Circle,
  MessageSquare,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ENTERPRISE_FROM,
  PAID_PLANS,
  formatKrw,
  launchDiscountPercent,
  maxLaunchDiscountPercent,
  withVat,
} from "@/features/billing/plans";
import {
  MeetingShot,
  OrderShot,
  StandardShot,
  WorkerShot,
} from "./public-mocks";
import { ScrollReveal, reveal } from "./scroll-reveal";
import { LawTable, type LawRow } from "./public-law";
import { PRO_FEATURES } from "@/features/billing/pro-features";

/**
 * 로그인 전 홈의 첫 화면 밑. 좁은 화면에서는 패널 하나가 한 화면이고(풀페이지),
 * 내리면 글과 미리보기가 떠오른다. 순서는 사장님 결정(2026-10-01):
 * 대표 업무 4단계(미리보기 왼쪽·오른쪽·왼쪽·오른쪽) → 법 대응 표 → 요금 → FAQ 6개.
 */
const STEPS = [
  {
    title: "표준서 한 번 적으면 끝",
    lead: "작업 방법·보호구·위험성평가·체크리스트를 한 번 등록합니다.",
    points: [
      "작업 단계와 보호구 칩",
      "위험성평가는 별도 문서로 함께",
      "개정하면 새 판, 옛 판은 그대로",
    ],
    shot: <StandardShot />,
  },
  {
    title: "지시서 발급, QR 게시",
    lead: "표준서를 고르고 날짜·작업자만 적으면 발급. QR 을 뽑아 현장에 붙입니다.",
    points: [
      "위험작업이면 허가서까지 한 번에",
      "표준서의 위험성평가를 그대로",
      "A4 한 장 출력 · 링크 전달",
    ],
    shot: <OrderShot />,
  },
  {
    title: "작업자는 QR 만 찍으면",
    lead: "앱 설치 없이 카메라로 QR 을 찍고 TBM 확인·작업 중 점검을 남깁니다.",
    points: [
      "앱 설치 없음",
      "외국인 근로자는 자기 언어로",
      "불량은 담당 관리자에게 바로",
    ],
    shot: <WorkerShot />,
  },
  {
    title: "주간 회의와 사고 처리까지",
    lead: "한 주의 점검 불량·사고·조치가 회의 안건으로 모이고, 사고는 등급에 따라 할 일이 생깁니다.",
    points: [
      "이번 주 안건 자동 수집",
      "사고 등록 → 법이 요구하는 할 일",
      "산업재해조사표 서식",
    ],
    shot: <MeetingShot />,
  },
];

/* 근거는 사고 할 일(incidents/model.ts DUTY_LABEL)과 같은 표기를 쓴다. 요지는 우리가 풀어
   쓴 것이고 조문 그대로는 국가법령정보센터 링크 너머에 있다 — 법은 바뀐다. */
const LAW_ROWS: LawRow[] = [
  {
    duty: "위험성평가 실시·기록",
    basis: "산안법 36조",
    where: "표준서의 위험성평가 · 회차 이력",
    law: "산업안전보건법",
    article: "제36조 위험성평가의 실시",
    gist: [
      "사업주는 기계·설비·원재료·작업행동 등에서 유해·위험요인을 찾아내어 위험성이 허용 가능한지 평가하고, 그 결과에 따라 조치한다.",
      "평가할 때 해당 작업장의 근로자를 참여시킨다.",
      "평가 결과와 조치사항을 기록해 보존한다.",
      "방법·절차·시기는 고용노동부 고시(사업장 위험성평가에 관한 지침)로 정한다.",
    ],
    url: "https://www.law.go.kr/법령/산업안전보건법/제36조",
  },
  {
    duty: "평가 결과 근로자 공유",
    basis: "위험성평가 고시 15조",
    where: "지시서 QR → 작업자 TBM 확인 기록",
    law: "사업장 위험성평가에 관한 지침 (고용노동부 고시)",
    article: "위험성평가의 시기와 결과 공유",
    gist: [
      "위험성평가는 최초 평가 뒤 정기·수시로 다시 하고, 설비·물질·작업 방법이 바뀌거나 사고가 나면 그때 수시 평가를 한다.",
      "평가 결과 가운데 위험요인과 감소대책은 작업 전 안전점검회의(TBM) 등으로 근로자에게 알린다.",
      "우리 지시서의 TBM 확인 기록이 그 '알렸다'의 증거다.",
    ],
    url: "https://www.law.go.kr/행정규칙/사업장위험성평가에관한지침",
  },
  {
    duty: "위험작업 허가·감독",
    basis: "산업안전보건기준규칙",
    where: "작업허가서(PTW) · 승인 기록",
    law: "산업안전보건기준에 관한 규칙",
    article: "화기·밀폐공간·고소 등 위험작업의 사전 조치",
    gist: [
      "화재위험작업, 밀폐공간 작업, 전기·고소 작업 등은 작업 전에 위험 요인을 확인하고 감시자·감독자를 두는 등 정해진 조치를 한 뒤에 한다.",
      "밀폐공간은 작업 허가 절차를 포함한 프로그램을 수립해 운영한다.",
      "우리 작업허가서는 그 사전 조치를 신청·승인 기록으로 남긴다.",
    ],
    url: "https://www.law.go.kr/법령/산업안전보건기준에관한규칙",
  },
  {
    duty: "작업 중지·대피, 재해 보고",
    basis: "산안법 54조 · 57조",
    where: "안전사고 등록 · 산업재해조사표",
    law: "산업안전보건법",
    article: "제54조 중대재해 발생 시 조치 · 제57조 산업재해 보고",
    gist: [
      "중대재해가 나면 즉시 작업을 중지하고 근로자를 대피시키는 등 필요한 조치를 하고, 지체 없이 고용노동부에 보고한다 (54조).",
      "산업재해 발생 사실을 숨기지 않고, 발생 원인 등을 기록해 보존한다 (57조).",
      "휴업 3일 이상 등 정해진 재해는 산업재해조사표로 한 달 안에 보고한다 (57조).",
    ],
    url: "https://www.law.go.kr/법령/산업안전보건법/제57조",
  },
  {
    duty: "재발방지대책 이행",
    basis: "산안법 57조 2항",
    where: "사고 상세의 할 일 · 완료 기록",
    law: "산업안전보건법",
    article: "제57조 산업재해 발생 은폐 금지 및 보고 등",
    gist: [
      "산업재해의 발생 원인 등을 기록하고 보존한다.",
      "보고 대상 재해는 발생 개요·원인·재발방지 계획을 함께 보고한다.",
      "우리 사고 상세는 재발방지대책마다 담당·기한·완료를 기록하고, 다 끝나야 종결된다.",
    ],
    url: "https://www.law.go.kr/법령/산업안전보건법/제57조",
  },
  {
    duty: "안전보건 점검·경영책임자 확인",
    basis: "중처법 시행령 4조",
    where: "주간 안전회의 · 경영책임자 확인",
    law: "중대재해 처벌 등에 관한 법률 시행령",
    article: "제4조 안전보건관리체계의 구축 및 이행 조치",
    gist: [
      "경영책임자는 안전·보건 목표와 경영방침을 세우고, 유해·위험요인을 확인·개선하는 업무절차를 마련해 반기마다 점검한다.",
      "안전보건 예산을 편성·집행하고, 관리책임자 등이 일을 하는지 반기마다 평가한다.",
      "종사자 의견을 듣는 절차, 중대재해에 대비한 매뉴얼(작업 중지·대피·보고·구호)을 마련해 반기마다 점검한다.",
    ],
    url: "https://www.law.go.kr/법령/중대재해처벌등에관한법률시행령/제4조",
  },
];

const FAQ: Array<{ q: string; a: string; href?: [string, string] }> = [
  {
    q: "앱을 설치해야 하나요?",
    a: "아니요. 관리자는 브라우저로, 작업자는 지시서 QR 이나 이메일 링크로 들어옵니다. 링크 화면을 홈 화면에 추가하면 앱처럼 씁니다.",
  },
  {
    q: "정말 무료인가요?",
    a: "인원 제한 없이 무료입니다. 사진 첨부·문자 알림·출력물·통합 대시보드 같은 부가 기능이 필요해질 때 인원 구간으로 유료 전환합니다.",
  },
  {
    q: "외국인 근로자도 쓸 수 있나요?",
    a: "위험요인과 감소대책을 자기 언어로 읽고 확인 기록을 남깁니다. 한국어 원문과 함께 보관돼 관리자는 그대로 봅니다.",
  },
  {
    q: "표준서가 없어도 시작할 수 있나요?",
    a: "네. 간이 위험성평가로 지시서를 바로 낼 수 있습니다. 표준서는 반복 작업부터 하나씩 등록하면 됩니다.",
  },
  {
    q: "위험성평가 인정 준비가 되나요?",
    a: "매일 쌓이는 표준서·지시서·허가서·점검 기록이 그대로 인정 준비 자료입니다. 인정받으면 3년간 정기 감독 유예, 산재보험료 20% 인하.",
    href: ["/recognition-check", "우리 회사 준비도 3분 진단"],
  },
  {
    q: "사고가 나면 무엇을 해 주나요?",
    a: "작업자가 세 칸으로 신고하면 관리자 홈의 처리할 일에 바로 올라갑니다. 등급에 따라 법이 요구하는 할 일(보고·조사표·재발방지·공유)이 기한과 함께 생기고, 다 끝내야 종결됩니다.",
  },
];

export function PublicPanels() {
  return (
    <div className="public-panels">
      <ScrollReveal />
      {STEPS.map((s, i) => {
        const side = i % 2 === 0 ? "left" : "right";
        return (
          <section
            key={s.title}
            className="public-panel public-step"
            data-side={side}
            aria-labelledby={`public-step-${i + 1}`}
          >
            <div className="public-step-text" {...reveal("fade-up")}>
              <p className="public-kicker">
                대표 업무 {i + 1}/{STEPS.length}
              </p>
              <h2 id={`public-step-${i + 1}`}>{s.title}</h2>
              <p className="public-lead">{s.lead}</p>
            </div>
            <div className="public-step-body">
              <div
                className="public-step-shot"
                {...reveal(side === "left" ? "fade-right" : "fade-left", 100)}
              >
                {s.shot}
              </div>
              <ul
                className="public-points"
                role="list"
                {...reveal("fade-up", 250)}
              >
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      <section className="public-panel" aria-labelledby="public-law-h">
        <div className="public-step-text" {...reveal("fade-up")}>
          <p className="public-kicker">법 대응</p>
          <h2 id="public-law-h">
            복잡한 법적 의무들, 심플안전으로 대응 가능합니다.
          </h2>
          <p className="public-lead">
            해야 하는 것을 누르면 조문 요지와 전문 링크가 뜹니다.
          </p>
        </div>
        <div {...reveal("fade-up", 150)}>
          <LawTable rows={LAW_ROWS} />
        </div>
      </section>

      <section
        className="public-panel public-price"
        aria-labelledby="public-price-h"
      >
        <div className="public-step-text" {...reveal("fade-up")}>
          <p className="public-kicker">요금</p>
          <h2 id="public-price-h">무료로 시작, 필요할 때만 유료</h2>
          <p className="public-lead">
            글자로 하는 일은 모두 무료, 인원 제한도 없습니다. 유료는 부가 기능이
            필요할 때 인원 구간으로만 갈립니다.
          </p>
        </div>
        <div className="public-price-free" {...reveal("zoom-in", 100)}>
          <p className="public-price-tag">무료</p>
          <p className="public-price-amount">
            <strong>0</strong>
            <span>원 · 인원 제한 없음</span>
          </p>
          <p className="public-price-note">
            표준서 · 위험성평가 · 지시서 · 허가서 · TBM · 점검 · 사고 · 주간
            회의
          </p>
          <p className="public-price-limit">
            일부 기능 제한 — 사진 첨부·출력·문자 알림 등은 유료 (아래 안내)
          </p>
        </div>
        <ul
          className="public-price-grid"
          role="list"
          {...reveal("fade-up", 250)}
        >
          {PAID_PLANS.map((plan) => (
            <li key={plan.id}>
              <p className="public-price-tag">{plan.name}</p>
              <p className="public-price-range">~{plan.maxHeadcount}인</p>
              <p className="public-price-list">
                <s>{formatKrw(withVat(plan.listSupplyKrw))}원</s>
              </p>
              <p className="public-price-amount">
                <strong>{formatKrw(withVat(plan.launchSupplyKrw))}</strong>
                <span>원 / 월</span>
              </p>
              <p className="public-price-off">
                출시가 {launchDiscountPercent(plan)}% 할인
              </p>
            </li>
          ))}
        </ul>
        <table
          className="public-law public-compare"
          {...reveal("fade-up", 300)}
        >
          <caption>유료 기능 안내</caption>
          <thead>
            <tr>
              <th scope="col">기능</th>
              <th scope="col">무료</th>
              <th scope="col">유료</th>
            </tr>
          </thead>
          <tbody>
            {/* ○·× 한눈에. 무료에서 일부 되는 것은 제목 밑 작은 글로. */}
            {PRO_FEATURES.map((f) => (
              <tr key={f.key}>
                <th scope="row">
                  {f.title}
                  <small>무료: {f.freeBehavior}</small>
                </th>
                <td>
                  <span
                    className="public-mark"
                    data-on="false"
                    aria-label="불가"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </span>
                </td>
                <td className="is-pro">
                  <span
                    className="public-mark"
                    data-on="true"
                    aria-label="가능"
                  >
                    <Circle size={18} strokeWidth={2.5} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="public-price-foot" {...reveal("fade-up", 350)}>
          VAT 포함 · 출시 기념 최대 {maxLaunchDiscountPercent()}% 할인 ·{" "}
          {ENTERPRISE_FROM}인 이상은 <Link href="/contact">문의</Link>
        </p>
      </section>

      <section
        className="public-panel public-faq-panel"
        aria-labelledby="public-faq-h"
      >
        <div className="public-step-text" {...reveal("fade-up")}>
          <p className="public-kicker">자주 묻는 것</p>
          <h2 id="public-faq-h">궁금한 것 여섯</h2>
        </div>
        <div className="public-faq-list" {...reveal("fade-up", 150)}>
          {FAQ.map((f) => (
            <details key={f.q} className="std-fold public-faq">
              <summary>{f.q}</summary>
              <p>
                {f.a}
                {f.href && (
                  <>
                    {" "}
                    <Link href={f.href[0]}>{f.href[1]}</Link>
                  </>
                )}
              </p>
            </details>
          ))}
        </div>
        <div className="hero-actions public-cta" {...reveal("fade-up", 250)}>
          <Link href="/login" className="btn-primary">
            무료로 시작 <ArrowRight size={15} />
          </Link>
          <Link href="/recognition-check" className="btn-secondary">
            <ShieldCheck size={15} /> 안전수준 진단
          </Link>
          <Link href="/contact" className="btn-secondary">
            <MessageSquare size={15} /> 문의
          </Link>
        </div>
      </section>
    </div>
  );
}
