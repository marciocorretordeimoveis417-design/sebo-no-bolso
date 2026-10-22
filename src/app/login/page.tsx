"use client";

import { BrandMark } from "@/components/brand-mark";
import { clearSeboAtivo } from "@/lib/sebo-ativo";
import { getSupabase, insertPerfil, isSupabaseConfigured } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "login" | "register";
type ContaPapel = "dono" | "funcionario";

type FormState = {
  nome: string;
  convite: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const emptyForm: FormState = {
  nome: "",
  convite: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function codigoAleatorio(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(buffer[0] % 100_000_000).padStart(8, "0");
}

async function buscarSeboPorConvite(
  client: SupabaseClient,
  codigo: string,
): Promise<{ id: string; nome: string } | { error: string }> {
  const { data, error } = await client.from("sebos").select("id, nome").eq("codigo_convite", codigo).maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data?.id) {
    return { error: "Código de convite não encontrado" };
  }

  const nome = typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : "Sebo";
  return { id: data.id, nome };
}

async function criarSeboDoDono(client: SupabaseClient, nome: string): Promise<{ id: string } | { error: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inserted = await client
      .from("sebos")
      .insert({ nome, codigo_convite: codigoAleatorio() })
      .select("id")
      .single();

    if (!inserted.error && inserted.data?.id) {
      return { id: inserted.data.id };
    }

    if (inserted.error?.code === "23505") {
      continue;
    }

    if (inserted.error && /codigo_convite/i.test(inserted.error.message)) {
      const plain = await client.from("sebos").insert({ nome }).select("id").single();
      if (!plain.error && plain.data?.id) {
        return { id: plain.data.id };
      }

      return { error: plain.error?.message ?? "Não foi possível criar o sebo." };
    }

    return { error: inserted.error?.message ?? "Não foi possível criar o sebo." };
  }

  return { error: "Não foi possível gerar o código de convite." };
}

async function vincularMembro(
  client: SupabaseClient,
  seboId: string,
  usuarioId: string,
  papel: ContaPapel,
): Promise<string | null> {
  const { error } = await client.from("membros_sebo").insert({
    sebo_id: seboId,
    usuario_id: usuarioId,
    papel,
  });

  if (!error || error.code === "23505") {
    return null;
  }

  return error.message;
}

const fieldClassName =
  "h-12 w-full rounded-md border border-rule bg-card px-3 text-base text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-ink";

function mapAuthError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (text.includes("already registered") || text.includes("already been registered")) {
    return "Este e-mail já está cadastrado. Entre com a senha.";
  }

  if (text.includes("invalid api key")) {
    return "A chave anônima do Supabase foi recusada. Confira o .env.local.";
  }

  if (text.includes("failed to fetch") || text.includes("network")) {
    return "Não foi possível alcançar o Supabase. Confira a URL do projeto.";
  }

  if (text.includes("email rate limit")) {
    return "Muitas tentativas de e-mail. Aguarde um pouco e tente de novo.";
  }

  if (text.includes("password")) {
    return "A senha foi recusada. Use pelo menos 6 caracteres.";
  }

  return message;
}

function validate(mode: Mode, papel: ContaPapel, values: FormState): string | null {
  const nome = values.nome.trim();
  const email = values.email.trim();

  if (mode === "register" && papel === "dono" && nome.length < 2) {
    return "Informe o nome do sebo.";
  }

  if (mode === "register" && papel === "funcionario" && !/^\d{8}$/.test(values.convite)) {
    return "Informe o código de convite com 8 dígitos.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Informe um e-mail válido.";
  }

  if (values.password.length < 6) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (mode === "register" && values.password !== values.confirmPassword) {
    return "As senhas não coincidem.";
  }

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [papel, setPapel] = useState<ContaPapel>("dono");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let active = true;
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) {
          return;
        }

        if (data.session) {
          router.replace("/dashboard");
          return;
        }

        setReady(true);
      })
      .catch(() => {
        if (active) {
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const validationError = validate(mode, papel, form);
    if (validationError) {
      setError(validationError);
      return;
    }

    const email = form.email.trim().toLowerCase();
    const nome = form.nome.trim();
    const supabase = getSupabase();
    setSubmitting(true);

    try {
      if (mode === "register") {
        let seboId = "";
        let nomeSebo = nome;

        if (papel === "funcionario") {
          const encontrado = await buscarSeboPorConvite(supabase, form.convite);
          if ("error" in encontrado) {
            setError(encontrado.error);
            return;
          }

          seboId = encontrado.id;
          nomeSebo = encontrado.nome;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: form.password,
          options: {
            data: { nome_sebo: nomeSebo },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (signUpError) {
          setError(mapAuthError(signUpError.message));
          return;
        }

        if (!data.user) {
          setError("Não foi possível criar a conta.");
          return;
        }

        if (data.user.identities && data.user.identities.length === 0) {
          setError("Este e-mail já está cadastrado. Entre com a senha.");
          setMode("login");
          return;
        }

        if (papel === "dono") {
          const criado = await criarSeboDoDono(supabase, nome);
          if ("error" in criado) {
            setError(
              data.session
                ? `A conta foi criada, mas a loja não foi salva: ${criado.error}`
                : `Conta criada. Confirme o e-mail para entrar. A loja não foi salva: ${criado.error}`,
            );
            return;
          }

          seboId = criado.id;
        }

        const membroError = await vincularMembro(supabase, seboId, data.user.id, papel);
        if (membroError) {
          setError(
            data.session
              ? `A conta foi criada, mas o vínculo com o sebo não foi salvo: ${membroError}`
              : `Conta criada. Confirme o e-mail para entrar. O vínculo não foi salvo: ${membroError}`,
          );
          return;
        }

        await insertPerfil(supabase, {
          id: data.user.id,
          nome_sebo: nomeSebo,
        });

        if (!data.session) {
          setNotice("Conta criada. Confirme o e-mail para entrar.");
          setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
          setMode("login");
          return;
        }

        clearSeboAtivo();
        router.replace("/dashboard");
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });

      if (signInError) {
        setError(mapAuthError(signInError.message));
        return;
      }

      if (!data.user) {
        setError("Não foi possível entrar.");
        return;
      }

      router.replace("/dashboard");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erro inesperado.";
      setError(mapAuthError(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ledger flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 md:grid-cols-[1.15fr_0.85fr]">
        <section className="flex flex-col px-5 pt-8 pb-6 md:justify-between md:px-14 md:py-16">
          <BrandMark />
          <div className="mt-10 md:mt-0">
            <p className="text-xs font-medium tracking-[0.18em] text-olive uppercase">
              Livros usados
            </p>
            <h1 className="mt-3 max-w-md font-serif text-[2.6rem] leading-[0.95] tracking-tight text-ink md:text-7xl">
              Seu lugar na estante.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-ink/70 md:text-base">
              Entre com sua conta ou crie um perfil para o sebo reconhecer quem chega.
            </p>
          </div>
          <p className="mt-8 hidden text-sm text-ink/55 md:block">
            Feito para o balcão e para o celular.
          </p>
        </section>

        <section className="flex items-start px-5 pb-10 md:items-center md:px-8 md:py-16">
          <div className="w-full rounded-2xl border border-rule bg-card p-5 shadow-[0_16px_40px_rgb(28_25_21_/_0.05)] md:p-8">
            {!isSupabaseConfigured ? (
              <div className="space-y-3">
                <h2 className="font-serif text-3xl text-ink">Falta a conexão</h2>
                <p className="text-sm leading-6 text-ink/70">
                  Preencha <code className="text-ink">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
                  <code className="text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> em{" "}
                  <code className="text-ink">.env.local</code>, depois reinicie o servidor.
                </p>
              </div>
            ) : !ready ? (
              <p className="text-sm text-ink/60">Abrindo a sessão…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 rounded-lg bg-paper p-1">
                  <button
                    type="button"
                    aria-pressed={mode === "login"}
                    onClick={() => switchMode("login")}
                    className={`h-11 rounded-md text-sm font-medium transition-colors ${
                      mode === "login" ? "bg-ink text-card" : "text-ink/65"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "register"}
                    onClick={() => switchMode("register")}
                    className={`h-11 rounded-md text-sm font-medium transition-colors ${
                      mode === "register" ? "bg-ink text-card" : "text-ink/65"
                    }`}
                  >
                    Criar conta
                  </button>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
                  {mode === "register" ? (
                    <div role="radiogroup" aria-label="Tipo de conta" className="grid gap-2">
                      {(
                        [
                          ["dono", "Sou Dono de Sebo (Criar nova loja)"],
                          ["funcionario", "Sou Funcionário (Entrar em loja existente)"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={papel === id}
                          onClick={() => {
                            setPapel(id);
                            setError(null);
                          }}
                          className={`rounded-lg border px-3 py-3 text-left text-sm font-medium ${
                            papel === id
                              ? "border-[#18794a] bg-[#18794a]/10 text-[#18794a]"
                              : "border-rule text-ink/70"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {mode === "register" && papel === "dono" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-ink">Nome do Sebo</span>
                      <input
                        name="nome"
                        autoComplete="organization"
                        required
                        value={form.nome}
                        onChange={(event) => updateField("nome", event.target.value)}
                        className={fieldClassName}
                        placeholder="Nome da loja"
                      />
                    </label>
                  ) : null}

                  {mode === "register" && papel === "funcionario" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-ink">Código de Convite (8 dígitos)</span>
                      <input
                        name="convite"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        maxLength={8}
                        value={form.convite}
                        onChange={(event) => updateField("convite", event.target.value.replace(/\D/g, "").slice(0, 8))}
                        className={fieldClassName}
                        placeholder="00000000"
                      />
                    </label>
                  ) : null}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">E-mail</span>
                    <input
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      className={fieldClassName}
                      placeholder="voce@email.com"
                    />
                  </label>

                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-ink">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={form.password}
                        onChange={(event) => updateField("password", event.target.value)}
                        className={`${fieldClassName} pr-20`}
                        placeholder="Mínimo de 6 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink/60"
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>

                  {mode === "register" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-ink">Confirmar senha</span>
                      <input
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={(event) => updateField("confirmPassword", event.target.value)}
                        className={fieldClassName}
                        placeholder="Repita a senha"
                      />
                    </label>
                  ) : null}

                  {error ? (
                    <p role="alert" className="text-sm leading-6 text-spine">
                      {error}
                    </p>
                  ) : null}

                  {notice ? (
                    <p role="status" className="text-sm leading-6 text-olive">
                      {notice}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-medium text-card transition-opacity disabled:opacity-60"
                  >
                    {submitting
                      ? mode === "login"
                        ? "Entrando…"
                        : "Criando conta…"
                      : mode === "login"
                        ? "Entrar"
                        : "Criar conta"}
                  </button>
                </form>

                <p className="mt-5 text-center text-sm text-ink/60">
                  <Link href="/" className="underline decoration-rule underline-offset-4">
                    Voltar ao início
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
