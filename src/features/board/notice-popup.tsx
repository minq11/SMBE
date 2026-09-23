"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { postDate } from "./model";

export type PopupNoticeView = {
  id: string;
  title: string;
  html: string;
  published_at: string | null;
};

const KEY = "smbe.notice-hide.";
const DAY = 24 * 60 * 60 * 1000;

function hiddenUntil(id: string): number {
  try {
    return Number(localStorage.getItem(KEY + id) ?? 0);
  } catch {
    return 0;
  }
}
function hide(id: string, days: number) {
  try {
    localStorage.setItem(KEY + id, String(Date.now() + days * DAY));
  } catch {
    /* 저장 못 하면 다음에 다시 보인다 */
  }
}

/**
 * 공지 팝업. 홈(로그인)·작업자 링크 화면에 들어올 때 한 번 뜬다.
 * "오늘 하루 안 보기 / 7일간 안 보기" 는 이 기기의 localStorage 가 기억한다.
 * 여러 개면 최신 것부터 하나씩. 좁은 화면은 아래에서 올라오는 시트.
 */
export function NoticePopup({
  notices,
  linkBase = "/board/notices",
}: {
  notices: PopupNoticeView[];
  /** 자세히 보기 링크의 바탕. 링크 화면(/w)에서는 글 화면이 없어 null. */
  linkBase?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [queue, setQueue] = useState<PopupNoticeView[] | null>(null);

  useEffect(() => {
    // 서버는 숨김 여부를 모른다. 마운트 뒤 기기 저장소를 보고 고른다.
    const now = Date.now();
    setTimeout(
      () => setQueue(notices.filter((n) => hiddenUntil(n.id) < now)),
      0,
    );
  }, [notices]);

  const current = queue?.[0] ?? null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (current && !el.open) el.showModal();
    else if (!current && el.open) el.close();
  }, [current]);

  const next = () => setQueue((q) => (q ? q.slice(1) : q));
  if (!current) return null;

  return (
    <dialog
      ref={ref}
      className="notice-popup"
      aria-labelledby="notice-popup-title"
      onCancel={(e) => {
        e.preventDefault();
        next();
      }}
      onClose={() => {
        if (current) next();
      }}
    >
      <div className="notice-popup-body">
        <p className="notice-popup-eyebrow">
          <Megaphone size={14} /> 공지사항
          {current.published_at && (
            <span> · {postDate(current.published_at)}</span>
          )}
        </p>
        <h2 id="notice-popup-title">{current.title}</h2>
        <div
          className="board-content notice-popup-content"
          dangerouslySetInnerHTML={{ __html: current.html }}
        />
        {linkBase && (
          <Link
            href={`${linkBase}/${current.id}`}
            className="notice-popup-link"
            onClick={() => next()}
          >
            공지 화면에서 보기
          </Link>
        )}
        <div className="notice-popup-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              hide(current.id, 1);
              next();
            }}
          >
            오늘 하루 안 보기
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              hide(current.id, 7);
              next();
            }}
          >
            7일간 안 보기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={next}
            autoFocus
          >
            닫기
          </button>
        </div>
      </div>
    </dialog>
  );
}
