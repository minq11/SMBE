import { z } from "zod";

/**
 * 통합자료실 — 공지사항·자료실의 공통 모델.
 *
 * 본문은 편집기(Tiptap)의 JSON 문서다. 저장할 때 아래 스키마로 거르고, 읽을 때
 * `renderDoc` 이 화이트리스트로만 HTML 을 만든다. 편집기가 만든 HTML 을 그대로
 * 저장·출력하는 길은 두지 않는다 — 그 길이 열리면 관리자 계정 하나가 뚫렸을 때
 * 회사 구성원 전원의 브라우저에서 스크립트가 돈다.
 *
 * 사진·동영상은 URL 이 아니라 **첨부 id** 로만 들어간다. 주소는 읽을 때
 * `/api/attachments/{id}` 로 만들어지고, 그 라우트가 회사 소속을 확인한 뒤 짧은
 * 서명 URL 로 보낸다. 외부 이미지 URL 은 받지 않는다.
 */

export const BOARD_KINDS = ["notices", "resources"] as const;
export type BoardKindSlug = (typeof BOARD_KINDS)[number];
export type BoardKind = "NOTICE" | "RESOURCE";

export const KIND_BY_SLUG: Record<BoardKindSlug, BoardKind> = {
  notices: "NOTICE",
  resources: "RESOURCE",
};
export const SLUG_BY_KIND: Record<BoardKind, BoardKindSlug> = {
  NOTICE: "notices",
  RESOURCE: "resources",
};
export const KIND_LABEL: Record<BoardKind, string> = {
  NOTICE: "공지사항",
  RESOURCE: "자료실",
};

export function isKindSlug(value: string): value is BoardKindSlug {
  return (BOARD_KINDS as readonly string[]).includes(value);
}

/** 회사당 자료실 첨부 합계 상한. */
export const BOARD_STORAGE_LIMIT = 1024 * 1024 * 1024; // 1GB

export class BoardError extends Error {}

/* ------------------------------------------------------------------ */
/* 문서 스키마                                                          */
/* ------------------------------------------------------------------ */

const MAX_DOC_BYTES = 400 * 1024;
const MAX_DEPTH = 24;

const safeHref = z
  .string()
  .max(2000)
  .refine((v) => /^(https?:\/\/|mailto:|tel:)/i.test(v.trim()), {
    message: "링크는 http(s)·mailto·tel 만 됩니다.",
  });

const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).passthrough(),
  z.object({ type: z.literal("italic") }).passthrough(),
  z.object({ type: z.literal("underline") }).passthrough(),
  z.object({ type: z.literal("strike") }).passthrough(),
  z.object({ type: z.literal("code") }).passthrough(),
  z.object({
    type: z.literal("link"),
    attrs: z.object({ href: safeHref }).passthrough(),
  }),
]);

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

const uuid = z.string().uuid();

const nodeSchema: z.ZodType<DocNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      text: z.string().max(20000),
      marks: z.array(markSchema).max(8).optional(),
    }),
    z.object({ type: z.literal("hardBreak") }),
    z.object({ type: z.literal("horizontalRule") }),
    z.object({
      type: z.literal("paragraph"),
      attrs: z.object({}).passthrough().optional(),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("heading"),
      attrs: z.object({ level: z.number().int().min(1).max(3) }).passthrough(),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("bulletList"),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("orderedList"),
      attrs: z.object({}).passthrough().optional(),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("listItem"),
      attrs: z.object({}).passthrough().optional(),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("blockquote"),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("codeBlock"),
      attrs: z.object({}).passthrough().optional(),
      content: z.array(nodeSchema).optional(),
    }),
    z.object({
      type: z.literal("attachmentImage"),
      attrs: z.object({ id: uuid, alt: z.string().max(200).nullish() }),
    }),
    z.object({
      type: z.literal("attachmentVideo"),
      attrs: z.object({ id: uuid }),
    }),
  ]),
);

export const docSchema = z.object({
  type: z.literal("doc"),
  content: z.array(nodeSchema).max(2000).optional(),
});
export type BoardDoc = z.infer<typeof docSchema>;

export const EMPTY_DOC: BoardDoc = { type: "doc", content: [] };

function depthOf(node: DocNode, depth = 0): number {
  if (!node.content?.length) return depth;
  return Math.max(...node.content.map((c) => depthOf(c, depth + 1)));
}

/** 저장 전 검증. 알 수 없는 노드·마크·속성은 통째로 거절한다. */
export function parseDoc(raw: unknown): BoardDoc {
  const text = JSON.stringify(raw ?? null);
  if (!text || text.length > MAX_DOC_BYTES)
    throw new BoardError("본문이 너무 깁니다 (사진·동영상은 첨부로 넣으세요).");
  const parsed = docSchema.safeParse(raw);
  if (!parsed.success) throw new BoardError("본문 형식이 올바르지 않습니다.");
  if (depthOf(parsed.data) > MAX_DEPTH)
    throw new BoardError("본문 구조가 너무 깊습니다.");
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* 렌더링                                                               */
/* ------------------------------------------------------------------ */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const attachmentUrl = (id: string) => `/api/attachments/${id}`;

function renderText(node: DocNode): string {
  let html = esc(node.text ?? "");
  for (const mark of [...(node.marks ?? [])].reverse()) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<u>${html}</u>`;
        break;
      case "strike":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "");
        if (safeHref.safeParse(href).success)
          html = `<a href="${esc(href.trim())}" target="_blank" rel="noopener noreferrer">${html}</a>`;
        break;
      }
    }
  }
  return html;
}

function renderChildren(node: DocNode): string {
  return (node.content ?? []).map(renderNode).join("");
}

function renderNode(node: DocNode): string {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>";
    case "paragraph": {
      const inner = renderChildren(node);
      return `<p>${inner || "<br>"}</p>`;
    }
    case "heading": {
      // 화면 제목이 h1 이라 본문 제목은 h2 부터.
      const level = Math.min(4, Number(node.attrs?.level ?? 1) + 1);
      return `<h${level}>${renderChildren(node)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node)}</li>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${renderChildren(node)}</code></pre>`;
    case "attachmentImage": {
      const id = String(node.attrs?.id ?? "");
      if (!uuid.safeParse(id).success) return "";
      const alt = esc(String(node.attrs?.alt ?? ""));
      return `<figure class="board-media"><img src="${attachmentUrl(id)}" alt="${alt}" loading="lazy"></figure>`;
    }
    case "attachmentVideo": {
      const id = String(node.attrs?.id ?? "");
      if (!uuid.safeParse(id).success) return "";
      return `<figure class="board-media"><video src="${attachmentUrl(id)}" controls playsinline preload="metadata"></video></figure>`;
    }
    default:
      return renderChildren(node);
  }
}

/** 검증된 문서 → HTML. 화이트리스트 밖의 것은 나오지 않는다. */
export function renderDoc(doc: BoardDoc): string {
  return (doc.content ?? []).map(renderNode).join("");
}

/** 목록·푸시용 요약 글자. */
export function docText(doc: BoardDoc, limit = 120): string {
  const parts: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === "text" && node.text) parts.push(node.text);
    else if (node.type === "attachmentImage") parts.push("[사진]");
    else if (node.type === "attachmentVideo") parts.push("[동영상]");
    node.content?.forEach(walk);
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "listItem"
    )
      parts.push(" ");
  };
  walk(doc);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
}

/** 문서 안에서 쓰인 첨부 id. 저장 시 회사 소속 확인용. */
export function docAttachmentIds(doc: BoardDoc): string[] {
  const ids = new Set<string>();
  const walk = (node: DocNode) => {
    if (
      (node.type === "attachmentImage" || node.type === "attachmentVideo") &&
      typeof node.attrs?.id === "string"
    )
      ids.add(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}

/* ------------------------------------------------------------------ */
/* 목록·표시                                                             */
/* ------------------------------------------------------------------ */

export type PostStatus = "DRAFT" | "PUBLISHED";

export type PostSummary = {
  id: string;
  kind: BoardKind;
  status: PostStatus;
  title: string;
  excerpt: string;
  popup: boolean;
  popup_from: string | null;
  popup_until: string | null;
  author: string;
  published_at: string | null;
  updated_at: string;
  has_media: boolean;
};

export type PostDetail = {
  id: string;
  kind: BoardKind;
  status: PostStatus;
  title: string;
  body: BoardDoc;
  popup: boolean;
  popup_from: string | null;
  popup_until: string | null;
  author: string;
  created_by: string;
  published_at: string | null;
  updated_at: string;
};

export const postDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? (bytes / 1024 / 1024 / 1024).toFixed(2) + "GB"
    : bytes >= 1024 * 1024
      ? Math.round(bytes / 1024 / 1024) + "MB"
      : Math.max(1, Math.round(bytes / 1024)) + "KB";
