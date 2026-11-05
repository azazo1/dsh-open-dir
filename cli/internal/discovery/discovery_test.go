package discovery

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/azazo1/dsh-open-dir/cli/internal/hostapi"
	"github.com/azazo1/dsh-open-dir/cli/internal/protocol"
)

const (
	instanceA = "11111111-1111-4111-8111-111111111111"
	instanceB = "22222222-2222-4222-8222-222222222222"
	token     = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

// fakeHost 启动只认可指定实例的 /health, 返回对应的发现记录.
func fakeHost(t *testing.T, instance string) protocol.Endpoint {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token || r.URL.Path != "/health" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_ = json.NewEncoder(w).Encode(protocol.Health{Version: 1, Instance: instance, PID: 42, Targets: []protocol.Target{"web"}})
	}))
	t.Cleanup(server.Close)
	_, port, err := net.SplitHostPort(server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	value, err := strconv.Atoi(port)
	if err != nil {
		t.Fatal(err)
	}
	return protocol.Endpoint{Version: 1, Instance: instance, PID: 42, Port: value, Token: token}
}

func writeRecord(t *testing.T, directory, name string, endpoint protocol.Endpoint, mode os.FileMode) {
	t.Helper()
	data, err := json.Marshal(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, data, mode); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}
}

func newFinder(directory string, target protocol.Target, instance string) Finder {
	return Finder{Directory: directory, Target: target, Instance: instance, Client: hostapi.NewClient(),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func discover(t *testing.T, f Finder) []protocol.Endpoint {
	t.Helper()
	found, err := f.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func TestDiscoverFiltersRecords(t *testing.T) {
	valid := fakeHost(t, instanceA)

	if found := discover(t, newFinder(filepath.Join(t.TempDir(), "absent"), "web", "")); len(found) != 0 {
		t.Fatalf("目录不存在时应返回空结果: %v", found)
	}

	directory := t.TempDir()
	writeRecord(t, directory, instanceA+".json", valid, 0o600)
	// 伪造实例: 端口指向 instanceA 的 Host, /health 返回的实例 ID 对不上.
	forged := valid
	forged.Instance = instanceB
	writeRecord(t, directory, instanceB+".json", forged, 0o600)
	// 文件名与记录中的实例不一致.
	writeRecord(t, directory, "33333333-3333-4333-8333-333333333333.json", valid, 0o600)
	writeRecord(t, directory, "unrelated.json", valid, 0o600)

	found := discover(t, newFinder(directory, "web", ""))
	if len(found) != 1 || found[0].Instance != instanceA {
		t.Fatalf("只应保留握手通过的 instanceA: %v", found)
	}
	if found := discover(t, newFinder(directory, "desktop", "")); len(found) != 0 {
		t.Fatalf("Host 不支持 desktop, 不应返回实例: %v", found)
	}

	if runtime.GOOS != "windows" {
		loose := t.TempDir()
		writeRecord(t, loose, instanceA+".json", valid, 0o644)
		if found := discover(t, newFinder(loose, "web", "")); len(found) != 0 {
			t.Fatalf("权限过宽的记录应被忽略: %v", found)
		}
	}
}

func TestWaitRequiresExplicitInstance(t *testing.T) {
	directory := t.TempDir()
	writeRecord(t, directory, instanceA+".json", fakeHost(t, instanceA), 0o600)
	writeRecord(t, directory, instanceB+".json", fakeHost(t, instanceB), 0o600)

	_, err := newFinder(directory, "web", "").Wait(context.Background())
	if err == nil || !strings.Contains(err.Error(), instanceA) || !strings.Contains(err.Error(), instanceB) {
		t.Fatalf("多实例时应报错并列出两个实例: %v", err)
	}
	endpoint, err := newFinder(directory, "web", instanceB).Wait(context.Background())
	if err != nil || endpoint.Instance != instanceB {
		t.Fatalf("指定 --instance 后应返回 instanceB: %v, %v", endpoint, err)
	}
}
