# 品牌自定义

ARS 支持完整的品牌自定义，包括 Logo、组织名称、版权信息、登录协议等，方便企业用户进行品牌定制。

## 品牌信息配置

### 步骤 1：复制模板文件

```bash
cp backend/package/ars/config/static/info.template.yaml backend/package/ars/config/static/info.local.yaml
```

### 步骤 2：编辑品牌信息

在 `backend/package/ars/config/static/info.local.yaml` 中配置你的品牌信息：

- 应用名称
- 组织名称
- Logo
- 版权信息
- 登录页用户协议/隐私协议链接

### 步骤 3：指定配置文件

在 `.env` 中指定配置文件路径：

```env
ARS_BRAND_FILE_PATH=package/ars/config/static/info.local.yaml
```

::: tip 配置优先级
`info.local.yaml` > `info.template.yaml`（默认）
:::

## 登录协议配置

登录页支持从品牌配置中读取用户协议与隐私协议链接。

### 配置项

在 `backend/package/ars/config/static/info.local.yaml` 的 `footer` 下新增以下字段：

```yaml
footer:
  copyright: "© your org 2026"
  user_agreement_url: "/protocols/user-agreement.template.html"
  privacy_policy_url: "/protocols/privacy-policy.template.html"
```

### 显示规则

后端通过 `GET /api/system/info` 把 `footer` 交给前端，是否展示协议勾选项由前端决定：两个字段都有值时显示，任一为空时不显示，未勾选时提示用户先同意协议。当前负责展示的登录页位于 `web/`，协议勾选尚未随迁移落地。

### 协议模板文件

默认配置指向 `/protocols/user-agreement.template.html` 与 `/protocols/privacy-policy.template.html`，这两个文件由部署方提供：放进前端静态目录 `web/public/protocols/`（构建后位于站点根路径），或把上面两个字段改成自己的路径与外部链接。仓库内的 `web/public/` 只保留目录占位，不含协议正文。

### Icon 定制

前端图标来自 `lucide-react`，按需引入并保持尺寸一致。

## 样式定制

前端的颜色、字号、圆角与阴影集中在 `web/src/styles/tokens.css`：`:root` 是亮色取值，`.dark` 是暗色取值，随 `html.dark` 生效。主色刻度是 `--primary-1`（最浅）到 `--primary-7`（最深），`--primary-6` 是主色基准值。

颜色 Token 存的是 RGB 三元组而不是颜色字符串，因此引用时要包一层 `rgb()`：

```css
:root {
  --primary-6: 22 93 255;      /* 主色基准，等价于 #165DFF */
  --color-text-1: 29 33 41;    /* 正文主色 */
}
```

替换品牌色时改 `tokens.css` 里的 `--primary-*` 刻度，并保持三元组格式；业务代码只引用 Token，不写颜色字面量，`pnpm run check:tokens` 会拒绝硬编码颜色与 Tailwind 默认调色板类。

品牌标识里不随主题变化的固定配色（如第三方登录图标）放在 `web/src/styles/brand.css`，该校验脚本默认豁免该文件。

文档站的品牌色与主色刻度联动：`docs/.vitepress/theme/custom.css` 直接导入 `tokens.css` 并用 `rgb(var(--primary-6))` 等形式映射到 VitePress 变量。
