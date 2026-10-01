/**
 * Fetch-input safety (issue 15). Central guard so no tool can be steered
 * onto internal resources via caller- or web-supplied URLs (`companyUrl`,
 * discovery results) reaching `fetchPosting` / `defaultFetch`.
 *
 * Blocks non-http(s) schemes, loopback, and private addresses. Hostname
 * checks are literal (no DNS resolution here): localhost names, `.local` /
 * `.internal` suffixes, and literal IPv4/IPv6 in private ranges. Anything
 * else passes — this is a safety net, not a full SSRF resolver.
 */

export interface SafetyVerdict {
  safe: boolean;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost"]);

function isLoopbackIpv6(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number.parseInt(part, 10);
    if (value < 0 || value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

function isPrivateIpv4(host: string): boolean {
  const octets = ipv4Octets(host);
  if (!octets) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  return false;
}

function hostnameBlocked(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === "" || BLOCKED_HOSTNAMES.has(host)) {
    return "loopback hostname";
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return "non-public suffix";
  }
  if (isLoopbackIpv6(host)) {
    return "loopback address";
  }
  if (isPrivateIpv4(host)) {
    return "private address";
  }
  return null;
}

/** Central URL gate: http(s) only, no loopback / private / non-public hosts. Never throws. */
export function isSafeFetchUrl(rawUrl: string): SafetyVerdict {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "unparseable URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `blocked scheme ${parsed.protocol}` };
  }
  const blocked = hostnameBlocked(parsed.hostname);
  if (blocked) {
    return { safe: false, reason: `blocked host (${blocked})` };
  }
  return { safe: true };
}
