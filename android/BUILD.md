# 三国 SLG · Android APK 构建指南

本项目是**单文件 H5 游戏**（已打包进 `app/src/main/assets/www/index.html`），用 Android **原生 WebView** 加载，离线即可玩，无需任何服务器。

## 方式一：Android Studio（最简单，推荐）

1. 安装 [Android Studio](https://developer.android.com/studio)（自带 SDK + Gradle，无需额外配置）
2. `File → Open` → 选择本 `android/` 目录
3. 等待 Gradle 同步完成（首次会自动下载依赖，需联网）
4. 菜单 `Build → Build Bundle(s) / APK(s) → Build APK(s)`
5. 编译完成后点击通知里的 **locate**，得到 `app/build/outputs/apk/debug/app-debug.apk`
6. 把 `app-debug.apk` 传到手机，允许「未知来源」安装即可游玩

> 想发布到应用商店？`Build → Generate Signed Bundle / APK`，按向导创建签名密钥（keystore）即可生成 release APK / AAB。

## 方式二：命令行（需自备 Android SDK）

```bash
cd android
export ANDROID_HOME=/你的/sdk/路径
./gradlew assembleDebug        # 生成 debug APK
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

## 重新打包游戏（改了代码后）

游戏本体在 `../dist/index.standalone.html`，更新它后需同步进 assets：

```bash
# 在仓库根目录
node tools/build-standalone.js
cp dist/index.standalone.html android/app/src/main/assets/www/index.html
```

然后在 Android Studio 里重新 Build。

## 已配置要点

- 包名 `com.tk.slg`，竖屏 `portrait`，targetSdk 34，minSdk 21（Android 5.0+）
- WebView 已开启 JS / 本地存储 / 文件访问（游戏必需）
- 关闭系统缩放（游戏自带双指缩放），开启**沉浸式全屏**（隐藏状态栏+导航栏）
- 返回键：先退 WebView 历史，再退出 App
- 启动即加载 `file:///android_asset/www/index.html`，**完全离线**

## 图标

`mipmap-*` 已生成（深蓝底 + 金环 + 三竖旗）。若要更高清，可用 512 原图在 Android Studio 右键 `New → Image Asset` 重新生成。
