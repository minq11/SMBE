/** 사업자 표시 정보 (전자상거래법 제10조). 공개 화면 하단과 마이페이지에 그대로 나간다. */
export const BUSINESS = {
  name: "패밀리포차",
  owner: "윤은희",
  registration: "202-26-98342",
  address: "경기도 시흥시 하상로 13, 1층",
  phone: "070-7938-5499",
  email: "gooddonutsyh@gmail.com",
  service: "심플안전",
  /** 전자상거래법 시행령의 호스팅서비스 제공자 표시. 서버·파일은 AWS, DB 는 Neon. */
  hosting: "Amazon Web Services · Neon",
} as const;
