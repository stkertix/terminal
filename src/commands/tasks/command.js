export function topCommand(args) {
  if (args.length > 0) return "top: too many arguments";
  return { top: true };
}

export function htopCommand(args) {
  if (args.length > 0) return "htop: too many arguments";
  return { top: true };
}
