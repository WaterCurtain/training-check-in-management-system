# 电气仪控实训室打卡管理系统

一个面向实训室局域网场景的 Web 打卡系统，用于记录成员的实训开始与结束时间、现场照片，以及个人和管理员的统计数据。

## 功能

- 成员通过姓名和 PIN 登录，完成带现场照片的开始、结束打卡。
- 一名成员同一时间只能有一条进行中的实训记录。
- 自动统计今日、本周和本月实训时长及完成次数。
- 管理员可查看总览、成员、打卡记录、异常记录与审计日志，并导出统计数据。
- 本地运行时使用 SQLite 和本地照片目录持久化数据。
- 可部署为 Cloudflare Worker，并使用 D1 保存数据。

## 技术栈

- 前端：原生 HTML、CSS、JavaScript
- 本地服务：Node.js 内置 HTTP 服务、`node:sqlite`
- 云端部署：Cloudflare Workers、Cloudflare D1

## 本地运行

### 前置条件

- Node.js 22.5 或更高版本（需要内置 `node:sqlite`）。

### 启动

```bash
npm start
```

启动后访问 [http://127.0.0.1:4173](http://127.0.0.1:4173)。首次启动会自动创建 `data/training.db` 和 `data/photos/`。

## 初始测试账号

| 角色 | 账号 | PIN |
| --- | --- | --- |
| 管理员 | `Admin` | `123456` |
| 成员示例 | 张伟、李昂、王宇等 | `123456` |

这些账号和 PIN 用于本地演示与测试。部署到真实环境前，请在代码和数据库中替换默认凭据，并限制管理员入口的访问范围。

## Cloudflare 部署

项目已包含 Worker 配置文件 `wrangler.jsonc` 与 D1 表结构 `schema.sql`。

1. 安装并登录 Wrangler：

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. 在 `wrangler.jsonc` 中配置目标 D1 数据库的 `database_id`。
3. 初始化远程 D1 数据库：

   ```bash
   wrangler d1 execute training-checkin --remote --file=./schema.sql
   ```

4. 发布 Worker：

   ```bash
   wrangler deploy
   ```

## 项目结构

```text
├── index.html       # 页面结构
├── styles.css       # 样式
├── app.js           # 浏览器端交互逻辑
├── server.js        # 本地 Node.js 服务与 SQLite 接口
├── worker.js        # Cloudflare Worker 与 D1 接口
├── schema.sql       # D1 数据库表结构
└── data/            # 本地 SQLite 数据库和照片（运行时生成）
```

## 许可证

本项目采用 [MIT License](LICENSE)。MIT 是一种宽松的开源许可证，允许使用、复制、修改、合并、发布和分发软件，但须保留版权与许可声明。
