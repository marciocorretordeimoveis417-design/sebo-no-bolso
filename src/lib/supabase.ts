import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function supabaseProjectUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

const supabaseUrl = supabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * Row written to public.perfis when an account is created.
 * id matches auth.users.id. nome_sebo comes from the name field.
 */
export type Perfil = {
  id: string;
  nome_sebo: string;
};

const authOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
} as const;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, authOptions)
  : null;

export async function getSignedInUser() {
  if (typeof window === "undefined" || !isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local e reinicie o servidor.",
    );
  }

  return supabase;
}

export async function insertPerfil(
  client: SupabaseClient,
  perfil: Perfil,
): Promise<string | null> {
  const { error } = await client.from("perfis").insert({
    id: perfil.id,
    nome_sebo: perfil.nome_sebo,
  });

  if (!error || error.code === "23505") {
    return null;
  }

  return error.message;
}
