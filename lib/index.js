// src/shared/protocol.ts
var API = "/api/plugins/azazo1-open-dir";
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isResult(value) {
  return record(value) && (value.ok === true ? typeof value.workspaceId === "string" && typeof value.path === "string" : value.ok === false && typeof value.error === "string");
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/shared/paths.ts
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
function runtimeDirectory() {
  return join(resolveDshHome(), "runtime", "dsh-open-dir");
}

// src/host/broker.ts
import { randomUUID } from "node:crypto";
var Broker = class {
  constructor(log, pollMs = 2e4) {
    this.log = log;
    this.pollMs = pollMs;
  }
  pending = [];
  waiters = /* @__PURE__ */ new Set();
  presence = /* @__PURE__ */ new Map();
  closed = false;
  get targets() {
    return [...this.presence].filter(([, time]) => Date.now() - time < 45e3).map(([target]) => target);
  }
  submit(request, signal) {
    if (this.closed) return Promise.resolve({ ok: false, error: "\u63D2\u4EF6\u5DF2\u7ECF\u5378\u8F7D" });
    if (this.pending.length >= 32) return Promise.resolve({ ok: false, error: "\u6253\u5F00\u8BF7\u6C42\u961F\u5217\u5DF2\u6EE1" });
    if (this.pending.some((row) => row.request.id === request.id)) return Promise.resolve({ ok: false, error: "\u8BF7\u6C42 ID \u91CD\u590D" });
    if (signal.aborted || request.deadline <= Date.now()) return Promise.resolve({ ok: false, error: "\u8BF7\u6C42\u5DF2\u8FC7\u671F" });
    return new Promise((resolve) => {
      const cancel = () => this.finish(row, { ok: false, error: "CLI \u5DF2\u65AD\u5F00\u8FDE\u63A5" });
      const timer = setTimeout(() => this.finish(row, { ok: false, error: "\u7B49\u5F85\u754C\u9762\u5B8C\u6210\u5BFC\u822A\u8D85\u65F6, \u8BF7\u786E\u8BA4\u76EE\u6807\u5BBF\u4E3B\u5DF2\u5B89\u88C5\u63D2\u4EF6\u5E76\u6253\u5F00\u754C\u9762" }), request.deadline - Date.now());
      const row = { request, resolve, timer, startedAt: Date.now(), cleanup: () => signal.removeEventListener("abort", cancel) };
      signal.addEventListener("abort", cancel, { once: true });
      this.pending.push(row);
      this.log.info("\u63A5\u6536\u6253\u5F00\u8BF7\u6C42 %s, target=%s, path=%s", request.id, request.target, request.path);
      this.dispatch();
    });
  }
  poll(target, signal) {
    if (this.closed || signal.aborted) return Promise.resolve(null);
    this.presence.set(target, Date.now());
    if (this.waiters.size >= 32) return Promise.reject(new Error("\u524D\u7AEF\u8FDE\u63A5\u6570\u91CF\u8D85\u51FA\u9650\u5236"));
    return new Promise((resolve) => {
      const finish = () => {
        this.waiters.delete(waiter);
        waiter.cleanup();
        resolve(null);
      };
      const timer = setTimeout(finish, this.pollMs);
      const waiter = { target, resolve, cleanup: () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
      } };
      signal.addEventListener("abort", finish, { once: true });
      this.waiters.add(waiter);
      this.dispatch();
    });
  }
  acknowledge(ack) {
    const row = this.pending.find((row2) => row2.request.id === ack.id && row2.lease === ack.lease);
    if (!row || row.request.deadline <= Date.now()) return false;
    this.finish(row, ack.result);
    return true;
  }
  dispose() {
    this.closed = true;
    for (const row of [...this.pending]) this.finish(row, { ok: false, error: "\u63D2\u4EF6\u5DF2\u5378\u8F7D\u6216\u5BBF\u4E3B\u6B63\u5728\u5173\u95ED" });
    for (const waiter of this.waiters) {
      waiter.cleanup();
      waiter.resolve(null);
    }
    this.waiters.clear();
  }
  dispatch() {
    const row = this.pending[0];
    if (!row || row.lease || this.closed) return;
    const waiter = [...this.waiters].find((waiter2) => waiter2.target === row.request.target);
    if (!waiter) return;
    this.waiters.delete(waiter);
    waiter.cleanup();
    row.lease = randomUUID();
    this.log.debug("\u5411 %s \u524D\u7AEF\u5206\u53D1\u8BF7\u6C42 %s", waiter.target, row.request.id);
    waiter.resolve({ ...row.request, lease: row.lease });
  }
  finish(row, result) {
    const index = this.pending.indexOf(row);
    if (index < 0) return;
    this.pending.splice(index, 1);
    clearTimeout(row.timer);
    row.cleanup();
    if (result.ok) this.log.info("\u5B8C\u6210\u6253\u5F00\u8BF7\u6C42 %s, workspace=%s, \u8017\u65F6=%sms", row.request.id, result.workspaceId, Date.now() - row.startedAt);
    else this.log.warn("\u6253\u5F00\u8BF7\u6C42 %s \u5931\u8D25: %s", row.request.id, result.error);
    row.resolve(result);
    this.dispatch();
  }
};

// src/host/bridge.ts
import { createServer } from "node:http";
import { randomBytes, randomUUID as randomUUID2, timingSafeEqual } from "node:crypto";
import { mkdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join as join2 } from "node:path";
function respond(res, status, body2) {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body2));
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 16384) throw new Error("\u8BF7\u6C42\u4F53\u8D85\u8FC7 16 KiB");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function startBridge(broker, directory, log) {
  const token = randomBytes(32).toString("hex");
  const instance = randomUUID2();
  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      log.warn("CLI \u63A5\u53E3\u5931\u8D25: %s", errorMessage(error));
      respond(res, 400, { ok: false, error: errorMessage(error) });
    });
  });
  server.requestTimeout = 1e4;
  server.headersTimeout = 1e4;
  const endpoint = { version: 1, instance, pid: process.pid, port: 0, token };
  async function handle(req, res) {
    const auth = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (req.headers.origin !== void 0 || auth.length !== expected.length || !timingSafeEqual(auth, expected) || req.headers.host !== `127.0.0.1:${endpoint.port}`) {
      respond(res, 403, { ok: false, error: "\u62D2\u7EDD\u672A\u7ECF\u8BA4\u8BC1\u7684\u672C\u5730\u8BF7\u6C42" });
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      respond(res, 200, { version: 1, instance, pid: process.pid, targets: broker.targets });
      return;
    }
    if (req.method !== "POST" || req.url !== "/open") {
      respond(res, 404, { ok: false, error: "\u63A5\u53E3\u4E0D\u5B58\u5728" });
      return;
    }
    const value = await body(req);
    if (!record(value) || typeof value.id !== "string" || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.path !== "string" || value.path.length > 8192 || !isAbsolute(value.path) || !["desktop", "web"].includes(String(value.target)) || typeof value.deadline !== "number" || !Number.isFinite(value.deadline) || value.deadline <= Date.now() || value.deadline > Date.now() + 3e5) {
      throw new Error("\u6253\u5F00\u8BF7\u6C42\u683C\u5F0F\u4E0D\u6B63\u786E");
    }
    const canonical = await realpath(value.path);
    if (!(await stat(canonical)).isDirectory()) throw new Error("\u76EE\u6807\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55");
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once("close", abort);
    try {
      const result = await broker.submit({ ...value, path: canonical }, controller.signal);
      respond(res, result.ok ? 200 : 409, result);
    } finally {
      res.off("close", abort);
    }
  }
  let published = false;
  const file = join2(directory, `${instance}.json`);
  const dispose = async () => {
    broker.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
    if (published) {
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      published = false;
    }
    log.info("CLI \u672C\u5730\u63A5\u53E3\u5DF2\u5173\u95ED, instance=%s", instance);
  };
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    endpoint.port = server.address().port;
    await mkdir(directory, { recursive: true, mode: 448 });
    await writeFile(file, JSON.stringify(endpoint), { mode: 384, flag: "wx" });
    published = true;
    server.on("error", (error) => log.error("CLI \u672C\u5730\u63A5\u53E3\u5F02\u5E38: %s", errorMessage(error)));
    log.info("CLI \u672C\u5730\u63A5\u53E3\u5C31\u7EEA, instance=%s, port=%s", instance, endpoint.port);
    return { endpoint, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

// src/index.ts
var name = "dsh-open-dir";
var inject = ["connection"];
async function apply(ctx) {
  const broker = new Broker(ctx.logger);
  let startup;
  ctx.effect(() => async () => {
    broker.dispose();
    await startup?.then((bridge) => bridge.dispose(), () => {
    });
  }, "dsh-open-dir: CLI bridge lifetime");
  ctx.connection.fetch.register({
    path: `${API}/next`,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async (request) => {
      const target = new URL(request.url).searchParams.get("target");
      if (target !== "desktop" && target !== "web") return Response.json({ error: "target \u4E0D\u5408\u6CD5" }, { status: 400 });
      try {
        return Response.json(await broker.poll(target, request.signal));
      } catch (error) {
        return Response.json({ error: errorMessage(error) }, { status: 503 });
      }
    }
  });
  ctx.connection.fetch.register({
    path: `${API}/ack`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let value;
      try {
        value = await request.json();
      } catch {
        return Response.json({ error: "\u4E0D\u662F\u5408\u6CD5 JSON" }, { status: 400 });
      }
      if (!record(value) || typeof value.id !== "string" || typeof value.lease !== "string" || !isResult(value.result)) {
        return Response.json({ error: "\u786E\u8BA4\u683C\u5F0F\u4E0D\u5408\u6CD5" }, { status: 400 });
      }
      const accepted = broker.acknowledge({ id: value.id, lease: value.lease, result: value.result });
      return Response.json({ accepted }, { status: accepted ? 200 : 409 });
    }
  });
  startup = startBridge(broker, runtimeDirectory(), ctx.logger);
  await startup;
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
