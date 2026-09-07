const EXTERNAL_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;

export function sitePath(pathname: string, base = import.meta.env.BASE_URL): string {
  if (!pathname || pathname.startsWith("#") || EXTERNAL_PROTOCOL.test(pathname)) {
    return pathname;
  }

  const normalizedBase = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return `${normalizedBase}${normalizedPath}`.replace(/\/{2,}/g, "/");
}
