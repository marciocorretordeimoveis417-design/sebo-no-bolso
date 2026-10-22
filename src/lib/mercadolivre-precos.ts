const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search";
const PRODUCT_SEARCH_URL = "https://api.mercadolibre.com/products/search";
const MAX_LISTINGS = 200;

type CachedToken = {
  value: string;
  expiresAt: number;
};

type ListingAttribute = {
  id?: unknown;
  value_name?: unknown;
};

type Listing = {
  price?: unknown;
  currency_id?: unknown;
  condition?: unknown;
  title?: unknown;
  attributes?: ListingAttribute[];
};

export type FaixaMercadoLivre = {
  minimo: number;
  maximo: number;
  mediana: number;
};

let cachedToken: CachedToken | null = null;

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function isIsbn(value: string): boolean {
  return /^(?:\d{9}[\dXx]|\d{13})$/.test(value);
}

function readPrice(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999.99) return null;
  return cents(amount);
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return cents((sorted[middle - 1] + sorted[middle]) / 2);
}

function matchesIsbn(listing: Listing, isbn: string): boolean {
  const target = digits(isbn);
  if (target.length < 10) return false;

  const title = digits(typeof listing.title === "string" ? listing.title : "");
  if (title.includes(target)) return true;

  for (const attribute of listing.attributes ?? []) {
    const id = typeof attribute.id === "string" ? attribute.id.toUpperCase() : "";
    if (id !== "ISBN" && id !== "GTIN" && !id.includes("ISBN")) continue;
    const value = digits(typeof attribute.value_name === "string" ? attribute.value_name : "");
    if (value.length >= 10 && (value === target || value.endsWith(target) || target.endsWith(value))) {
      return true;
    }
  }

  return false;
}

async function accessToken(): Promise<string | null> {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID?.trim();
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    console.error("mercadolivre token", response.status);
    return null;
  }

  const data = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== "string" || data.access_token.length === 0) return null;

  const expiresIn = typeof data.expires_in === "number" && data.expires_in > 60 ? data.expires_in : 3_600;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return data.access_token;
}

function collectUsedPrices(listings: Listing[]): number[] {
  return listings
    .filter((item) => item.condition === "used")
    .filter((item) => item.currency_id === "BRL" || item.currency_id == null)
    .map((item) => readPrice(item.price))
    .filter((price): price is number => price !== null)
    .sort((left, right) => left - right);
}

function faixa(prices: number[]): FaixaMercadoLivre | null {
  if (prices.length === 0) return null;
  return {
    minimo: prices[0],
    maximo: prices[prices.length - 1],
    mediana: median(prices),
  };
}

async function authorizedGet(token: string, url: string, quietStatuses: number[] = []): Promise<unknown | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    if (!quietStatuses.includes(response.status)) {
      console.error("mercadolivre consulta", response.status, new URL(url).pathname);
    }
    return null;
  }

  return response.json() as Promise<unknown>;
}

async function precosDaBuscaPublica(token: string, isbn: string): Promise<number[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", isbn);
  url.searchParams.set("condition", "used");
  url.searchParams.set("limit", "50");
  const data = (await authorizedGet(token, url.toString(), [403])) as { results?: Listing[] } | null;
  const results = Array.isArray(data?.results) ? data.results : [];
  const matched = results.filter((item) => matchesIsbn(item, isbn));
  return collectUsedPrices(matched.length > 0 ? matched : results);
}

async function precosDoCatalogo(token: string, isbn: string): Promise<number[]> {
  const search = new URL(PRODUCT_SEARCH_URL);
  search.searchParams.set("site_id", "MLB");
  search.searchParams.set("status", "active");
  search.searchParams.set("product_identifier", digits(isbn) || isbn);
  const found = (await authorizedGet(token, search.toString())) as {
    results?: { id?: unknown; catalog_product_id?: unknown }[];
  } | null;
  const product = found?.results?.[0];
  const productId = typeof product?.catalog_product_id === "string"
    ? product.catalog_product_id
    : typeof product?.id === "string"
      ? product.id
      : "";
  if (!productId) return [];

  const prices: number[] = [];
  for (let offset = 0; offset < MAX_LISTINGS; offset += 50) {
    const pageUrl = `https://api.mercadolibre.com/products/${encodeURIComponent(productId)}/items?limit=50&offset=${offset}`;
    const page = (await authorizedGet(token, pageUrl)) as {
      results?: Listing[];
      paging?: { total?: unknown };
    } | null;
    const results = Array.isArray(page?.results) ? page.results : [];
    if (results.length === 0) break;
    prices.push(...collectUsedPrices(results));
    const total = typeof page?.paging?.total === "number" ? page.paging.total : results.length;
    if (offset + results.length >= total) break;
  }

  return prices.sort((left, right) => left - right);
}

export async function buscarPrecoUsado(isbn: string): Promise<FaixaMercadoLivre | null> {
  const code = isbn.trim().toUpperCase();
  if (!isIsbn(code)) return null;

  try {
    const token = await accessToken();
    if (!token) return null;

    const publicPrices = await precosDaBuscaPublica(token, code);
    if (publicPrices.length > 0) return faixa(publicPrices);

    return faixa(await precosDoCatalogo(token, code));
  } catch (error) {
    console.error("mercadolivre preco", error instanceof Error ? error.name : "erro");
    return null;
  }
}
