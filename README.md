# 鹿大摸鱼站 V1.0

一个校园摸鱼小工具合集 —— 今天吃什么转盘、GPA 计算器（成绩单 xlsx 一键导入）、像素小鸟排行榜、浏览量统计。

**在线地址：https://luda-guide.pages.dev/**

![技术栈](https://img.shields.io/badge/React-TypeScript%20%2B%20Vite%20%2B%20Tailwind-0b7285)
![许可](https://img.shields.io/badge/license-代码%20MIT%20%2F%20内容%20CC--BY--NC--SA--4.0-a31e32)

## 功能一览

- 🔐 **邀请制访问**：全站强制登录，不开放注册，账号由站长在 Cloudflare KV 预置（仅 hello_world）
- 🍜 **今天吃什么**：选择困难症救星，双校区 24 档口随机抽
- 🐤 **像素小鸟**：经典小游戏，登录后成绩自动上榜，前 50 名排行
- 🧮 **GPA 计算器**：4 分制实时换算，支持从教务系统导出成绩单（xlsx）一键导入，纯本地解析不上传
- 👀 **浏览量统计**：Vercount 公益计数，仅记录次数不收集个人信息
- 📱 **移动端适配**：窄屏布局、数字键盘、防 iOS 聚焦缩放

## 技术栈

React 18 + TypeScript + Vite + Tailwind CSS 3 + shadcn/ui，纯前端静态站，数据全部本地加载。

## 本地运行

```bash
npm install
npm run dev        # 开发服务器（默认 3000 端口）
npm run build      # 生产构建 → dist/
```

## 部署（Cloudflare Pages）

```bash
npm run build
npx wrangler pages deploy dist --project-name=luda-guide
```

任何静态托管（GitHub Pages / Vercel / Netlify / OSS）均可直接部署 `dist/` 目录。

## 数据来源与致谢

- **网页版制作：Hermann**

## ⚠️ 免责声明

本站为个人制作的非官方页面，与任何学校及机构无关；站内工具与内容仅供娱乐和参考，不构成任何建议，重要事项请以官方渠道信息为准。本网页免费共享，禁止商业用途；信息来源于网络，如有侵权请通过页面底部邮箱联系删除。

## 登录系统

游客可直接浏览全站；导航栏可进入「登录 / 注册」页——随意输入名称（要求合法合规），**未注册的名称会自动注册**，已注册则校验密码登录。登录态为 HMAC-SHA256 签名的 HttpOnly Cookie，保留 7 天，访问 `/logout` 退出。

架构：

- `functions/_middleware.ts`：Pages Functions 中间件，游客放行、`/login` 表单、`/api/me` 当前用户
- `auth-worker/`：Cloudflare Worker + KV，负责注册/登录（PBKDF2-SHA256 10 万次迭代存储密码哈希）与防爆破锁定
- 密码经 Worker 校验，不进入本仓库；两边共享 `SESSION_SECRET` 签名会话

所需环境变量（均通过 `wrangler secret put` 配置，不入库）：

| 位置 | 变量 | 说明 |
|---|---|---|
| Pages 项目 | `AUTH_API` | auth Worker 地址 |
| Pages 项目 | `SESSION_SECRET` | 会话签名密钥 |
| Worker | `SESSION_SECRET` | 同上（与 Pages 一致） |

## 许可证

本项目采用**双许可**：

| 范围 | 协议 | 说明 |
|---|---|---|
| 代码（`src/components`、`src/hooks`、样式、构建配置等） | [MIT](LICENSE) | 可自由使用、修改、商用 |
| 内容（[`src/data/`](src/data) 下全部文字数据） | [CC BY-NC-SA 4.0](LICENSE-CONTENT) | 署名、**禁止商用**、衍生内容同协议共享 |

详见 [LICENSE](LICENSE) 与 [LICENSE-CONTENT](LICENSE-CONTENT)。
