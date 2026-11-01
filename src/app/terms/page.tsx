import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "이용약관 · 겨울파트너" };

export default function TermsPage() {
  return (
    <LegalPage title="이용약관" updated="2026-11-02 (초안)">
      <section>
        <h2>1. 서비스</h2>
        <p>겨울파트너는 스키·스노보드 렌탈샵·강습팀과 강사를 연결하고, 강습 배정과 월 정산서 작성을 돕는 서비스입니다.</p>
      </section>
      <section>
        <h2>2. 대금</h2>
        <p>겨울파트너는 강습료를 받거나 대신 지급하지 않습니다. 강사 강습료는 샵이 직접 송금하며, 서비스는 정산서와 지급 완료 표시만 제공합니다.</p>
      </section>
      <section>
        <h2>3. 강습 배정과 취소</h2>
        <ul>
          <li>한 강사는 같은 시간에 두 강습을 맡을 수 없습니다.</li>
          <li>손님 사정으로 취소된 강습은 정산에서 빠지고 담당 강사에게 바로 알립니다.</li>
          <li>강사가 배정된 강습을 일방적으로 취소하면 정산에서 빠지고 패널티 점수가 기록됩니다(강습 24시간 안 3점, 그 전 1점).</li>
        </ul>
      </section>
      <section>
        <h2>4. 전속 강사</h2>
        <p>강사는 샵의 전속 제안을 수락해야 전속이 되며, 전속 중에는 다른 샵의 입찰 공고를 볼 수 없습니다. 강사와 샵은 언제든 전속을 끝낼 수 있습니다.</p>
      </section>
      <section>
        <h2>5. 자격 정보</h2>
        <p>강사가 올린 자격증은 본사가 확인한 뒤에만 다른 샵에 표시합니다. 허위 자격을 올리면 이용이 제한될 수 있습니다.</p>
      </section>
      <section>
        <h2>6. 손님 정보</h2>
        <p>샵은 손님 정보를 등록할 때 개인정보 수집·이용 동의를 받아야 합니다. 동의를 받지 않은 손님의 수업 메모는 강사에게 공유되지 않습니다.</p>
      </section>
    </LegalPage>
  );
}
