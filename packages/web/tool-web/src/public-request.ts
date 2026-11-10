import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { pipeline, Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * IPv4 networks a page fetch must not reach: this machine, private networks, link-local (cloud metadata
 * lives there), carrier NAT, multicast and reserved space.
 *
 * 198.18.0.0/15 is deliberately absent. Local proxies in fake-IP mode answer every name from that range,
 * so refusing it would stop web_fetch for everyone who runs one.
 */
const NON_PUBLIC_IPV4 = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 3]] as const;
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of NON_PUBLIC_IPV4) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
  // The same networks written inside an IPv6 address: IPv4-mapped, NAT64 (RFC 6052) and 6to4.
  const [a, b, c, d] = network.split(".").map(Number) as [number, number, number, number];
  const embedded = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  NON_PUBLIC.addSubnet(`::ffff:${embedded}`, 96 + prefix, "ipv6");
  NON_PUBLIC.addSubnet(`64:ff9b::${embedded}`, 96 + prefix, "ipv6");
  NON_PUBLIC.addSubnet(`2002:${embedded}::`, 16 + prefix, "ipv6");
}
// Unspecified, loopback and IPv4-compatible (::/96), unique local, link-local and the retired site-local (fe80::/9), multicast.
for (const [network, prefix] of [["::", 96], ["fc00::", 7], ["fe80::", 9], ["ff00::", 8]] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv6");

/** Anything that is not an IP address counts as non-public: a resolver must return addresses. */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  try { return NON_PUBLIC.check(address, family === 6 ? "ipv6" : "ipv4"); } catch { return true; }
}

/**
 * The addresses a URL's host may be reached at, or an error when any of them is not public.
 * `hostname` is `URL.hostname`, which keeps the brackets of an IPv6 literal.
 */
export async function publicAddresses(hostname: string, resolveHostname: (hostname: string) => Promise<readonly string[]>): Promise<readonly string[]> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Local and private network hosts are not allowed.");
  const addresses = isIP(host) ? [host] : await resolveHostname(host);
  if (!addresses.length || addresses.some(isNonPublicAddress)) throw new Error("Local and private network addresses are not allowed.");
  return addresses;
}

export type PageRequestInit = { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal };
/** Sends one GET without following redirects. `addresses` are the checked addresses of `url`'s host. */
export type PageRequest = (url: URL, addresses: readonly string[], init: PageRequestInit) => Promise<Response>;

/**
 * A GET whose connection can only go to `addresses`.
 *
 * Checking a name and then handing the URL to `fetch` resolves the name twice, and the second answer is
 * the one the socket uses: a DNS server can answer with a public address for the check and a private one
 * for the connection. Here the socket gets the checked addresses as its lookup result, so there is no
 * second answer. TLS still verifies the certificate against the host name.
 */
export const requestPinned: PageRequest = (url, addresses, init) => new Promise((resolve, reject) => {
  const entries = addresses.map((address) => ({ address, family: isIP(address) }));
  const lookup: LookupFunction = (_hostname, options, callback) => {
    const [first] = entries;
    if (first === undefined) callback(new Error("No checked address to connect to."), []);
    else if (options.all) callback(null, entries);
    else callback(null, first.address, first.family);
  };
  // agent: false gives this request its own connection, so it cannot reuse a socket opened for another lookup.
  const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, { method: "GET", agent: false, lookup, signal: init.signal, headers: { ...init.headers, "Accept-Encoding": "gzip, br" } }, (incoming) => {
    try { resolve(toResponse(incoming)); } catch (error) { incoming.destroy(); reject(error); }
  });
  request.once("error", (error) => reject(init.signal.aborted ? init.signal.reason : error));
  request.end();
});

function toResponse(incoming: IncomingMessage): Response {
  const status = incoming.statusCode ?? 0;
  if (status < 200 || status > 599) throw new Error(`Unexpected HTTP status ${status}.`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) for (const item of Array.isArray(value) ? value : [value ?? ""]) headers.append(name, item);
  const init = { status, statusText: incoming.statusMessage ?? "", headers };
  if (status === 204 || status === 205 || status === 304) { incoming.resume(); return new Response(null, init); }
  const encoding = (incoming.headers["content-encoding"] ?? "").trim().toLowerCase();
  const decoder = encoding === "gzip" || encoding === "x-gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : undefined;
  if (encoding && encoding !== "identity" && decoder === undefined) throw new Error(`Unsupported content encoding "${encoding}".`);
  // pipeline destroys both streams when either fails or the reader cancels, which closes the socket.
  const body = decoder === undefined ? incoming : pipeline(incoming, decoder, () => undefined);
  return new Response(Readable.toWeb(body) as unknown as ConstructorParameters<typeof Response>[0], init);
}
