import { soccer } from "../src/commands/play/soccer/soccer.js";
import { lineShift, shotWindow, wideChance } from "../src/commands/play/soccer/ratings.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(wideChance(90) < wideChance(30), "higher finishing aims inside the goal more often");
assert(
  shotWindow("High Press", {}).open < shotWindow("Low Block", {}).open,
  "high press shoots from farther out than a low block",
);
assert(
  shotWindow("Balanced", { trailing: true }).open < shotWindow("Balanced", { leading: true }).open,
  "a trailing side shoots more readily than a leading side",
);
assert(lineShift("High Press", {}) > lineShift("Low Block", {}), "high press stands higher than a low block");

function play(options) {
  const sim = soccer({ quiet: true, ...options });
  sim.reset(48, 36);
  let guard = 0;
  while (!sim.holding && guard < 40000) {
    sim.step();
    guard += 1;
  }
  if (!sim.holding) throw new Error("match did not finish");
  return sim.report();
}

function batch(count, options) {
  const rows = [];
  for (let i = 0; i < count; i += 1) rows.push(play({ ...options, seed: 1000 + i }));
  return rows;
}

function rate(rows, pick) {
  return rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
}

function summarize(label, rows) {
  const count = rows.length;
  const share = (side) => Math.round((100 * rows.filter((row) => row.winner === side).length) / count);
  const regulationDraws = rows.filter((row) => row.regulation === "draw").length;
  const possession = rate(rows, (row) => {
    const total = row.stats.home.hold + row.stats.away.hold;
    return total ? (100 * row.stats.home.hold) / total : 50;
  });
  const line = [
    label,
    `n=${count}`,
    `home ${share("home")}%`,
    `draw ${share("draw")}%`,
    `away ${share("away")}%`,
    `level after extra time ${Math.round((100 * regulationDraws) / count)}%`,
    `goals ${rate(rows, (row) => row.home + row.away).toFixed(2)}`,
    `shots ${rate(rows, (row) => row.stats.home.shots + row.stats.away.shots).toFixed(1)}`,
    `xG ${rate(rows, (row) => row.stats.home.xg + row.stats.away.xg).toFixed(2)}`,
    `home possession ${possession.toFixed(0)}%`,
    `cards ${rate(rows, (row) => row.stats.home.yellows + row.stats.home.reds + row.stats.away.yellows + row.stats.away.reds).toFixed(2)}`,
  ];
  console.log(line.join("  "));
  return { home: share("home"), away: share("away") };
}

const count = Number(process.argv[2] || 40);
const first = play({ seed: 7 });
const second = play({ seed: 7 });
assert(first.home === second.home && first.away === second.away, "the same seed repeats the score");

const even = summarize("even", batch(count, {
  homeScale: 1,
  awayScale: 1,
  homeTactic: "Balanced",
  awayTactic: "Balanced",
}));
const mismatch = summarize("strong away", batch(count, {
  homeScale: 0.62,
  awayScale: 1.35,
  homeTactic: "Balanced",
  awayTactic: "Balanced",
}));
summarize("low block vs high press", batch(count, {
  homeScale: 1,
  awayScale: 1,
  homeTactic: "Low Block",
  awayTactic: "High Press",
}));

assert(mismatch.away > mismatch.home, "the stronger side wins more often");
console.log("checks passed");
