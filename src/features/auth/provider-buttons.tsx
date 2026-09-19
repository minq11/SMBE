import { signIn } from "@/auth";

const providers = [
  { id: "naver", label: "네이버로 시작하기", className: "auth-provider-btn naver" },
  { id: "kakao", label: "카카오로 시작하기", className: "auth-provider-btn kakao" },
  { id: "google", label: "구글로 시작하기", className: "auth-provider-btn google" },
] as const;

export function ProviderButtons({ redirectTo }: { redirectTo: string }) {
  return (
    <div className="auth-provider-list">
      {providers.map((provider) => (
        <form
          key={provider.id}
          action={async () => {
            "use server";
            await signIn(provider.id, { redirectTo });
          }}
        >
          <button type="submit" className={provider.className}>
            {provider.label}
          </button>
        </form>
      ))}
    </div>
  );
}
