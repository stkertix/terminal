import { TAROT_CARDS } from "./cards.js";

const POSITIONS = ["Past", "Present", "Future"];

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickThree(seed) {
  const indexes = [];
  let state = seed;
  while (indexes.length < 3) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const index = state % TAROT_CARDS.length;
    if (!indexes.includes(index)) indexes.push(index);
  }
  return indexes;
}

export function formatReading(name, isoDate) {
  const displayName = name.trim().replace(/\s+/g, " ");
  const key = `${displayName.toLowerCase()}|${isoDate}`;
  const cards = pickThree(hashSeed(key)).map((index) => TAROT_CARDS[index]);
  const body = cards.map((card, index) => {
    const label = POSITIONS[index].padEnd(9);
    const pad = " ".repeat(9);
    return `${label}${card.name}\n${pad}${card.line}\n${pad}${card.narrative}`;
  });
  return [`Reading for ${displayName}, born ${isoDate}`, "", body.join("\n\n")].join("\n");
}
