function parsePageUrl(value) {
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url;
}

export function openCommand(args) {
  if (args.length === 0) return "open: missing url";
  if (args.length > 1) return "open: too many arguments";
  const url = parsePageUrl(args[0]);
  if (!url) return "open: invalid url";
  return { browse: url.href };
}
