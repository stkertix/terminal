export const GAMES = ["soccer", "padel", "badminton"];

export function playCommand(args) {
  if (args.length > 1) return `play: usage: play [${GAMES.join("|")}]`;
  const name = args[0] || "soccer";
  if (!GAMES.includes(name)) {
    const list = GAMES.join(", ").replace(/, ([^,]*)$/, " or $1");
    return `play: ${args[0]}: expected ${list}`;
  }
  return { play: name };
}
