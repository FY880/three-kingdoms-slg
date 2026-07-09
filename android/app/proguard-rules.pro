# 本项目 WebView 仅加载本地 HTML，无反射/原生混淆需求
# 保留 WebView 相关（默认即可，这里显式放行避免误伤）
-keep class android.webkit.** { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
