// Compressão feita antes do envio, sem enviar a imagem original ao servidor.
export async function optimize(file) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione apenas imagens.');
  if (file.size > 20000000) throw new Error('A imagem original deve ter até 20 MB.');
  const image = await createImageBitmap(file).catch(() => { throw new Error('Formato não suportado. Use JPEG, PNG ou WebP.'); });
  const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  for (const quality of [.86, .8, .74]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= 2660000) return result;
  }
  throw new Error('Esta imagem tem muitos detalhes para o limite de 2 MB. Recorte a região do reparo e tente novamente.');
}
