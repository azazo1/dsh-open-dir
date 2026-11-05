[private]
default:
    @just --list

# 安装项目依赖.
install:
    pnpm install

# 检查类型.
typecheck:
    pnpm typecheck

# 构建 Host 和类型声明.
build-host:
    pnpm build:host

# 构建 Client Loader 产物.
build-client:
    pnpm build:client

# 构建插件全部产物, 不含 Go CLI.
build:
    pnpm build

# 产物可复制到 PATH 中的任意目录, 之后与本仓库无关.
# 构建 Go CLI 到 .tmp/bin/dsh-open.
build-cli:
    pnpm build:cli

# 运行 Go CLI 的 vet 和单元测试.
test-cli:
    pnpm test:cli

# 测试关键请求流程, 先构建插件产物, Go CLI 由 pnpm test 构建.
test: build
    pnpm test

# 验证类型, 构建, 测试与发布包内容.
verify:
    pnpm check
    pnpm pack --dry-run

# just open . 或 just open --target web --no-launch .
# 从仓库构建并运行 Go CLI, 不修改全局 PATH.
open *args: build-cli
    {{ justfile_directory() / ".tmp" / "bin" / "dsh-open" }}{{ if os_family() == "windows" { ".exe" } else { "" } }} {{args}}

# 生成可安装的插件压缩包.
pack: build
    pnpm pack
