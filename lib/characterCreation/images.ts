async function fileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(
  file: File,
  maxSize = 1024,
  quality = 0.78,
) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Escolha uma imagem de até 20 MB.");
  if (!file.type.startsWith("image/"))
    throw new Error("Escolha um arquivo de imagem.");
  const source = await fileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("A imagem não pôde ser aberta."));
    element.src = source;
  });
  const scale = Math.min(
    1,
    maxSize / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
