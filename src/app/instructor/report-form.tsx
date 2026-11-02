"use client";

import { useActionState, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { completeLesson, tidyNote, type TidyState } from "./actions";

type SpeechRec = { lang: string; interimResults: boolean; start: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

const noop = () => () => {};
function speechCtor() {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function ReportForm({ jobId, aiTidy = false }: { jobId: string; aiTidy?: boolean }) {
  const [state, action, pending] = useActionState(completeLesson, undefined);
  const [tidy, setTidy] = useState<TidyState | null>(null);
  const [tidying, startTidy] = useTransition();
  const [listening, setListening] = useState(false);
  const note = useRef<HTMLTextAreaElement>(null);
  // 음성 인식 지원 여부는 브라우저에서만 안다 (서버 렌더에서는 없음으로)
  const hasSpeech = useSyncExternalStore(noop, () => !!speechCtor(), () => false);
  const speech = hasSpeech ? speechCtor() : undefined;

  const runTidy = () =>
    startTidy(async () => {
      const r = await tidyNote(jobId, note.current?.value ?? "");
      setTidy(r);
      if (r.text && note.current) note.current.value = r.text;
    });
  const listen = () => {
    if (!speech) return;
    const rec = new speech();
    rec.lang = "ko-KR";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      if (note.current) note.current.value = [note.current.value, said].filter(Boolean).join(" ");
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <textarea
        ref={note}
        name="note"
        rows={aiTidy ? 4 : 2}
        maxLength={1000}
        placeholder="강습 노트 (다음 강습 참고): 어디까지 했는지, 다음에 할 것"
        aria-label="강습 노트"
        aria-describedby={`note-hint-${jobId}`}
        className="rounded-[10px] border border-line px-3 py-2 text-sm"
      />
      <p id={`note-hint-${jobId}`} className="text-xs text-ink-muted">
        같은 샵에서 다음에 맡는 강사가 봅니다. 부상·질환 등 건강 정보는 적지 마세요.
      </p>
      {(aiTidy || speech) && (
        <div className="flex flex-wrap gap-2">
          {speech && (
            <button type="button" onClick={listen} disabled={listening} className="min-h-11 rounded-[10px] border border-line px-3 text-xs disabled:opacity-60">
              {listening ? "듣는 중…" : "말로 입력"}
            </button>
          )}
          {aiTidy && (
            <button type="button" onClick={runTidy} disabled={tidying} className="min-h-11 rounded-[10px] border-[1.5px] border-brand px-3 text-xs font-medium text-brand disabled:opacity-60">
              {tidying ? "정리 중…" : "정리하기"}
            </button>
          )}
        </div>
      )}
      {speech && <p className="text-[11px] text-ink-muted">말로 입력은 브라우저 음성 인식을 씁니다(브라우저 제공 업체 서버를 거칠 수 있음).</p>}
      {tidy?.text && <p role="status" className="text-xs text-brand">정리했습니다. 고칠 곳을 고친 뒤 보고해 주세요.</p>}
      {tidy?.message && <p className="text-xs text-danger">{tidy.message}</p>}
      {!!tidy?.health?.length && (
        <div role="alert" className="rounded-lg bg-[#FFF1E0] p-2 text-xs text-[#7A3E06]">
          건강 정보로 보이는 문장은 정리에서 뺐습니다. 노트에 남기지 말고 샵에 직접 알려 주세요:
          <ul>
            {tidy.health.map((h) => (
              <li key={h} className="ml-4 list-disc">
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand text-sm font-medium text-white disabled:opacity-60">
        {pending ? "보내는 중…" : "완료 보고하기"}
      </button>
      {state?.message && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
