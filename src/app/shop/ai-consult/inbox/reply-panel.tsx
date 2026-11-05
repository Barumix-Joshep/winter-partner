"use client";

import { useActionState, useRef, useState } from "react";
import { KAKAO_REPLY_NOTE, kbPrefill } from "@/lib/channels/inbox";
import { KB_CONTENT_MAX, KB_KIND_LABEL, KB_KINDS, KB_TITLE_MAX } from "@/lib/ai/consult/knowledge";
import { saveKnowledge, type KbState } from "../knowledge/actions";
import { approveSend, markCopied, markWrong, type InboxState } from "./actions";

// 대화 상세의 답장 칸(P22-5): [수정] [승인·발송(인스타)] / [복사(카카오)] [KB에 추가] [AI 답변 틀림].
// AI 초안은 제안일 뿐이고, 보내기·복사·안내 정보 저장은 모두 사장님이 누를 때만 한다(CLAUDE.md AI 원칙).
const area = "mt-1 block w-full rounded-[10px] border border-line bg-white px-3 py-2 text-base outline-none focus:border-brand read-only:bg-[#F6F7F9]";
const input = "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const btn = "min-h-11 rounded-[10px] px-4 text-sm font-medium disabled:opacity-60";

function Status({ state }: { state?: { ok?: boolean; message?: string } }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#1B6B3A]" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

export function ReplyPanel({
  conversationId,
  channel,
  draft,
  question,
  feedbackMessageId,
}: {
  conversationId: string;
  channel: string;
  draft: string;
  question: string;
  feedbackMessageId: string | null; // AI 답변 틀림을 붙일 메시지(마지막 AI·안내 메시지)
}) {
  const [text, setText] = useState(draft);
  const [editing, setEditing] = useState(!draft);
  const [kbOpen, setKbOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const [sendState, send, sending] = useActionState<InboxState | undefined, FormData>(approveSend, undefined);
  // 복사는 브라우저에서 먼저(클립보드 쓰기만, 읽지 않는다), 된 다음에 서버에 "답장함"으로 남긴다
  const [copyState, copy, copying] = useActionState<InboxState | undefined, FormData>(async (prev, fd) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      box.current?.select();
      return { message: "자동으로 복사하지 못했어요. 글을 길게 눌러 직접 복사해 주세요." };
    }
    return markCopied(prev, fd);
  }, undefined);
  const instagram = channel === "instagram";

  return (
    <section aria-label="답장" className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
      <label className="text-sm font-bold" htmlFor="reply-text">
        답장 {draft ? <span className="font-normal text-ink-muted">(AI 초안 — 확인하고 고쳐 쓰세요)</span> : null}
      </label>
      <textarea
        id="reply-text"
        ref={box}
        value={text}
        readOnly={!editing}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={2000}
        className={area}
      />
      {!instagram && (
        <p role="note" className="rounded-lg bg-[#FFF1E0] p-3 text-sm text-[#7A3E06]">
          {KAKAO_REPLY_NOTE}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            requestAnimationFrame(() => box.current?.focus());
          }}
          disabled={editing}
          className={`${btn} border border-line bg-white`}
        >
          수정
        </button>
        {instagram ? (
          <form action={send}>
            <input type="hidden" name="conversation_id" value={conversationId} />
            <input type="hidden" name="text" value={text} />
            <button disabled={sending || !text.trim()} className={`${btn} bg-brand text-white`}>
              {sending ? "보내는 중…" : "승인·발송(인스타)"}
            </button>
          </form>
        ) : (
          <form action={copy}>
            <input type="hidden" name="conversation_id" value={conversationId} />
            <input type="hidden" name="text" value={text} />
            <button disabled={copying || !text.trim()} className={`${btn} bg-brand text-white`}>
              복사(카카오)
            </button>
          </form>
        )}
        <button type="button" onClick={() => setKbOpen((v) => !v)} className={`${btn} border border-line bg-white`} aria-expanded={kbOpen}>
          KB에 추가
        </button>
        {feedbackMessageId && <WrongButton messageId={feedbackMessageId} draft={draft} edited={text} />}
      </div>
      <Status state={instagram ? sendState : copyState} />
      {kbOpen && <KbAddForm question={question} answer={text} />}
    </section>
  );
}

// [AI 답변 틀림] (고친 글이 있으면 함께 남긴다)
export function WrongButton({ messageId, draft, edited }: { messageId: string; draft: string; edited?: string }) {
  const [state, action, pending] = useActionState<InboxState | undefined, FormData>(markWrong, undefined);
  if (state?.ok) return <Status state={state} />;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="message_id" value={messageId} />
      <input type="hidden" name="draft" value={draft} />
      {edited !== undefined && <input type="hidden" name="edited" value={edited} />}
      <button disabled={pending} className={`${btn} border border-[#F2C9C9] bg-white text-danger`}>
        AI 답변 틀림
      </button>
      <Status state={state} />
    </form>
  );
}

// [KB에 추가]: 손님 질문 + 사장님 답으로 안내 정보 새 항목을 미리 채운다. 'AI 답변에 사용'은 꺼진 채로 — 사장님이 확인해 저장·켠다.
function KbAddForm({ question, answer }: { question: string; answer: string }) {
  const pre = kbPrefill(question, answer);
  const [state, action, pending] = useActionState<KbState | undefined, FormData>(saveKnowledge, undefined);
  return (
    <form action={action} aria-label="안내 정보에 추가" className="flex flex-col gap-3 rounded-[14px] border border-dashed border-line p-3">
      <p className="text-sm font-bold">안내 정보에 추가</p>
      <label className="text-sm font-medium">
        종류
        <select name="kind" defaultValue={pre.kind} className={input}>
          {KB_KINDS.map((k) => (
            <option key={k} value={k}>
              {KB_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        제목
        <input name="title" defaultValue={pre.title} maxLength={KB_TITLE_MAX} required className={input} />
      </label>
      <label className="text-sm font-medium">
        내용
        <textarea name="content" defaultValue={pre.content} maxLength={KB_CONTENT_MAX} rows={3} className={area} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" className="size-5" />
        AI 답변에 사용
      </label>
      <button disabled={pending} className={`${btn} border border-line bg-white`}>
        {pending ? "저장 중…" : "안내 정보 저장"}
      </button>
      <Status state={state} />
    </form>
  );
}
