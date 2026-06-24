# SoftwareHub

一个现代化的多版本软件聚合平台，支持 GitHub Release 自动同步、多云盘备份、CDN 加速下载。

> 自动从 GitHub Releases 同步版本、下载量等数据，提供分类浏览、全文搜索、排行榜等功能。
> 后台管理面板支持 WebDAV / OneDrive / Google Drive 多渠道云盘备份。

---

## 目录

- [功能特性](#功能特性)
- [在线演示](#在线演示)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [数据模型](#数据模型)
- [管理后台](#管理后台)
- [GitHub Actions 工作流](#github-actions-工作流)
- [云盘备份配置](#云盘备份配置)
- [环境变量](#环境变量)
- [自定义域名](#自定义域名)
- [开发指南](#开发指南)
- [部署](#部署)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 功能特性

- **多版本管理** — 每个软件可管理多个版本，每个版本包含多平台下载项
- **GitHub 自动同步** — 自动拉取 GitHub Releases 的版本、下载量、Star/Fork 数据
- **7 大平台** — Android / Windows / MacOS / Linux / iOS / Web / Other
- **分类浏览** — 按类别（如「阅读」「音乐」「动漫」）分组浏览
- **全文搜索** — 按名称、描述、slug、仓库名搜索所有软件
- **排行榜** — 按最近更新时间、Star 数、下载量排序
- **真实下载量** — 通过 GitHub Release API 获取真实下载统计
- **多云盘备份** — 支持 WebDAV / OneDrive / Google Drive 等多种云盘
- **CDN 加速** — 可配置 GitHub 下载代理（gh-proxy）加速下载
- **图标 CDN** — 可配置图标加载源（jsdelivr / statically / githack / 自定义）
- **离线优先** — 数据存储在 `localStorage`，定期从远程 JSON 同步
- **自动更新检测** — 每 5 分钟轮询远程数据，发现新版本自动刷新
- **图片压缩** — 上传前客户端压缩图片，减少存储占用

---



---

## 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | Vue 3（Composition API + `<script setup>`） |
| **构建工具** | Vite 8 |
| **语言** | TypeScript 6 |
| **UI 组件库** | Naive UI |
| **状态管理** | Pinia 3 |
| **路由** | Vue Router 4（history 模式） |
| **测试** | Vitest + happy-dom |
| **云同步** | rclone CLI + webdav 库 |
| **部署** | GitHub Pages（自定义域名） |
| **CI/CD** | GitHub Actions |

---

## 快速开始

### 环境要求

- Node.js >= 20
- npm >= 9

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/your-username/SoftwareHub.git
cd SoftwareHub

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器访问 `http://localhost:5173`

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run test` | 运行测试（单次） |
| `npm run test:watch` | 运行测试（监听模式） |

---

## 项目结构

```
SoftwareHub/
├── .github/
│   └── workflows/
│       ├── deploy.yml            # GitHub Pages 部署工作流
│       └── sync-backup.yml       # 同步备份工作流（每 6 小时）
├── data/                         # 源数据（原始 JSON）
│   ├── categories.json           # 分类数据
│   ├── iconAssets.json           # 图标资源
│   ├── index.json                # 轻量搜索索引
│   ├── projects.json             # 旧版项目数据（已迁移）
│   ├── settings.json             # 站点设置
│   ├── backup-manifest.json      # 备份清单
│   └── page/                     # 按分类存储的数据
│       └── {categorySlug}/
│           ├── software.json     # 该分类下的软件列表
│           ├── versions.json     # 该分类下的版本数据
│           └── downloads.json    # 该分类下的下载数据
├── public/                       # 静态资源（构建后原样输出）
│   ├── CNAME                     # 自定义域名：app.qiyinqin.top
│   ├── data/                     # 发布的 JSON 数据
│   ├── page/                     # 发布的分类页面数据
│   ├── favicon.svg               # 网站图标
│   └── icons.svg                 # SVG 图标集
├── scripts/                      # 工具脚本
│   ├── sync-backup.mjs           # CI 同步备份脚本（rclone）
│   ├── rclone-backup.mjs         # 本地 rclone 备份脚本
│   ├── rclone-utils.mjs          # rclone 工具函数
│   ├── migrate-data.cjs          # 数据迁移脚本
│   ├── export-data.mjs           # 数据导出脚本
│   └── bin/
│       └── rclone.exe            # rclone 二进制（Windows）
├── src/                          # 应用源码
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 入口文件
│   ├── defaults.ts               # 默认设置值
│   ├── style.css                 # 全局样式
│   ├── components/               # 可复用组件
│   │   ├── admin/                # 后台专用组件
│   │   │   ├── AdminLayout.vue   # 后台布局（侧边栏 + 内容区）
│   │   │   ├── AdminPager.vue    # 分页组件
│   │   │   ├── AdminSearchBar.vue# 搜索栏
│   │   │   └── AdminSortGroup.vue# 排序控件
│   │   ├── AmbientOrbs.vue       # 背景装饰
│   │   ├── ProjectCard.vue       # 软件卡片
│   │   ├── SiteFooter.vue        # 页脚
│   │   └── SiteHeader.vue        # 页头
│   ├── router/
│   │   └── index.ts              # 路由配置
│   ├── store/                    # Pinia 状态管理
│   │   ├── category.ts           # 分类状态
│   │   ├── project.ts            # 软件状态
│   │   ├── settings.ts           # 设置状态
│   │   └── user.ts               # 用户状态
│   ├── types/
│   │   └── index.ts              # TypeScript 类型定义
│   ├── utils/                    # 工具函数
│   │   ├── api.ts                # 数据访问层（核心）
│   │   ├── auth.ts               # GitHub Token 认证
│   │   ├── github.ts             # GitHub API 调用
│   │   ├── githubRepo.ts         # GitHub 仓库操作
│   │   ├── emojiLibrary.ts       # Emoji 图标库
│   │   ├── iconUrl.ts            # 图标 URL 处理
│   │   ├── iconsApi.ts           # 图标 API
│   │   ├── imageCompressor.ts    # 图片压缩
│   │   ├── index.ts              # 通用辅助函数
│   │   ├── platformTag.ts        # 平台标签处理
│   │   └── secretStore.ts        # 安全存储
│   └── views/                    # 页面组件
│       ├── Home.vue              # 首页
│       ├── ProjectDetail.vue     # 软件详情页
│       ├── Category.vue          # 分类页
│       ├── Search.vue            # 搜索页
│       ├── Ranking.vue           # 排行榜
│       └── admin/                # 管理后台页面（11 个）
├── vite.config.ts                # Vite 配置
├── vite-plugin-backup.ts         # WebDAV 备份插件
├── vite-plugin-local-backup.ts   # rclone 备份插件
├── vitest.config.ts              # Vitest 测试配置
├── index.html                    # SPA 入口
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
└── README.md
```

---

## 数据模型

### 存储架构

采用**双层存储**：

1. **静态 JSON 文件**（`public/data/` + `public/page/`）— 由构建过程生成，GitHub Pages 直接托管
2. **localStorage**（key: `sh_data`）— 运行时数据，管理员操作写入

应用启动时，`loadRemoteData()` 从静态 JSON 拉取数据并合并到 localStorage。管理员编辑写入 localStorage，构建/同步后导出到静态 JSON。

### 核心实体

#### Software（软件主实体）

```typescript
{
  id: string              // 唯一 ID（时间戳生成）
  slug: string            // URL 友好的标识符
  sourceType: 'github' | 'custom'  // 来源类型
  name: string            // 软件名称
  description: string     // 描述
  logo: string            // Logo 图片 URL
  categorySlug: string    // 所属分类的 slug
  featured: boolean       // 是否推荐
  githubRepo?: string     // GitHub 仓库（owner/repo）
  githubUrl?: string      // GitHub 主页
  website?: string        // 官方网站
  stars?: number          // Star 数
  forks?: number          // Fork 数
  latestVersionId?: string // 最新版本 ID
  latestUpdateTime: string // 最近更新时间（ISO）
}
```

#### Version（版本）

```typescript
{
  id: string              // 唯一 ID
  projectId: string       // 所属软件 ID
  version: string         // 版本号（如 "v1.2.3"）
  publishedAt: string     // 发布时间（ISO）
  changelog: string       // 更新日志
  downloadIds: string[]   // 包含的下载项 ID 列表
}
```

#### Download（下载项）

```typescript
{
  id: string              // 唯一 ID
  versionId: string       // 所属版本 ID
  platform: Platform      // 平台（7 种）
  filename: string        // 文件名
  size: string            // 文件大小（如 "12.3 MB"）
  url: string             // 下载 URL
  downloadCount?: number  // 真实下载量（仅 GitHub）
  downloadCountSyncedAt?: string  // 下载量拉取时间
}
```

#### Category（分类/页面）

```typescript
{
  id: string              // 唯一 ID
  slug: string            // URL slug
  name: string            // 显示名称（如 "阅读"）
  icon?: string           // Emoji 图标
  description?: string    // 描述
  sortOrder?: number      // 排序权重
}
```

#### Settings（站点设置）

```typescript
{
  siteName: string        // 站点名称
  logo: string            // 站点 Logo
  footer?: string         // 页脚 HTML
  admins: string[]        // 管理员列表
  storageNote?: string    // 存储说明
  ghProxyEnabled?: boolean // GitHub 代理开关
  ghProxyUrl?: string     // GitHub 代理 URL
  networkProxy?: string   // 网络代理地址
  uploadTimeout?: number  // 上传超时（秒）
  maxFileSizeMB?: number  // 文件大小限制（MB）
  defaultChannel?: string // 默认备份渠道
  uploadProxy?: string    // 上传代理地址
  schedule?: ScheduleConfig // 定时调度设置
  webdav?: WebDAVConfig   // WebDAV 配置
  iconCdnMode?: IconCdnMode // 图标 CDN 模式
  iconCdnCustomBase?: string // 自定义 CDN 地址
}
```

### 静态 JSON 文件布局

```
public/
├── data/
│   ├── index.json              # IndexEntry[]（轻量搜索索引）
│   ├── categories.json         # Category[]
│   ├── settings.json           # Settings
│   ├── iconAssets.json         # IconAsset[]
│   └── backup-manifest.json    # { entries, updatedAt }
└── page/
    └── {categorySlug}/
        ├── software.json       # Software[]
        ├── versions.json       # Version[]
        └── downloads.json      # Download[]
```

---

## 管理后台

访问地址：`/admin`

### 路由一览

| 路由 | 标题 | 说明 |
|------|------|------|
| `/admin` | 登录 | GitHub Token 认证 |
| `/admin/dashboard` | 统计概览 | 软件总数、分类统计、图表展示 |
| `/admin/projects` | 软件管理 | 搜索、筛选、管理所有软件 |
| `/admin/projects/new` | 新增软件 | 添加 GitHub 或自定义软件 |
| `/admin/projects/:id/edit` | 编辑软件 | 修改软件详细信息 |
| `/admin/projects/:id/versions` | 版本管理 | 管理该软件的版本和下载项 |
| `/admin/categories` | 页面管理 | 管理分类/页面 |
| `/admin/categories/:id/projects` | 页面下的软件 | 按分类筛选软件 |
| `/admin/icons` | 图标管理 | 上传、管理图标资源 |
| `/admin/backup-files` | 备份管理 | 查看 WebDAV / rclone / 清单文件 |
| `/admin/settings` | 网站设置 | 站点名称、Logo、页脚、代理配置 |
| `/admin/acceleration` | 加速设置 | CDN 模式、代理地址 |
| `/admin/channel-backup` | 渠道备份 | rclone 多渠道云盘管理 |

### 认证方式

- 使用 **GitHub Personal Access Token（PAT）** 登录
- Token 存储在 `localStorage`（key: `sh_admin_token`）
- 通过 `https://api.github.com/user` 验证有效性
- 支持 classic PAT 和 fine-grained PAT

### 后台组件

| 组件 | 说明 |
|------|------|
| `AdminLayout.vue` | 全屏后台布局（侧边栏 + 内容区） |
| `AdminPager.vue` | 分页 |
| `AdminSearchBar.vue` | 搜索过滤 |
| `AdminSortGroup.vue` | 排序控件 |

---

## GitHub Actions 工作流

### 1. deploy.yml — 部署到 GitHub Pages

| 项目 | 说明 |
|------|------|
| **触发条件** | Push 到 `main` 分支，或手动触发 |
| **运行环境** | `ubuntu-latest` |
| **构建命令** | `npm ci && npm run build` |
| **部署目标** | GitHub Pages |
| **并发控制** | `pages` 组，自动取消进行中的部署 |

```yaml
步骤：
1. Checkout 代码
2. Setup Node.js 20
3. npm ci（安装依赖）
4. npm run build（类型检查 + 构建）
5. Upload ./dist 为 Pages artifact
6. Deploy 到 GitHub Pages
```

### 2. sync-backup.yml — 同步备份

| 项目 | 说明 |
|------|------|
| **触发条件** | 每 6 小时（`0 */6 * * *`），或手动触发 |
| **运行环境** | `ubuntu-latest` |
| **脚本** | `node scripts/sync-backup.mjs` |
| **权限** | `contents: write`（提交数据变更） |

```yaml
步骤：
1. Checkout 代码
2. Setup Node.js 20
3. 安装 rclone（apt-get install -y rclone）
4. npm ci
5. 运行 sync-backup.mjs
```

---

## 云盘备份配置

### 支持的渠道

| 渠道 | 说明 | 密码处理 |
|------|------|---------|
| **WebDAV** | 通用 WebDAV 服务器（123 云盘等） | `rclone obscure` 混淆 |
| **OneDrive** | Microsoft OneDrive（OAuth2） | Token JSON |
| **Google Drive** | Google Drive（OAuth2） | Token JSON |

### 管理后台配置流程

1. 访问 `/admin/channel-backup`
2. 选择渠道类型（WebDAV / OneDrive / Google Drive）
3. 填写连接信息
4. 点击「测试连接」验证
5. 保存配置（自动写入 `rclone.conf`，密码自动混淆）

### rclone.conf 结构

```ini
[123webdav]
type = webdav
url = https://xxxxx
vendor = other
user = your_username
pass = <obscured_password>  # rclone obscure 生成

[onedrive]
type = onedrive
client_id = your_client_id
client_secret = your_client_secret
token = {"access_token":"...","refresh_token":"...","token_type":"Bearer","expiry":"..."}

[gdrive]
type = drive
client_id = your_client_id
client_secret = your_client_secret
scope = drive
token = {"access_token":"...","refresh_token":"...","token_type":"Bearer","expiry":"..."}
```

### CI/CD 备份流程

在 GitHub Actions 中，通过 Repository Secrets 配置渠道信息：

```
BACKUP_CHANNEL=123webdav
WEBDAV_URL=https://xxxxx
WEBDAV_USERNAME=your_username
WEBDAV_PASSWORD=your_password
WEBDAV_BASE_DIR=/SoftwareHub
```

`sync-backup.mjs` 脚本会：
1. 读取环境变量中的渠道配置
2. 动态生成 `rclone.conf`
3. 执行 `rclone copyto` 上传文件
4. 验证文件是否上传成功
5. 生成备份清单

---

## 环境变量

### CI/CD（GitHub Actions Secrets/Variables）

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `BACKUP_CHANNEL` | Secret | `webdav` | 备份渠道：webdav / onedrive / gdrive |
| `GH_TOKEN` | Secret | — | GitHub PAT（提高 API 限额） |
| `GH_PROXY` | Secret | — | GitHub 下载加速代理 |
| `KEEP_VERSIONS` | Var | `2` | 每个项目保留版本数 |
| `MAX_FILE_SIZE_MB` | Var | `500` | 文件大小限制（MB） |
| `UPLOAD_TIMEOUT` | Var | `600` | 上传超时（秒） |
| `WEBDAV_URL` | Secret | — | WebDAV 服务器地址 |
| `WEBDAV_USERNAME` | Secret | — | WebDAV 用户名 |
| `WEBDAV_PASSWORD` | Secret | — | WebDAV 密码 |
| `WEBDAV_BASE_DIR` | Secret | `/SoftwareHub` | WebDAV 根目录 |
| `ONEDRIVE_TOKEN` | Secret | — | OneDrive token JSON |
| `GDRIVE_TOKEN` | Secret | — | Google Drive token JSON |
| `UPLOAD_PROXY` | Secret | — | 上传代理地址（用于 123 云盘等国内服务） |

### 本地脚本

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RCLONE_REMOTE` | — | rclone 远程存储名称 |
| `RCLONE_PATH` | `/SoftwareHub` | 远程存储路径 |
| `LOCAL_MODE` | — | 本地备份模式标志 |
| `DEV_URL` | `http://localhost:5173` | 开发服务器地址 |

---

## 自定义域名

当前通过 `public/CNAME` 文件配置自定义域名：

```
app.qiyinqin.top
```

### 配置步骤

1. 在域名 DNS 设置中添加 CNAME 记录，指向 `{username}.github.io`
2. 在仓库 `public/CNAME` 文件中写入自定义域名
3. 推送到 `main` 分支，GitHub Pages 自动部署

### 注意事项

- 启用 HTTPS（GitHub Pages 自动提供）
- 自定义域名配置后，`username.github.io` 仍可访问
- 部署失败时检查 `CNAME` 文件是否存在

---

## 开发指南

### 本地开发

```bash
# 启动开发服务器
npm run dev

# 热更新：修改代码后自动刷新浏览器
# 后台管理：访问 http://localhost:5173/admin
```

### 添加新软件

1. 访问 `/admin` 登录
2. 点击「软件管理」→「新增软件」
3. 选择来源（GitHub 或自定义）
4. 填写信息后保存

### 添加新分类

1. 访问 `/admin/categories`
2. 点击「新增分类」
3. 填写名称、slug、描述

### 数据迁移

```bash
# 从旧版 projects.json 迁移到新版分层结构
node scripts/migrate-data.cjs

# 从 localStorage 导出数据到 JSON
node scripts/export-data.mjs
```

### 测试

```bash
# 运行所有测试
npm run test

# 监听模式
npm run test:watch
```

测试文件位于 `src/**/__tests__/**/*.spec.ts`

---

## 部署

### GitHub Pages（推荐）

1. **Fork 或克隆** 本仓库到 GitHub
2. **配置 Secrets**（Settings → Secrets and variables → Actions）：
   - `BACKUP_CHANNEL` — 选择备份渠道
   - `WEBDAV_URL` / `WEBDAV_USERNAME` / `WEBDAV_PASSWORD` — WebDAV 配置
   - `GH_TOKEN` — 可选，提高 API 限额
3. **推送代码到 `main` 分支**
4. GitHub Actions 自动构建并部署

### 自定义部署

```bash
# 构建
npm run build

# 构建产物在 dist/ 目录
# 将 dist/ 目录部署到任意静态托管服务
```

### 部署流程图

```
代码推送到 main
       ↓
GitHub Actions 触发 deploy.yml
       ↓
npm ci → npm run build → Upload dist/ → Deploy to GitHub Pages
       ↓
网站更新完成
```

---

## 常见问题

### Q: 如何提高 GitHub API 限额？

**A:** 配置 `GH_TOKEN` Secret（GitHub Personal Access Token）。未认证限额为 60 次/小时，认证后为 5000 次/小时。

Token 创建步骤：
1. 访问 [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. 点击「Generate new token」
3. 选择 `public_repo` 范围（只需公开仓库权限）
4. 复制 Token 并添加到 Repository Secrets

### Q: 如何配置 GitHub 下载代理？

**A:** 在加速设置页面（`/admin/acceleration`）或配置 `GH_PROXY` Secret：

```
GH_PROXY=https://gh-proxy.com/
```

支持的代理节点：
- `https://gh-proxy.com/`（推荐）
- `https://mirror.ghproxy.com/`
- `https://ghproxy.net/`
- `https://gh-proxy.org/`

### Q: 123 云盘 WebDAV 上传后文件不在远程？

**A:** 123 云盘 WebDAV 服务器有异步处理机制。文件提交后可能需要数小时才会出现在远程目录中。脚本会在上传后自动验证（最多 3 次，间隔 10-20 秒）。

### Q: 如何添加自定义 CDN？

**A:** 在加速设置页面（`/admin/acceleration`）：
1. 选择「自定义」CDN 模式
2. 输入 CDN 地址（如 `https://your-cdn.com/gh/{owner}/{repo}@{branch}/{path}`）
3. 保存设置

### Q: 如何修改保留版本数？

**A:** 在 GitHub Actions 中配置 `KEEP_VERSIONS` Variable，默认值为 2。每个项目只备份最近 N 个版本，旧版本自动清理。

### Q: 数据存储在哪里？

**A:** 采用双层存储：
1. **静态 JSON**（`public/data/` + `public/page/`）— GitHub Pages 托管，前端读取
2. **localStorage**（浏览器本地）— 运行时数据缓存

管理员编辑写入 localStorage，通过「发布到 GitHub」或 CI/CD 同步到静态 JSON。

### Q: 如何添加 Google Drive 渠道？

**A:** Google Drive 需要 OAuth2 认证，步骤如下：
1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目
2. 启用 Google Drive API
3. 创建 OAuth2 凭据（Desktop 应用类型）
4. 获取 Client ID 和 Client Secret
5. 在管理后台 `/admin/channel-backup` 填写信息
6. 完成 OAuth 授权流程
7. Token 自动保存到 `rclone.conf`

**注意：** Google OAuth2 端点（`oauth2.googleapis.com`）在中国大陆可能被墙，需要配置网络代理。

### Q: 如何配置网络代理？

**A:** 在管理后台 `/admin/acceleration` 的「网络代理」卡片中填写代理地址（如 `http://127.0.0.1:7890`），该代理会用于 rclone 的网络请求。

---

## 许可证

本项目为私人项目，未经授权禁止转载或商用。

---

**Built with ❤️ using Vue 3 + Vite + TypeScript**
