# 운영 점검 (P16-1)

2026-11-02 기준으로 **읽기만** 해서 확인했다. 설정은 하나도 바꾸지 않았다. 사용한 명령: `supabase backups list`, `supabase config diff`(원격과 로컬 설정 비교), `vercel logs`, `vercel crons list`, `vercel env ls`(이름만), 운영 DB `notifications` 건수.

## 결과 한눈에
| 항목 | 상태 | 내용 |
|---|---|---|
| DB 자동 백업 | ⚠️ 없음 | 백업 목록이 비어 있고 PITR(시점 복구)도 꺼져 있다. 무료 요금제로 보인다. 지금은 복구할 수 있는 시점이 없다 |
| 인증 메일 발송 | ❌ 시범 전에 꼭 고칠 것 | 커스텀 SMTP가 없어 Supabase 내장 메일을 쓴다. 내장 메일은 **시간당 2통**이고 **조직 팀원 주소로만** 간다. 원격에서는 가입 메일 인증이 켜져 있어, 시범 샵 사장님이 가입하면 인증 메일을 못 받는다 |
| 메일 재전송 간격 | ✅ | 같은 주소로 1분에 1번 |
| Auth Site URL | ✅ | `https://winter-partner.vercel.app` |
| Redirect URL | ✅ (참고 있음) | `https://winter-partner.vercel.app/auth/confirm` 1개뿐이다. 로컬 개발은 로컬 Supabase를 써서 운영에 localhost를 넣을 필요는 없다. Preview 배포 주소는 목록에 없어서, Preview에서 가입하면 운영 주소로 돌아간다 |
| 비밀번호 재설정 | ❌ 화면 없음 | 앱에 "비밀번호를 잊으셨나요" 흐름이 없었다 → P16-3에서 추가한다(역시 메일 발송이 필요) |
| 2단계 인증(TOTP) | ✅ | 원격에서 켜져 있다 |
| 크론 `/api/notify/dispatch` (매일 09:00 KST) | ⚠️ 성공 기록 없음 | Vercel에 크론 2개가 등록돼 있다. 오류 로그는 환경변수를 넣기 전(11/2 06:48 KST) 1건뿐이다. 성공하면 아무것도 남기지 않아 실제로 돌았는지 확인할 수 없다 → P16-2에서 실행 결과를 남긴다. 운영 알림은 1건이고 이미 발송됐다(밀린 것 0) |
| 크론 `/api/maintenance/daily` (매일 03:00 KST) | ⚠️ 위와 같음 | 오류 로그 없음. 성공 기록도 없음 |
| Vercel 런타임 오류 (최근 3일) | ✅ 지금은 없음 | 31건 중 24건은 첫 배포 때 환경변수가 비어 있던 것(11/2 06:31~06:49 KST, 해결됨)이고, 6건은 입찰 보조 AI 400 오류(3d5e16에서 수정)다. 11/2 12:00 KST 이후 0건 |
| 운영 환경변수 | ✅ | 필요한 8개가 있다(값은 보지 않음): Supabase 3, VAPID 3, CRON_SECRET, ANTHROPIC_API_KEY |

## 사장님이 할 일
| # | 할 일 | 왜 | 비용 | 급한 정도 |
|---|---|---|---|---|
| 1 | **메일 발송 서비스 가입 + 도메인** (아래 비교) → Supabase Auth → SMTP 설정 | 이게 없으면 시범 샵이 가입·비밀번호 재설정 메일을 못 받는다 | 메일 0원부터 + 도메인 연 1~3만 원 | 시범 전 필수 |
| 1-대안 | 메일 서비스 준비 전까지 Supabase Auth의 "Confirm email"을 끄거나, 본사가 계정을 만들어 전달 | 당장 가입을 막지 않으려면 | 0원 | 임시 |
| 2 | Supabase 요금제를 Pro로 올릴지 결정 | Pro는 매일 자동 백업 7일치. PITR은 추가 비용 | 월 $25 | 실제 샵 데이터가 들어오기 전 |
| 2-대안 | 요금제를 올리기 전까지 `scripts/ops/db-backup.sh`로 주 1회 손 백업 (Docker 필요). 결과는 `backups/`에 생기고 git에는 안 올라간다 | 복구할 시점을 하나라도 남기려면 | 0원 | 실제 샵 데이터가 들어오면 |
| 3 | Vercel 대시보드 → Settings → Cron Jobs에서 두 크론의 최근 실행을 한 번 눈으로 확인 | CLI로는 실행 이력이 안 보인다 | 0원 | 이번 주 |
| 4 | (선택) Preview에서도 가입을 시험하려면 Redirect URL에 `https://winter-partner-*-barumix-default.vercel.app/auth/confirm` 추가 | Preview 확인용 | 0원 | 낮음 |

## 메일 발송 서비스 후보 (가입은 사장님이)
둘 다 **자기 도메인**(예: winterpartner.kr)이 있어야 한다. `vercel.app` 주소로는 SPF·DKIM을 설정할 수 없어 네이버·다음 메일에서 스팸으로 가거나 거부된다. 가격은 2026-11-02에 공식 문서·리뷰를 검색해 확인했다(Resend 무료 한도는 공식 블로그·문서 일치, 유료 단계와 SES 무료 한도는 출처마다 달라 가입 전에 공식 요금 페이지를 다시 본다).

| | Resend | Amazon SES |
|---|---|---|
| 무료 한도 | 월 3,000통, 하루 100통 (도메인 1개) | 공식 FAQ는 처음 12개월 월 3,000통. 2026-07부터 새 계정은 크레딧 방식으로 바뀌었다는 글도 있어 확인 필요 |
| 넘으면 | Pro 월 $20 안팎 (월 5만 통) | 1,000통에 $0.10 |
| 시작 난이도 | 쉬움. 도메인 DNS 3줄 넣고 바로 SMTP | 보통. 처음엔 샌드박스라 "운영 전환" 신청이 필요(1~2일) |
| 한국 환경 | 서울 리전 없음(도쿄 발송). 한국어 메일 문제없음 | 서울 리전(ap-northeast-2)에서 발송, Supabase·Vercel과 같은 지역 |
| Supabase 연동 | 공식 연동 안내 있음 | SMTP 정보 직접 입력 |

**추천: Resend.** 시범 운영 규모(가입·재설정 메일 하루 수십 통)는 무료 한도 안이고, 설정이 가장 빠르다. 메일이 월 수만 통으로 늘면 SES로 옮기기 쉽다(SMTP 정보만 바꾸면 됨).

SMTP를 연결하면 Supabase의 시간당 메일 한도(`email_sent`)를 30 정도로 올린다(기본 2는 내장 메일용 값).

출처: [Supabase SMTP 문서](https://supabase.com/docs/guides/auth/auth-smtp) · [Resend 무료 한도](https://resend.com/blog/new-free-tier) · [Resend 요금](https://resend.com/pricing) · [Amazon SES 요금](https://aws.amazon.com/ses/pricing/) · [SES FAQ](https://aws.amazon.com/ses/faqs/)
