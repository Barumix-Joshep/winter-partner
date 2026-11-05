-- 보안 7(DB 함수, P21-5): Security Advisor security_definer_view 경고 1건(public.instructor_assignments)을 의도된 예외로 남긴다.
-- 뷰 정의·권한은 그대로 두고 설명(comment)만 단다. 근거·안전장치는 docs/security/checklist.md 7번 "허용된 예외". 데이터 변경 없음.
--
-- 되돌리기: comment on view public.instructor_assignments is null;

comment on view public.instructor_assignments is '의도된 SECURITY DEFINER: 팀 금액을 가리고 자기 배정만 보여 줌. 열·where를 바꾸면 docs/security/checklist.md 7번과 테스트를 같이 고칠 것';
