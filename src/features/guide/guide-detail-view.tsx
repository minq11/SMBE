"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import {
  GUIDE_META,
  SIZE_BANDS,
  getLawDetail,
  getLawSummary,
  type LawSummary,
  type SizeBand,
} from "./data";
import { SizeBandPicker } from "./size-band-picker";
import { DEFAULT_BAND, loadBand, saveBand } from "./band-state";

export function GuideDetailView({ topic }: { topic: LawSummary["topic"] }) {
  const summary = getLawSummary(topic);
  const detail = getLawDetail(topic);

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
      <Link href="/guide" className="text-button guide-back-link">
        <ArrowLeft size={13} /> 안전법 가이드
      </Link>

      <header className="guide-detail-hero">
        <h1>{summary.title}</h1>
        <p className="guide-detail-lead">{summary.intro}</p>
        <p className="guide-hero-meta">
          검토일 {GUIDE_META.reviewedDate} · 공식 근거{" "}
          <a
            href={detail.officialSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="guide-source-link"
          >
            {detail.officialSourceLabel}
            <ExternalLink size={11} />
          </a>
        </p>
      </header>

      <SizeBandPicker value={band} onChange={changeBand} />
      <p className="guide-band-context">
        선택한 구간: <strong>{bandMeta.label}</strong>{" "}
        <span>({bandMeta.note})</span>
      </p>

      <div className="guide-detail-body">
        {detail.sections.map((section) => (
          <section key={section.heading} className="guide-detail-section">
            <h2>{section.heading}</h2>
            {section.lead && (
              <p className="guide-detail-section-lead">{section.lead}</p>
            )}
            {section.perBandNotes?.[band] && (
              <p className="guide-detail-band-note">
                <span className="guide-detail-band-note-label">
                  {bandMeta.label}
                </span>
                {section.perBandNotes[band]}
              </p>
            )}
            {section.items && (
              <ul className="guide-detail-list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="guide-detail-section">
          <h2>필요한 기록</h2>
          <ul className="guide-detail-list">
            {detail.requiredRecords.map((record) => (
              <li key={record}>{record}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="guide-next-actions" aria-label="지금 시작할 일">
        <h2>지금 시작할 일</h2>
        <ul>
          {detail.nextActions.map((action) => (
            <li key={action.text}>
              <p>{action.text}</p>
              {action.ctaHref && action.ctaLabel && (
                <Link href={action.ctaHref} className="ghost-button">
                  {action.ctaLabel} <ArrowRight size={13} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="guide-disclaimer">{GUIDE_META.sourceNote}</p>
    </>
  );
}
