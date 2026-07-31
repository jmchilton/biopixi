/**
 * Channel URL handling: canonical identity, artifact-to-channel derivation, and the redaction
 * every renderer owes a user.
 *
 * Kept apart from matching and from manifest reading because all three of those want it and none
 * of them owns it. A credential that reaches a terminal, a log, or a `--json` payload has already
 * leaked, so the redaction lives beside the parsing rather than at each call site.
 */

/**
 * Strip everything from a URL that is either secret or not part of its identity: userinfo, query,
 * and fragment, plus a trailing slash.
 *
 * Returns `undefined` for a value that is not a URL at all, which is how a bare channel name such
 * as `bioconda` is distinguished from a channel URL.
 */
export function canonicalChannelUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

/** Derive a channel URL by removing an artifact's platform and filename path segments. */
export function artifactChannelUrl(value: string): string | undefined {
  const canonical = canonicalChannelUrl(value);
  if (canonical === undefined) {
    return undefined;
  }
  const url = new URL(canonical);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }
  url.pathname = `/${parts.slice(0, -2).join("/")}`;
  return url.toString().replace(/\/$/, "");
}

/**
 * Whether a channel URL carries userinfo or parameters.
 *
 * Deliberately broader than "has a password": a query string on a channel URL is how several
 * hosted registries pass a token, and biopixi cannot tell a token apart from a harmless parameter
 * by looking. Treating both as unpublishable costs a project nothing it can't undo by moving the
 * parameter into its Pixi authentication configuration, whereas guessing wrong leaks a secret.
 */
export function channelHasSensitiveData(channel: string): boolean {
  try {
    const url = new URL(channel);
    return (
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Remove userinfo and parameters from every URL in a free-text message.
 *
 * Every biopixi renderer runs its output through this, because the strings being rendered are
 * assembled far from the point where a URL's provenance is known. A URL that cannot be parsed
 * after extraction is replaced wholesale rather than passed through: an unparseable fragment is
 * exactly the case where the structure that redaction relies on is absent.
 */
export function redactSensitiveUrls(value: string): string {
  // Stop at whitespace only. Commas, quotes, and parentheses are all legal in a URL, and clipping
  // one produces a truncated URL rendered as if it were whole — worse than either extreme.
  return value.replace(/\bhttps?:\/\/\S+/g, (raw) => {
    // Trailing punctuation belongs to the sentence, not the URL. Peel it back off before parsing
    // so `…/linux-64.` does not become part of the path.
    const trailing = /[.,;:!?)\]}'"]+$/.exec(raw)?.[0] ?? "";
    const candidate = raw.slice(0, raw.length - trailing.length);
    const canonical = canonicalChannelUrl(candidate);
    return canonical === undefined ? `[redacted URL]${trailing}` : `${canonical}${trailing}`;
  });
}
