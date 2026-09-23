"use client";

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Redo2,
  Underline,
  Undo2,
  Video,
} from "lucide-react";
import { uploadImage } from "@/features/attachments/upload";
import { attachmentUrl, type BoardDoc } from "./model";

/**
 * 자료실 편집기 — Tiptap(ProseMirror). MIT 라이선스, 모바일 입력이 안정적이고
 * 문서를 JSON 으로 다뤄 서버가 화이트리스트로 검증·렌더링할 수 있다
 * (model.ts). 도구는 현장 공지에 쓰는 것만: 굵게·기울임·밑줄·제목·목록·링크·
 * 사진·동영상.
 *
 * 사진·동영상은 첨부(attachments)로 올라가고 문서에는 첨부 id 만 남는다.
 * 편집 중에는 /api/attachments/{id} 로 바로 보인다.
 */

const AttachmentImage = Node.create({
  name: "attachmentImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null }, alt: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-attachment-id]",
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute("data-attachment-id"),
          alt: (el as HTMLElement).getAttribute("alt") ?? "",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { id, alt } = HTMLAttributes as { id: string; alt?: string };
    return [
      "img",
      mergeAttributes({
        src: attachmentUrl(id),
        "data-attachment-id": id,
        alt: alt ?? "",
        class: "board-editor-media",
      }),
    ];
  },
});

const AttachmentVideo = Node.create({
  name: "attachmentVideo",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "video[data-attachment-id]",
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute("data-attachment-id"),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { id } = HTMLAttributes as { id: string };
    return [
      "video",
      mergeAttributes({
        src: attachmentUrl(id),
        "data-attachment-id": id,
        controls: "true",
        playsinline: "true",
        preload: "metadata",
        class: "board-editor-media",
      }),
    ];
  },
});

const VIDEO_MAX = 200 * 1024 * 1024;

export function BoardEditor({
  postId,
  initial,
  onChange,
  canAttach,
  attachHint,
}: {
  postId: string;
  initial: BoardDoc;
  onChange: (doc: BoardDoc) => void;
  /** 유료 회사만 사진·동영상. */
  canAttach: boolean;
  /** 첨부 단추 옆 안내 (저장 공간 등). */
  attachHint?: string;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto", "tel"],
        },
        codeBlock: false,
      }),
      AttachmentImage,
      AttachmentVideo,
    ],
    content: initial,
    editorProps: {
      attributes: {
        class: "board-editor-content board-content",
        "aria-label": "본문",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as BoardDoc),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            heading: editor.isActive("heading", { level: 2 }),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            link: editor.isActive("link"),
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
          }
        : null,
  });

  if (!editor) return <div className="board-editor board-editor--loading" />;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("링크 주소 (https://…)", previous ?? "https://");
    if (href === null) return;
    if (!href.trim() || href.trim() === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: href.trim() })
      .run();
  };

  const upload = async (file: File, kind: "image" | "video") => {
    setError(null);
    if (kind === "video" && file.size > VIDEO_MAX) {
      setError("동영상은 200MB 까지 올릴 수 있습니다.");
      return;
    }
    setUploading(kind === "image" ? "사진 올리는 중…" : "동영상 올리는 중…");
    try {
      const id = await uploadImage(
        { targetType: "board_post", targetId: postId },
        file,
        { keepOriginal: kind === "video" },
      );
      editor
        .chain()
        .focus()
        .insertContent(
          kind === "image"
            ? { type: "attachmentImage", attrs: { id, alt: file.name } }
            : { type: "attachmentVideo", attrs: { id } },
        )
        .createParagraphNear()
        .run();
      onChange(editor.getJSON() as BoardDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "올리지 못했습니다.");
    } finally {
      setUploading(null);
    }
  };

  const tool = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    isActive = false,
    disabled = false,
    desktopOnly = false,
  ) => (
    <button
      type="button"
      className={`board-tool${isActive ? " is-active" : ""}${desktopOnly ? " board-tool--desktop" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={isActive}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <div className="board-editor">
      <div className="board-toolbar" role="toolbar" aria-label="서식">
        {tool(
          "굵게",
          <Bold size={18} />,
          () => editor.chain().focus().toggleBold().run(),
          active?.bold,
        )}
        {tool(
          "기울임",
          <Italic size={18} />,
          () => editor.chain().focus().toggleItalic().run(),
          active?.italic,
        )}
        {tool(
          "밑줄",
          <Underline size={18} />,
          () => editor.chain().focus().toggleUnderline().run(),
          active?.underline,
          false,
          true,
        )}
        {tool(
          "소제목",
          <Heading2 size={18} />,
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          active?.heading,
        )}
        {tool(
          "글머리 목록",
          <List size={18} />,
          () => editor.chain().focus().toggleBulletList().run(),
          active?.bullet,
        )}
        {tool(
          "번호 목록",
          <ListOrdered size={18} />,
          () => editor.chain().focus().toggleOrderedList().run(),
          active?.ordered,
        )}
        {tool("링크", <Link2 size={18} />, setLink, active?.link)}
        <span className="board-toolbar-gap" />
        {/* 파일 고르기는 label 이 연다 — ref 없이 된다. */}
        <label
          className={`board-tool${!canAttach || uploading ? " is-disabled" : ""}`}
          title={canAttach ? "사진" : "사진 (유료)"}
          aria-label={canAttach ? "사진" : "사진 (유료)"}
        >
          <ImageIcon size={18} />
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={!canAttach || uploading !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f, "image");
            }}
          />
        </label>
        <label
          className={`board-tool${!canAttach || uploading ? " is-disabled" : ""}`}
          title={canAttach ? "동영상" : "동영상 (유료)"}
          aria-label={canAttach ? "동영상" : "동영상 (유료)"}
        >
          <Video size={18} />
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            hidden
            disabled={!canAttach || uploading !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f, "video");
            }}
          />
        </label>
        <span className="board-toolbar-gap" />
        {/* 좁은 화면에서는 밑줄·실행취소·다시실행을 뺀다 — 한 줄에 여덟 개가 한계다. */}
        {tool(
          "실행 취소",
          <Undo2 size={18} />,
          () => editor.chain().focus().undo().run(),
          false,
          !active?.canUndo,
          true,
        )}
        {tool(
          "다시 실행",
          <Redo2 size={18} />,
          () => editor.chain().focus().redo().run(),
          false,
          !active?.canRedo,
          true,
        )}
      </div>
      <EditorContent editor={editor} />
      <div className="board-editor-foot">
        {uploading ? (
          <span className="board-editor-status">
            <Loader2 size={13} className="spin" /> {uploading}
          </span>
        ) : error ? (
          <span className="board-editor-status is-error" role="alert">
            {error}
          </span>
        ) : (
          <span className="board-editor-status">
            {canAttach
              ? (attachHint ?? "사진·동영상은 본문 안에 들어갑니다.")
              : "사진·동영상 첨부는 유료 요금제에서 쓸 수 있습니다."}
          </span>
        )}
      </div>
    </div>
  );
}
