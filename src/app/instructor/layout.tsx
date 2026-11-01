import { Suspense, type ReactNode } from "react";
import { AreaShell } from "@/components/area-shell";
import { NoticeBanner } from "@/components/notice-banner";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AreaShell area="instructor">
      <Suspense>
        <NoticeBanner />
      </Suspense>
      {children}
    </AreaShell>
  );
}
