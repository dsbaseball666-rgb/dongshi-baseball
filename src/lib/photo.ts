// 大頭照：上傳前在手機／電腦上先縮小成 JPG，網站讀取比較快，雲端硬碟也不會塞滿大照片。

/** 讀入一張照片檔，縮到最長邊 max 像素，回傳 JPG 的 data: 網址 */
export async function resizePhoto(file: File, max = 480, quality = 0.85): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error(`「${file.name}」不是照片檔。`);
  const url = URL.createObjectURL(file);
  try {
    return await resizeSrc(url, max, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 縮小一張照片（src 可以是 blob: 或 data: 網址，例如從雲端硬碟讀來的原圖） */
export async function resizeSrc(src: string, max = 480, quality = 0.85): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // PNG 透明的地方變白色
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('照片讀不出來，請換一張（手機的 HEIC 格式請先轉成 JPG）。'));
    img.src = src;
  });
}

/**
 * 檔名去掉副檔名、括號內容、年級與空白，用來對應球員姓名
 * （例如「王小明.jpg」「王小明 (1).png」「王小明(國三).jpg」「國一王小明.jpg」→「王小明」）
 */
export function nameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[(（[【][^)）\]】]*[)）\]】]/g, '')
    .replace(/國[一二三]|[七八九]年級|[一二三]年級/g, '')
    .replace(/[\s_\-－]+/g, '')
    .trim();
}
