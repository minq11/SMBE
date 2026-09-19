import { logoutAction } from "./logout-action";

export function SignOutButton({ label = "로그아웃" }: { label?: string }) {
  return (
    <form action={logoutAction} style={{ display: "inline" }}>
      <button
        type="submit"
        style={{
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        {label}
      </button>
    </form>
  );
}
