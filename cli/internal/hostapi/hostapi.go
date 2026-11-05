// Package hostapi 访问插件 Host 在回环地址上开放的 CLI 接口.
package hostapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/azazo1/dsh-open-dir/cli/internal/protocol"
)

const maxResponseBytes = 64 << 10

// NewClient 创建只访问回环接口的 HTTP 客户端: 不走代理, 拒绝重定向.
func NewClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	return &http.Client{
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("Host 接口不允许重定向")
		},
	}
}

func address(endpoint protocol.Endpoint, route string) string {
	return "http://127.0.0.1:" + strconv.Itoa(endpoint.Port) + route
}

func send(ctx context.Context, client *http.Client, endpoint protocol.Endpoint, method, route string, body any) (*http.Response, []byte, error) {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, address(endpoint, route), reader)
	if err != nil {
		return nil, nil, err
	}
	request.Header.Set("Authorization", "Bearer "+endpoint.Token)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes))
	if err != nil {
		return nil, nil, err
	}
	return response, data, nil
}

// Health 请求 /health, 只返回 HTTP 成功且能解析的结果.
func Health(ctx context.Context, client *http.Client, endpoint protocol.Endpoint) (protocol.Health, error) {
	var health protocol.Health
	response, data, err := send(ctx, client, endpoint, http.MethodGet, "/health", nil)
	if err != nil {
		return health, err
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return health, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	if err := json.Unmarshal(data, &health); err != nil {
		return health, err
	}
	return health, nil
}

// Open 提交打开请求, 一直等到 Host 收到界面的确认或请求失败.
func Open(ctx context.Context, client *http.Client, endpoint protocol.Endpoint, request protocol.OpenRequest) (workspaceID, path string, err error) {
	response, data, err := send(ctx, client, endpoint, http.MethodPost, "/open", request)
	if err != nil {
		return "", "", err
	}
	var result protocol.OpenResult
	if json.Unmarshal(data, &result) != nil || !result.Valid() {
		return "", "", fmt.Errorf("Host 返回了不合法的结果: HTTP %d", response.StatusCode)
	}
	if !*result.OK {
		return "", "", errors.New(*result.Error)
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return "", "", fmt.Errorf("Host 确认失败: HTTP %d", response.StatusCode)
	}
	return *result.WorkspaceID, *result.Path, nil
}
