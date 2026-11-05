// Package args 解析命令行参数并规范化目标目录.
package args

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/azazo1/dsh-open-dir/cli/internal/paths"
	"github.com/azazo1/dsh-open-dir/cli/internal/protocol"
)

// Help 是 --help 输出的用法说明.
const Help = `用法: dsh-open [选项] [目录]

省略目录时打开当前目录, 成功退出前等待 DSH 界面完成工作区导航.

选项:
  --target desktop|web  选择界面, 默认 desktop
  --instance <ID>       选择具体 Host 实例, 有多个实例时使用
  --timeout <秒>        总等待时间, 默认 30, 范围 1..300
  --no-launch           不唤起 Desktop, 连接已经运行的实例
  --verbose             输出阶段和诊断日志, 也可设置 DSH_OPEN_DEBUG=1
  --help, -h            显示帮助
  --version             显示 CLI 版本
  --                    后面的参数按目录处理

示例:
  dsh-open .
  dsh-open ~/projects/my-project
  dsh-open --target web --no-launch .
`

// Action 表示本次调用要执行的动作.
type Action int

const (
	ActionOpen Action = iota
	ActionHelp
	ActionVersion
)

// Options 是解析后的命令行选项.
type Options struct {
	Path     string
	Target   protocol.Target
	Timeout  time.Duration
	Launch   bool
	Instance string
	Verbose  bool
	Action   Action
}

var secondsPattern = regexp.MustCompile(`^\d+$`)

// Parse 解析参数, 规则与原 TS 版 CLI 保持一致.
func Parse(argv []string) (Options, error) {
	result := Options{Path: ".", Target: protocol.TargetDesktop, Timeout: 30 * time.Second, Launch: true, Action: ActionOpen}
	positional, literal := false, false
	for index := 0; index < len(argv); index++ {
		arg := argv[index]
		take := func() (string, error) {
			index++
			if index >= len(argv) || argv[index] == "" || strings.HasPrefix(argv[index], "--") {
				return "", fmt.Errorf("%s 缺少参数", arg)
			}
			return argv[index], nil
		}
		if !literal {
			switch arg {
			case "--":
				literal = true
				continue
			case "--help", "-h":
				result.Action = ActionHelp
				continue
			case "--version":
				result.Action = ActionVersion
				continue
			case "--verbose":
				result.Verbose = true
				continue
			case "--no-launch":
				result.Launch = false
				continue
			case "--target":
				value, err := take()
				if err != nil {
					return result, err
				}
				if value != string(protocol.TargetDesktop) && value != string(protocol.TargetWeb) {
					return result, errors.New("--target 只能是 desktop 或 web")
				}
				result.Target = protocol.Target(value)
				continue
			case "--instance":
				value, err := take()
				if err != nil {
					return result, err
				}
				if !protocol.ValidInstance(value) {
					return result, errors.New("--instance 需要 Host 实例 UUID")
				}
				result.Instance = value
				continue
			case "--timeout":
				value, err := take()
				if err != nil {
					return result, err
				}
				seconds, convErr := strconv.Atoi(value)
				if !secondsPattern.MatchString(value) || convErr != nil || seconds < 1 || seconds > 300 {
					return result, errors.New("--timeout 需要 1..300 的整数秒数")
				}
				result.Timeout = time.Duration(seconds) * time.Second
				continue
			}
			if strings.HasPrefix(arg, "-") {
				return result, fmt.Errorf("未知选项 %s, 使用 --help 查看用法", arg)
			}
		}
		if positional {
			return result, errors.New("一次只能打开一个目录")
		}
		result.Path = arg
		positional = true
	}
	return result, nil
}

// CanonicalDirectory 展开 ~, 转为绝对路径并解析符号链接, 要求结果是目录.
func CanonicalDirectory(path string) (string, error) {
	expanded, err := paths.ExpandHome(path)
	if err != nil {
		return "", err
	}
	absolute, err := filepath.Abs(expanded)
	if err != nil {
		return "", err
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("无法访问目标路径 %s: %w", absolute, err)
	}
	info, err := os.Stat(canonical)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("目标路径不是目录")
	}
	return canonical, nil
}
