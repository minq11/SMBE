"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ExternalLink, X } from "lucide-react";

/**
 * 법 대응 표. "해야 하는 것" 을 누르면 그 조문의 요지와 국가법령정보센터 전문 링크가
 * 창으로 뜬다. 요지는 우리가 풀어 쓴 것이고, 조문 그대로는 링크 너머에 있다 — 법은
 * 바뀌므로 원문을 베껴 두지 않는다.
 */
export type LawRow = {
  duty: string;
  basis: string;
  where: string;
  law: string;
  article: string;
  gist: string[];
  url: string;
};

export function LawTable({ rows }: { rows: LawRow[] }) {
  const [open, setOpen] = useState<LawRow | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  const close = () => setOpen(null);
  return (
    <>
      <table className="public-law">
        <thead>
          <tr>
            <th scope="col">해야 하는 것</th>
            <th scope="col">심플안전에서</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.duty}>
              <th scope="row">
                <button
                  type="button"
                  className="public-law-duty"
                  onClick={() => setOpen(row)}
                >
                  <span>
                    {row.duty}
                    <small>{row.basis}</small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </th>
              <td>{row.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dialog
        ref={ref}
        className="law-dialog"
        aria-labelledby="law-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {open && (
          <div className="reason-dialog-body">
            <button
              type="button"
              className="reason-dialog-close"
              onClick={close}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <p className="public-kicker">{open.law}</p>
            <h2 id="law-dialog-title">{open.article}</h2>
            <ul className="law-gist" role="list">
              {open.gist.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <p className="law-where">
              심플안전에서는 <strong>{open.where}</strong>에 기록이 남습니다.
            </p>
            <div className="law-dialog-actions">
              <a
                className="btn-primary"
                href={open.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} /> 조문 전문 보기 · 국가법령정보센터
              </a>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
