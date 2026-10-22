const CAMERA_MAX_WIDTH = 1200;
const CAMERA_JPEG_QUALITY = 0.7;
const CAMERA_MAX_BYTES = 350_000;

function canvasJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  quality: number,
  maxWidth = CAMERA_MAX_WIDTH,
): Promise<Blob> {
  const width = Math.min(maxWidth, Math.max(1, sourceWidth));
  const height = Math.max(1, Math.round(sourceHeight * (width / Math.max(1, sourceWidth))));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Não foi possível reduzir a foto.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "medium";
  context.drawImage(source, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível reduzir a foto."))),
      "image/jpeg",
      quality,
    );
  });
}

function bitmapFromImage(file: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const width = Math.min(CAMERA_MAX_WIDTH, image.naturalWidth || CAMERA_MAX_WIDTH);
      const height = Math.max(
        1,
        Math.round((image.naturalHeight || width) * (width / Math.max(1, image.naturalWidth || width))),
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        reject(new Error("Não foi possível reduzir a foto."));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      createImageBitmap(canvas).then(resolve, reject);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível reduzir a foto."));
    };
    image.src = url;
  });
}

async function bitmapForCamera(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { resizeWidth: CAMERA_MAX_WIDTH, resizeQuality: "medium" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return bitmapFromImage(file);
    }
  }
}

export async function compressCameraPhoto(file: Blob): Promise<Blob> {
  if (file.type === "image/jpeg" && file.size > 0 && file.size <= CAMERA_MAX_BYTES) {
    return file;
  }

  const bitmap = await bitmapForCamera(file);
  try {
    let image = await canvasJpeg(bitmap, bitmap.width, bitmap.height, CAMERA_JPEG_QUALITY);
    if (image.size > CAMERA_MAX_BYTES) {
      image = await canvasJpeg(bitmap, bitmap.width, bitmap.height, 0.5);
    }
    if (image.size > CAMERA_MAX_BYTES) {
      image = await canvasJpeg(bitmap, bitmap.width, bitmap.height, 0.5, 800);
    }
    return image;
  } finally {
    bitmap.close();
  }
}

export async function prepareImage(file: Blob, maxEdge: number, quality: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

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

  try {
    context.drawImage(bitmap, 0, 0, width, height);
  } catch {
    bitmap.close();
    return file;
  }

  bitmap.close();

  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
