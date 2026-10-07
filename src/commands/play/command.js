export const GAMES = ["soccer", "padel", "badminton", "mini-4wd", "boxing", "chess"];

export function playCommand(args) {
  if (args.length > 1) return `play: usage: play [${GAMES.join("|")}]`;
  if (args.length === 0) return { playPick: true };
  const name = args[0];
  if (!GAMES.includes(name)) {
    const list = GAMES.join(", ").replace(/, ([^,]*)$/, " or $1");
    return `play: ${args[0]}: expected ${list}`;
  }
  return { play: name };
}
