# 人大校内邮箱注册：免费配置与验收

本分支增加 `/register`，流程为：输入校内邮箱 → 接收六位验证码 → 设置账号名和密码 → 自动登录。登录仍使用账号名与密码，原 KV 预置账号可继续登录。仅允许精确的 `@ruc.edu.cn` 后缀；校友邮箱 `@alu.ruc.edu.cn` 不在范围内。邮箱验证证明收件能力，不等同于学校官方学籍认证。

当前提交默认关闭新注册，避免未配置发信服务就让用户提交邮箱。本功能在此前的认证鲁棒性 PR #4 上开发，请先合并 #4，再合并本 PR。

## 免费方案（核实于 2026-10-06）

- 邮件：Brevo Free，官方列出每天 300 封，包含事务邮件、不要求信用卡。本模块限制为任意连续 24 小时最多 250 次发信尝试，为其他邮件及服务商配额预留余量。建议专用免费账号，不购买短信、付费配额或升级套餐。
- 后端：沿用 Cloudflare Workers + Pages，新增 SQLite Durable Object，Workers Free 支持此类型。不要选择仅付费支持的旧 KV 后端 Durable Object。免费套餐有请求/存储上限，超出时服务会失败，不能保证任意访问量下均可用。
- 域名：可继续用 `pages.dev` / `workers.dev`。没有自有发信域名时，先用本人可收信的普通邮箱在 Brevo 验证发件人。Brevo 对未认证域名可能改写发件地址；这不是永久投递保证。开通后必须实测人大收信，若服务商要求域名认证或学校拒收，则先保持注册关闭，不能靠伪造 `ruc.edu.cn` 发件人绕过。以后有域名再按 Brevo 指引配 DKIM/DMARC。

不要求同学提供学校邮箱密码，服务端只发送验证码。

## 1. 免费开通发信

1. 在 [Brevo](https://www.brevo.com/) 注册 Free 账号，完成账号验证及事务邮件发送的启用流程。若控制台要求审核，请按提示完成后再继续。
2. 在设置的 **Senders, Domains & Dedicated IPs → Senders** 添加本人控制的发件邮箱，完成收到的确认验证码。无需购买域名就可先验证一个发件人；最终能否正常收信以实际测试为准。
3. 在 **SMTP & API → API Keys** 创建 API key。代码使用 API key，不使用 SMTP key。不要把密钥贴到仓库、PR 或聊天截图中。
4. 保持免费套餐。验证码为纯文本事务邮件，不导入营销联系人，不发送广告。

## 2. 配置 auth Worker

在 `auth-worker` 目录操作（下面使用 Wrangler，首次可能要求登录 Cloudflare）：

```sh
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put MAIL_FROM
# 如尚未设置会话密钥，设置一个足够长的随机值，并在 Pages 使用相同值：
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

`MAIL_FROM` 填写刚在 Brevo 验证的完整发件邮箱，例如自己的 QQ 邮箱。不要填写虚构地址或未经验证的校内地址。

保留 `wrangler.toml` 中已有的 `USERS` KV binding 和 ID，这样旧账号及排行榜仍可用。新账号保存在 `REGISTRATION` SQLite Durable Object；迁移 `new_sqlite_classes` 会创建此类存储。现有项目如果已有其他迁移，应保留旧迁移并追加本次迁移，不重置存储。

默认 `REGISTRATION_ENABLED = "false"`。准备验收时将 Worker 的该变量设为字符串 `"true"` 后重新部署；如要关闭入口，改回 `"false"`。关闭注册仍允许已经注册的账号登录。

## 3. 配置 Pages

在 Cloudflare Pages 项目设置里，配置生产环境以及需要使用的预览环境：

| 变量 | 值 |
| --- | --- |
| `AUTH_API` | 已部署 auth Worker 的 HTTPS 地址，不带末尾 `/` |
| `SESSION_SECRET` | 与 auth Worker 相同的会话密钥，以 Secret 保存 |
| `REGISTRATION_ENABLED` | 字符串 `true`；关闭注册时为 `false` |

重新构建、部署 Pages，使 `functions/_middleware.ts` 生效。构建命令仍为 `npm run build`，输出目录 `dist`。此登录/注册功能需要 Cloudflare Pages Functions，只有静态托管不能运行。Brevo 密钥仅放 Worker，不放 Pages/前端。

请求会携带 Pages 为正文、路径、时间和访客 IP 生成的签名。直接调用 Worker 无法伪造注册请求和限流 IP。线上由 Cloudflare 提供 `CF-Connecting-IP`；纯 Vite 本地预览没有这个注册后端。

## 4. 上线前用真实人大邮箱验收

只向愿意参与测试且本人控制的校内邮箱发送验证码。先小范围验收，确认以下项目后再通知同学使用：

1. 从 `/login` 点击校内邮箱注册链接，输入真实 `@ruc.edu.cn` 邮箱，收到六位验证码；检查垃圾邮件文件夹。确认 Brevo 控制台显示投递情况。API 接收成功不代表邮件已送达。
2. 验证码错误时显示提示；正确验证码注册后跳转首页，右上角显示账号名。
3. 退出后用账号名/密码重新登录；旧 KV 账号也能登录，排行榜仍可读取。
4. 同一邮箱无法注册第二个账号，重复账号名不会覆盖已有账号。
5. 连续点击只发一封；60 秒后可重发，使用最新验证码；过 10 分钟的验证码失效。
6. 校友、QQ、伪造后缀邮箱被拒绝。关闭 Pages 和 Worker 注册开关后，新注册返回不可用，已有账号登录继续可用。

本次提交只完成本地验证，未使用真实 Brevo 密钥、未向人大邮箱实际发信、未部署你朋友的 Cloudflare 项目。如果实际收不到，先关闭注册，查看 Brevo 投递记录/账号状态，再调整发件人配置。

## 保护与维护

- 验证码 10 分钟有效，60 秒重发冷却，最多 5 次错误尝试；重发使旧验证码失效。持久存储只保存验证码 HMAC，不保存或记录验证码明文；页面也不返回验证码。
- 每邮箱每小时最多 5 次、每 IP 每小时 20 次；全站任意连续 24 小时最多 250 次。发送失败/超时也占额度，避免结果不确定时重复耗用配额。校园网多人可能共用一个公网 IP，若达到上限请稍后再试；若需扩大规模，应先加机器人验证和调整服务商配额。
- 注册和新账号密码失败计数在一个协调对象内串行执行。账号、邮箱索引、验证码消费在同一存储事务里完成；存储失败不会留下半个账号。新账号密码失败 10 次后锁定 10 分钟。
- 暂存验证码及限流记录由每小时 alarm 清理。账号记录包含规范化邮箱、账号名、随机盐、PBKDF2-SHA256 哈希及创建时间，不存明文密码。邮箱用于唯一性，不公开给排行榜。IP 只以 HMAC 暂存作限流。
- 轮换 `SESSION_SECRET` 时应同时更新 Worker 与 Pages；旧会话和未完成的验证码会失效。已注册账号及邮箱唯一性仍保留。不要在旧 KV 中手动新增已注册的同名账号，否则 KV 账号会优先登录。
- 请求体限制 4 KB，同源 POST，邮件调用 4 秒超时、Pages 上游调用 8 秒超时，错误响应不泄漏服务商细节。关闭开关后保留存储，避免丢失用户账号。
- 本版本不包含找回密码、邮箱更换、账号删除或定期重新验证学生身份；忘记密码先联系站长，后续可另加邮箱恢复流程。

## 开发检查

需要 Node.js 24（测试使用内置 TypeScript 支持）：

```sh
npm ci
npm run check:server
npm run test:auth
npm run build
# 以下只编译，不部署：
npx wrangler deploy --dry-run --config auth-worker/wrangler.toml
npx wrangler pages functions build functions --outdir ../pages-check
```

自动化测试使用模拟发信和存储，覆盖端到端代理/会话、域名伪装、失败超时、次数限制、过期/重放、并发唯一性、事务回滚、旧账号与关闭注册兼容、密钥轮换。另已在本地 Cloudflare 运行环境及真实 SQLite Durable Object 中验证页面注册流程，邮件仍为模拟发送。

## 官方资料

- [人大毕业生邮箱迁移通知（明确在校与校友邮箱后缀）](https://m.ruc.edu.cn/wap/material?id=454)
- [人大电子邮件管理办法](https://it.ruc.edu.cn/docs/2021-05/ea089a6353f941cc8cb0c4dd1739ae5d.pdf)
- [Brevo 免费套餐](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)
- [Brevo 新建及验证发件人](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)
- [Brevo 未认证域名及发件地址改写](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
- [Brevo 事务邮件 API](https://developers.brevo.com/docs/send-a-transactional-email)
- [Cloudflare Durable Objects 免费配额](https://developers.cloudflare.com/durable-objects/platform/pricing/)
