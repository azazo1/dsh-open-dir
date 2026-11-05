package args

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParse(t *testing.T) {
	options, err := Parse(nil)
	if err != nil || options.Path != "." || options.Target != "desktop" || options.Timeout != 30*time.Second || !options.Launch {
		t.Fatalf("默认值不正确: %+v, %v", options, err)
	}
	options, err = Parse([]string{"--", "-directory"})
	if err != nil || options.Path != "-directory" {
		t.Fatalf("-- 之后应按目录处理: %+v, %v", options, err)
	}
	options, err = Parse([]string{"--target", "web", "--timeout", "300", "--no-launch", "dir"})
	if err != nil || options.Target != "web" || options.Timeout != 300*time.Second || options.Launch || options.Path != "dir" {
		t.Fatalf("合法参数解析错误: %+v, %v", options, err)
	}
	invalid := [][]string{
		{"--timeout", "NaN"},
		{"--timeout", "0"},
		{"--timeout", "301"},
		{"--timeout", "+5"},
		{"--timeout"},
		{"--target", "other"},
		{"--target", "--verbose"},
		{"--instance", "not-a-uuid"},
		{"--unknown"},
		{"one", "two"},
	}
	for _, argv := range invalid {
		if _, err := Parse(argv); err == nil {
			t.Errorf("参数 %q 应当报错", argv)
		}
	}
}

func TestCanonicalDirectory(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "file.txt")
	if err := os.WriteFile(file, []byte("data"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := CanonicalDirectory(file); err == nil {
		t.Error("普通文件应当被拒绝")
	}
	if _, err := CanonicalDirectory(filepath.Join(root, "absent")); err == nil {
		t.Error("不存在的路径应当被拒绝")
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(root, link); err != nil {
		t.Skipf("无法创建符号链接: %v", err)
	}
	got, err := CanonicalDirectory(link)
	if err != nil || got != root {
		t.Fatalf("符号链接应解析为真实路径 %s, 实际 %s, %v", root, got, err)
	}
}
