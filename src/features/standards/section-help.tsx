// 표준서 폼 구간 머리의 물음표가 여는 안내. 세 줄이면 충분하다: 이게 뭔지,
// 어떻게 쓰는지, 법이 왜 요구하는지. 길면 아무도 안 읽는다.
function Rows({ what, how, why }: { what: string; how: string; why: string }) {
  return (
    <dl className="help-rows">
      <dt>무엇</dt>
      <dd>{what}</dd>
      <dt>어떻게</dt>
      <dd>{how}</dd>
      <dt>왜</dt>
      <dd>{why}</dd>
    </dl>
  );
}

export function BasicHelp() {
  return (
    <Rows
      what="표준서 이름과 위험작업허가(PTW) 필요 여부."
      how="현장에서 부르는 작업 이름 그대로. 불·질식·감전 위험이 큰 작업이면 PTW 필요."
      why="지시서를 만들 때마다 이 이름으로 고릅니다. 이름이 곧 검색어입니다."
    />
  );
}

export function MethodHelp() {
  return (
    <Rows
      what="이 작업을 어떤 순서로 하는지."
      how="한 단계에 한 동작. 전원 차단 → 잠금 → 금형 분리. 사진을 붙이면 신입도 따라 합니다."
      why="산업안전보건법 38조: 사업주는 위험을 막을 작업 방법을 정해 알려야 합니다. 사고 뒤 처음 묻는 것이 이것입니다."
    />
  );
}

export function ChecklistHelp() {
  return (
    <Rows
      what="작업 전(TBM)과 작업 중 순회점검에서 확인할 항목."
      how="예·아니오로 답할 수 있게. 작업 전 3~5개, 작업 중 2~3개면 충분합니다."
      why="작업자가 매일 이 항목을 확인한 기록이 안전관리 증빙입니다. 감독이 오면 이것부터 봅니다."
    />
  );
}

export function RiskHelp() {
  return (
    <Rows
      what="이 작업에서 무엇이 위험한지, 얼마나, 어떻게 줄일지."
      how="위험요인 하나에 카드 하나. 수준은 회사 기준(수준 옆 물음표)으로. 허용 불가면 담당과 기한을 정합니다."
      why="산업안전보건법 36조: 사업주는 위험성평가를 하고 기록을 3년 보관합니다. 이 화면이 그 기록입니다."
    />
  );
}
