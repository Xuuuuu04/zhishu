# 构建指南

本文档说明如何在本地构建和打包「智枢 ZhiShu」为 macOS 原生应用。

## 前置要求

- **macOS**（构建 macOS 应用需要在 Mac 上执行）
- **Node.js 18+**
- **Xcode Command Line Tools**（`xcode-select --install`）
- 可选：`iconutil` / `sips` / `qlmanage`（全部是 macOS 系统自带，无需安装）

## 快速构建

```bash
# 1. 安装依赖
npm install

# 2. Rebuild node-pty against current Electron version
npm run rebuild-native

# 3. 生成 React 生产构建 + 打包为 .dmg / .zip / .app
npm run package
```

构建产物在 `dist/` 目录下：
- `智枢-1.0.0-arm64.dmg` — Apple Silicon (M1/M2/M3) 安装镜像
- `智枢-1.0.0.dmg` — Intel x64 安装镜像
- `mac-arm64/智枢.app` — Apple Silicon 未打包的 .app bundle
- `mac/智枢.app` — Intel x64 未打包的 .app bundle

## 图标工作流

应用图标从 `build-assets/icon.svg` 源文件开始，通过 macOS 系统工具链生成 `.icns`：

```bash
cd build-assets

# 1. SVG → 1024×1024 PNG (via macOS QuickLook)
qlmanage -t -s 1024 -o . icon.svg
mv icon.svg.png icon-1024.png

# 2. 生成 iconset (macOS 要求的多尺寸 PNG 集)
mkdir -p icon.iconset
sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
cp icon-1024.png  icon.iconset/icon_512x512@2x.png

# 3. iconset → .icns
iconutil -c icns icon.iconset -o icon.icns
```

`icon.icns` 是最终产物，被 `package.json` 的 `build.mac.icon` 引用。

**只修改 SVG 源文件**，然后重跑上面的脚本即可更新图标。iconset 中间产物和 icon-1024.png 已经在 `.gitignore` 里忽略，不会污染仓库。

## 安装到本机

构建完成后，把 .app 拖到 `/Applications`：

```bash
cp -R "dist/mac-arm64/智枢.app" /Applications/
```

或者打开 `.dmg` 用图形界面拖拽。

### 首次启动：绕过 Gatekeeper

因为应用**未经 Apple Developer 账号签名**，首次启动会被 macOS Gatekeeper 阻止：

1. 打开 Finder，找到 `/Applications/智枢.app`
2. **右键点击 → 选择"打开"**（不要双击！）
3. 弹窗点"**打开**"确认信任
4. 之后再次启动直接双击即可

## 打包配置细节

`package.json` 的 `build` 字段关键选项：

| 字段 | 值 | 说明 |
|---|---|---|
| `appId` | `com.zhishu.app` | macOS Launch Services 注册 ID |
| `productName` | `智枢` | 显示在 Dock / 菜单栏的应用名 |
| `mac.icon` | `build-assets/icon.icns` | 应用图标 |
| `mac.category` | `public.app-category.developer-tools` | 分类（用于 Launchpad / App Store）|
| `mac.target` | `dmg` + `zip` | 两种分发格式 |
| `mac.hardenedRuntime` | `false` | 不强化（开发模式）|
| `mac.identity` | `null` | 不签名 |
| `mac.darkModeSupport` | `true` | 原生支持系统深色模式 |

## 代码签名（生产发布）

如果要分发到非开发者用户（或上传 App Store），需要签名 + 公证：

1. 申请 [Apple Developer Program](https://developer.apple.com/programs/)（$99/年）
2. 在 Keychain Access 安装 Developer ID Application 证书
3. 在 `package.json` 的 `build.mac` 中设置 `identity: "Developer ID Application: Your Name (TEAM_ID)"`
4. 打开 `hardenedRuntime: true`
5. 添加 `notarize` 配置 + Apple ID 应用专用密码
6. 重新打包

详见 [electron-builder 公证文档](https://www.electron.build/code-signing.html)。
