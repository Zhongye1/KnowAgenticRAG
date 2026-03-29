# 📦 RagMobile APK 打包指南

## 方案：EAS Cloud Build（推荐，无需 Java/Android Studio）

---

## 第一步：注册 Expo 账号

前往 [https://expo.dev](https://expo.dev) 免费注册，记住你的用户名。

---

## 第二步：安装 EAS CLI

```bash
npm install -g eas-cli
```

---

## 第三步：登录并初始化项目

```bash
cd KnowledgeRAG-GZHU/RagMobile

# 登录 Expo 账号
eas login

# 初始化 EAS（会自动填写 app.json 里的 projectId）
eas build:configure
```

> `eas build:configure` 会：
>
> - 在 expo.dev 上创建项目
> - 自动把 `projectId` 写入 `app.json`
> - 确认 `eas.json` 配置

---

## 第四步：修改后端地址

在打包前，**必须把 API 地址改成真实 IP**（手机访问不了 localhost）。

编辑 `src/utils/api.ts` 第一行：

```ts
// 改成你电脑的局域网 IP（cmd 中运行 ipconfig 查看）
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.xxx:8000";
```

或者用环境变量方式，在项目根目录新建 `.env`：

```env
EXPO_PUBLIC_API_URL=http://192.168.1.xxx:8000
```

> 💡 查看本机 IP：Windows 运行 `ipconfig`，找 "IPv4 地址"
>
> 如果要打包给别人用/生产环境，填你服务器的公网 IP 或域名：
> `EXPO_PUBLIC_API_URL=http://your-server.com:8000`

---

## 第五步：打包 APK

```bash
# 打包 Android APK（internal 分发，适合测试安装）
eas build -p android --profile preview
```

构建过程大约 **5~15 分钟**，全程在云端，本机无需操作。

完成后终端会显示：

```
✅ Build finished.
🤖 Android APK:
   https://expo.dev/artifacts/eas/xxxxxxxxxx.apk
```

直接点击链接下载 `.apk`，发给手机安装即可。

---

## 第六步（可选）：发布到 Google Play

如果需要发布到应用商店，改用生产构建（生成 `.aab`）：

```bash
eas build -p android --profile production
```

---

## 构建 Profile 说明

| Profile       | 格式   | 用途                           |
| ------------- | ------ | ------------------------------ |
| `preview`     | `.apk` | 测试用，直接安装到手机 ✅ 推荐 |
| `production`  | `.aab` | 发布 Google Play 商店          |
| `development` | `.apk` | 开发调试（含 dev client）      |

---

## 常见问题

### Q: 构建失败 "Project not found"

```bash
eas build:configure  # 重新初始化
```

### Q: 手机安装时提示"未知来源"

打开手机 **设置 → 安全 → 允许未知来源安装**，然后重新安装 APK。

### Q: 打开 App 后连不上后端

- 确认手机和电脑**在同一个 WiFi**
- 把 `api.ts` 里的 IP 改成电脑的局域网 IP
- 确认后端服务已启动：`uvicorn main:app --host 0.0.0.0 --port 8000`

### Q: 免费额度用完了怎么办

EAS 免费账号每月 **30 次**构建，一般够用。超出可以：

- 升级 EAS 付费计划
- 改用本地构建（需安装 JDK 17 + Android Studio）

---

## 本地构建备选方案

如果不想用云端，可以安装本地环境：

1. 下载安装 [JDK 17](https://adoptium.net/)
2. 下载安装 [Android Studio](https://developer.android.com/studio)
3. 配置环境变量 `ANDROID_HOME`
4. 运行：
   ```bash
   npx expo run:android --variant release
   # APK 输出目录：android/app/build/outputs/apk/release/
   ```
