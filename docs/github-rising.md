# GitHub 新星日报（Loon）

- 脚本：[\`scripts/LoonGitHubRising.js\`](../scripts/LoonGitHubRising.js)
- 生成器：[\`tools/github_rising_poster.py\`](../tools/github_rising_poster.py)
- 定时任务：[\`.github/workflows/github-rising.yml\`](../.github/workflows/github-rising.yml)

## 展示方式

iOS 通知正文通常无法滚动，10 条文字可能被截断。因此每天生成一张 **1080×1920 PNG 精简海报**，完整呈现 Top 10。借鉴「每日 60 秒」的图片日报与「随机插画 / Pixiv」的 \`mediaUrl\` 附件机制。

Loon 只需保留当前 \`LoonGitHubRising.js\` 的 URL，不需要改变手动、Cron 规则，也不需要 API Token、MITM、额外服务器。

## 数据与发布时间

GitHub Actions 每日 **UTC 02:15（北京时间 10:15）** 查询 GitHub Search 中最近 7 天创建、至少 5 Star、非 fork 的公开仓库，按累计 Star 排序；该榜单**不是**官方 GitHub Trending，也不是七天内新增 Star 的排序。

GitHub Actions 生成的单张图片及对应的 \`assets/github-rising/latest.json\` 在同一提交中发布。Loon 定时任务建议放在北京时间 12:35 之后，给 CI 留出缓冲。Actions 的计划任务可能延迟。

## 失败处理

1. Loon 先读取 \`latest.json\`，只接受北京时间**今天**生成的清单及预期图片路径。
2. 若单张 PNG 的 HEAD 检查成功，发送**一条图片通知**（Top 10）。
3. 若 PNG 不可用但今日清单有效，直接按 **3+3+2+2** 拆为四条短文字通知，不再重复调用 GitHub API。
4. 若清单缺失、过期或格式错误，则重新查询 GitHub API，并按 **3+3+2+2** 发送四条短通知。
5. API 也失败时发送错误提示；手动测试允许重复推送。

**注意：** Loon 官方文档指出 \`mediaUrl\` 下载或图片解码失败时可能**不会发出那条图片通知**。HEAD 检查只能降低这种风险，不能保证最终 iOS 展示成功。若遇到此情况，请查 Loon 日志中的 \`ScriptNotificationImage\`。

## 手动更新海报

打开 [Build GitHub Rising posters](https://github.com/GavinDong3600/loonx/actions/workflows/github-rising.yml) → **Run workflow**。若希望确认发布，请检查 \`assets/github-rising/latest.json\` 中的日期及单张 `YYYY-MM-DD.png` 是否可访问。

## 维护

- 不保存 API Token；工作流使用 GitHub 自动分配的临时 \`GITHUB_TOKEN\`，仅授予仓库内容写权限。
- 图片按日期命名并保留最近 14 天；旧双图版本在首次构建新单图时清理。
- 只有今日的图片会被 Loon 推送，不会拿昨天的图片冒充今日榜单。
- 需要 Python 3.12、Pillow、Noto Sans CJK 字体；由 GitHub Actions 自动安装。
