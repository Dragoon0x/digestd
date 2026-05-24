// stable id generation. same url always yields same id.
// no crypto dep, FNV-1a 64-bit is good enough for de-duplication.

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // strip common tracking params
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
      "ref_src",
    ];
    for (const p of drop) u.searchParams.delete(p);
    // strip trailing slash on pathname (but keep root)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    // lowercase host
    u.hostname = u.hostname.toLowerCase();
    // drop fragment
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

export function itemId(url: string, fallback?: string): string {
  const normalized = normalizeUrl(url);
  const seed = normalized || fallback || "";
  return fnv1a64(seed);
}
