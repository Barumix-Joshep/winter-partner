import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "개인정보 처리방침 · 겨울파트너" };

export default function PrivacyPage() {
  return (
    <LegalPage title="개인정보 처리방침" updated="2026-11-02 (초안)">
      <section>
        <h2>1. 처리하는 개인정보</h2>
        <ul>
          <li>회원(샵 관리자·강사): 이름, 이메일, 휴대폰 번호, 강사 자격증 사본, 활동 스키장·종목·소개</li>
          <li>샵이 등록하는 손님: 이름, 연락처, 보호자 이름·연락처, 레벨, 장비 사이즈, 강습 이력과 수업 메모</li>
        </ul>
      </section>
      <section>
        <h2>2. 처리 목적</h2>
        <ul>
          <li>샵과 강사의 강습 의뢰·입찰·배정, 일정 충돌 확인, 월 정산서 작성</li>
          <li>강사 자격 확인(본사 검증 뒤에만 자격 정보를 다른 샵에 표시)</li>
          <li>손님 강습 진행: 담당 강사에게 손님의 레벨과 지난 수업 메모 제공(손님이 동의한 경우)</li>
        </ul>
      </section>
      <section>
        <h2>3. 누가 볼 수 있나</h2>
        <ul>
          <li>손님 연락처는 그 손님을 등록한 샵의 관리자만 봅니다. 강사와 본사는 볼 수 없습니다.</li>
          <li>강사에게는 맡은 강습 손님의 레벨과 요청 사항만 보이고, 손님이 동의하면 같은 샵의 지난 수업 메모가 보입니다.</li>
          <li>강사의 연락처는 다른 샵에 공개하지 않습니다.</li>
        </ul>
      </section>
      <section>
        <h2>4. 보관 기간</h2>
        <ul>
          <li>회원 정보: 탈퇴할 때까지. 정산 기록은 세법에 따라 5년 보관합니다.</li>
          <li>손님 정보: 샵이 지울 때까지 또는 마지막 강습 뒤 3년.</li>
        </ul>
      </section>
      <section>
        <h2>5. 처리 위탁</h2>
        <ul>
          <li>Supabase(데이터 저장·인증), Vercel(서비스 호스팅). 알림톡을 쓰게 되면 발송 대행사를 추가합니다.</li>
        </ul>
      </section>
      <section>
        <h2>6. 권리</h2>
        <p>회원과 손님은 자기 정보의 열람·정정·삭제·처리 정지를 요구할 수 있습니다. 손님 정보는 등록한 샵에 요청하고, 샵이 처리하기 어려우면 본사로 연락해 주세요.</p>
      </section>
    </LegalPage>
  );
}
