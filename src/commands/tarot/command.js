import { formatReading } from "./reading.js";

const PERSON_NAME = /^[\p{L} '’-]+$/u;

function isBirthDate(token, today) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) return false;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date <= startToday;
}

export function tarotCommand(args, _state, deps) {
  if (args.length < 2) return "tarot: usage: tarot FULL NAME YYYY-MM-DD";
  const dateToken = args[args.length - 1];
  if (!isBirthDate(dateToken, deps.now())) return `tarot: ${dateToken}: invalid date`;
  const name = args.slice(0, -1).join(" ").trim().replace(/\s+/g, " ");
  if (!name || !PERSON_NAME.test(name)) return `tarot: ${name}: invalid name`;
  return formatReading(name, dateToken);
}
