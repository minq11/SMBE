/**
 * 보이는 영역(visualViewport)에서 앱 틀이 취할 자세를 정한다. 순수 함수라
 * 기기 없이 시험한다 (tests/viewport-frame.test.ts).
 *
 * 키보드가 올라오면 두 가지 중 하나가 일어난다.
 * - 안드로이드(Chromium): 문서 자체가 줄어든다 (interactive-widget=resizes-content,
 *   layout.tsx). 보이는 높이 = 문서 높이, 밀림 없음.
 * - iOS: 문서는 그대로 두고 보이는 영역만 줄여서 아래로 민다(offsetTop). 그러면
 *   틀은 위에 남고 아래 단추 띠가 화면 중간에 뜨며 그 밑은 빈 배경이다.
 * 그래서 틀을 보이는 영역의 위치(offsetTop)·높이로 맞춘다.
 *
 * 키보드가 열렸는지는 "이 방향에서 본 가장 큰 높이" 와 비교해 안다. 주소창
 * 접힘은 100px 안쪽이고 키보드는 그보다 훨씬 크다.
 */
export const KEYBOARD_MIN_PX = 150;

export type ViewportFrame = {
  /** --app-h */
  height: number;
  /** 틀을 아래로 옮길 양. 0이면 옮기지 않는다. */
  top: number;
  keyboard: boolean;
};

export function viewportFrame(input: {
  height: number;
  offsetTop: number;
  /** 이 방향에서 지금까지 본 가장 큰 높이 */
  maxHeight: number;
}): ViewportFrame {
  const height = Math.round(input.height);
  const top = Math.max(0, Math.round(input.offsetTop));
  const keyboard = input.maxHeight - height >= KEYBOARD_MIN_PX;
  return { height, top, keyboard };
}
