#!/usr/bin/env bash
# 운영 DB 논리 백업 (P16-1). 무료 요금제에는 Supabase 자동 백업이 없어서, 요금제를 올리기 전까지 손으로 뜬다.
# 결과는 backups/<날짜>/ 아래에 생기고 git에 올라가지 않는다(.gitignore). 손님 연락처가 들어 있으니 암호화된 곳에만 옮긴다.
# 필요: Docker 실행 중, `npx supabase link` 완료. 운영 데이터를 바꾸지 않는다(읽기만).
set -euo pipefail
cd "$(dirname "$0")/../.."
out="backups/$(date +%Y%m%d-%H%M)"
mkdir -p "$out"
umask 077
npx supabase db dump --linked -f "$out/schema.sql"
npx supabase db dump --linked --data-only --use-copy -f "$out/data.sql"
npx supabase db dump --linked --role-only -f "$out/roles.sql"
echo "백업 완료: $out ($(du -sh "$out" | cut -f1))"
