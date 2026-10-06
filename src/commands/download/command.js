export function downloadCommand(args) {
  if (args.length > 1) return "download: too many arguments";
  const name = args[0] || "";
  if (name && !/^[A-Za-z0-9._-]+$/.test(name)) return `download: ${name}: invalid name`;
  return { download: name || true };
}
