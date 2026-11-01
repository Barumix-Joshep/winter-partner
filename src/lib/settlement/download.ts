// 한글 파일 이름 내려받기 헤더 (RFC 5987)
export function attachment(filename: string, fallback: string) {
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
