"use client";

import { SeboHeader, useSeboAtivo } from "@/components/sebo-header";
import { removeBookCover, signedCoverUrls } from "@/lib/book-covers";
import { getSeboAtivo } from "@/lib/sebo-ativo";
import { getSignedInUser, getSupabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Livro = {
  id: string;
  titulo: string;
  autor: string;
  editora: string;
  isbn: string;
  ano: string;
  estado: string;
  descricao: string;
  precoCusto: number;
  precoSugerido: number;
  precoVenda: number;
  status: string;
  capaPath: string;
};

const fieldClassName =
  "h-11 w-full rounded-md border border-rule bg-paper px-3 text-base text-ink outline-none focus:border-ink";

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function asMoney(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function readLivro(row: Record<string, unknown>): Livro | null {
  const id = asText(row.id);
  if (!id) {
    return null;
  }

  return {
    id,
    titulo: asText(row.titulo),
    autor: asText(row.autor),
    editora: asText(row.editora),
    isbn: asText(row.isbn),
    ano: asText(row.ano_publicacao),
    estado: asText(row.estado_conservacao),
    descricao: asText(row.descricao_estado),
    precoCusto: asMoney(row.preco_custo),
    precoSugerido: asMoney(row.preco_sugerido),
    precoVenda: asMoney(row.preco_venda),
    status: asText(row.status),
    capaPath: asText(row.capa_path),
  };
}

function formatMoney(value: number | null | undefined): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function moneyInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function parseMoney(value: string): number | null {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const amount = Math.round(Number(text) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) {
    return null;
  }

  return amount;
}

function csvMoney(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[;"\n\r]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }

  return safe;
}

function csvIsbn(isbn: string | null | undefined): string {
  const value = (isbn ?? "").trim().replaceAll('"', "");
  if (!value) {
    return "";
  }

  const formula = `="${value}"`;
  if (/[;\n\r]/.test(value)) {
    return `"${formula.replaceAll('"', '""')}"`;
  }

  return formula;
}

function buildCsv(books: Livro[]): string {
  const header = [
    "titulo",
    "autor",
    "editora",
    "isbn",
    "ano",
    "estado_conservacao",
    "descrição",
    "preco_custo",
    "preco_sugerido",
    "preco_venda",
    "status",
  ];

  const rows = books.map((book) =>
    [
      csvCell(book.titulo),
      csvCell(book.autor),
      csvCell(book.editora),
      csvIsbn(book.isbn),
      csvCell(book.ano),
      csvCell(book.estado),
      csvCell(book.descricao),
      csvCell(csvMoney(book.precoCusto)),
      csvCell(csvMoney(book.precoSugerido)),
      csvCell(csvMoney(book.precoVenda)),
      csvCell(book.status),
    ].join(";"),
  );

  return `\uFEFF${[header.join(";"), ...rows].join("\r\n")}`;
}

function downloadCsv(books: Livro[]) {
  const blob = new Blob([buildCsv(books)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "acervo-sebo.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function conditionClass(label: string): string {
  const key = label.trim().toLocaleLowerCase("pt-BR");

  if (key === "como novo") {
    return "bg-olive text-card";
  }

  if (key === "ótimo" || key === "otimo") {
    return "bg-[#2f6f4e] text-card";
  }

  if (key === "bom") {
    return "bg-[#1f4d3a] text-card";
  }

  if (key === "regular") {
    return "bg-[#a68456] text-ink";
  }

  if (key === "desgastado") {
    return "bg-spine text-card";
  }

  return "bg-ink/10 text-ink";
}

function ConditionTag({ label }: { label: string }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ${conditionClass(label)}`}>
      {label || "Sem estado"}
    </span>
  );
}

function CoverPlaceholder() {
  return (
    <svg viewBox="0 0 56 80" aria-hidden="true" className="size-full">
      <rect width="56" height="80" fill="#e7dccb" />
      <rect width="8" height="80" fill="#8d3b31" />
      <rect x="16" y="18" width="28" height="3" rx="1" fill="#1c1915" opacity="0.35" />
      <rect x="16" y="26" width="22" height="2" rx="1" fill="#1c1915" opacity="0.2" />
      <rect x="16" y="32" width="18" height="2" rx="1" fill="#1c1915" opacity="0.2" />
    </svg>
  );
}

function CoverThumb({ src, title, large = false }: { src?: string; title: string; large?: boolean }) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-lg border border-rule bg-[#e7dccb] ${
        large ? "h-36 w-24" : "h-20 w-14"
      }`}
    >
      {src ? (
        <img src={src} alt={`Capa de ${title || "livro"}`} className="size-full object-cover" />
      ) : (
        <CoverPlaceholder />
      )}
    </span>
  );
}

type BookDraft = {
  titulo: string;
  autor: string;
  editora: string;
  isbn: string;
  ano: string;
  estado: string;
  descricao: string;
  status: string;
  precoCusto: string;
  precoSugerido: string;
  precoVenda: string;
};

function draftFrom(book: Livro): BookDraft {
  return {
    titulo: book.titulo,
    autor: book.autor,
    editora: book.editora,
    isbn: book.isbn,
    ano: book.ano,
    estado: book.estado,
    descricao: book.descricao,
    status: book.status,
    precoCusto: moneyInput(book.precoCusto),
    precoSugerido: moneyInput(book.precoSugerido),
    precoVenda: moneyInput(book.precoVenda),
  };
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M4 7h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  );
}

function BookDialog({
  book,
  coverSrc,
  seboId,
  usuarioId,
  onClose,
  onSaved,
  onDeleted,
}: {
  book: Livro;
  coverSrc?: string;
  seboId: string;
  usuarioId: string;
  onClose: () => void;
  onSaved: (book: Livro) => void;
  onDeleted: (bookId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selling, setSelling] = useState(false);
  const [draft, setDraft] = useState<BookDraft>(() => draftFrom(book));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving && !deleting && !selling) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [deleting, onClose, saving, selling]);

  function updateDraft(field: keyof BookDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function updateLivro(values: Record<string, unknown>) {
    const supabase = getSupabase();
    if (seboId) {
      const scoped = await supabase.from("livros").update(values).eq("id", book.id).eq("sebo_id", seboId);
      if (!(scoped.error && /sebo_id/i.test(scoped.error.message))) {
        return scoped;
      }
    }

    return supabase.from("livros").update(values).eq("id", book.id).eq("usuario_id", usuarioId);
  }

  async function deleteLivro() {
    const supabase = getSupabase();
    if (seboId) {
      const scoped = await supabase.from("livros").delete().eq("id", book.id).eq("sebo_id", seboId);
      if (!(scoped.error && /sebo_id/i.test(scoped.error.message))) {
        return scoped;
      }
    }

    return supabase.from("livros").delete().eq("id", book.id).eq("usuario_id", usuarioId);
  }

  async function markSold() {
    if (book.status.trim().toLocaleLowerCase("pt-BR") === "vendido") {
      return;
    }

    setSelling(true);
    setFormError(null);

    const { error } = await updateLivro({ status: "vendido" });
    setSelling(false);

    if (error) {
      setFormError(
        error.code === "42501"
          ? "Sua conta não tem permissão para alterar este livro."
          : `Não foi possível marcar como vendido. ${error.message}`,
      );
      return;
    }

    onSaved({ ...book, status: "vendido" });
  }

  async function saveChanges() {
    const titulo = draft.titulo.trim();
    const autor = draft.autor.trim();
    const editora = draft.editora.trim();
    const isbn = draft.isbn.trim();
    const ano = draft.ano.trim();
    const estado = draft.estado.trim();
    const descricao = draft.descricao.trim();
    const cost = parseMoney(draft.precoCusto);
    const suggested = parseMoney(draft.precoSugerido);
    const sale = parseMoney(draft.precoVenda);

    if (!titulo || !autor || !editora || !isbn) {
      setFormError("Preencha título, autor, editora e ISBN.");
      return;
    }

    if (!/^\d{4}$/.test(ano)) {
      setFormError("O ano precisa ter 4 dígitos.");
      return;
    }

    if (!estado) {
      setFormError("Informe o estado de conservação.");
      return;
    }

    if (cost === null || suggested === null || sale === null) {
      setFormError("Informe os três preços com até duas casas decimais.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const saved: Livro = {
      id: book.id,
      titulo,
      autor,
      editora,
      isbn,
      ano,
      estado,
      descricao,
      precoCusto: cost,
      precoSugerido: suggested,
      precoVenda: sale,
      status: draft.status.trim() || "catalogado",
      capaPath: book.capaPath,
    };

    const { error } = await updateLivro({
      titulo: saved.titulo,
      autor: saved.autor,
      editora: saved.editora,
      isbn: saved.isbn,
      ano_publicacao: Number(saved.ano),
      estado_conservacao: saved.estado,
      descricao_estado: saved.descricao || null,
      preco_custo: saved.precoCusto,
      preco_sugerido: saved.precoSugerido,
      preco_venda: saved.precoVenda,
      status: saved.status,
    });

    setSaving(false);

    if (error) {
      setFormError(
        error.code === "42501"
          ? "Sua conta não tem permissão para alterar este livro."
          : `Não foi possível salvar. ${error.message}`,
      );
      return;
    }

    onSaved(saved);
  }

  async function removeBook() {
    if (!book.id || !usuarioId) {
      setFormError("Não foi possível identificar o livro.");
      return;
    }

    setDeleting(true);
    setFormError(null);

    const { error } = await deleteLivro();

    setDeleting(false);

    if (!error) {
      void removeBookCover(getSupabase(), book.capaPath);
    }

    if (error) {
      setConfirmingDelete(false);
      setFormError(
        error.code === "42501"
          ? "Sua conta não tem permissão para excluir este livro."
          : `Não foi possível excluir. ${error.message}`,
      );
      return;
    }

    onDeleted(book.id);
  }

  const priceFields: { key: "precoCusto" | "precoSugerido" | "precoVenda"; label: string }[] = [
    { key: "precoCusto", label: "Preço de custo (R$)" },
    { key: "precoSugerido", label: "Preço sugerido (R$)" },
    { key: "precoVenda", label: "Preço de venda (R$)" },
  ];

  return (
    <div className="fixed inset-x-0 top-0 bottom-16 z-40 flex items-end justify-center bg-ink/40 md:inset-0 md:bottom-0 md:z-50 md:items-center md:p-6">
      <button
        type="button"
        aria-label="Fechar detalhes"
        className="absolute inset-0 cursor-default"
        onClick={() => !saving && !deleting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="livro-detalhe-titulo"
        className="relative z-10 flex max-h-full w-full flex-col overflow-y-auto rounded-t-3xl border border-rule bg-card px-4 py-5 shadow-xl md:max-h-[92vh] md:max-w-lg md:rounded-2xl md:px-6"
      >
        <div className="flex items-start gap-4">
          <CoverThumb src={coverSrc} title={book.titulo} large />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.16em] text-olive uppercase">Detalhes</p>
            <h2 id="livro-detalhe-titulo" className="mt-1 font-serif text-3xl leading-none text-ink">
              {editing ? "Editar livro" : book.titulo || "Sem título"}
            </h2>
            {editing ? null : <p className="mt-2 text-sm text-ink/70">{book.autor || "Autor não informado"}</p>}
          </div>
        </div>

        {editing ? (
          <div className="mt-5 space-y-3">
            {(
              [
                ["titulo", "Título"],
                ["autor", "Autor"],
                ["editora", "Editora"],
                ["isbn", "ISBN"],
                ["ano", "Ano"],
                ["estado", "Estado de conservação"],
                ["status", "Status"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block space-y-1">
                <span className="text-sm font-medium text-ink">{label}</span>
                <input
                  value={draft[key]}
                  onChange={(event) => updateDraft(key, event.target.value)}
                  className={fieldClassName}
                  inputMode={key === "ano" ? "numeric" : undefined}
                  maxLength={key === "ano" ? 4 : undefined}
                />
              </label>
            ))}
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink">Descrição</span>
              <textarea
                rows={3}
                value={draft.descricao}
                onChange={(event) => updateDraft("descricao", event.target.value)}
                className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-base text-ink outline-none focus:border-ink"
              />
            </label>
            {priceFields.map((field) => (
              <label key={field.key} className="block space-y-1">
                <span className="text-sm font-medium text-ink">{field.label}</span>
                <input
                  value={draft[field.key]}
                  onChange={(event) => updateDraft(field.key, event.target.value)}
                  className={fieldClassName}
                  inputMode="decimal"
                />
              </label>
            ))}
          </div>
        ) : (
          <dl className="mt-5 space-y-3 text-sm">
            {(
              [
                ["Autor", book.autor],
                ["Editora", book.editora],
                ["ISBN", book.isbn],
                ["Ano", book.ano],
                ["Descrição", book.descricao],
                ["Preço de custo", formatMoney(book.precoCusto)],
                ["Preço sugerido", formatMoney(book.precoSugerido)],
                ["Preço de venda", formatMoney(book.precoVenda)],
                ["Status", book.status],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-rule pb-2">
                <dt className="text-ink/50">{label}</dt>
                <dd className="max-w-[16rem] text-right text-ink">{value || "—"}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/50">Estado</dt>
              <dd>
                <ConditionTag label={book.estado} />
              </dd>
            </div>
          </dl>
        )}

        {formError ? (
          <p role="alert" className="mt-4 text-sm leading-6 text-spine">
            {formError}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void saveChanges()}
                disabled={saving}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-[#18794a] text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar Alterações"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(draftFrom(book));
                  setFormError(null);
                  setEditing(false);
                }}
                disabled={saving}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-ink text-sm font-medium text-ink disabled:opacity-60"
              >
                Cancelar
              </button>
            </>
          ) : confirmingDelete ? (
            <>
              <p className="w-full text-sm text-ink">Excluir este livro do acervo?</p>
              <button
                type="button"
                onClick={() => void removeBook()}
                disabled={deleting}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#9f2d2d] text-sm font-semibold text-white disabled:opacity-60"
              >
                <TrashIcon />
                {deleting ? "Excluindo…" : "Excluir Livro"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-ink text-sm font-medium text-ink disabled:opacity-60"
              >
                Voltar
              </button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-2">
              {book.status.trim().toLocaleLowerCase("pt-BR") !== "vendido" ? (
                <button
                  type="button"
                  onClick={() => void markSold()}
                  disabled={selling}
                  className="inline-flex h-11 w-full items-center justify-center rounded-md bg-[#18794a] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {selling ? "Marcando…" : "Marcar como Vendido"}
                </button>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(draftFrom(book));
                    setEditing(true);
                  }}
                  disabled={selling}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-ink text-sm font-semibold text-card disabled:opacity-60"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setConfirmingDelete(true);
                  }}
                  disabled={selling}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#9f2d2d] text-sm font-semibold text-white disabled:opacity-60"
                >
                  <TrashIcon />
                  Excluir Livro
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function bookStatus(book: Livro): string {
  return book.status.trim().toLocaleLowerCase("pt-BR") || "catalogado";
}

function matchesSearch(book: Livro, term: string): boolean {
  const needle = term.trim().toLocaleLowerCase("pt-BR");
  if (!needle) {
    return true;
  }

  const haystack = [book.titulo, book.autor, book.editora, book.isbn].join("\n").toLocaleLowerCase("pt-BR");
  if (haystack.includes(needle)) {
    return true;
  }

  const digits = needle.replace(/\D/g, "");
  return digits.length > 0 && book.isbn.replace(/\D/g, "").includes(digits);
}

export default function DashboardPage() {
  const router = useRouter();
  const seboAtivo = useSeboAtivo();
  const [books, setBooks] = useState<Livro[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [seboId, setSeboId] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"catalogado" | "vendido">("catalogado");

  useEffect(() => {
    function closeDetail() {
      setSelectedId(null);
    }

    window.addEventListener("sebo-nav", closeDetail);
    return () => {
      window.removeEventListener("sebo-nav", closeDetail);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAcervo() {
      const user = await getSignedInUser();

      if (!active) {
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      setUsuarioId(user.id);
      const supabase = getSupabase();
      const sebo = seboAtivo ?? (await getSeboAtivo(supabase));
      if (!active) {
        return;
      }

      setSeboId(sebo?.id ?? "");

      const listed =
        "id, titulo, autor, editora, isbn, ano_publicacao, estado_conservacao, descricao_estado, preco_custo, preco_sugerido, preco_venda, status, capa_path";
      let result = sebo
        ? await supabase.from("livros").select(listed).eq("sebo_id", sebo.id).order("criado_em", { ascending: false })
        : await supabase.from("livros").select(listed).eq("usuario_id", user.id).order("criado_em", { ascending: false });

      if (result.error && sebo && /sebo_id/i.test(result.error.message)) {
        result = await supabase.from("livros").select(listed).eq("usuario_id", user.id).order("criado_em", { ascending: false });
      }

      if (!active) {
        return;
      }

      if (result.error) {
        setError(result.error.message);
        setBooks([]);
        setReady(true);
        return;
      }

      const nextBooks = (result.data ?? []).flatMap((row) => {
        const book = readLivro(row as Record<string, unknown>);
        return book ? [book] : [];
      });

      const stored = await signedCoverUrls(
        supabase,
        nextBooks.map((book) => book.capaPath),
      );

      if (!active) {
        return;
      }

      const nextCovers: Record<string, string> = {};
      for (const book of nextBooks) {
        const remote = book.capaPath ? stored[book.capaPath] : "";
        if (remote) {
          nextCovers[book.id] = remote;
        }
      }

      setCovers(nextCovers);
      setBooks(nextBooks);
      setReady(true);
    }

    void loadAcervo();

    return () => {
      active = false;
    };
  }, [router, seboAtivo]);

  const selected = books.find((book) => book.id === selectedId) ?? null;
  const daAba = books.filter((book) => bookStatus(book) === aba);
  const visiveis = daAba.filter((book) => matchesSearch(book, busca));
  const totalLabel = visiveis.length === 1 ? "Total: 1 livro" : `Total: ${visiveis.length} livros`;

  if (!ready) {
    return (
      <div className="ledger flex flex-1 flex-col">
        <SeboHeader nome={seboAtivo?.nome ?? ""} />
        <div className="flex flex-1 items-center justify-center px-5">
          <p className="text-sm text-ink/60">Abrindo o acervo…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ledger flex flex-1 flex-col">
      <SeboHeader nome={seboAtivo?.nome ?? ""} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 md:px-8 md:py-12">
        <h1 className="font-serif text-4xl leading-none tracking-tight text-ink md:text-6xl">Acervo</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-ink/70">
          Os livros deste sebo, do mais recente ao mais antigo.
        </p>

        <label className="mt-6 block">
          <span className="sr-only">Buscar no acervo</span>
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por título, autor, editora ou ISBN"
            className="h-12 w-full rounded-full border border-rule bg-card px-5 text-base text-ink outline-none placeholder:text-ink/40 focus:border-ink"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 rounded-full border border-rule bg-card p-1" role="tablist" aria-label="Situação do estoque">
          {(
            [
              ["catalogado", "Catalogados"],
              ["vendido", "Vendidos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`h-10 rounded-full text-sm font-semibold ${
                aba === id ? "bg-[#18794a] text-white" : "text-ink/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">{totalLabel}</p>
          <button
            type="button"
            onClick={() => downloadCsv(daAba)}
            disabled={daAba.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-md border border-ink px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            Exportar Acervo (CSV)
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm leading-6 text-spine">
            {error}
          </p>
        ) : null}

        {visiveis.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-rule bg-card px-4 py-6 text-sm leading-6 text-ink/70">
            {busca.trim()
              ? "Nenhum livro encontrado para essa busca."
              : aba === "vendido"
                ? "Nenhum livro vendido ainda."
                : "Nenhum livro catalogado ainda. Use Novo livro para incluir o primeiro."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visiveis.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(book.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-rule bg-card px-3 py-3 text-left"
                >
                  <CoverThumb src={covers[book.id]} title={book.titulo || "livro"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-serif text-xl leading-tight text-ink">
                          {book.titulo || "Sem título"}
                        </span>
                        <span className="mt-1 block truncate text-sm text-ink/70">
                          {book.autor || "Autor não informado"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-ink">{formatMoney(book.precoVenda)}</span>
                    </span>
                    <span className="mt-3 block">
                      <ConditionTag label={book.estado} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <BookDialog
          book={selected}
          coverSrc={covers[selected.id]}
          seboId={seboId}
          usuarioId={usuarioId}
          onClose={() => setSelectedId(null)}
          onSaved={(saved) => {
            setBooks((current) =>
              current.map((item) => (item.id === saved.id ? { ...saved, capaPath: item.capaPath } : item)),
            );
            setSelectedId(null);
          }}
          onDeleted={(bookId) => {
            setBooks((current) => current.filter((item) => item.id !== bookId));
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}
