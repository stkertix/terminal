export const CHARTS = ["bar-horizontal", "bar-vertical", "line", "heatmap"];

export function monitorCommand(args) {
  if (args.length > 1) return `monitor: usage: monitor [${CHARTS.join("|")}]`;
  const chart = args[0] || "line";
  if (!CHARTS.includes(chart)) return `monitor: ${args[0]}: expected ${CHARTS.join(", ").replace(/, ([^,]*)$/, ", or $1")}`;
  return { monitor: chart };
}
