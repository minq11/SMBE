import { fmtHours, type PersonTraining } from "./model";

const ROLE: Record<string, string> = {
  MANAGER_SUPERVISOR: "관리감독자",
  MANAGER_SAFETY: "안전관리자",
  WORKER: "작업자",
};

/** 사람별 교육 현황. 빨간 칸이 지금 할 일이다. */
export function PeopleTable({
  people,
  tbmMinutes,
}: {
  people: PersonTraining[];
  tbmMinutes: number;
}) {
  if (!people.length) return <p className="wo-muted">인원이 없습니다.</p>;
  return (
    <table className="training-table">
      <thead>
        <tr>
          <th scope="col">이름</th>
          <th scope="col" className="training-col-role">
            역할
          </th>
          <th scope="col">채용 시</th>
          <th scope="col">이번 반기 정기</th>
          <th scope="col">특별</th>
        </tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.user_id}>
            <th scope="row">{p.name}</th>
            <td className="training-col-role">{ROLE[p.role] ?? p.role}</td>
            <td className={p.hire === "MISSING" ? "is-alert" : ""}>
              {p.hire === "DONE" ? "이수" : p.hire === "MISSING" ? "필요" : "—"}
            </td>
            <td className={p.regular_short > 0 ? "is-alert" : ""}>
              {fmtHours(p.regular_hours + p.tbm_hours)} /{" "}
              {fmtHours(p.regular_required)}
              {tbmMinutes > 0 && p.tbm_count > 0 && (
                <small>TBM {p.tbm_count}회 포함</small>
              )}
              {p.regular_short > 0 && (
                <small>{fmtHours(p.regular_short)} 부족</small>
              )}
            </td>
            <td className={p.special_check ? "is-alert" : ""}>
              {p.special_done ? "이수" : p.special_check ? "확인" : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
