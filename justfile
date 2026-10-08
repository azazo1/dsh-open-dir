[private]
default:
    @just --list

# 安装项目依赖.
install:
    pnpm install

# 检查类型.
typecheck:
    pnpm typecheck

# 构建 Host 和独立 CLI.
build-host:
    pnpm build:host

# 构建 Client Loader 产物.
build-client:
    pnpm build:client

# 构建全部产物.
build:
    pnpm build

# 测试关键请求流程, 先构建当前产物.
test: build
    pnpm test

# 验证类型, 构建, 测试与发布包内容.
verify:
    pnpm check
    pnpm pack --dry-run

# just open . 或 just open --target web --no-launch .
# 从仓库运行 CLI, 不修改全局 PATH.
open *args:
    node lib/cli.js {{args}}

# 生成可安装的插件压缩包.
pack: build
    pnpm pack
