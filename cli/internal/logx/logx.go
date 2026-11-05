// Package logx 提供 CLI 的 stderr 日志输出, 格式为 "[level] message".
package logx

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
)

type handler struct {
	mu    *sync.Mutex
	out   io.Writer
	level slog.Level
	attrs []slog.Attr
}

// New 创建日志器. verbose 为 true 时输出 debug 及以上级别, 否则只输出 warn 和 error.
func New(out io.Writer, verbose bool) *slog.Logger {
	level := slog.LevelWarn
	if verbose {
		level = slog.LevelDebug
	}
	return slog.New(&handler{mu: &sync.Mutex{}, out: out, level: level})
}

func (h *handler) Enabled(_ context.Context, level slog.Level) bool { return level >= h.level }

func (h *handler) Handle(_ context.Context, record slog.Record) error {
	var line strings.Builder
	fmt.Fprintf(&line, "[%s] %s", strings.ToLower(record.Level.String()), record.Message)
	write := func(attr slog.Attr) bool {
		fmt.Fprintf(&line, " %s=%v", attr.Key, attr.Value.Any())
		return true
	}
	for _, attr := range h.attrs {
		write(attr)
	}
	record.Attrs(write)
	line.WriteByte('\n')
	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := io.WriteString(h.out, line.String())
	return err
}

func (h *handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := *h
	next.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	return &next
}

// WithGroup 对 CLI 无意义, 直接返回自身.
func (h *handler) WithGroup(string) slog.Handler { return h }
