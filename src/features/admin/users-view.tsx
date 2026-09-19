"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { UserListRow } from "@/server/admin";

const ROLE_LABEL: Record<NonNullable<UserListRow["active_role"]>, string> = {
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
  WORKER: "작업자",
};

export function UsersView({
  users,
  initialSearch,
}: {
  users: UserListRow[];
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
      router.push(`/admin/users?${nextParams.toString()}`);
    });
  };

  return (
    <>
      <form onSubmit={submit} className="admin-search">
        <Search size={15} />
        <input
          type="search"
          placeholder="이름·이메일·전화번호로 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="ghost-button" disabled={pending}>
          {pending ? "검색 중..." : "검색"}
        </button>
      </form>

      {users.length === 0 ? (
        <div className="empty-state">
          <strong>결과가 없어요</strong>
          <p>
            {initialSearch
              ? `"${initialSearch}" 에 해당하는 사용자를 찾지 못했습니다.`
              : "등록된 사용자가 없어요."}
          </p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>전화번호</th>
                <th>현재 소속</th>
                <th>역할</th>
                <th>상태</th>
                <th>가입일</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.display_name}</td>
                  <td className="cell-mono">{u.email ?? "—"}</td>
                  <td>{u.phone ?? "—"}</td>
                  <td>{u.active_company_name ?? "—"}</td>
                  <td>{u.active_role ? ROLE_LABEL[u.active_role] : "—"}</td>
                  <td>{u.status === "ACTIVE" ? "활성" : "탈퇴"}</td>
                  <td className="cell-dim">
                    {new Date(u.created_at).toLocaleDateString("ko-KR")}
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
