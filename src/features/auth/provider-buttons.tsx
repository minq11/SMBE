import { ReactNode } from "react";
import { signIn } from "@/auth";
import { GoogleLogo, KakaoLogo, NaverLogo } from "./provider-logos";

const providers: ReadonlyArray<{
  id: "naver" | "kakao" | "google";
  label: string;
  className: string;
  icon: ReactNode;
}> = [
  {
    id: "naver",
    label: "네이버로 시작하기",
    className: "auth-provider-btn naver",
    icon: <NaverLogo />,
  },
  {
    id: "kakao",
    label: "카카오로 시작하기",
    className: "auth-provider-btn kakao",
    icon: <KakaoLogo />,
  },
  {
    id: "google",
    label: "구글로 시작하기",
    className: "auth-provider-btn google",
    icon: <GoogleLogo />,
  },
];

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
            <span className="auth-provider-icon" aria-hidden="true">
              {provider.icon}
            </span>
            <span>{provider.label}</span>
          </button>
        </form>
      ))}
    </div>
  );
}
