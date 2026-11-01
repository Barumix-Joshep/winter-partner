import type { ReactNode } from "react";
import { AreaShell } from "@/components/area-shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <AreaShell area="admin">{children}</AreaShell>;
}
