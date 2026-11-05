// Package protocol 定义 CLI 与插件 Host 回环接口之间的协议, 需要与 src/shared/protocol.ts 保持一致.
package protocol

import (
	"crypto/rand"
	"fmt"
	"regexp"
)

// Version 是发现记录和 /health 响应的协议版本.
const Version = 1

// RuntimeName 是 $DSH_HOME/runtime 下本插件的发现目录名.
const RuntimeName = "dsh-open-dir"

// Target 表示目标界面.
type Target string

const (
	TargetDesktop Target = "desktop"
	TargetWeb     Target = "web"
)

var (
	instancePattern = regexp.MustCompile(`^[a-f0-9-]{36}$`)
	tokenPattern    = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// ValidInstance 判断实例 ID 是否符合 Host 生成的 UUID 格式.
func ValidInstance(value string) bool { return instancePattern.MatchString(value) }

// Endpoint 是 Host 写入发现目录的记录.
type Endpoint struct {
	Version  int    `json:"version"`
	Instance string `json:"instance"`
	PID      int    `json:"pid"`
	Port     int    `json:"port"`
	Token    string `json:"token"`
}

// Valid 校验发现记录字段, 不合法的记录直接忽略.
func (e Endpoint) Valid() bool {
	return e.Version == Version && ValidInstance(e.Instance) && tokenPattern.MatchString(e.Token) &&
		e.PID > 0 && e.Port > 0 && e.Port <= 65535
}

// Health 是 GET /health 的响应.
type Health struct {
	Version  int      `json:"version"`
	Instance string   `json:"instance"`
	PID      int      `json:"pid"`
	Targets  []Target `json:"targets"`
}

// OpenRequest 是 POST /open 的请求体, deadline 为毫秒时间戳.
type OpenRequest struct {
	ID       string `json:"id"`
	Path     string `json:"path"`
	Target   Target `json:"target"`
	Deadline int64  `json:"deadline"`
}

// OpenResult 是 POST /open 的响应, 指针字段用于区分缺失和零值.
type OpenResult struct {
	OK          *bool   `json:"ok"`
	WorkspaceID *string `json:"workspaceId"`
	Path        *string `json:"path"`
	Error       *string `json:"error"`
}

// Valid 按 ok 分支校验结果字段是否齐全.
func (r OpenResult) Valid() bool {
	if r.OK == nil {
		return false
	}
	if *r.OK {
		return r.WorkspaceID != nil && r.Path != nil
	}
	return r.Error != nil
}

// NewUUID 生成随机 UUID v4, 作为请求 ID.
func NewUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
