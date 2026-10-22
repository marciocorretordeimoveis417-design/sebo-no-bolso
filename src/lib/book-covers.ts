import type { SupabaseClient } from "@supabase/supabase-js";

import { prepareImage } from "@/lib/prepare-image";

export const COVERS_BUCKET = "capas";

export function coverStoragePath(seboId: string, livroId: string): string {
  return `${seboId}/${livroId}/capa.jpg`;
}

export async function storeBookCover(
  client: SupabaseClient,
  seboId: string,
  livroId: string,
  file: Blob,
): Promise<string> {
  const image = await prepareImage(file, 1600, 0.8);
  const path = coverStoragePath(seboId, livroId);
  const { error } = await client.storage.from(COVERS_BUCKET).upload(path, image, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "86400",
  });

  if (error) {
    throw error;
  }

  return path;
}

export async function signedCoverUrls(
  client: SupabaseClient,
  paths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (unique.length === 0) {
    return {};
  }

  const { data, error } = await client.storage.from(COVERS_BUCKET).createSignedUrls(unique, 60 * 60);
  if (error || !data) {
    return {};
  }

  const urls: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl) {
      urls[item.path] = item.signedUrl;
    }
  }

  return urls;
}

export async function removeBookCover(client: SupabaseClient, path: string | null | undefined): Promise<void> {
  if (!path) {
    return;
  }

  await client.storage.from(COVERS_BUCKET).remove([path]);
}
