# 鹿大摸鱼站 V1.0

一个校园摸鱼小工具合集 —— 今天吃什么转盘、GPA 计算器（成绩单 xlsx 一键导入）、像素小鸟排行榜、浏览量统计。

**在线地址：https://luda-guide.pages.dev/**

![技术栈](https://img.shields.io/badge/React-TypeScript%20%2B%20Vite%20%2B%20Tailwind-0b7285)
![许可](https://img.shields.io/badge/license-代码%20MIT%20%2F%20内容%20CC--BY--NC--SA--4.0-a31e32)

## 功能一览

- 🔐 **校内邮箱注册与登录**：全站强制登录，可配置开放人大 `@ruc.edu.cn` 邮箱验证码注册；旧 KV 预置账号继续可用，注册默认关闭
- 🍜 **今天吃什么**：选择困难症救星，双校区 24 档口随机抽
- 🐤 **像素小鸟**：经典小游戏，登录后成绩自动上榜，前 50 名排行
- 🧮 **GPA 计算器**：4 分制实时换算，支持从教务系统导出成绩单（xlsx）一键导入，纯本地解析不上传
- 👀 **浏览量统计**：Vercount 公益计数，仅记录次数不收集个人信息
- 📱 **移动端适配**：窄屏布局、数字键盘、防 iOS 聚焦缩放

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS 3 + shadcn/ui；页面与工具在浏览器运行，登录、注册与排行榜使用 Cloudflare Pages Functions / Worker。

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

`dist/` 可用于静态页面预览；完整登录、注册与排行榜需要同时部署 Cloudflare Pages Functions 和 auth Worker，不能只上传静态文件。

## 数据来源与致谢

- **网页版制作：Hermann**

## ⚠️ 免责声明

本站为个人制作的非官方页面，与任何学校及机构无关；站内工具与内容仅供娱乐和参考，不构成任何建议，重要事项请以官方渠道信息为准。本网页免费共享，禁止商业用途；信息来源于网络，如有侵权请通过页面底部邮箱联系删除。

## 登录系统

未登录用户跳转 `/login`，可从登录页进入 `/register`，使用本人校内邮箱接收验证码后注册。验证码 10 分钟有效、60 秒重发冷却、最多 5 次错误尝试，一个邮箱一个账号；校友邮箱和非人大邮箱不支持注册。注册默认关闭，完成配置和真实收信验收后开启。旧账号仍用账号名与密码登录。登录态为 HMAC-SHA256 签名的 HttpOnly Cookie，保留 7 天，访问 `/logout` 退出。

**没有域名的免费配置、开关及验收步骤见 [校内邮箱注册说明](docs/email-registration.md)。** 免费发信采用 Brevo，每日服务商配额以官方套餐为准；本模块另限制任意连续 24 小时最多 250 次发信尝试。

架构：

- `functions/_middleware.ts`：Pages Functions 中间件，访问控制、登录表单、注册代理、`/api/me` 当前用户
- `server/registration.ts`：注册页面与 Pages 请求签名
- `auth-worker/`：Cloudflare Worker；KV 保留旧账号与排行榜，SQLite Durable Object 保存新账号、邮箱索引、验证码与限流计数
- 密码使用 PBKDF2-SHA256 10 万次迭代与随机盐；两边共享 `SESSION_SECRET` 签名会话及注册代理请求

所需环境变量（按部署位置配置，密钥以 Secret 保存，不入库）：

| 位置 | 变量 | 说明 |
|---|---|---|
| Pages 项目 | `AUTH_API` | auth Worker 地址 |
| Pages 项目 | `SESSION_SECRET` | 会话签名密钥 |
| Worker | `SESSION_SECRET` | 同上（与 Pages 一致） |
| Pages / Worker | `REGISTRATION_ENABLED` | 字符串 `true` 开启注册；默认/关闭为 `false` |
| Worker | `BREVO_API_KEY` | Brevo 事务邮件 API key，Secret |
| Worker | `MAIL_FROM` | 本人控制且在 Brevo 已验证的发件邮箱，Secret |

## 许可证

本项目采用**双许可**：

| 范围 | 协议 | 说明 |
|---|---|---|
| 代码（`src/components`、`src/hooks`、样式、构建配置等） | [MIT](LICENSE) | 可自由使用、修改、商用 |
| 内容（[`src/data/`](src/data) 下全部文字数据） | [CC BY-NC-SA 4.0](LICENSE-CONTENT) | 署名、**禁止商用**、衍生内容同协议共享 |

详见 [LICENSE](LICENSE) 与 [LICENSE-CONTENT](LICENSE-CONTENT)。
