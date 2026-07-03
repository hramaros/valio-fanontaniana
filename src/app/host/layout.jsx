"use client";
import { usePathname } from "next/navigation";
import HostShell from "@/components/HostShell";

// Toutes les pages /host/* vivent dans le shell formateur.
// Lobby et suivi de session passent en mode « focus » (projection).
export default function HostLayout({ children }) {
  const pathname = usePathname();
  const focus =
    pathname.startsWith("/host/lobby") || pathname.startsWith("/host/results");
  return <HostShell focus={focus}>{children}</HostShell>;
}
