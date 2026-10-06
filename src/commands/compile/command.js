export const COMPILERS = ["java", "npm", "go", "rust", "gcc", "dotnet", "python"];

function compilerName(roll) {
  const index = Math.min(COMPILERS.length - 1, Math.floor(roll() * COMPILERS.length));
  return COMPILERS[index];
}

function expectedCompiler(command, name) {
  const list = COMPILERS.join(", ").replace(/, ([^,]*)$/, ", or $1");
  return `${command}: ${name}: expected ${list}`;
}

const COMPILER_CHOICES = COMPILERS.join("|");

export function compileCommand(args, _state, deps) {
  if (args.length === 0) {
    const roll = deps.random ?? Math.random;
    const tool = compilerName(roll);
    const minutes = 1 + Math.floor(roll() * 25);
    return { compile: { tool, minutes, loops: 1 } };
  }
  if (args.length !== 2) return `compile: usage: compile [${COMPILER_CHOICES} MINUTES]`;
  const tool = args[0].toLowerCase();
  if (!COMPILERS.includes(tool)) return expectedCompiler("compile", args[0]);
  if (!/^[1-9]\d*$/.test(args[1])) return `compile: ${args[1]}: invalid duration`;
  const minutes = Number(args[1]);
  if (minutes > 1440) return `compile: ${args[1]}: duration is too long`;
  return { compile: { tool, minutes, loops: 1 } };
}

export function installCommand(args) {
  if (args.length !== 3) return `install: usage: install ${COMPILER_CHOICES} MINUTES LOOPS`;
  const tool = args[0].toLowerCase();
  if (!COMPILERS.includes(tool)) return expectedCompiler("install", args[0]);
  if (!/^[1-9]\d*$/.test(args[1])) return `install: ${args[1]}: invalid duration`;
  if (!/^[1-9]\d*$/.test(args[2])) return `install: ${args[2]}: invalid loops`;
  const minutes = Number(args[1]);
  const loops = Number(args[2]);
  if (minutes > 1440) return `install: ${args[1]}: duration is too long`;
  if (loops > 100) return `install: ${args[2]}: too many loops`;
  return { compile: { tool, minutes, loops } };
}
