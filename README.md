# JSON 工具箱浏览器插件

独立的 Vue 3 + TypeScript + Vite 项目，使用 Chrome Manifest V3。点击浏览器工具栏中的插件图标，会打开完整的 JSON 编辑器标签页。

完整打包、安装和更新步骤见 [打包与安装说明](./打包与安装说明.md)。与原网站源码的逐文件对照见 [源码对照说明](./源码对照说明.md)。

## 安装已构建的插件

1. 打开 Chrome 的 `chrome://extensions`，或 Edge 的 `edge://extensions`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目的 `dist` 目录。
4. 将「JSON 工具箱」固定到工具栏，点击图标打开工具。

如果使用发布 ZIP，请先解压，再选择包含 `manifest.json` 的目录。`dist/index.html` 由浏览器插件加载，不需要启动博客服务。

## 保留的功能

- JSON / JSON5 格式化、压缩、语法检查、转义与去转义。
- 可选 JSON 修复：兼容解析失败后在 Worker 中修复，可在新标签页查看原始数据与修复结果的只读 Diff。
- 长整数和高精度数值的字面量保留。
- JSON 排序、字段排序、数据脱敏与 Diff 对比。
- YAML、TOML、XML、Go、TypeScript 和 Cookie 转换。
- 本地文件导入、拖放、复制、结果下载。
- 本地存档、设置、明暗主题、中英文切换、大文件折叠和层级分析。

## 已移除的功能和依赖

URL 获取、cURL、客户端证书请求、分享、我的分享和问题反馈已从入口、弹窗、设置和处理代码中移除。原博客的全屏／退出全屏按钮、默认全屏设置及相关状态和样式也已删除；普通编辑和 Diff 均直接使用整个工具标签页。项目不包含博客页面、SEO、Nuxt、Nitro、服务端 API、指纹采集或 WASM 分享鉴权。

编辑器和所有脚本随插件打包；运行不依赖网络。插件没有网站访问权限，也不会向其他网页注入脚本。扩展的内容安全策略将网络连接限制在插件自身资源。

设置与存档沿用原工具的 localStorage / IndexedDB 实现，按工具标签页管理。插件与原网站的存储空间相互独立，原网站中的数据不会自动迁入；需要手动导出并导入。卸载插件会清除其本地数据。

## 本地开发

需要 Node.js 20.19+ 或 22.12+，建议使用当前 Node.js LTS。

```sh
npm ci --include=dev
npm run dev
```

`dev` 提供前端开发页面和热更新。开发服务器地址会显示在终端中。要验证真实扩展环境，请构建后加载 `dist`；每次重新构建后，在浏览器扩展管理页面点击「重新加载」，再刷新工具标签页。

```sh
npm run typecheck
npm test
npm run build
npm run package
npm run verify-package
```

`build` 依次进行类型检查、生产构建和本地模式检查。`package` 生成 `release/json-tool-extension-1.1.0.zip`，可用于分发或提交扩展商店；商店上架资料见 [商店发布资料](./store/商店发布资料.md)。每次打包会生成源码指纹与 ZIP 校验记录，上传前用 `npm run verify-package` 确认安装包对应当前源码。

## 编辑器报错排查

首次打开源码前，先在项目根目录安装完整依赖：

```sh
npm ci --include=dev
npm run typecheck
```

`node_modules/` 不随源码提交。仅有该目录并不代表安装成功；如果提示找不到 Vue、Element Plus、Vite、TypeScript 或 `vue-tsc`，需要等 `npm ci` 成功结束后再检查。被中断的安装可能留下空目录，重新执行上述命令即可恢复。

本项目的 `tsconfig.json` 同时检查 Vue/TypeScript 源码、`vite.config.ts` 和 Monaco 构建脚本。构建脚本沿用原网站中的 JSDoc 类型，Node 类型由 `@types/node` 提供。

如果命令行类型检查通过而 TRAE 仍显示旧错误，执行「TypeScript: Restart TS Server」或「Vue: Restart Vue Server」，再重新打开报错文件。编辑 `.vue` 文件需要启用 Vue (Official) 扩展。

## 项目结构

```text
public/
  manifest.json             扩展配置与内容安全策略
  background.js             点击图标打开工具标签页
  icons/                    插件图标
src/
  App.vue                   独立入口和语言状态
  components/              编辑器、弹窗、本地处理逻辑与 Worker
  utils/jsonToolMessage.ts  消息提示
scripts/
  vite/monaco-large-folding.mjs  原工具的大文件折叠补丁
  check-local-only.mjs           在线依赖与扩展权限检查
  package.mjs                   发布打包
tests/                     核心功能、修复、折叠、编辑性能和设置迁移回归测试
```

当前编辑器沿用双栏桌面布局。浏览器窗口宽度低于 901px 时会显示大屏使用提示；侧边栏或手机布局需要另行适配。

本项目已从博客源码中独立抽取。后续可以作为新仓库维护；更新 JSON 工具时只需维护这个前端项目。

## 1.1.0 同步更新

同步原网站提交 `b9d3d1a` 的 JSON 工具实现，保留插件本地运行的功能边界。新增 JSON 修复，默认关闭；在「设置 → 格式化设置」中开启，仅在兼容解析失败后尝试修复，修复结果应通过 Diff 核对。

更新包含大文件折叠后的编辑性能、文件末尾输入、折叠统计与字段颜色、清空残留、Diff 定位与占位区域、英文设置文案和悬浮语言／主题面板。弹窗组件与可选语言模块按需加载，标签页清理只读取存档和 Diff 的键，并安排在空闲时执行。

修复和 Diff 的数据都保存在浏览器本地，不调用博客服务。新功能不增加浏览器权限。网站的在线获取、分享、反馈、扩展推广及 SEO 页面仍不纳入插件。

可运行 `npx --yes --package=knip@6.41.0 knip --config scripts/knip-json-tool.config.mjs` 复查无用代码候选；该命令只报告，不自动删除，模板 ref 和动态入口仍需人工核对。

测试入口使用现有 esbuild 依赖转换 TypeScript 源码，不要求 Node 原生 TypeScript 功能，仍兼容项目原有的 Node.js 20.19+ 或 22.12+ 环境。
