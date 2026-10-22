import type { SupabaseClient } from "@supabase/supabase-js";

import { getSignedInUser } from "@/lib/supabase";

export type PapelSebo = "dono" | "funcionario" | "";

export type SeboAtivo = {
  id: string;
  nome: string;
  papel: PapelSebo;
  codigoConvite: string;
};

let memory: SeboAtivo | null = null;
let pending: Promise<SeboAtivo | null> | null = null;
let generation = 0;

export function peekSeboAtivo(): SeboAtivo | null {
  return memory;
}

export function clearSeboAtivo(): void {
  generation += 1;
  memory = null;
  pending = null;
}

function readId(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return readId(value[0]);
  }

  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ["id", "sebo_id", "obter_sebo_usuario"]) {
      const candidate = row[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return "";
}

function readNome(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const row = value as Record<string, unknown>;
  if (typeof row.nome === "string" && row.nome.trim()) {
    return row.nome.trim();
  }

  if (typeof row.nome_sebo === "string" && row.nome_sebo.trim()) {
    return row.nome_sebo.trim();
  }

  return "";
}

function readPapel(value: unknown): PapelSebo {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "dono" || text === "funcionario") {
    return text;
  }

  return "";
}

function readCodigo(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const code = (value as Record<string, unknown>).codigo_convite;
  if (typeof code === "string") {
    return code.trim();
  }

  if (typeof code === "number" && Number.isFinite(code)) {
    return String(code).padStart(8, "0");
  }

  return "";
}

async function detalhesDoSebo(
  client: SupabaseClient,
  seboId: string,
): Promise<{ nome: string; codigoConvite: string }> {
  const full = await client.from("sebos").select("id, nome, codigo_convite").eq("id", seboId).maybeSingle();
  if (!full.error) {
    return { nome: readNome(full.data) || "Sebo", codigoConvite: readCodigo(full.data) };
  }

  if (/codigo_convite/i.test(full.error.message)) {
    const byNome = await client.from("sebos").select("id, nome").eq("id", seboId).maybeSingle();
    return { nome: byNome.error ? "Sebo" : readNome(byNome.data) || "Sebo", codigoConvite: "" };
  }

  const byNomeSebo = await client.from("sebos").select("id, nome_sebo, codigo_convite").eq("id", seboId).maybeSingle();
  if (byNomeSebo.error) {
    return { nome: "Sebo", codigoConvite: "" };
  }

  return { nome: readNome(byNomeSebo.data) || "Sebo", codigoConvite: readCodigo(byNomeSebo.data) };
}

async function seboPeloVinculo(client: SupabaseClient, usuarioId: string): Promise<SeboAtivo | null> {
  const membership = await client
    .from("membros_sebo")
    .select("sebo_id, papel")
    .eq("usuario_id", usuarioId)
    .limit(1)
    .maybeSingle();

  let seboId = membership.error ? "" : readId(membership.data?.sebo_id);
  let papel = membership.error ? "" : readPapel(membership.data?.papel);

  if (!seboId && membership.error && /usuario_id/i.test(membership.error.message)) {
    const alternate = await client
      .from("membros_sebo")
      .select("sebo_id, papel")
      .eq("user_id", usuarioId)
      .limit(1)
      .maybeSingle();
    seboId = alternate.error ? "" : readId(alternate.data?.sebo_id);
    papel = alternate.error ? "" : readPapel(alternate.data?.papel);
  }

  if (!seboId) {
    const rpc = await client.rpc("obter_sebo_usuario");
    seboId = rpc.error ? "" : readId(rpc.data);
  }

  if (!seboId) {
    return null;
  }

  const detalhes = await detalhesDoSebo(client, seboId);
  return { id: seboId, papel, ...detalhes };
}

async function fetchSebo(client: SupabaseClient, ticket: number): Promise<SeboAtivo | null> {
  const user = await getSignedInUser();
  if (!user || ticket !== generation) {
    return null;
  }

  const sebo = await seboPeloVinculo(client, user.id);
  if (ticket !== generation) {
    return null;
  }

  memory = sebo;
  return sebo;
}

export function getSeboAtivo(client: SupabaseClient): Promise<SeboAtivo | null> {
  if (memory) {
    return Promise.resolve(memory);
  }

  if (!pending) {
    const ticket = generation;
    pending = fetchSebo(client, ticket).finally(() => {
      if (ticket === generation) {
        pending = null;
      }
    });
  }

  return pending;
}
