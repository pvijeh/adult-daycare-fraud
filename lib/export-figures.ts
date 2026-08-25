function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const SVG_STYLE_PROPERTIES = [
  "color",
  "display",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "opacity",
  "paint-order",
  "shape-rendering",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "text-decoration",
  "text-rendering",
  "vector-effect",
  "visibility",
  "word-spacing",
] as const;

function inlineComputedStyles(source: SVGSVGElement, target: SVGSVGElement) {
  const sourceElements = [
    source,
    ...source.querySelectorAll<SVGElement>("*"),
  ];
  const targetElements = [
    target,
    ...target.querySelectorAll<SVGElement>("*"),
  ];

  sourceElements.forEach((element, index) => {
    const computed = window.getComputedStyle(element);
    const targetElement = targetElements[index];
    for (const property of SVG_STYLE_PROPERTIES) {
      targetElement.style.setProperty(property, computed.getPropertyValue(property));
    }
  });
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const viewBox = svg.viewBox.baseVal;
  inlineComputedStyles(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (viewBox.width && viewBox.height) {
    clone.setAttribute("width", String(viewBox.width));
    clone.setAttribute("height", String(viewBox.height));
  }
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
  canvas.width = image.naturalWidth * scale;
  canvas.height = image.naturalHeight * scale;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas export is unavailable.");
  }
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
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
