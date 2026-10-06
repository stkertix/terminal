import { formatRemaining } from "../format.js";

export function logLine(level, text) {
  return { level, message: `[${level.toUpperCase()}] ${text}` };
}

export function pickLog(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

export function javaCompileLine() {
  const packages = ["com.example.app", "com.example.core", "com.example.net", "com.example.io", "org.example.service"];
  const types = ["Application", "Buffer", "Socket", "Token", "Parser", "Window", "Task", "Stream", "Table", "Lexer", "Runtime", "Config", "Service", "Handler", "Repository"];
  const pkg = packages[Math.floor(Math.random() * packages.length)];
  const type = `${types[Math.floor(Math.random() * types.length)]}${Math.floor(Math.random() * 40)}`;
  const path = `src/main/java/${pkg.replaceAll(".", "/")}/${type}.java`;
  const count = 20 + Math.floor(Math.random() * 180);
  return pickLog([
    logLine("info", `Compiling ${path}`),
    logLine("debug", `Compiling ${count} source files with javac [debug release 17] to target/classes`),
    logLine("warn", `Changes detected - recompiling the module! ${path}`),
    logLine("error", `Failed to compile ${path}`),
  ]);
}

export function npmCompileLine() {
  const dirs = ["src", "src/core", "src/net", "src/ui", "src/routes", "lib"];
  const stems = ["index", "buffer", "socket", "parser", "window", "task", "stream", "table", "runtime", "config", "service", "handler"];
  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  const stem = stems[Math.floor(Math.random() * stems.length)];
  const file = `${dir}/${stem}${Math.floor(Math.random() * 40)}.ts`;
  const modules = 10 + Math.floor(Math.random() * 400);
  const size = (8 + Math.random() * 240).toFixed(2);
  const gzip = (Number(size) * 0.32).toFixed(2);
  const hash = crypto.randomUUID().slice(0, 8);
  return pickLog([
    logLine("info", `transforming ${file}`),
    logLine("debug", `${modules} modules transformed.`),
    logLine("info", "rendering chunks..."),
    logLine("debug", "computing gzip size..."),
    logLine("info", `dist/assets/${stem}-${hash}.js   ${size} kB │ gzip: ${gzip} kB`),
    logLine("warn", `${file} is larger than the recommended size`),
    logLine("error", `failed to resolve import from ${file}`),
  ]);
}

export function goCompileLine() {
  const packages = ["cmd/app", "internal/net", "internal/parser", "internal/store", "pkg/runtime"];
  const files = ["main.go", "socket.go", "parser.go", "buffer.go", "task.go", "config.go"];
  const pkg = packages[Math.floor(Math.random() * packages.length)];
  const file = files[Math.floor(Math.random() * files.length)];
  const version = `v1.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 20)}`;
  const moduleName = file.replace(".go", "");
  return pickLog([
    logLine("info", `compiling ${pkg}/${file}`),
    logLine("debug", `example.com/app/${pkg}`),
    logLine("debug", `go: downloading example.com/${moduleName} ${version}`),
    logLine("warn", `${pkg}/${file} uses a deprecated API`),
    logLine("error", `${pkg}: build failed`),
  ]);
}

export function rustCompileLine() {
  const crates = [
    ["app", "0.1.0"],
    ["serde", "1.0.210"],
    ["tokio", "1.40.0"],
    ["libc", "0.2.159"],
    ["regex", "1.11.0"],
    ["clap", "4.5.20"],
  ];
  const [name, version] = crates[Math.floor(Math.random() * crates.length)];
  return pickLog([
    logLine("info", `Compiling ${name} v${version}`),
    logLine("debug", `Fresh ${name} v${version}`),
    logLine("warn", `${name} v${version} will be rejected in a future release`),
    logLine("error", `could not compile ${name} v${version}`),
  ]);
}

export function gccCompileLine() {
  const files = ["main", "parser", "buffer", "socket", "runtime", "config"];
  const file = files[Math.floor(Math.random() * files.length)];
  return pickLog([
    logLine("info", `gcc -c src/${file}.c -o build/${file}.o`),
    logLine("debug", `gcc -c src/${file}.c -O2 -o build/${file}.o`),
    logLine("debug", `cc -c src/${file}.c -o build/${file}.o`),
    logLine("warn", `src/${file}.c: unused variable`),
    logLine("error", `src/${file}.c: error: undeclared identifier`),
  ]);
}

export function dotnetCompileLine() {
  const projects = ["App", "Core", "Net", "Service"];
  const name = projects[Math.floor(Math.random() * projects.length)];
  const warnings = Math.floor(Math.random() * 3);
  return pickLog([
    logLine("info", `Restore complete (${(0.4 + Math.random() * 3).toFixed(1)}s)`),
    logLine("debug", `${name} -> /home/user/app/bin/Release/net8.0/${name}.dll`),
    logLine("warn", `${warnings} Warning(s)`),
    logLine("error", `${name}: error CS0103: The name does not exist`),
  ]);
}

export function pythonCompileLine() {
  const modules = ["app/parser.py", "app/runtime.py", "app/config.py", "app/service.py", "app/__init__.py"];
  const file = modules[Math.floor(Math.random() * modules.length)];
  return pickLog([
    logLine("info", `Compiling '${file}'...`),
    logLine("debug", "Building wheel for app (pyproject.toml)"),
    logLine("info", "creating dist/app-1.0.0-py3-none-any.whl"),
    logLine("debug", "adding 'app/__init__.py'"),
    logLine("warn", `${file}: SyntaxWarning: invalid escape sequence`),
    logLine("error", `error: ${file} failed to compile`),
  ]);
}

export function compilerProfile(name, duration) {
  const profiles = {
    java: {
      command: "mvn compile",
      target: "target/app.jar",
      success: "BUILD SUCCESS",
      done: logLine("info", "BUILD SUCCESS"),
      line: javaCompileLine,
    },
    npm: {
      command: "npm run build",
      target: "dist/index.js",
      success: "built",
      done: logLine("info", `built in ${formatRemaining(duration)}`),
      line: npmCompileLine,
    },
    go: {
      command: "go build",
      target: "bin/app",
      success: "built",
      done: logLine("info", "built bin/app"),
      line: goCompileLine,
    },
    rust: {
      command: "cargo build",
      target: "target/release/app",
      success: "Finished",
      done: logLine("info", `Finished release [optimized] target(s) in ${formatRemaining(duration)}`),
      line: rustCompileLine,
    },
    gcc: {
      command: "gcc -o app",
      target: "app",
      success: "built",
      done: logLine("info", "built app"),
      line: gccCompileLine,
    },
    dotnet: {
      command: "dotnet build",
      target: "bin/Release/app.dll",
      success: "Build succeeded",
      done: logLine("info", "Build succeeded."),
      line: dotnetCompileLine,
    },
    python: {
      command: "python -m build",
      target: "dist/app.whl",
      success: "built",
      done: logLine("info", "Successfully built app"),
      line: pythonCompileLine,
    },
  };
  return profiles[name] ?? profiles.java;
}
