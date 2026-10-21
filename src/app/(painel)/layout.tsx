import { PainelShell } from "@/components/painel-shell";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <PainelShell>{children}</PainelShell>;
}
