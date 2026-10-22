"use client";

import { getSeboAtivo, peekSeboAtivo, type SeboAtivo } from "@/lib/sebo-ativo";
import { getSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

let cachedEmail: string | null = null;

export function clearOperatorEmail(): void {
  cachedEmail = null;
}

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

function useOperatorEmail(): string {
  const [email, setEmail] = useState(cachedEmail ?? "");

  useEffect(() => {
    if (cachedEmail) {
      setEmail(cachedEmail);
      return;
    }

    let active = true;
    void getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const next = data.user?.email?.trim() ?? "";
        cachedEmail = next;
        if (active) {
          setEmail(next);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return email;
}

export function SeboHeader({ nome, convite = "" }: { nome: string; convite?: string }) {
  const label = nome.trim() || "Sebo";
  const code = convite.trim();
  const email = useOperatorEmail();

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur-sm md:px-8">
      <p className="truncate font-serif text-lg leading-tight text-ink md:text-xl">
        <span className="font-semibold">{label}</span>
        <span className="font-medium text-ink/75"> - Copiloto do Livreiro</span>
      </p>
      {email ? (
        <p className="mt-1 truncate text-xs font-medium tracking-wide text-ink/55">
          Operador: {email}
        </p>
      ) : null}
      {code ? (
        <p className="mt-1 truncate text-xs font-medium tracking-wide text-ink/55">
          Código de convite para equipe: {code}
        </p>
      ) : null}
    </header>
  );
}
