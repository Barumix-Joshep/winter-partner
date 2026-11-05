"use client";

import { useActionState } from "react";
import { KB_CONTENT_MAX, KB_KIND_LABEL, KB_KINDS, KB_TITLE_MAX, type KbItem } from "@/lib/ai/consult/knowledge";
import { deleteKnowledge, saveDisclosure, saveKnowledge, type KbState } from "./actions";

const input = "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const area = "mt-1 block w-full rounded-[10px] border border-line bg-white px-3 py-2 text-base outline-none focus:border-brand";

function Status({ state }: { state?: KbState }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#1B6B3A]" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

export function KnowledgeItemForm({ item }: { item: KbItem }) {
  const [state, action, pending] = useActionState<KbState | undefined, FormData>(saveKnowledge, undefined);
  return (
    <li className="rounded-[14px] border border-line bg-white p-4">
      <form action={action} aria-label={`안내 정보: ${item.title}`} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="kind" value={item.kind} />
        <label className="text-sm font-medium">
          제목
          <input name="title" defaultValue={item.title} maxLength={KB_TITLE_MAX} required className={input} />
        </label>
        <label className="text-sm font-medium">
          내용
          <textarea name="content" defaultValue={item.content} maxLength={KB_CONTENT_MAX} rows={3} className={area} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={item.is_active} className="size-5" />
            AI 답변에 사용
          </label>
          <button disabled={pending} className="ml-auto min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
        <Status state={state} />
      </form>
      <form action={deleteKnowledge} className="mt-1 flex justify-end">
        <input type="hidden" name="id" value={item.id} />
        <button className="min-h-11 text-sm text-ink-muted underline">삭제</button>
      </form>
    </li>
  );
}

export function AddKnowledgeForm() {
  const [state, action, pending] = useActionState<KbState | undefined, FormData>(saveKnowledge, undefined);
  return (
    <form action={action} aria-label="안내 정보 추가" className="flex flex-col gap-3 rounded-[14px] border border-dashed border-line bg-white p-4">
      <p className="text-sm font-bold">새 항목 추가</p>
      <label className="text-sm font-medium">
        종류
        <select name="kind" defaultValue="faq" className={input}>
          {KB_KINDS.map((k) => (
            <option key={k} value={k}>
              {KB_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        제목
        <input name="title" maxLength={KB_TITLE_MAX} required className={input} />
      </label>
      <label className="text-sm font-medium">
        내용
        <textarea name="content" maxLength={KB_CONTENT_MAX} rows={3} className={area} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" className="size-5" />
        AI 답변에 사용
      </label>
      <button disabled={pending} className="min-h-11 rounded-[10px] border border-line text-sm font-medium disabled:opacity-60">
        {pending ? "추가 중…" : "추가"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function DisclosureForm({ text, discloseFirst }: { text: string; discloseFirst: boolean }) {
  const [state, action, pending] = useActionState<KbState | undefined, FormData>(saveDisclosure, undefined);
  return (
    <form action={action} aria-label="AI 고지 문구" className="flex flex-col gap-3">
      <label className="text-sm font-medium">
        AI 고지 문구 <span className="font-normal text-ink-muted">(첫 자동 답변 앞에 붙습니다, 300자까지)</span>
        <textarea name="disclosure" defaultValue={text} maxLength={300} rows={2} required className={area} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="disclose_first" defaultChecked={discloseFirst} className="size-5" />
        대화의 첫 자동 답변에 고지 문구 붙이기
      </label>
      <button disabled={pending} className="min-h-11 self-start rounded-[10px] border border-line px-4 text-sm font-medium disabled:opacity-60">
        {pending ? "저장 중…" : "고지 문구 저장"}
      </button>
      <Status state={state} />
    </form>
  );
}
