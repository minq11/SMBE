import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * 앱의 입력칸 (디자인 헌법 3장). 라벨이 칸 안에 있다가 누르거나 값이 들어가면
 * 윗선으로 올라간다. 위 라벨 줄이 없어 폼이 짧아지고, 좁은 화면에서 칸을 나란히
 * 세울 수 있다.
 *
 * - `hint` 는 예시 문구. 라벨이 칸을 차지하므로 누른 뒤에만 흐리게 보인다.
 *   CSS 가 `:placeholder-shown` 으로 빈 칸을 알아보므로 hint 가 없어도 placeholder
 *   는 " " 로 채운다.
 * - `note` 는 칸 아래 한 줄 안내. 화면 읽기가 칸과 함께 읽도록 aria-describedby 로 잇는다.
 * - 라벨·칸에 전용 클래스를 붙인다 — 폼마다 `.account-form label` 같은 조상 규칙이
 *   있어 태그 선택자로는 이기지 못한다.
 */
type Common = {
  id: string;
  label: ReactNode;
  hint?: string;
  note?: ReactNode;
  className?: string;
};

// 값이 없어도 브라우저가 칸 안에 무언가(연-월-일, 고른 항목)를 그리는 칸은 라벨을
// 처음부터 올려 둔다. 안 그러면 라벨과 그 글자가 겹친다.
const ALWAYS_UP = new Set(["date", "time", "datetime-local", "month", "week"]);

function rootClass(kind: string, up: boolean, className?: string) {
  return [
    "float-field",
    kind && `float-field--${kind}`,
    up && "float-field--up",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function Parts({
  id,
  label,
  note,
}: {
  id: string;
  label: ReactNode;
  note?: ReactNode;
}) {
  return (
    <>
      <label className="float-field-label" htmlFor={id}>
        {label}
      </label>
      {note ? (
        <p className="float-field-note" id={`${id}-note`}>
          {note}
        </p>
      ) : null}
    </>
  );
}

function describedBy(id: string, note: ReactNode, own?: string) {
  const ids = [own, note ? `${id}-note` : undefined].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function FloatField({
  id,
  label,
  hint,
  note,
  className,
  ...input
}: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "placeholder">) {
  return (
    <div className={rootClass("", ALWAYS_UP.has(input.type ?? ""), className)}>
      <input
        {...input}
        id={id}
        className="float-field-control"
        placeholder={hint || " "}
        aria-describedby={describedBy(id, note, input["aria-describedby"])}
      />
      <Parts id={id} label={label} note={note} />
    </div>
  );
}

export function FloatTextarea({
  id,
  label,
  hint,
  note,
  className,
  ...textarea
}: Common &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "placeholder">) {
  return (
    <div className={rootClass("textarea", false, className)}>
      <textarea
        {...textarea}
        id={id}
        className="float-field-control"
        placeholder={hint || " "}
        aria-describedby={describedBy(id, note, textarea["aria-describedby"])}
      />
      <Parts id={id} label={label} note={note} />
    </div>
  );
}

export function FloatSelect({
  id,
  label,
  note,
  className,
  children,
  ...select
}: Omit<Common, "hint"> & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <div className={rootClass("select", true, className)}>
      <select
        {...select}
        id={id}
        className="float-field-control"
        aria-describedby={describedBy(id, note, select["aria-describedby"])}
      >
        {children}
      </select>
      <Parts id={id} label={label} note={note} />
    </div>
  );
}
