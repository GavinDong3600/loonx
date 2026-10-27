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
 * Expandable iOS notice: Top 10, short project names, single-clause summaries.
 * Display only; no openUrl, no API token, no local state or dedup.
 */
(function () {
  "use strict";

  var days = 7;
  var maxItems = 10;
  var since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  var query = "created:>=" + since + " stars:>=5 fork:false";
  var url = "https://api.github.com/search/repositories?q=" +
    encodeURIComponent(query) + "&sort=stars&order=desc&per_page=" + maxItems;;
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
  // Truncate by approximate on-screen width (CJK chars count as two columns).
  function shortText(value, maxWidth) {
    var result = "";
    var width = 0;
    var i = 0;
    for (; i < value.length; i++) {
      var ch = value.charAt(i);
      var step = /[^\x00-\xff]/.test(ch) ? 2 : 1;
      if (width + step > maxWidth) break;
      result += ch;
      width += step;
    }
    if (i < value.length) {
      if (/[a-z0-9]$/i.test(result) && /[a-z0-9]/i.test(value.charAt(i))) {
        var space = result.lastIndexOf(" ");
        if (space >= Math.floor(result.length / 2)) result = result.slice(0, space);
      }
      result = result.replace(/[\s,，.。:：;；-]+$/g, "") + "…";
    }
    return result;
  }

  function summary(value) {
    var desc = clean(value, 240)
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ").trim();
    if (!desc) return "暂无简介";
    // Prefer one self-contained Chinese clause over duplicated bilingual text.
    if (/[\u3400-\u9fff]/.test(desc)) {
      var clause = desc.split(/[，,。！？!?；;：:]/)[0].trim();
      var hanCount = (clause.match(/[\u3400-\u9fff]/g) || []).length;
      if (hanCount >= 7 && clause.length <= 45) desc = clause;
    }
    return shortText(desc, 44);
  }

  function stars(value) {
    var n = Number(value) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function format(repo, index) {
    if (!repo || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(String(repo.full_name || ""))) return "";
    var fullName = clean(repo.full_name, 100);
    var name = fullName.length <= 24 ? fullName : clean(repo.name || fullName.split("/")[1], 32);
    var lang = clean(repo.language || "其他", 14);
    var marker = (index + 1 < 10 ? "0" : "") + (index + 1) + ".";
    return marker + " " + shortText(name, 28) + "  ★" + stars(repo.stargazers_count) + " · " + lang +
      "\n   " + summary(repo.description);
  }

  try {
    $httpClient.get({
      url: url,
      timeout: 10000,
      insecure: false,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "LoonGitHubRising/1.2"
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
      var lines = data.items.slice(0, maxItems).map(format).filter(Boolean);
      if (!lines.length) return notify("暂无结果", "本周没有匹配的公开项目。");
      notify("近 7 天创建 · 累计 Star Top " + lines.length, lines.join("\n\n"));
    });
  } catch (e) {
    notify("运行异常", clean(e, 160));
  }
})();
