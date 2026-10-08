"use strict";
(() => {
  // src/shared/protocol.ts
  var PACKAGE_NAME = "dsh-open-dir";
  var API = "/api/plugins/azazo1-open-dir";
  function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isDelivery(value) {
    return record(value) && typeof value.id === "string" && typeof value.path === "string" && (value.target === "desktop" || value.target === "web") && typeof value.lease === "string" && typeof value.deadline === "number" && Number.isFinite(value.deadline);
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  // src/client/runner.ts
  var inject = ["workspaces", "uiWorkspace"];
  async function navigate(ctx, delivery, signal) {
    const check = () => {
      signal.throwIfAborted();
      if (Date.now() >= delivery.deadline) throw new Error("\u6253\u5F00\u8BF7\u6C42\u5DF2\u8FC7\u671F");
    };
    try {
      check();
      const workspace = await ctx.workspaces.create({ path: delivery.path });
      check();
      let opened = false;
      await ctx.uiWorkspace.openWorkspace(workspace.workspaceId, () => {
        check();
        opened = true;
      });
      if (!opened) throw new Error("\u5DE5\u4F5C\u533A\u5BFC\u822A\u88AB\u5176\u4ED6\u64CD\u4F5C\u53D6\u6D88");
      return { ok: true, workspaceId: workspace.workspaceId, path: workspace.path };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }
  function pause(ms, signal) {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  async function runClient(ctx, target, signal, log, send = fetch) {
    let backoff = 500;
    while (!signal.aborted) {
      try {
        const response = await send(`${API}/next?target=${target}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(25e3)]), cache: "no-store" });
        if (!response.ok) throw new Error(`\u9886\u53D6\u8BF7\u6C42\u5931\u8D25: HTTP ${response.status}`);
        const value = await response.json();
        if (value === null) {
          backoff = 500;
          continue;
        }
        if (!isDelivery(value)) throw new Error("Host \u8FD4\u56DE\u4E86\u4E0D\u5408\u6CD5\u7684\u6253\u5F00\u8BF7\u6C42");
        log.info("\u5F00\u59CB\u6253\u5F00\u76EE\u5F55, request=%s, path=%s", value.id, value.path);
        const result = await navigate(ctx, value, signal);
        while (!signal.aborted && Date.now() < value.deadline) {
          try {
            const ack = await send(`${API}/ack`, {
              method: "POST",
              signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(5e3, value.deadline - Date.now())))]),
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: value.id, lease: value.lease, result })
            });
            if (ack.status === 409) {
              log.warn("\u6253\u5F00\u786E\u8BA4\u5DF2\u7ECF\u8FC7\u671F, request=%s", value.id);
              break;
            }
            if (!ack.ok) throw new Error(`\u53D1\u9001\u786E\u8BA4\u5931\u8D25: HTTP ${ack.status}`);
            log.info("\u5DE5\u4F5C\u533A\u6253\u5F00\u7ED3\u679C\u5DF2\u786E\u8BA4, request=%s, ok=%s", value.id, result.ok);
            break;
          } catch (error) {
            if (signal.aborted) break;
            log.warn("\u6253\u5F00\u786E\u8BA4\u6682\u65F6\u672A\u9001\u8FBE: %s", errorMessage(error));
            await pause(500, signal);
          }
        }
        backoff = 500;
      } catch (error) {
        if (signal.aborted) return;
        log.warn("\u6253\u5F00\u76EE\u5F55\u901A\u9053\u6682\u65F6\u4E0D\u53EF\u7528: %s", errorMessage(error));
        await pause(backoff, signal);
        backoff = Math.min(backoff * 2, 5e3);
      }
    }
  }

  // src/client/index.ts
  window.__ModuleLoader__.load({
    id: PACKAGE_NAME,
    factory: () => ({
      inject,
      apply(ctx) {
        const target = location.protocol === "dsh-app:" ? "desktop" : "web";
        ctx.effect(() => {
          const lifetime = new AbortController();
          ctx.logger.info("\u76EE\u5F55\u6253\u5F00\u901A\u9053\u5DF2\u542F\u52A8, target=%s", target);
          void runClient(ctx, target, lifetime.signal, ctx.logger).catch((error) => ctx.logger.error("\u76EE\u5F55\u6253\u5F00\u901A\u9053\u5F02\u5E38\u9000\u51FA: %s", errorMessage(error)));
          return () => lifetime.abort();
        }, "dsh-open-dir: client request loop");
      }
    })
  });
})();
//# sourceMappingURL=client.js.map
