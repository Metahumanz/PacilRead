# macOS release

## 当前发布模式

当前 GitHub Release 的 macOS 包：

- 分别在原生 Apple Silicon 和 Intel runner 上构建 `arm64` 与 `x64`
- 使用 ad-hoc code signing（`identity: "-"`）
- 未经过 Apple notarization
- 不需要 Apple Developer Program 或 Developer ID 证书

首次运行时，macOS 可能会拦截应用。请按以下方式手动放行：

1. 将 PacilRead 拖入 `Applications`。
2. 尝试打开 PacilRead。
3. 如果 macOS 拦截，右键 PacilRead，选择“打开”。
4. 也可以进入“系统设置”→“隐私与安全性”，点击“仍要打开”。

`workflow_dispatch` 仅用于手动验证构建；正式 GitHub Release 仍只在 `v*.*.*` tag push 时发布。

## 未来正式模式

切换到 Developer ID 签名和 notarization 时，再配置以下 GitHub Actions secrets：

- `MAC_CSC_LINK`：base64 编码的 Developer ID Application `.p12` 证书
- `MAC_CSC_KEY_PASSWORD`：证书密码
- `APPLE_API_KEY`：base64 编码的 App Store Connect API key `.p8`
- `APPLE_API_KEY_ID`：App Store Connect key ID
- `APPLE_API_ISSUER`：App Store Connect issuer ID

这五项只在未来启用 Developer ID + notarization 时使用。该模式需要有效的 Apple Developer Program 会员资格和 Developer ID Application 证书，并可让 Electron Builder 自动提交 notarization。
