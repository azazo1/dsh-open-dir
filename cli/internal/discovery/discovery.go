// Package discovery 扫描 Host 的发现记录, 并通过 /health 握手过滤过期或伪造的记录.
package discovery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/azazo1/dsh-open-dir/cli/internal/hostapi"
	"github.com/azazo1/dsh-open-dir/cli/internal/protocol"
)

const (
	maxRecords     = 128
	maxRecordBytes = 4096
	healthTimeout  = 700 * time.Millisecond
	pollInterval   = 250 * time.Millisecond
)

var recordPattern = regexp.MustCompile(`^[a-f0-9-]{36}\.json$`)

// Finder 在指定目录中查找支持目标界面的 Host 实例.
type Finder struct {
	Directory string
	Target    protocol.Target
	// Instance 非空时只考虑这个实例.
	Instance string
	Client   *http.Client
	Log      *slog.Logger
}

// Discover 返回当前所有可用的实例, 目录不存在时返回空结果.
func (f Finder) Discover(ctx context.Context) ([]protocol.Endpoint, error) {
	entries, err := os.ReadDir(f.Directory)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var files []string
	for _, entry := range entries {
		if recordPattern.MatchString(entry.Name()) {
			files = append(files, entry.Name())
		}
	}
	if len(files) > maxRecords {
		return nil, fmt.Errorf("发现记录超过 %d 个, 请清理本插件遗留的运行时记录", maxRecords)
	}
	candidates := make([]*protocol.Endpoint, len(files))
	var wg sync.WaitGroup
	for index, file := range files {
		if f.Instance != "" && file != f.Instance+".json" {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			endpoint, err := f.check(ctx, file)
			if err != nil {
				f.Log.Debug(fmt.Sprintf("忽略不可用的发现记录 %s: %v", file, err))
				return
			}
			candidates[index] = &endpoint
		}()
	}
	wg.Wait()
	var result []protocol.Endpoint
	for _, candidate := range candidates {
		if candidate != nil {
			result = append(result, *candidate)
		}
	}
	return result, nil
}

func (f Finder) check(ctx context.Context, file string) (protocol.Endpoint, error) {
	var endpoint protocol.Endpoint
	path := filepath.Join(f.Directory, file)
	info, err := os.Lstat(path)
	if err != nil {
		return endpoint, err
	}
	if !info.Mode().IsRegular() || info.Size() > maxRecordBytes {
		return endpoint, errors.New("不是普通文件或文件过大")
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		return endpoint, errors.New("文件权限过宽")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return endpoint, err
	}
	if err := json.Unmarshal(data, &endpoint); err != nil {
		return endpoint, err
	}
	if !endpoint.Valid() || file != endpoint.Instance+".json" {
		return endpoint, errors.New("记录字段不合法")
	}
	healthCtx, cancel := context.WithTimeout(ctx, healthTimeout)
	defer cancel()
	health, err := hostapi.Health(healthCtx, f.Client, endpoint)
	if err != nil {
		return endpoint, err
	}
	if health.Version != protocol.Version || health.Instance != endpoint.Instance || health.PID != endpoint.PID ||
		health.Targets == nil || !slices.Contains(health.Targets, f.Target) {
		return endpoint, errors.New("身份握手不匹配或不支持目标界面")
	}
	return endpoint, nil
}

// Wait 轮询直到恰好找到一个实例. 找到多个实例时报错, 要求用 --instance 选择.
func (f Finder) Wait(ctx context.Context) (protocol.Endpoint, error) {
	f.Log.Info(fmt.Sprintf("等待 %s 界面的插件通道就绪", f.Target))
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		candidates, err := f.Discover(ctx)
		if err != nil {
			return protocol.Endpoint{}, err
		}
		if len(candidates) > 1 {
			rows := make([]string, len(candidates))
			for index, row := range candidates {
				rows[index] = fmt.Sprintf("%s (pid=%d)", row.Instance, row.PID)
			}
			return protocol.Endpoint{}, fmt.Errorf("发现多个 %s Host 实例, 请用 --instance 选择: %s", f.Target, strings.Join(rows, ", "))
		}
		if len(candidates) == 1 {
			return candidates[0], nil
		}
		select {
		case <-ctx.Done():
			return protocol.Endpoint{}, ctx.Err()
		case <-ticker.C:
		}
	}
}
