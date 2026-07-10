# 职场守护 交接 · 0710（银行卡 → Stripe 一次性支付上线）

## 📋 本次提交（已 push · main）
| commit | 仓库 | 内容 |
|---|---|---|
| `e32d858` | karentan30/zhichang-shouhu | 银行卡走 Stripe 一次性支付(¥39·免登录·香港服务器) |
| `134b7e0` | (Lumee 私有仓库) | 后端 `_pay_stripe_create_anon` 匿名 Stripe 收款端点（由并行会话一并提交） |

**部署状态**：
- 前端：已 `vercel --prod --yes` 上线 `zhichang-shouhu.vercel.app/app`；已 push 到 GitHub Pages `karentan30.github.io/zhichang-shouhu/app.html`。两处缓存刷新后均已验证含新代码。
- 后端：Lumee 香港服务器 `47.242.80.65` 已 `scp server.py + systemctl restart`，健康检查通过，`/pay/stripe/create` 线上返真 `cs_live_…` 链接。

---

## 本次做完：银行卡 tab 从"即将开放"→ 真接 Stripe

之前维权包只有微信/支付宝二维码，银行卡 tab 是"即将开放·接 Stripe 中"占位。现在真接上了。

### 流程（`app.html`）
1. 点"💳 银行卡" → `setPayMethod('card')` → `createStripe()`。
2. `createStripe()` POST `STRIPE_API/pay/stripe/create {productId:'zhichang_39', return_url: 当前域}` → 拿 Stripe **Checkout 托管页 url**。
3. 显示"💳 去支付 ¥39 →"按钮 → `window.open(url)` 跳 Stripe 安全页付款。
4. 解锁**双保险**：
   - 原标签轮询 `/pay/stripe/query`（每 3s），到账 → `onPaid()` 解锁 + 生成案卷；
   - 若同标签跳转付款回来，`checkStripeReturn()` 读 URL 参数 `?stripe=success&oid=…` 向后端核对，已付则解锁。

### ⚠️ 关键架构铁律：Stripe 必须走香港服务器，不能走 .cn
```js
const PAY_API   = 'https://www.mylumee.cn';    // 微信/支付宝：大陆商户服务器
const STRIPE_API= 'https://www.mylumee.app';   // 银行卡(Stripe)：香港服务器
```
- 大陆服务器（`www.mylumee.cn` → `8.160.175.232`）被 **GFW 挡·连不上 `api.stripe.com`**。实测 `.cn` 上 `/pay/stripe/create` 返 **404**。
- 香港服务器（`www.mylumee.app` → `47.242.80.65`）可达 Stripe，`/pay/stripe/create` 返真 `cs_live_…`。
- 所以**只有 Stripe 调用（create/query/return 核对）指向 `.app`**；微信/支付宝仍走 `.cn` 大陆商户。
- `.app` 已设 `access-control-allow-origin: *`，vercel/github.io 前端跨域调用放行。

### 后端（Lumee `server.py`·复用香港个人 Stripe·sk_live）
- 新增 `_pay_stripe_create_anon(product, body)`：`mode=payment` **一次性**（非订阅）、**免登录**、**inline `price_data`**（免在 Dashboard 建 Price）。
- 价格以服务端 `PRODUCT_PLAN_MAP['zhichang_39'] = ('zhichang', 39, '职场守护维权包')` 为权威；货币 `STRIPE_ANON_CURRENCY` 默认 **CNY**（与页面 ¥39 一致）。
- `_pay_stripe_create` 开头识别 `_is_anon_product` → 分流到匿名分支（订阅路径不受影响）。
- settle 复用订阅那套：webhook `checkout.session.completed`（whsec 已配）+ `/pay/stripe/query` 主动查兜底；`plan='zhichang'` 在 `_apply_paid_order` 是**空操作**（只标订单已付、不发任何 Lumee 会员）。
- `return_url` 防开放重定向：后端白名单 `STRIPE_ANON_RETURN_HOSTS = {zhichang-shouhu.vercel.app, karentan30.github.io}`，命中才用它当回跳基址，否则回退默认——保证付款回到用户实际所在域，**解锁 localStorage 不串域**（双托管必须）。

---

## 已验证
- `create` 返真 `cs_live_…` 链接 → **等于这个香港 Stripe 账号已接受 CNY**（Stripe 建 session 即校验币种，不支持会直接 400）。
- `query` 对未付订单返 `pending`；CORS 预检 200；`return_url` 白名单命中/拒绝正确（evil host 静默回退）。
- 前端无原生弹窗、无死按钮（Slim QA 铁律）；两托管域缓存刷新后均含新代码。

## ⏳ 唯一剩下的闸（Karen 亲自）
> **刷一张真卡付 ¥39，确认"付款成功 → 自动解锁案卷"整条链路到账**（同 Lumee ¥28 真付的亲自闸惯例）。这一步验完即可正式对外。

## 备注
- **收款方名显示"鹿觅/Lumee"**：复用香港商户的必然代价（微信单也一样）。要显示"职场守护"须单独开商户，暂不值得。
- 海外卡也按 **¥39 CNY** 扣（约 $5.4）；若日后要海外用户看本币需另配价，现在统一 ¥39 最简单。
- `pay_card_soon`（"即将开放"）i18n 键已弃用，无害残留，未专门删。
- ⚠️ Lumee `server.py` 是**双会话共享**文件（另一会话在做 YiYi 英语）。提交只 `git add` 自己的文件，**绝不 `git add -A`**。本次后端改动已由并行会话的 `134b7e0` 一并提交、且我已单独部署到香港生产。
