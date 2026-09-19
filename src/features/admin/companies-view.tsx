"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import type { CompanyListRow } from "@/server/admin";

const SIZE_LABEL: Record<CompanyListRow["initial_employee_size_band"], string> = {
  UNDER_5: "5인 미만",
  FROM_5_TO_19: "5~19인",
  FROM_20_TO_49: "20~49인",
  FROM_50: "50인+",
};

const PRO_LABEL: Record<CompanyListRow["pro_state"], string> = {
  FREE: "무료",
  PRO_VOLUNTARY: "Pro (자발)",
  PRO_MANDATORY: "Pro (한도초과)",
};

export function CompaniesView({
  companies,
  initialSearch,
}: {
  companies: CompanyListRow[];
  initialSearch: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initialSearch);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextParams = new URLSearchParams(params.toString());
    if (q) nextParams.set("q", q);
    else nextParams.delete("q");
    startTransition(() => {
      router.push(`/admin?${nextParams.toString()}`);
    });
  };

  return (
    <>
      <form onSubmit={submit} className="admin-search">
        <Search size={15} />
        <input
          type="search"
          placeholder="회사명·회사코드·업종으로 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="ghost-button" disabled={pending}>
          {pending ? "검색 중..." : "검색"}
        </button>
      </form>

      {companies.length === 0 ? (
        <div className="empty-state">
          <strong>결과가 없어요</strong>
          <p>
            {initialSearch
              ? `"${initialSearch}" 에 해당하는 회사를 찾지 못했습니다.`
              : "아직 등록된 회사가 없어요."}
          </p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>회사명 / 코드</th>
                <th>업종</th>
                <th>인원 (활성 / 대기)</th>
                <th>규모</th>
                <th>무료 한도</th>
                <th>요금제</th>
                <th>가입일</th>
                <th>생성자</th>
                <th aria-label="상세" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.company_id}>
                  <td>
                    <div className="cell-main">
                      <strong>{c.company_name}</strong>
                      <code className="cell-mono">{c.company_code}</code>
                    </div>
                  </td>
                  <td>{c.business_type ?? "—"}</td>
                  <td className="cell-num">
                    {c.active_count}
                    {c.pending_count > 0 && (
                      <span className="cell-dim"> / {c.pending_count}</span>
                    )}
                  </td>
                  <td>{SIZE_LABEL[c.initial_employee_size_band]}</td>
                  <td className="cell-num">
                    {c.free_limit}
                    {c.active_count > c.free_limit && (
                      <span className="cell-warn"> 초과</span>
                    )}
                  </td>
                  <td>{PRO_LABEL[c.pro_state]}</td>
                  <td className="cell-dim">
                    {new Date(c.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="cell-dim">{c.creator_name ?? "—"}</td>
                  <td>
                    <Link
                      href={`/admin/companies/${c.company_id}`}
                      className="cell-link"
                    >
                      상세 <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
