import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const PROMPT =
  "Analise a imagem 1 (capa do livro) para extrair o Título, Autor e Editora. Faça o OCR detalhado da imagem 2 (página de créditos/ficha catalográfica interna do livro) para extrair estritamente o ISBN e o Ano de Publicação correto, ignorando outras datas secundárias da página. Retorne a resposta obrigatoriamente e estritamente como um objeto JSON válido, sem blocos de código Markdown de texto (sem ```json), contendo as chaves exatas: title, author, publisher, isbn, year.";

type BookFields = {
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  year: string;
};

function isImageFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0 && (value.type === "" || value.type.startsWith("image/"));
}

function mimeTypeOf(file: File): string {
  return file.type.startsWith("image/") ? file.type : "image/jpeg";
}

async function fileToInlineData(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());

  return {
    mimeType: mimeTypeOf(file),
    data: bytes.toString("base64"),
  };
}

function readJson(content: string | undefined): Record<string, unknown> {
  if (!content) {
    throw new Error("O Gemini não retornou conteúdo.");
  }

  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("O Gemini não retornou um objeto JSON.");
  }

  return parsed as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

function cleanIsbn(value: string): string {
  return value.replace(/^isbn[:\s-]*/i, "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function cleanYear(value: string): string {
  return value.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/)?.[0] ?? "";
}

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"] as const;
const MODEL_TIMEOUT_MS = 18_000;

export const maxDuration = 60;

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isFinite(status)) return status;
  }

  if (error instanceof Error) {
    const match = error.message.match(/"code"\s*:\s*(\d+)/);
    if (match) return Number(match[1]);
  }

  return undefined;
}

function isOverloaded(error: unknown): boolean {
  const code = errorCode(error);
  if (code === 429 || code === 503) return true;

  return error instanceof Error && /high demand|UNAVAILABLE|overloaded|resource exhausted/i.test(error.message);
}

function isMissingModel(error: unknown): boolean {
  const code = errorCode(error);
  if (code === 404) return true;

  return error instanceof Error && /no longer available|NOT_FOUND|is not found|not supported/i.test(error.message);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeout = new Error("timeout");
      Object.assign(timeout, { status: 503 });
      reject(timeout);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function failureMessage(error: unknown): string {
  const status = errorCode(error);

  if (status === 400 || status === 401 || status === 403) {
    return "A chave do Gemini foi recusada.";
  }

  if (isOverloaded(error)) {
    return "O Gemini está sobrecarregado. As fotos continuam nos cards; aguarde um instante e fotografe de novo para repetir a leitura.";
  }

  return "A análise das fotos falhou.";
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Defina GEMINI_API_KEY em .env.local e reinicie o servidor." },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const cover = formData.get("cover");
    const dataPage = formData.get("dataPage");

    if (!isImageFile(cover) || !isImageFile(dataPage)) {
      return NextResponse.json(
        { error: "Envie a foto da capa e a página de créditos." },
        { status: 400 },
      );
    }

    const maxBytes = 12 * 1024 * 1024;
    if (cover.size > maxBytes || dataPage.size > maxBytes) {
      return NextResponse.json(
        { error: "Cada foto precisa ter no máximo 12 MB." },
        { status: 400 },
      );
    }

    const [coverImage, pageImage] = await Promise.all([
      fileToInlineData(cover),
      fileToInlineData(dataPage),
    ]);
    const ai = new GoogleGenAI({ apiKey });
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
    let lastError: unknown;

    for (const model of MODELS) {
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: [
              { text: PROMPT },
              { inlineData: coverImage },
              { inlineData: pageImage },
            ],
            config: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  author: { type: Type.STRING },
                  publisher: { type: Type.STRING },
                  isbn: { type: Type.STRING },
                  year: { type: Type.STRING },
                },
                required: ["title", "author", "publisher", "isbn", "year"],
              },
            },
          }),
          MODEL_TIMEOUT_MS,
        );
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const code = errorCode(error);
        console.error("extract-book model", model, code ?? "unknown");
        if (!isOverloaded(error) && !isMissingModel(error)) throw error;
      }
    }

    if (!response) throw lastError ?? new Error("Nenhum modelo Gemini respondeu.");

    const data = readJson(response.text);
    const book: BookFields = {
      title: asText(data.title),
      author: asText(data.author),
      publisher: asText(data.publisher),
      isbn: cleanIsbn(asText(data.isbn)),
      year: cleanYear(asText(data.year)),
    };

    return NextResponse.json(book);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "erro desconhecido";
    console.error("extract-book failed", detail.replace(/AIza[\w-]{10,}/g, "[key]").slice(0, 400));
    return NextResponse.json({ error: failureMessage(error) }, { status: 502 });
  }
}
