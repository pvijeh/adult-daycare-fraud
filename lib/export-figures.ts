function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

async function exportPng(svgMarkup: string, filename: string) {
  const source = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not render ${filename}.`));
    image.src = url;
  });
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = image.width * scale;
  canvas.height = image.height * scale;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas export is unavailable.");
  }
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))),
      "image/png",
    );
  });
  downloadBlob(png, `${filename}.png`);
}

export async function exportStoryFigures() {
  const figures = Array.from(
    document.querySelectorAll<SVGSVGElement>("svg[data-export-name]"),
  );
  for (const figure of figures) {
    const filename = figure.dataset.exportName ?? "story-figure";
    const markup = serializeSvg(figure);
    downloadBlob(
      new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
      `${filename}.svg`,
    );
    await exportPng(markup, filename);
  }
  return figures.length;
}
