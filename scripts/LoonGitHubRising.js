/*
 * LoonGitHubRising.js - 近 7 天 GitHub 新星项目
 *
 * GitHub search API, no GitHub token required for small public queries.
 * IMPORTANT: This ranks repositories CREATED during the last 7 days
 * by their TOTAL stars. It is NOT GitHub's official "stars today" ranking.
 * GitHub API may rate-limit anonymous requests (403/429).
 *
 * Add to existing Loon [Script]:
 * generic then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonGitHubRising.js") with tag="GitHub新星项目", timeout=30
 * cron "35 12 * * *" then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonGitHubRising.js") with tag="GitHub新星·定时", timeout=30, enable=false
 *
 * Display only; no openUrl, no API token, no local state.
 */
(function () {
  "use strict";

  var days = 7;
  var since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  var query = "created:>=" + since + " stars:>=5 fork:false";
  var url = "https://api.github.com/search/repositories?q=" +
    encodeURIComponent(query) + "&sort=stars&order=desc&per_page=5";
  var completed = false;

  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function notify(subtitle, text) {
    if (completed) return;
    completed = true;
    try {
      $notification.post("GitHub · 新星项目", subtitle, text);
    } catch (e) {
      console.log("[LoonGitHubRising] Notification error: " + String(e));
    }
    $done();
  }
  function format(repo, index) {
    var name = clean(repo.full_name, 75);
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(name)) return "";
    var stars = Number(repo.stargazers_count) || 0;
    var lang = clean(repo.language || "Other", 18);
    var description = clean(repo.description || "", 100);
    return (index + 1) + ". " + name + " ★" + stars.toLocaleString("en-US") +
      " · " + lang + (description ? "\n   " + description : "");
  }

  try {
    $httpClient.get({
      url: url,
      timeout: 10000,
      insecure: false,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "LoonGitHubRising/1.0"
      }
    }, function (error, response, body) {
      if (error) return notify("网络错误", clean(error, 150));
      var status = Number(response && (response.status || response.statusCode));
      if (status === 403 || status === 429) {
        return notify("GitHub API 限流", "请稍后再试；此脚本不使用账号令牌。HTTP " + status);
      }
      if (status !== 200) return notify("请求失败", "GitHub API HTTP " + status);
      var data;
      try {
        data = JSON.parse(String(body || ""));
      } catch (e) {
        return notify("数据错误", "GitHub API 返回的 JSON 无效");
      }
      if (!data || !Array.isArray(data.items)) {
        return notify("数据错误", "GitHub API 没有返回项目列表");
      }
      var lines = data.items.slice(0, 5).map(format).filter(Boolean);
      if (!lines.length) return notify("暂无结果", "本周没有匹配的公开项目。");
      var title = "近 7 天创建 · 按累计 Star 排序";
      notify(title, lines.join("\n\n") + "\n（不是 GitHub 官方 Trending 榜）");
    });
  } catch (e) {
    notify("运行异常", clean(e, 160));
  }
})();
