/**
 * 가입할 때 받는 연락처 두 칸. 회사 만들기·회사코드 참여·초대 수락 세 갈래가
 * 모두 "이 회사의 구성원이 되는 순간" 이므로 같은 칸을 같은 문구로 보여 준다.
 *
 * 둘 다 선택 입력이다. 여기서 가입을 막으면 정작 현장에 들어가야 할 사람이
 * 문턱에서 걸린다. 비워 두면 메일은 로그인 계정 주소로 나가고, 문자는 안 간다.
 */
export function ContactFields({ defaultEmail }: { defaultEmail: string }) {
  return (
    <>
      <div className="form-field">
        <label htmlFor="contact_email">알림 받을 메일 (선택)</label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          defaultValue={defaultEmail}
          maxLength={254}
          autoComplete="email"
          placeholder="example@company.com"
        />
        <span className="hint">
          로그인에 연동된 주소가 기본입니다. 회사 메일처럼 다른 주소로 받으려면
          바꾸세요. 작업지시 링크·승인 요청·주간 안전점검 회의 알림이 이 주소로
          갑니다.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="phone">휴대폰 번호 (선택)</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          maxLength={30}
          autoComplete="tel"
          placeholder="010-1234-5678"
        />
        <span className="hint">
          지금 넣지 않아도 가입됩니다. 넣어 두면 나중에 작업지시 링크와 승인
          요청을 문자·알림톡으로도 받습니다. 마이페이지에서 언제든 바꿀 수
          있습니다.
        </span>
      </div>
    </>
  );
}
