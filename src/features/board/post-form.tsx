"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Save, Send, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BoardEditor } from "./editor";
import { deletePostAction, savePostAction } from "./actions";
import {
  KIND_LABEL,
  SLUG_BY_KIND,
  formatBytes,
  type BoardDoc,
  type PostDetail,
} from "./model";

/**
 * 글 편집 화면. 제목 + (공지면) 팝업 설정 + 본문 편집기 + 저장/발행/삭제.
 * 발행된 글을 고칠 때는 "저장" 하나만 남는다.
 */
export function PostForm({
  post,
  canAttach,
  usage,
}: {
  post: PostDetail;
  canAttach: boolean;
  usage: { used: number; limit: number } | null;
}) {
  const router = useRouter();
  const slug = SLUG_BY_KIND[post.kind];
  const [title, setTitle] = useState(post.title);
  const [popup, setPopup] = useState(post.popup);
  const [from, setFrom] = useState(post.popup_from ?? "");
  const [until, setUntil] = useState(post.popup_until ?? "");
  const doc = useRef<BoardDoc>(post.body);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const published = post.status === "PUBLISHED";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = (publish: boolean) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const result = await savePostAction({
        id: post.id,
        title,
        body: doc.current,
        popup: post.kind === "NOTICE" && popup,
        popupFrom: popup && from ? from : null,
        popupUntil: popup && until ? until : null,
        publish: publish || published,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      if (publish && !published) {
        router.replace(`/board/${slug}/${post.id}`);
        router.refresh();
        return;
      }
      setNotice(
        result.pushed > 0
          ? `저장했습니다. 기기 ${result.pushed}대에 알렸습니다.`
          : "저장했습니다.",
      );
    });

  const remove = async () => {
    if (
      !(await confirm(
        published
          ? "발행된 글을 지웁니다. 구성원에게 더 이상 보이지 않습니다."
          : "작성 중인 글을 지울까요?",
        { confirmLabel: "지우기", danger: true },
      ))
    )
      return;
    start(async () => {
      const result = await deletePostAction(post.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      router.replace("/board/" + result.kind);
      router.refresh();
    });
  };

  return (
    <div className="board-form">
      {dialog}
      <div className="form-field">
        <label htmlFor="post-title">제목</label>
        <input
          id="post-title"
          value={title}
          maxLength={120}
          placeholder={
            post.kind === "NOTICE"
              ? "예: 10월 정기 안전점검 일정"
              : "예: 지게차 일상점검표 (2026)"
          }
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
      </div>

      {post.kind === "NOTICE" && (
        <fieldset className="board-popup-set">
          <legend>팝업 노출</legend>
          <label className="board-check">
            <input
              type="checkbox"
              checked={popup}
              onChange={(e) => {
                setPopup(e.target.checked);
                setDirty(true);
              }}
            />
            <span>
              <strong>구성원이 들어올 때 창으로 띄우기</strong>
              <small>
                홈과 작업자 링크 화면에 뜹니다. 구성원은 &ldquo;오늘 하루 /
                7일간 안 보기&rdquo; 로 닫을 수 있습니다.
              </small>
            </span>
          </label>
          {popup && (
            <div className="board-popup-dates">
              <label>
                <span>시작일</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                <span>종료일</span>
                <input
                  type="date"
                  value={until}
                  min={from || undefined}
                  onChange={(e) => {
                    setUntil(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <small className="hint">비우면 기간 제한 없이 뜹니다.</small>
            </div>
          )}
        </fieldset>
      )}

      <div className="form-field">
        <label>본문</label>
        <BoardEditor
          postId={post.id}
          initial={post.body}
          canAttach={canAttach}
          attachHint={
            usage
              ? `사진·동영상 저장 공간 ${formatBytes(usage.used)} / ${formatBytes(usage.limit)}`
              : undefined
          }
          onChange={(next) => {
            doc.current = next;
            setDirty(true);
          }}
        />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="board-form-notice">{notice}</p>}

      <div className="board-form-actions">
        <button
          type="button"
          className="ghost-button ghost-button--danger"
          onClick={remove}
          disabled={pending}
        >
          <Trash2 size={14} /> 지우기
        </button>
        <span className="board-form-actions-gap" />
        {published ? (
          <>
            <a className="btn-secondary" href={`/board/${slug}/${post.id}`}>
              <Eye size={14} /> 보기
            </a>
            <button
              type="button"
              className="btn-primary"
              onClick={() => save(false)}
              disabled={pending}
            >
              <Save size={14} /> {pending ? "저장 중…" : "저장"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => save(false)}
              disabled={pending}
            >
              <Save size={14} /> 임시저장
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => save(true)}
              disabled={pending}
            >
              <Send size={14} />{" "}
              {pending ? "처리 중…" : `${KIND_LABEL[post.kind]} 발행`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
