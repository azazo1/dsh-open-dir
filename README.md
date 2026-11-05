# dsh-open-dir

通过 `dsh-open <目录>` 在 DSH Desktop 中创建或复用工作区, 然后打开对应会话. CLI 在界面完成导航后才报告成功. 支持 DSH `>=0.2.0-rc.2 <0.3.0`.

仓库分为两部分, 安装后互不依赖:

- 插件: 仓库根目录的 TS 包, 通过 DSH 插件管理器安装.
- CLI: `cli/` 下的 Go 程序, 编译为单个 `dsh-open` 二进制, 只依赖本机 DSH 的运行时目录和回环接口.

## 使用

先在 Desktop 的插件管理器中安装并启用 `dsh-open-dir`. 从源码使用时, 运行 `just install`, `just verify`, `just pack`, 再通过插件管理器安装生成的压缩包. Desktop 与 Web 使用独立的 profile, 需要分别安装.

然后构建 CLI, 把生成的二进制复制到 PATH 中的任意目录:

```shell
just build-cli
cp .tmp/bin/dsh-open ~/.local/bin/
# 或者不克隆仓库, 直接安装到 go env GOBIN {
go install github.com/azazo1/dsh-open-dir/cli/cmd/dsh-open@latest
# }
dsh-open .
```

仓库内可直接运行, 无需安装全局命令:

```shell
just open .
just open ~/projects/my-project
just open --no-launch .
```

macOS 和 Windows 通过已注册的 `dsh://open` 协议唤起或前置 Desktop. 首次使用前需要启动 Desktop 一次以注册协议. 协议不可用时, 手动打开 Desktop 并使用 `--no-launch`.

Web 模式要求已运行的本机 Web 界面安装并启用插件, 且页面已加载:

```shell
just open --target web --no-launch .
just open --timeout 60 --verbose .
```

默认等待 30s, `--timeout` 可设为 1..300s. 同类 Host 有多个实例时, CLI 输出实例 ID, 用 `--instance <ID>` 明确选择. 同一个 Host 的多个页面只会有一个领取请求. 路径支持相对路径和 `~`, 会解析符号链接并验证目录. 目录名以 `-` 开头时使用 `--`.

## 通信与诊断

Host 在回环地址上申请随机端口, 向 `$DSH_HOME/runtime/dsh-open-dir` 写入当前实例的发现信息. 未设置 `DSH_HOME` 时使用 DSH 官方默认目录. 发现文件包含随机认证令牌, 使用权限 `0600`, 日志不输出令牌. CLI 与宿主必须使用相同的 `DSH_HOME`.

CLI 提交请求后等待 Client 确认. Client 通过 DSH 的认证 API 领取请求, 调用 `ctx.workspaces.create({ path })` 和 `ctx.uiWorkspace.openWorkspace(workspaceId)`. Desktop 的 `dsh-app` 协议负责将 Client API 转发到 Host. 请求只交付一次, ACK 可以重试, 断线后不会自动重放导航.

导航被其他操作取消, 目录不可用, 插件卸载或界面未就绪都会以非零退出码结束, 被 Ctrl-C 中断时退出码为 130. 超时表示没有收到成功确认, 不能保证界面没有发生变化. `--verbose` 或 `DSH_OPEN_DEBUG=1` 可输出 CLI 阶段诊断. Host 和 Client 使用 Cordis 日志记录请求生命周期.

宿主崩溃后可能留下发现记录. CLI 通过令牌和实例身份握手忽略过期记录, 正常卸载时只移除本实例的记录.

## 开发

```shell
just install
just verify
just pack
just test-cli
```

插件源码按 Host, Client 和共享协议划分, `lib/` 是构建产物, 发布和 Git 安装均直接使用, 不在安装时运行构建脚本. Go CLI 位于 `cli/`, 协议定义在 `cli/internal/protocol`, 修改 `src/shared/protocol.ts` 时需要同步. 测试覆盖队列交付与确认, 真实本地 HTTP 和 Go CLI 进程, Client 导航结果及 Loader 注册, `just test` 会先构建 Go CLI, 需要本机有 Go. Desktop 的实际安装和页面流程仍需在产品中验证.
