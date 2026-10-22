"use client";

import { getSeboAtivo, peekSeboAtivo, type SeboAtivo } from "@/lib/sebo-ativo";
import { getSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export function useSeboAtivo(): SeboAtivo | null {
  const [sebo, setSebo] = useState<SeboAtivo | null>(() => peekSeboAtivo());

  useEffect(() => {
    let active = true;

    void getSeboAtivo(getSupabase()).then((value) => {
      if (active) {
        setSebo(value);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return sebo;
}

export function SeboHeader({ nome }: { nome: string }) {
  const label = nome.trim() || "Sebo";

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur-sm md:px-8">
      <p className="truncate font-serif text-lg leading-tight text-ink md:text-xl">
        <span className="font-semibold">{label}</span>
        <span className="font-medium text-ink/75"> - Copiloto do Livreiro</span>
      </p>
    </header>
  );
}
