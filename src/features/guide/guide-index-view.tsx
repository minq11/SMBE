"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import {
  GUIDE_META,
  LAW_SUMMARIES,
  SIZE_BANDS,
  type Applicability,
  type LawSummary,
  type SizeBand,
} from "./data";
import { SizeBandPicker } from "./size-band-picker";
import { DEFAULT_BAND, loadBand, saveBand } from "./band-state";

export function GuideIndexView() {
  const [band, setBand] = useState<SizeBand>(DEFAULT_BAND);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBand(loadBand());
  }, []);

  const changeBand = (next: SizeBand) => {
    setBand(next);
    saveBand(next);
  };

  const bandMeta = SIZE_BANDS.find((b) => b.key === band)!;

  return (
    <>
      <section className="guide-hero">
        <span className="guide-hero-eyebrow">공개 가이드</span>
        <h1>안전법 가이드</h1>
        <p className="guide-hero-lead">
          중대재해처벌법·산업안전보건법 이 우리 회사에 어떻게 적용되는지 인원
          규모별로 안내합니다. 지금 상황에 맞는 구간을 선택해 필요한 의무를
          확인하세요.
        </p>
        <p className="guide-hero-meta">
          검토일 {GUIDE_META.reviewedDate} · 실 적용은 사업 종류·업종 등
          개별 조건에 따라 다름
        </p>
      </section>

      <SizeBandPicker value={band} onChange={changeBand} />

      <p className="guide-band-context">
        선택한 구간: <strong>{bandMeta.label}</strong>{" "}
        <span>({bandMeta.note})</span>
      </p>

      <div className="guide-law-grid">
        {LAW_SUMMARIES.map((law) => (
          <LawCard key={law.topic} law={law} band={band} />
        ))}
      </div>

      <section className="guide-check-cta">
        <div className="guide-check-cta-copy">
          <span className="guide-check-cta-eyebrow">자가진단</span>
          <h2>우리 회사, 위험성평가 인정 준비가 되어있을까요?</h2>
          <p>
            10문항 안팎의 짧은 문답으로 신청대상 여부와 준비 상태를 확인합니다.
            결과를 보고 부족한 항목을 심플안전으로 바로 채워 나갈 수 있습니다.
          </p>
        </div>
        <Link href="/recognition-check" className="primary-button guide-check-cta-button">
          <ClipboardCheck size={14} />
          인정 준비도 진단 시작
        </Link>
      </section>

      <p className="guide-disclaimer">{GUIDE_META.disclaimer}</p>
    </>
  );
}

function LawCard({ law, band }: { law: LawSummary; band: SizeBand }) {
  const applicability = law.applicability[band];
  return (
    <article className="law-card">
      <header className="law-card-head">
        <div>
          <h2>{law.title}</h2>
          <p className="law-card-intro">{law.intro}</p>
        </div>
        <ApplicabilityBadge value={applicability} />
      </header>
      <p className="law-card-band-note">{law.bandNote[band]}</p>
      <div className="law-card-duties">
        <span className="law-card-duties-label">핵심 의무</span>
        <ul>
          {law.coreDuties.map((duty) => (
            <li key={duty}>{duty}</li>
          ))}
        </ul>
      </div>
      <Link href={law.detailHref} className="law-card-cta">
        상세 안내 보기 <ArrowRight size={14} />
      </Link>
    </article>
  );
}

function ApplicabilityBadge({ value }: { value: Applicability }) {
  const cls =
    value === "적용"
      ? "applicability applicability--on"
      : value === "일부 적용"
        ? "applicability applicability--partial"
        : "applicability applicability--off";
  return <span className={cls}>{value}</span>;
}
