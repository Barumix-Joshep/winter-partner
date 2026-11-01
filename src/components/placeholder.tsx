// 아직 만들지 않은 화면 자리
export function Placeholder({ title, next }: { title: string; next: string }) {
  return (
    <section className="rounded-[14px] border border-line bg-white p-5">
      <h1 className="text-base font-bold">{title}</h1>
      <p className="mt-1 text-sm text-ink-muted">{next}</p>
    </section>
  );
}
