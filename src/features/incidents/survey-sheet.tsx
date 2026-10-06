"use client";

import { Printer } from "lucide-react";
import { usePaidToast } from "@/components/ui/paid-lock";
import {
  KIND_LABEL,
  OCCURRENCE_LABEL,
  occurredClock,
  occurredDate,
  type IncidentDetail,
} from "./model";

export type SurveyCompany = {
  name: string;
  business_type: string | null;
  headcount: number;
};

/** 인쇄 / PDF 저장. 무료 요금제는 안내만. 지시서 출력물의 단추와 같은 모양. */
export function SurveyPrintButton({ allowed }: { allowed: boolean }) {
  const { block, toast } = usePaidToast(
    "산업재해조사표 인쇄는 유료 요금제에서 씁니다.",
  );
  return (
    <div className="wo-no-print">
      <button
        type="button"
        className="btn-primary"
        onClick={() => (allowed ? window.print() : block())}
      >
        <Printer size={14} /> 조사표 인쇄 / PDF 저장
      </button>
      {toast}
    </div>
  );
}

const cell = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? " " : String(v);

/**
 * 산업재해조사표 (산안법 시행규칙 별지 제30호 서식) 의 칸을 우리 기록으로 채운
 * 문서. 화면에서도 같은 모양으로 보이고 인쇄하면 이 문서만 나간다.
 * 기록에 없는 칸(사업자등록번호·소재지·주민번호·근로자대표 확인)은 비워 두어
 * 사장님이 마저 적는다 — 없는 값을 지어내지 않는다.
 */
export function SurveySheet({
  incident,
  company,
  printedAt,
}: {
  incident: IncidentDetail;
  company: SurveyCompany;
  printedAt: string;
}) {
  const victims = incident.victims.length ? incident.victims : [null];
  return (
    <article className="survey-sheet" aria-label="산업재해조사표">
      <header className="survey-head">
        <p className="survey-form-no">
          ■ 산업안전보건법 시행규칙 [별지 제30호서식]
        </p>
        <h1>산업재해조사표</h1>
        <p className="survey-note">
          ※ 뒤쪽의 작성방법을 읽고 작성해 주시기 바라며, 색상이 어두운 난은
          신고인이 적지 않습니다.
        </p>
      </header>

      <table className="survey-table">
        <tbody>
          <tr>
            <th className="survey-group" rowSpan={5}>
              Ⅰ.
              <br />
              사업장
              <br />
              정보
            </th>
            <th>① 산재관리번호</th>
            <td>{cell(null)}</td>
            <th>사업자등록번호</th>
            <td>{cell(null)}</td>
          </tr>
          <tr>
            <th>② 사업장명</th>
            <td>{cell(company.name)}</td>
            <th>③ 근로자 수</th>
            <td>{cell(company.headcount ? `${company.headcount}명` : null)}</td>
          </tr>
          <tr>
            <th>④ 업종</th>
            <td>{cell(company.business_type)}</td>
            <th>소재지</th>
            <td>{cell(null)}</td>
          </tr>
          <tr>
            <th>⑤ 재해자가 사내 수급인 소속인 경우</th>
            <td colSpan={3}>해당 없음 (구성원)</td>
          </tr>
          <tr>
            <th>⑥ 재해자가 파견근로자인 경우</th>
            <td colSpan={3}>해당 없음</td>
          </tr>
        </tbody>
      </table>

      {victims.map((v, i) => (
        <table className="survey-table" key={v?.id ?? i}>
          <tbody>
            <tr>
              <th className="survey-group" rowSpan={4}>
                Ⅱ.
                <br />
                재해
                <br />
                정보
                {victims.length > 1 ? (
                  <>
                    <br />({i + 1})
                  </>
                ) : null}
              </th>
              <th>⑦ 성명</th>
              <td>{cell(v?.name)}</td>
              <th>주민등록번호</th>
              <td>{cell(null)}</td>
            </tr>
            <tr>
              <th>⑧ 직종</th>
              <td>{cell(null)}</td>
              <th>⑨ 입사일</th>
              <td>{cell(null)}</td>
            </tr>
            <tr>
              <th>⑩ 상해 종류</th>
              <td>{cell(v?.injury)}</td>
              <th>⑪ 상해 부위</th>
              <td>{cell(v?.body_part)}</td>
            </tr>
            <tr>
              <th>⑫ 휴업 예상 일수</th>
              <td>{cell(v ? `휴업 ${v.expected_leave_days}일` : null)}</td>
              <th>사망 여부</th>
              <td>{v ? (v.fatal ? "사망" : "해당 없음") : " "}</td>
            </tr>
          </tbody>
        </table>
      ))}

      <table className="survey-table">
        <tbody>
          <tr>
            <th className="survey-group" rowSpan={5}>
              Ⅲ.
              <br />
              재해
              <br />
              발생
              <br />
              개요
              <br />및<br />
              원인
            </th>
            <th>⑬ 재해 발생 일시</th>
            <td colSpan={3}>
              {occurredDate(incident.occurred_at)}{" "}
              {occurredClock(incident.occurred_at)}
            </td>
          </tr>
          <tr>
            <th>⑭ 발생 장소</th>
            <td colSpan={3}>
              {incident.location}
              {incident.location_detail ? ` ${incident.location_detail}` : ""}
            </td>
          </tr>
          <tr>
            <th>⑮ 재해 관련 작업 유형</th>
            <td colSpan={3}>
              {incident.work_order_name ? `${incident.work_order_name} · ` : ""}
              {OCCURRENCE_LABEL[incident.occurrence_type]} (
              {KIND_LABEL[incident.kind]})
            </td>
          </tr>
          <tr>
            <th>⑯ 재해 발생 당시 상황</th>
            <td colSpan={3} className="survey-long">
              {incident.description}
              {incident.immediate_action
                ? `\n\n[바로 한 조치] ${incident.immediate_action}`
                : ""}
            </td>
          </tr>
          <tr>
            <th>⑰ 재해 발생 원인</th>
            <td colSpan={3} className="survey-long">
              {cell(incident.cause)}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="survey-table">
        <tbody>
          <tr>
            <th className="survey-group">
              Ⅳ.
              <br />
              재발
              <br />
              방지
              <br />
              계획
            </th>
            <td className="survey-long">
              {incident.actions.length
                ? incident.actions
                    .map(
                      (a, i) =>
                        `${i + 1}. ${a.measure}` +
                        (a.responsible_name
                          ? ` (담당 ${a.responsible_name}`
                          : "") +
                        (a.due_on
                          ? `${a.responsible_name ? ", " : " ("}기한 ${a.due_on}`
                          : "") +
                        (a.responsible_name || a.due_on ? ")" : ""),
                    )
                    .join("\n")
                : " "}
            </td>
          </tr>
        </tbody>
      </table>

      <section className="survey-sign">
        <p>
          「산업안전보건법」 제57조제3항 및 같은 법 시행규칙 제73조제1항에 따라
          위와 같이 산업재해조사표를 제출합니다.
        </p>
        <p className="survey-sign-line">
          작성일 <span className="survey-blank">{printedAt}</span> · 작성자 성명{" "}
          <span className="survey-blank">{incident.reported_by_name}</span> ·
          사업주 <span className="survey-blank" />
          (서명 또는 인)
        </p>
        <p className="survey-sign-line">
          근로자대표 (재해자) 확인 <span className="survey-blank" /> (서명 또는
          인)
        </p>
        <p className="survey-to">지방고용노동청(지청)장 귀하</p>
      </section>
    </article>
  );
}
