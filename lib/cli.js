#!/usr/bin/env node

// src/cli/main.ts
import { randomUUID } from "node:crypto";

// src/cli/args.ts
import { realpath, stat } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";

// node_modules/.pnpm/@deepseek-ai+dsh-home-paths@0.2.0-rc.2_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
var DSH_HOME_DIR_NAME = ".dsh";
var DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`;
var DSH_HOME_ENV = "DSH_HOME";
function defaultDshHome() {
  return join(homedir(), DSH_HOME_DIR_NAME);
}
function expandHomePath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}
function resolveDshHome(configured, env = process.env) {
  const fromEnv = env[DSH_HOME_ENV];
  return resolve(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}

// src/cli/args.ts
var HELP = `\u7528\u6CD5: dsh-open [\u9009\u9879] [\u76EE\u5F55]

\u7701\u7565\u76EE\u5F55\u65F6\u6253\u5F00\u5F53\u524D\u76EE\u5F55, \u6210\u529F\u9000\u51FA\u524D\u7B49\u5F85 DSH \u754C\u9762\u5B8C\u6210\u5DE5\u4F5C\u533A\u5BFC\u822A.

\u9009\u9879:
  --target desktop|web  \u9009\u62E9\u754C\u9762, \u9ED8\u8BA4 desktop
  --instance <ID>       \u9009\u62E9\u5177\u4F53 Host \u5B9E\u4F8B, \u6709\u591A\u4E2A\u5B9E\u4F8B\u65F6\u4F7F\u7528
  --timeout <\u79D2>        \u603B\u7B49\u5F85\u65F6\u95F4, \u9ED8\u8BA4 30, \u8303\u56F4 1..300
  --no-launch           \u4E0D\u5524\u8D77 Desktop, \u8FDE\u63A5\u5DF2\u7ECF\u8FD0\u884C\u7684\u5B9E\u4F8B
  --verbose             \u8F93\u51FA\u9636\u6BB5\u548C\u8BCA\u65AD\u65E5\u5FD7
  --help, -h            \u663E\u793A\u5E2E\u52A9
  --version             \u663E\u793A CLI \u7248\u672C
  --                    \u540E\u9762\u7684\u53C2\u6570\u6309\u76EE\u5F55\u5904\u7406

\u793A\u4F8B:
  dsh-open .
  dsh-open ~/projects/my-project
  dsh-open --target web --no-launch .
`;
function parseArgs(args) {
  const result = { path: ".", target: "desktop", timeout: 3e4, launch: true, verbose: false, action: "open" };
  let positional = false;
  let literal = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const take = () => {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} \u7F3A\u5C11\u53C2\u6570`);
      return value;
    };
    if (!literal && arg === "--") {
      literal = true;
      continue;
    }
    if (!literal && ["--help", "-h"].includes(arg)) {
      result.action = "help";
      continue;
    }
    if (!literal && arg === "--version") {
      result.action = "version";
      continue;
    }
    if (!literal && arg === "--verbose") {
      result.verbose = true;
      continue;
    }
    if (!literal && arg === "--no-launch") {
      result.launch = false;
      continue;
    }
    if (!literal && arg === "--target") {
      const value = take();
      if (value !== "desktop" && value !== "web") throw new Error("--target \u53EA\u80FD\u662F desktop \u6216 web");
      result.target = value;
      continue;
    }
    if (!literal && arg === "--instance") {
      const value = take();
      if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error("--instance \u9700\u8981 Host \u5B9E\u4F8B UUID");
      result.instance = value;
      continue;
    }
    if (!literal && arg === "--timeout") {
      const value = take();
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 300) throw new Error("--timeout \u9700\u8981 1..300 \u7684\u6574\u6570\u79D2\u6570");
      result.timeout = Number(value) * 1e3;
      continue;
    }
    if (!literal && arg.startsWith("-")) throw new Error(`\u672A\u77E5\u9009\u9879 ${arg}, \u4F7F\u7528 --help \u67E5\u770B\u7528\u6CD5`);
    if (positional) throw new Error("\u4E00\u6B21\u53EA\u80FD\u6253\u5F00\u4E00\u4E2A\u76EE\u5F55");
    result.path = arg;
    positional = true;
  }
  return result;
}
async function canonicalDirectory(path) {
  const canonical = await realpath(resolve2(expandHomePath(path)));
  if (!(await stat(canonical)).isDirectory()) throw new Error("\u76EE\u6807\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55");
  return canonical;
}

// src/cli/log.ts
import { debuglog, format } from "node:util";
import { channel } from "node:diagnostics_channel";
var diagnostic = channel("dsh-open-dir/cli-log");
var debug = debuglog("dsh-open");
function cliLog(verbose) {
  const write = (level, message, args) => {
    const text = format(message, ...args);
    diagnostic.publish({ level, message: text, time: Date.now() });
    if (verbose || level === "warn" || level === "error") process.stderr.write(`[${level}] ${text}
`);
    else debug("[%s] %s", level, text);
  };
  return {
    debug: (message, ...args) => write("debug", message, args),
    info: (message, ...args) => write("info", message, args),
    warn: (message, ...args) => write("warn", message, args),
    error: (message, ...args) => write("error", message, args)
  };
}

// src/cli/launch.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
async function wakeDesktop(signal) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", "dsh://open"] : ["dsh://open"];
  await promisify(execFile)(command, args, { signal, timeout: 1e4, windowsHide: true });
}

// src/cli/discovery.ts
import { lstat, readFile, readdir } from "node:fs/promises";
import { join as join2 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// src/shared/protocol.ts
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isResult(value) {
  return record(value) && (value.ok === true ? typeof value.workspaceId === "string" && typeof value.path === "string" : value.ok === false && typeof value.error === "string");
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/cli/discovery.ts
function valid(value) {
  return record(value) && value.version === 1 && typeof value.instance === "string" && /^[a-f0-9-]{36}$/.test(value.instance) && typeof value.token === "string" && /^[a-f0-9]{64}$/.test(value.token) && typeof value.pid === "number" && Number.isInteger(value.pid) && value.pid > 0 && typeof value.port === "number" && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535;
}
function address(endpoint, route) {
  return `http://127.0.0.1:${endpoint.port}${route}`;
}
function authorization(endpoint) {
  return { Authorization: `Bearer ${endpoint.token}` };
}
async function discover(directory, target, instance, signal, log) {
  let files;
  try {
    files = (await readdir(directory)).filter((file) => /^[a-f0-9-]{36}\.json$/.test(file));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  if (files.length > 128) throw new Error("\u53D1\u73B0\u8BB0\u5F55\u8D85\u8FC7 128 \u4E2A, \u8BF7\u6E05\u7406\u672C\u63D2\u4EF6\u9057\u7559\u7684\u8FD0\u884C\u65F6\u8BB0\u5F55");
  const candidates = await Promise.all(files.map(async (file) => {
    if (instance && file !== `${instance}.json`) return null;
    try {
      const path = join2(directory, file);
      const info = await lstat(path);
      if (!info.isFile() || info.size > 4096 || process.platform !== "win32" && (info.mode & 63) !== 0) return null;
      const value = JSON.parse(await readFile(path, "utf8"));
      if (!valid(value) || file !== `${value.instance}.json`) return null;
      const response = await fetch(address(value, "/health"), {
        headers: authorization(value),
        signal: AbortSignal.any([signal, AbortSignal.timeout(700)]),
        redirect: "error"
      });
      if (!response.ok) return null;
      const health = await response.json();
      if (!record(health) || health.version !== 1 || health.instance !== value.instance || health.pid !== value.pid || !Array.isArray(health.targets) || !health.targets.includes(target)) return null;
      return value;
    } catch (error) {
      log.debug("\u5FFD\u7565\u4E0D\u53EF\u7528\u7684\u53D1\u73B0\u8BB0\u5F55 %s: %s", file, errorMessage(error));
      return null;
    }
  }));
  return candidates.filter((value) => value !== null);
}
async function waitForEndpoint(directory, target, instance, signal, log) {
  log.info("\u7B49\u5F85 %s \u754C\u9762\u7684\u63D2\u4EF6\u901A\u9053\u5C31\u7EEA", target);
  while (!signal.aborted) {
    const candidates = await discover(directory, target, instance, signal, log);
    if (candidates.length > 1) {
      throw new Error(`\u53D1\u73B0\u591A\u4E2A ${target} Host \u5B9E\u4F8B, \u8BF7\u7528 --instance \u9009\u62E9: ${candidates.map((row) => `${row.instance} (pid=${row.pid})`).join(", ")}`);
    }
    if (candidates[0]) return candidates[0];
    await delay(250, void 0, { signal });
  }
  signal.throwIfAborted();
  throw new Error("\u6CA1\u6709\u53EF\u7528\u7684\u63D2\u4EF6\u5B9E\u4F8B");
}

// src/shared/paths.ts
import { join as join3 } from "node:path";
function runtimeDirectory() {
  return join3(resolveDshHome(), "runtime", "dsh-open-dir");
}

// src/cli/main.ts
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.action === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (options.action === "version") {
    process.stdout.write(`${"0.1.0"}
`);
    return;
  }
  const log = cliLog(options.verbose);
  const path = await canonicalDirectory(options.path);
  const startedAt = Date.now();
  const deadline = startedAt + options.timeout;
  const cancel = new AbortController();
  const timeout = AbortSignal.timeout(options.timeout);
  const signal = AbortSignal.any([cancel.signal, timeout]);
  const interrupt = () => cancel.abort(new Error("\u6253\u5F00\u8BF7\u6C42\u5DF2\u53D6\u6D88"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    log.info("\u76EE\u6807\u76EE\u5F55\u5DF2\u9A8C\u8BC1: %s", path);
    if (options.target === "desktop" && options.launch) {
      log.info("\u5524\u8D77 Desktop");
      try {
        await wakeDesktop(signal);
      } catch (error) {
        throw new Error(`\u65E0\u6CD5\u5524\u8D77 Desktop: ${errorMessage(error)}. \u53EF\u5148\u624B\u52A8\u6253\u5F00 Desktop, \u518D\u7528 --no-launch \u91CD\u8BD5`);
      }
    }
    const endpoint = await waitForEndpoint(runtimeDirectory(), options.target, options.instance, signal, log);
    const id = randomUUID();
    log.info("\u5411 Host \u63D0\u4EA4\u6253\u5F00\u8BF7\u6C42, instance=%s, request=%s", endpoint.instance, id);
    const response = await fetch(address(endpoint, "/open"), {
      method: "POST",
      signal,
      redirect: "error",
      headers: { ...authorization(endpoint), "Content-Type": "application/json" },
      body: JSON.stringify({ id, path, target: options.target, deadline })
    });
    const result = await response.json();
    if (!isResult(result)) throw new Error(`Host \u8FD4\u56DE\u4E86\u4E0D\u5408\u6CD5\u7684\u7ED3\u679C: HTTP ${response.status}`);
    if (!result.ok) throw new Error(result.error);
    if (!response.ok) throw new Error(`Host \u786E\u8BA4\u5931\u8D25: HTTP ${response.status}`);
    log.info("\u754C\u9762\u5BFC\u822A\u5B8C\u6210, workspace=%s, \u8017\u65F6=%sms", result.workspaceId, Date.now() - startedAt);
    process.stdout.write(`\u5DF2\u6253\u5F00\u5DE5\u4F5C\u533A: ${result.path}
`);
  } catch (error) {
    if (timeout.aborted) throw new Error(`\u7B49\u5F85 ${options.timeout / 1e3}s \u540E\u8D85\u65F6. \u8BF7\u786E\u8BA4 ${options.target} \u5DF2\u542F\u52A8, \u5DF2\u5B89\u88C5\u5E76\u542F\u7528 dsh-open-dir, \u4E14\u754C\u9762\u5DF2\u7ECF\u52A0\u8F7D. CLI \u548C\u5BBF\u4E3B\u5FC5\u987B\u4F7F\u7528\u76F8\u540C\u7684 DSH_HOME`);
    if (cancel.signal.aborted) {
      process.exitCode = 130;
      throw cancel.signal.reason;
    }
    throw error;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
main().catch((error) => {
  cliLog(false).error("%s", errorMessage(error));
  process.exitCode ||= 1;
});
//# sourceMappingURL=cli.js.map
