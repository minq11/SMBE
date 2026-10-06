import { FloatField } from "@/components/ui/float-field";

/**
 * 가입할 때 받는 연락처 두 칸. 회사 만들기·회사코드 참여·초대 수락 세 갈래가
 * 모두 "이 회사의 구성원이 되는 순간" 이므로 같은 칸을 같은 문구로 보여 준다.
 *
 * 기본은 둘 다 선택 입력이다. 여기서 가입을 막으면 정작 현장에 들어가야 할
 * 사람이 문턱에서 걸린다. 비워 두면 메일은 로그인 계정 주소로 나가고, 문자는
 * 안 간다.
 *
 * emailRequired: **로그인 계정에 메일이 없는 사람만** 메일 칸이 필수가 된다
 * (카카오 이메일 미동의). 그 사람이 비우면 알림이 갈 주소가 아예 없어지는데,
 * 알림 쿼리들은 조용히 건너뛰므로 아무도 못 알아챈다. 판단은 서버가 한다
 * (`notifyEmailState`) — 여기 required 는 거들 뿐이다.
 *
 * flush: 구간 카드(`.std-form-section`) 안에 넣을 때. 카드가 gap 으로 간격을
 * 주므로 칸의 아래 여백을 뺀다.
 */
export function ContactFields({
  defaultEmail,
  flush = false,
  emailRequired = false,
}: {
  defaultEmail: string;
  flush?: boolean;
  emailRequired?: boolean;
}) {
  const className = flush ? "float-field--flush" : undefined;
  return (
    <>
      <FloatField
        className={className}
        id="contact_email"
        name="contact_email"
        label={emailRequired ? "알림 받을 메일" : "알림 받을 메일 (선택)"}
        type="email"
        defaultValue={defaultEmail}
        required={emailRequired}
        maxLength={254}
        autoComplete="email"
        hint="example@company.com"
        note={
          emailRequired
            ? "로그인에 쓴 계정에 메일 주소가 없어 받을 곳이 필요합니다. 작업지시 링크·승인 요청·주간 안전점검 회의 알림이 이 주소로 갑니다."
            : "로그인에 연동된 주소가 기본입니다. 회사 메일처럼 다른 주소로 받으려면 바꾸세요. 작업지시 링크·승인 요청·주간 안전점검 회의 알림이 이 주소로 갑니다."
        }
      />

      <FloatField
        className={className}
        id="phone"
        name="phone"
        label="휴대폰 번호 (선택)"
        type="tel"
        inputMode="tel"
        maxLength={30}
        autoComplete="tel"
        hint="010-1234-5678"
        note="지금 넣지 않아도 가입됩니다. 넣어 두면 나중에 작업지시 링크와 승인 요청을 문자·알림톡으로도 받습니다. 마이페이지에서 언제든 바꿀 수 있습니다."
      />
    </>
  );
}
