"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center px-4 py-10">
      <ErrorScreen error={error} retry={retry} />
    </main>
  );
}
