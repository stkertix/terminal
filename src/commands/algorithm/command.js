import { ALGORITHMS } from "./registry.js";

export function algorithmCommand(args) {
  if (args.length > 1) return `algorithm: usage: algorithm [${ALGORITHMS.join("|")}]`;
  const name = args[0] || "matrix";
  if (!ALGORITHMS.includes(name)) {
    const list = ALGORITHMS.join(", ").replace(/, ([^,]*)$/, ", or $1");
    return `algorithm: ${args[0]}: expected ${list}`;
  }
  return { algorithm: name };
}
