"use client";

import { BrandMark } from "@/components/brand-mark";
import { clearOperatorEmail } from "@/components/sebo-header";
import { clearSeboAtivo, getSeboAtivo } from "@/lib/sebo-ativo";
import { getSignedInUser, getSupabase } from "@/lib/supabase";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M8 7h11M8 12h11M8 17h11" />
      <path strokeLinecap="round" d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M9 7V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 12H4m0 0 2.5-2.5M4 12l2.5 2.5" />
    </svg>
  );
}

function navClass(active: boolean, desktop: boolean) {
  if (desktop) {
    return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
      active ? "bg-[#18794a]/10 text-[#18794a]" : "text-ink/70 hover:bg-paper"
    }`;
  }

  return `flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
    active ? "text-[#18794a]" : "text-ink/45"
  }`;
}

export function PainelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [nome, setNome] = useState("Sebo");
  const [leaving, setLeaving] = useState(false);
  const dashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const novo = pathname === "/cadastrar" || pathname.startsWith("/cadastrar/");

  useEffect(() => {
    let active = true;

    void (async () => {
      const user = await getSignedInUser();
      if (!active) {
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      const sebo = await getSeboAtivo(getSupabase());
      if (!active) {
        return;
      }

      setNome(sebo?.nome?.trim() || "Sebo");
      setReady(true);
    })().catch(() => {
      if (active) {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  function closeDetail() {
    window.dispatchEvent(new Event("sebo-nav"));
  }

  async function leave() {
    closeDetail();
    setLeaving(true);
    try {
      clearSeboAtivo();
      clearOperatorEmail();
      await getSupabase().auth.signOut();
    } finally {
      router.replace("/login");
    }
  }

  if (!ready) {
    return (
      <div className="ledger flex flex-1 items-center justify-center px-5">
        <p className="text-sm text-ink/60">Abrindo…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-rule bg-card px-5 py-8 md:flex">
        <BrandMark />
        <p className="mt-6 font-serif text-2xl leading-tight text-ink">{nome}</p>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          <Link href="/dashboard" onClick={closeDetail} className={navClass(dashboard, true)}>
            <ListIcon />
            Dashboard
          </Link>
          <Link href="/cadastrar" onClick={closeDetail} className={navClass(novo, true)}>
            <PlusIcon />
            Novo livro
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => void leave()}
          disabled={leaving}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/70 disabled:opacity-60"
        >
          <LogoutIcon />
          {leaving ? "Saindo…" : "Sair"}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">{children}</div>

      <nav className="fixed bottom-0 z-50 flex h-16 w-full border-t border-rule bg-white md:hidden">
        <Link href="/dashboard" onClick={closeDetail} className={navClass(dashboard, false)}>
          <ListIcon />
          Dashboard
        </Link>
        <Link href="/cadastrar" onClick={closeDetail} className={navClass(novo, false)}>
          <PlusIcon />
          Novo livro
        </Link>
        <button type="button" onClick={() => void leave()} disabled={leaving} className={navClass(false, false)}>
          <LogoutIcon />
          {leaving ? "Saindo…" : "Sair"}
        </button>
      </nav>
    </div>
  );
}
