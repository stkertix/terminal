export const GAMES = ["soccer", "padel"];

const USAGE = "play: usage: play [soccer|padel] | play soccer [seed N] [2x|skip|replay]";

export function playCommand(args) {
  const name = args[0] || "soccer";
  if (!GAMES.includes(name)) {
    const list = GAMES.join(", ").replace(/, ([^,]*)$/, " or $1");
    return `play: ${args[0]}: expected ${list}`;
  }
  if (name === "padel") {
    if (args.length > 1) return USAGE;
    return { play: "padel" };
  }
  const options = parseSoccer(args.slice(1));
  if (options.error) return options.error;
  return { play: "soccer", playOptions: options };
}

function parseSoccer(args) {
  const options = { speed: 1, seed: null, skip: false, replay: false, command: "play soccer" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "2x") options.speed = 2;
    else if (arg === "skip") options.skip = true;
    else if (arg === "replay") options.replay = true;
    else if (arg === "seed") {
      const value = args[i + 1];
      if (!/^\d+$/.test(value || "")) return { error: USAGE };
      options.seed = Number(value);
      i += 1;
    } else return { error: USAGE };
  }
  if (options.replay && (options.skip || options.speed !== 1 || options.seed != null)) return { error: USAGE };
  const parts = ["play soccer"];
  if (options.seed != null) parts.push("seed", String(options.seed));
  if (options.speed === 2) parts.push("2x");
  if (options.skip) parts.push("skip");
  if (options.replay) parts.push("replay");
  options.command = parts.join(" ");
  return options;
}
