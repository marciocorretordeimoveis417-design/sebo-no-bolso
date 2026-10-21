const DB_NAME = "sebo-acervo";
const STORE = "capas";

export function coverKey(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function thumbnailBlob(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 240;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  return blob ?? file;
}

export async function rememberCover(isbn: string, file: Blob): Promise<void> {
  const key = coverKey(isbn);
  if (!key) {
    return;
  }

  const blob = await thumbnailBlob(file);
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(blob, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

export async function readCovers(isbns: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(isbns.map(coverKey).filter(Boolean))];
  const covers = new Map<string, string>();
  if (keys.length === 0) {
    return covers;
  }

  const db = await openDb();
  const stored = await new Promise<Array<[string, Blob]>>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const store = transaction.objectStore(STORE);
    const found: Array<[string, Blob]> = [];
    let pending = keys.length;

    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result instanceof Blob) {
          found.push([key, request.result]);
        }
        pending -= 1;
        if (pending === 0) {
          resolve(found);
        }
      };
      request.onerror = () => reject(request.error);
    }
  });

  db.close();

  for (const [key, blob] of stored) {
    covers.set(key, URL.createObjectURL(blob));
  }

  return covers;
}
