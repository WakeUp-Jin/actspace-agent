/** widget 里用的小图标：用 DOM API 构造，不走 innerHTML。 */

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(size: number): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 16 16");
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("aria-hidden", "true");
  return el;
}

function path(d: string, strokeWidth: string): SVGPathElement {
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", d);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", strokeWidth);
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  return el;
}

export function checkIcon(): SVGSVGElement {
  const el = svg(12);
  el.append(path("M3.5 8.5l3 3 6-7", "2"));
  return el;
}

export function fileIcon(): SVGSVGElement {
  const el = svg(12);
  el.append(path("M4 1.75h5.2L12.5 5v9.25H4z", "1.3"), path("M9 1.9V5.2h3.3", "1.3"));
  return el;
}

export function expandIcon(): SVGSVGElement {
  const el = svg(12);
  el.append(path("M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9", "1.5"));
  return el;
}
