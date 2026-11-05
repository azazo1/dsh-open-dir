// Package launch 通过已注册的 dsh:// 协议唤起或前置 Desktop.
package launch

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// WakeDesktop 只打开固定的协议地址, 目录不会进入命令行或协议 URL.
func WakeDesktop(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.CommandContext(ctx, "open", "dsh://open")
	case "windows":
		command = exec.CommandContext(ctx, "rundll32.exe", "url.dll,FileProtocolHandler", "dsh://open")
	default:
		command = exec.CommandContext(ctx, "xdg-open", "dsh://open")
	}
	output, err := command.CombinedOutput()
	if err != nil {
		if text := strings.TrimSpace(string(output)); text != "" {
			return fmt.Errorf("%w: %s", err, text)
		}
		return err
	}
	return nil
}
