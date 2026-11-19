# BlogPulse · 技术博客订阅助手

关注作者，而不是反复刷新网页。BlogPulse 是可自托管的 Python 命令行服务：定时发现文章，生成简短中文摘要，按订阅关系发送标题、摘要和原文链接。默认只输出到终端，不需要账号或 API key。

## 五分钟开始（Windows PowerShell）

在本仓库目录运行，建议 Python 3.10 或以上：

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python blogpulse.py preview
.\.venv\Scripts\python blogpulse.py once
.\.venv\Scripts\python blogpulse.py watch
```

macOS/Linux 用 `python3 -m venv .venv`，将后续 Python 命令替换为 `.venv/bin/python`。`preview` 列出每个来源的条目数和一个示例，不写数据库、不调用模型、不推送。`once` 完成一轮后退出（有错误返回 1）。`watch` 持续轮询，Ctrl+C 停止。默认每轮结束后等 600 秒，不是实时 webhook 订阅。

**首次成功抓取每个来源只建立基线，不补发历史文章。** 下一轮发现新链接才推送。请持久保存 `blogpulse.sqlite3`，可用 `--db` 指定路径；同一数据库只运行一个工作进程。来源临时不可用不会阻止其他来源工作。

## 来源与订阅

### 可视化阅读台与项目主页

在已有环境中执行 `python blogpulse.py once` 采集文章，再运行 `python blogpulse.py web`。
打开 [项目主页](http://127.0.0.1:8765/) 或 [阅读台](http://127.0.0.1:8765/reader.html)。阅读台支持来源筛选、标题搜索、分页和原文跳转。列表按收录顺序而非发布日期排列；旧基线没有保存摘要的条目仍可打开原文。

网页服务只监听本机，不执行抓取、付费摘要或推送。要持续更新，另开终端运行 `python blogpulse.py watch`，然后在阅读台点「刷新」。两者需使用相同的 `--db` 和 `--config`；用 `web --port 8877` 可更换端口。

项目介绍页在 `project_page/dist/`，无需 Node 或构建工具。只将该目录部署到静态主机即可（支持子路径）。静态站阅读台显示十个频道各一篇固定示例，不连接私有数据库；本机可通过 `reader.html?demo=1` 单独预览相同示例。设计参考 [VibeGame 项目页](https://vibegame.tettet.org/)，像素天文台与图标为本项目绘制。

### 配置来源和接收者

默认终端订阅涵盖十个频道：

| 来源 | ID | 收录范围 |
| --- | --- | --- |
| Lilian Weng / 科学空间 | `lilian` / `kexue` | 个人博客 feed |
| Anthropic / OpenAI | `anthropic` / `openai` | 工程团队列表 / 综合新闻 RSS |
| Cursor / Latent Space | `cursor` / `latent` | 官方博客文章列表 / 出版物 feed |
| Hacker News | `hackernews` | 首页 RSS，非全站新帖；只推标题与链接，不自动抓取社区用户提交的外部地址，也不调用 AI |
| Thinking Machines Lab | `tml` | Connectionism 研究博客，不含招聘与公司新闻 |
| LangChain / LMSYS Org | `langchain` / `lmsys` | LangChain 官方博客 RSS / LMSYS 官网首页的近期博客卡片（非完整历史） |

高频来源可从某位接收者的 `sources` 中移除。若使用已有 `config.local.json`，请将需要的新来源条目和相应订阅 ID 合并进去，重启后生效。HTML 文章卡片支持用 `title_selector` 限定标题节点，避免作者、日期混入标题。

复制 `config.json` 为 `config.local.json`，用 `watch --config config.local.json` 启动。`sources` 的键是稳定来源 ID；添加 RSS 只需 `name`、`url`。HTML 来源额外设置命中**文章链接**的 CSS `selector`。可先用 `preview --config config.local.json` 验证。每位接收者分别指定 `sources` 和一个 `channel`，例如将 `subscriptions` 替换为：

```json
{
  "个人阅读群": {"sources": ["lilian", "kexue"], "channel": "feishu", "url_env": "READING_BOT"},
  "工程团队": {"sources": ["anthropic", "openai"], "channel": "webhook", "url_env": "TEAM_WEBHOOK"}
}
```

`feishu` 对接飞书群自定义机器人（文本消息，不支持签名校验）；`webhook` 向自有 HTTP 端点 POST JSON，字段为 `source`、`title`、`url`、`summary`，2xx 表示成功。把机器人或接收端 URL 填到相应环境变量，不要提交到 Git。只想测试一个渠道时可删去另一个接收者。

## 启用 AI 中文摘要

```powershell
$env:AI_BASE_URL = 'https://api.openai.com/v1'
$env:AI_API_KEY = '<你的密钥>'
$env:AI_MODEL = '<账号可用的聊天模型 ID>'
$env:READING_BOT = '<飞书机器人 URL>'
$env:TEAM_WEBHOOK = '<团队接收端 URL>'
.\.venv\Scripts\python blogpulse.py watch --config config.local.json
```

支持 Chat Completions 兼容端点，也可使用本地模型。只有设置 `AI_MODEL` 才尝试生成；最多发送 12000 个字符的文章材料，可能产生服务商费用。优先使用 feed 内容，材料短时尝试读取原网页。无法调用模型时改发明确标注的原文节选，不冒充 AI 摘要。没有正文时只提示阅读原文。

## 运行边界

- 按来源和文章 URL 去重；识别新链接，不跟踪同一 URL 的正文修订。列表页改版后可能需要更新选择器；长时间离线时，已从源中移出的文章可能漏收。
- 在 SQLite 中先记录投递任务，每个接收者成功后单独确认。投递失败在下一轮重试；同一篇文章的摘要复用。接收端成功但确认丢失时可能重复投递，自建接收端建议按来源和 URL 去重。
- 配置修改后重启生效；删除订阅会取消对应积压任务。配置和来源应由可信管理员维护；不面向匿名用户开放抓取任意 URL 的接口。
- 长期运行应在常开的主机上用进程管理器托管 `watch`，或用系统定时任务单实例执行 `once`。不要同时运行两种方式。

## 开发

安装依赖后运行 `python -m unittest -v`。测试通过本地 HTTP 服务模拟订阅源、AI 和推送端点，不需要真实密钥。欢迎提交可复现的解析问题（来源 URL、匿名化样本、预期结果）。代码使用 MIT 许可证；文章及其内容归各自权利人所有。
