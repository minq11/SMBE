import type { InputHTMLAttributes } from "react";

/**
 * 라벨이 칸 안에 있다가 누르거나 값이 들어가면 윗선으로 올라가는 입력칸.
 * 짧은 칸이 한 줄에 여럿 반복되는 곳(비상연락처)에서 위 라벨 줄을 없애 준다.
 * placeholder 는 " " 로 고정한다 — CSS 가 `:placeholder-shown` 으로 빈 칸을 알아본다.
 * 라벨이 칸 안에 들어가므로 예시 문구를 따로 둘 자리는 없다.
 */
export function FloatField({
  id,
  label,
  className,
  ...input
}: {
  id: string;
  label: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "placeholder">) {
  return (
    <div className={className ? `float-field ${className}` : "float-field"}>
      <input id={id} placeholder=" " {...input} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}
