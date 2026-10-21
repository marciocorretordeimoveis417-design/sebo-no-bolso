"use client";

import { rememberCover } from "@/lib/cover-cache";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";

type PhotoKind = "capa" | "creditos";

type Condition = "como-novo" | "otimo" | "bom" | "regular" | "desgastado";

type ExtractedBook = {
  title?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  year?: string | number;
  error?: string;
};

const CONDITIONS: { id: Condition; label: string }[] = [
  { id: "como-novo", label: "Como novo" },
  { id: "otimo", label: "Ótimo" },
  { id: "bom", label: "Bom" },
  { id: "regular", label: "Regular" },
  { id: "desgastado", label: "Desgastado" },
];

const UPLOADS: { kind: PhotoKind; title: string; hint: string }[] = [
  {
    kind: "capa",
    title: "Foto da Capa",
    hint: "Frente do livro, com luz uniforme.",
  },
  {
    kind: "creditos",
    title: "Página de Dados/Créditos",
    hint: "Página com ISBN, autor e editora.",
  },
];

const fieldClassName =
  "h-12 w-full rounded-md border border-rule bg-card px-3 text-base text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-ink";

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-7 text-neutral-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8.5h2.2l1.3-2h9l1.3 2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z"
      />
      <circle cx="12" cy="13.75" r="3.1" />
    </svg>
  );
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

function fieldText(value: string | number | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

export default function CadastrarLivroPage() {
  const requestId = useRef(0);
  const filesRef = useRef<{ cover: File | null; dataPage: File | null }>({
    cover: null,
    dataPage: null,
  });
  const coverPreviewRef = useRef<string | null>(null);
  const dataPagePreviewRef = useRef<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [dataPagePreview, setDataPagePreview] = useState<string | null>(null);
  const [isbn, setIsbn] = useState("");
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [editora, setEditora] = useState("");
  const [ano, setAno] = useState("");
  const [precoCusto, setPrecoCusto] = useState("");
  const [precoSugerido, setPrecoSugerido] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [descricao, setDescricao] = useState("");
  const [condition, setCondition] = useState<Condition | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
      if (dataPagePreviewRef.current) URL.revokeObjectURL(dataPagePreviewRef.current);
    };
  }, []);

  async function handleExtract(cover: File | null, dataPage: File | null) {
    if (!cover || !dataPage) {
      setNotice(null);
      setError("Envie a capa e a página de créditos antes de analisar.");
      return;
    }

    const currentRequest = ++requestId.current;
    const body = new FormData();
    body.append("cover", cover);
    body.append("dataPage", dataPage);

    setExtracting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/extract-book", { method: "POST", body });
      const payload = (await response.json()) as ExtractedBook;

      if (currentRequest !== requestId.current) {
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "Não foi possível analisar as fotos.");
        return;
      }

      const title = fieldText(payload.title);
      const author = fieldText(payload.author);
      const publisher = fieldText(payload.publisher);
      const isbnValue = fieldText(payload.isbn);
      const year = fieldText(payload.year);

      setTitulo(title);
      setAutor(author);
      setEditora(publisher);
      setIsbn(isbnValue);
      setAno(year);

      if (!title && !author && !publisher && !isbnValue && !year) {
        setError("As fotos chegaram, mas a leitura não encontrou os dados. Tente de novo com mais luz.");
        return;
      }

      setNotice("Ficha preenchida a partir das fotos. Confira antes de salvar.");
    } catch {
      if (currentRequest === requestId.current) {
        setError("Não foi possível falar com o servidor.");
      }
    } finally {
      if (currentRequest === requestId.current) {
        setExtracting(false);
      }
    }
  }

  function onSelectPhoto(kind: PhotoKind, list: FileList | null) {
    const file = list?.[0];
    if (!file || file.size === 0) {
      setNotice(null);
      setError("A foto não chegou. Tente capturar de novo.");
      return;
    }

    if (file.type && !file.type.startsWith("image/")) {
      setNotice(null);
      setError("Escolha um arquivo de imagem.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    if (kind === "capa") {
      if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
      coverPreviewRef.current = previewUrl;
      filesRef.current.cover = file;
      setCoverPreview(previewUrl);
    } else {
      if (dataPagePreviewRef.current) URL.revokeObjectURL(dataPagePreviewRef.current);
      dataPagePreviewRef.current = previewUrl;
      filesRef.current.dataPage = file;
      setDataPagePreview(previewUrl);
    }

    setError(null);

    const { cover, dataPage } = filesRef.current;
    if (cover && dataPage) {
      setNotice(null);
      void handleExtract(cover, dataPage);
      return;
    }

    setNotice(
      kind === "capa"
        ? "Capa recebida. Agora fotografe a página de créditos."
        : "Página recebida. Agora fotografe a capa.",
    );
  }

  function clearPhotos() {
    filesRef.current = { cover: null, dataPage: null };
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    if (dataPagePreviewRef.current) URL.revokeObjectURL(dataPagePreviewRef.current);
    coverPreviewRef.current = null;
    dataPagePreviewRef.current = null;
    setCoverPreview(null);
    setDataPagePreview(null);
  }

  async function saveBook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const title = titulo.trim();
    const author = autor.trim();
    const publisher = editora.trim();
    const isbnValue = isbn.trim();
    const year = ano.trim();
    const cost = parseMoney(precoCusto);
    const suggested = parseMoney(precoSugerido);
    const sale = parseMoney(precoVenda);
    const notes = descricao.trim();
    const conservation = CONDITIONS.find((item) => item.id === condition)?.label;

    if (!isbnValue) {
      setError("Informe o ISBN.");
      return;
    }

    if (!title) {
      setError("Informe o título.");
      return;
    }

    if (!author) {
      setError("Informe o autor.");
      return;
    }

    if (!publisher) {
      setError("Informe a editora.");
      return;
    }

    if (!/^\d{4}$/.test(year)) {
      setError("Informe o ano com 4 dígitos.");
      return;
    }

    if (cost === null) {
      setError("Informe o preço de custo.");
      return;
    }

    if (suggested === null) {
      setError("Informe o preço sugerido.");
      return;
    }

    if (sale === null) {
      setError("Informe o preço de venda.");
      return;
    }

    if (!conservation) {
      setError("Escolha o estado de conservação.");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Defina a conexão com o Supabase em .env.local e reinicie o servidor.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        setError("Entre na sua conta para salvar o livro.");
        return;
      }

      const { error: insertError } = await supabase.from("livros").insert([
        {
          usuario_id: authData.user.id,
          titulo: title,
          autor: author,
          editora: publisher,
          isbn: isbnValue,
          ano_publicacao: Number(year),
          estado_conservacao: conservation,
          descricao_estado: notes || null,
          preco_custo: cost,
          preco_sugerido: suggested,
          preco_venda: sale,
        },
      ]);

      if (insertError) {
        setError(
          insertError.code === "42501"
            ? "Sua conta não tem permissão para salvar este livro."
            : `Não foi possível salvar o livro. ${insertError.message}`,
        );
        return;
      }

      const cover = filesRef.current.cover;
      if (cover) {
        void rememberCover(isbnValue, cover).catch(() => undefined);
      }

      setIsbn("");
      setTitulo("");
      setAutor("");
      setEditora("");
      setAno("");
      setPrecoCusto("");
      setPrecoSugerido("");
      setPrecoVenda("");
      setDescricao("");
      setCondition(null);
      clearPhotos();
      setNotice("Livro salvo.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o livro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ledger flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-6 md:px-6 md:py-12">
        <h1 className="font-serif text-4xl leading-none tracking-tight text-ink md:text-5xl">
          Cadastrar livro
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-ink/70">
          Fotografe a capa e a página de créditos. A ficha é preenchida em seguida.
        </p>

        <form className="mt-6 flex flex-1 flex-col" onSubmit={saveBook} noValidate>
          <div className="grid grid-cols-2 gap-3">
            {UPLOADS.map((upload) => {
              const preview = upload.kind === "capa" ? coverPreview : dataPagePreview;

              return (
                <label
                  key={upload.kind}
                  className="relative flex min-h-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-300 bg-neutral-200 px-3 py-4 text-center md:min-h-52"
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="absolute inset-0 z-20 size-full cursor-pointer opacity-0"
                    onChange={(event) => {
                      const selected = event.currentTarget.files;
                      onSelectPhoto(upload.kind, selected);
                      event.currentTarget.value = "";
                    }}
                  />
                  {preview ? (
                    <img
                      src={preview}
                      alt={
                        upload.kind === "capa" ? "Prévia da capa" : "Prévia da página de créditos"
                      }
                      className="pointer-events-none absolute inset-0 z-0 size-full object-cover"
                    />
                  ) : (
                    <span className="pointer-events-none flex flex-col items-center">
                      <CameraIcon />
                      <span className="mt-3 text-xs font-medium leading-4 text-neutral-700">
                        {upload.title}
                      </span>
                      <span className="mt-1 text-[11px] leading-4 text-neutral-500">
                        {upload.hint}
                      </span>
                    </span>
                  )}
                  {preview ? (
                    <span className="pointer-events-none absolute inset-x-2 bottom-2 z-10 rounded-full bg-neutral-900/75 px-2 py-1 text-[11px] font-medium text-white">
                      {upload.title}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          {extracting ? (
            <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-olive">
              Analisando livro com IA...
            </p>
          ) : null}

          <div className="mt-6 space-y-4">
            <label className="block space-y-2" htmlFor="isbn">
              <span className="text-sm font-medium text-ink">ISBN</span>
              <input
                id="isbn"
                name="isbn"
                inputMode="numeric"
                autoComplete="off"
                required
                aria-required="true"
                value={isbn}
                onChange={(event) => setIsbn(event.target.value)}
                placeholder="978..."
                className={fieldClassName}
              />
            </label>

            <label className="block space-y-2" htmlFor="titulo">
              <span className="text-sm font-medium text-ink">Título</span>
              <input
                id="titulo"
                name="titulo"
                required
                aria-required="true"
                value={titulo}
                onChange={(event) => setTitulo(event.target.value)}
                className={fieldClassName}
                placeholder="Nome do livro"
              />
            </label>

            <label className="block space-y-2" htmlFor="autor">
              <span className="text-sm font-medium text-ink">Autor</span>
              <input
                id="autor"
                name="autor"
                required
                aria-required="true"
                value={autor}
                onChange={(event) => setAutor(event.target.value)}
                className={fieldClassName}
                placeholder="Quem escreveu"
              />
            </label>

            <label className="block space-y-2" htmlFor="editora">
              <span className="text-sm font-medium text-ink">Editora</span>
              <input
                id="editora"
                name="editora"
                required
                aria-required="true"
                value={editora}
                onChange={(event) => setEditora(event.target.value)}
                className={fieldClassName}
                placeholder="Casa editorial"
              />
            </label>

            <label className="block space-y-2" htmlFor="ano">
              <span className="text-sm font-medium text-ink">Ano</span>
              <input
                id="ano"
                name="ano"
                inputMode="numeric"
                maxLength={4}
                required
                aria-required="true"
                value={ano}
                onChange={(event) => setAno(event.target.value)}
                className={fieldClassName}
                placeholder="1998"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block space-y-2" htmlFor="preco-custo">
                <span className="text-sm font-medium text-ink">Preço de custo (R$)</span>
                <input
                  id="preco-custo"
                  name="preco_custo"
                  inputMode="decimal"
                  required
                  aria-required="true"
                  value={precoCusto}
                  onChange={(event) => setPrecoCusto(event.target.value)}
                  className={fieldClassName}
                  placeholder="0,00"
                />
              </label>
              <label className="block space-y-2" htmlFor="preco-sugerido">
                <span className="text-sm font-medium text-ink">Preço sugerido (R$)</span>
                <input
                  id="preco-sugerido"
                  name="preco_sugerido"
                  inputMode="decimal"
                  required
                  aria-required="true"
                  value={precoSugerido}
                  onChange={(event) => setPrecoSugerido(event.target.value)}
                  className={fieldClassName}
                  placeholder="0,00"
                />
              </label>
              <label className="block space-y-2" htmlFor="preco-venda">
                <span className="text-sm font-medium text-ink">Preço de venda (R$)</span>
                <input
                  id="preco-venda"
                  name="preco_venda"
                  inputMode="decimal"
                  required
                  aria-required="true"
                  value={precoVenda}
                  onChange={(event) => setPrecoVenda(event.target.value)}
                  className={fieldClassName}
                  placeholder="0,00"
                />
              </label>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-ink">Estado de conservação</legend>
            <div
              role="radiogroup"
              aria-label="Estado de conservação"
              aria-required="true"
              className="mt-3 flex flex-wrap gap-2"
            >
              {CONDITIONS.map((item) => {
                const selected = condition === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setCondition(item.id);
                      setError(null);
                    }}
                    className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${
                      selected ? "bg-ink text-card" : "border border-rule bg-card text-ink"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="mt-4 text-sm leading-6 text-spine">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-4 text-sm leading-6 text-olive">
              {notice}
            </p>
          ) : null}

          <label className="mt-6 block space-y-2" htmlFor="descricao">
            <span className="text-sm font-medium text-ink">Descrição</span>
            <textarea
              id="descricao"
              name="descricao"
              rows={4}
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Observações sobre o estado do livro"
              className="w-full resize-y rounded-md border border-rule bg-card px-3 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-ink"
            />
          </label>

          <button
            type="submit"
            disabled={extracting || saving}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[#18794a] text-sm font-semibold text-white shadow-[0_8px_20px_rgb(24_121_74_/_0.25)] transition-colors hover:bg-[#14683f] disabled:opacity-60"
          >
            {saving ? "Salvando livro..." : "Salvar livro"}
          </button>
        </form>
      </div>
    </div>
  );
}
