export const PRODUCT_IMAGE_MAX_DIMENSION = 640;
export const PRODUCT_IMAGE_MAX_DATA_URL_CHARS = 120_000;
const PRODUCT_IMAGE_QUALITIES = [0.82, 0.68, 0.55];
const PRODUCT_IMAGE_DIMENSIONS = [640, 480, 360];

export function productImageDimensions(width, height, maxDimension = PRODUCT_IMAGE_MAX_DIMENSION) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

function readDataUrlWithBrowser(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("无法读取图片，请重新选择。"));
    reader.readAsDataURL(file);
  });
}

function loadImageWithBrowser(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片格式无法识别，请更换图片。"));
    image.src = source;
  });
}

function createBrowserCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function imageError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function prepareProductImage(file, options = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw imageError("请选择有效的图片文件。", "PRODUCT_IMAGE_INVALID");
  }
  const readDataUrl = options.readDataUrl || readDataUrlWithBrowser;
  const loadImage = options.loadImage || loadImageWithBrowser;
  const createCanvas = options.createCanvas || createBrowserCanvas;
  const maxDataUrlChars = options.maxDataUrlChars || PRODUCT_IMAGE_MAX_DATA_URL_CHARS;
  const original = await readDataUrl(file);
  const image = await loadImage(original);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw imageError("图片尺寸无法识别，请更换图片。", "PRODUCT_IMAGE_DIMENSIONS_INVALID");
  }
  if (
    original.length <= maxDataUrlChars
    && Math.max(sourceWidth, sourceHeight) <= PRODUCT_IMAGE_MAX_DIMENSION
  ) return original;

  for (const maxDimension of PRODUCT_IMAGE_DIMENSIONS) {
    const { width, height } = productImageDimensions(sourceWidth, sourceHeight, maxDimension);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw imageError("浏览器无法压缩图片，请更换浏览器后重试。", "PRODUCT_IMAGE_CANVAS_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    for (const quality of PRODUCT_IMAGE_QUALITIES) {
      const candidate = String(canvas.toDataURL("image/webp", quality) || "");
      if (candidate.startsWith("data:image/webp") && candidate.length <= maxDataUrlChars) {
        return candidate;
      }
    }
  }
  throw imageError("图片压缩后仍然过大，请选择更小的图片。", "PRODUCT_IMAGE_TOO_LARGE");
}
