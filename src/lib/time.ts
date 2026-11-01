// 요청 시각 (렌더 함수 밖에서 읽는다: React 렌더는 순수해야 한다)
export function requestTime() {
  return Date.now();
}
