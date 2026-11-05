// Package paths 复刻 @deepseek-ai/dsh-home-paths 中 CLI 用到的路径规则.
package paths

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/azazo1/dsh-open-dir/cli/internal/protocol"
)

// ExpandHome 展开开头的 ~, 支持 ~/ 和 ~\ 两种写法.
func ExpandHome(path string) (string, error) {
	if path != "~" && !strings.HasPrefix(path, "~/") && !strings.HasPrefix(path, `~\`) {
		return path, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	if path == "~" {
		return home, nil
	}
	return filepath.Join(home, path[2:]), nil
}

// DshHome 优先使用非空的 DSH_HOME 环境变量, 否则使用 ~/.dsh.
func DshHome() (string, error) {
	configured := os.Getenv("DSH_HOME")
	if strings.TrimSpace(configured) == "" {
		configured = filepath.Join("~", ".dsh")
	}
	expanded, err := ExpandHome(configured)
	if err != nil {
		return "", err
	}
	return filepath.Abs(expanded)
}

// RuntimeDirectory 返回 Host 写入发现记录的目录.
func RuntimeDirectory() (string, error) {
	home, err := DshHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "runtime", protocol.RuntimeName), nil
}
