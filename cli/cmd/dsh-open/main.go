// dsh-open 在 DSH Desktop 或 Web 中打开指定目录对应的工作区.
//
// CLI 通过 $DSH_HOME/runtime/dsh-open-dir 中的发现记录找到 dsh-open-dir 插件的回环接口,
// 提交打开请求, 等界面完成导航后才以 0 退出.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"
	"time"

	"github.com/azazo1/dsh-open-dir/cli/internal/args"
	"github.com/azazo1/dsh-open-dir/cli/internal/discovery"
	"github.com/azazo1/dsh-open-dir/cli/internal/hostapi"
	"github.com/azazo1/dsh-open-dir/cli/internal/launch"
	"github.com/azazo1/dsh-open-dir/cli/internal/logx"
	"github.com/azazo1/dsh-open-dir/cli/internal/paths"
	"github.com/azazo1/dsh-open-dir/cli/internal/protocol"
)

// version 由构建脚本通过 -ldflags "-X main.version=..." 注入.
var version string

// exitCancelled 是被 Ctrl-C 或 SIGTERM 中断时的退出码.
const exitCancelled = 130

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(argv []string, stdout, stderr io.Writer) int {
	options, err := args.Parse(argv)
	if err != nil {
		return fail(stderr, err)
	}
	switch options.Action {
	case args.ActionHelp:
		fmt.Fprint(stdout, args.Help)
		return 0
	case args.ActionVersion:
		fmt.Fprintln(stdout, currentVersion())
		return 0
	}
	log := logx.New(stderr, options.Verbose || debugEnabled())
	path, err := args.CanonicalDirectory(options.Path)
	if err != nil {
		return fail(stderr, err)
	}
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(signalCtx, options.Timeout)
	defer cancel()
	err = open(ctx, options, path, log, stdout)
	switch {
	case err == nil:
		return 0
	case signalCtx.Err() != nil:
		return failWith(stderr, exitCancelled, errors.New("打开请求已取消"))
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return fail(stderr, fmt.Errorf("等待 %ds 后超时. 请确认 %s 已启动, 已安装并启用 dsh-open-dir, 且界面已经加载. CLI 和宿主必须使用相同的 DSH_HOME",
			int(options.Timeout/time.Second), options.Target))
	default:
		return fail(stderr, err)
	}
}

func open(ctx context.Context, options args.Options, path string, log *slog.Logger, stdout io.Writer) error {
	startedAt := time.Now()
	deadline, _ := ctx.Deadline()
	log.Info("目标目录已验证: " + path)
	if options.Target == protocol.TargetDesktop && options.Launch {
		log.Info("唤起 Desktop")
		if err := launch.WakeDesktop(ctx); err != nil {
			return fmt.Errorf("无法唤起 Desktop: %w. 可先手动打开 Desktop, 再用 --no-launch 重试", err)
		}
	}
	directory, err := paths.RuntimeDirectory()
	if err != nil {
		return err
	}
	log.Debug("发现目录: " + directory)
	client := hostapi.NewClient()
	finder := discovery.Finder{Directory: directory, Target: options.Target, Instance: options.Instance, Client: client, Log: log}
	endpoint, err := finder.Wait(ctx)
	if err != nil {
		return err
	}
	id, err := protocol.NewUUID()
	if err != nil {
		return err
	}
	log.Info(fmt.Sprintf("向 Host 提交打开请求, instance=%s, request=%s", endpoint.Instance, id))
	request := protocol.OpenRequest{ID: id, Path: path, Target: options.Target, Deadline: deadline.UnixMilli()}
	workspaceID, openedPath, err := hostapi.Open(ctx, client, endpoint, request)
	if err != nil {
		return err
	}
	log.Info(fmt.Sprintf("界面导航完成, workspace=%s, 耗时=%dms", workspaceID, time.Since(startedAt).Milliseconds()))
	fmt.Fprintf(stdout, "已打开工作区: %s\n", openedPath)
	return nil
}

func debugEnabled() bool {
	value := os.Getenv("DSH_OPEN_DEBUG")
	return value != "" && value != "0"
}

func currentVersion() string {
	if version != "" {
		return version
	}
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	return "dev"
}

func fail(stderr io.Writer, err error) int { return failWith(stderr, 1, err) }

func failWith(stderr io.Writer, code int, err error) int {
	fmt.Fprintf(stderr, "[error] %v\n", err)
	return code
}
