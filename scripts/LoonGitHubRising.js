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
 * Daily digest presentation: Top 10, two-line entries, clean spacing.
 * Text-only notification; unlike the 60s digest, no hosted poster is required.
 * Diagnostic safeguards: single notification, guarded callback, timeout fallback.
 * Display only; no openUrl, no API token, no local state or dedup.
 */
(function () {
  "use strict";

  var days = 7;
  var maxItems = 10;
  var since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  var query = "created:>=" + since + " stars:>=5 fork:false";
  var url = "https://api.github.com/search/repositories?q=" +
    encodeURIComponent(query) + "&sort=stars&order=desc&per_page=" + maxItems;
  var completed = false;
  var requestStartedAt = Date.now();
  function log(message) {
    console.log("[LoonGitHubRising] " + message);
  }

  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function notify(subtitle, text) {
    if (completed) return;
    completed = true;
    log("数据处理完成：" + subtitle + "，耗时 " + (Date.now() - requestStartedAt) + "ms");
    try {
      // 与每日 60 秒相同：直接向 iOS 系统发送原生通知，不额外延迟。
      $notification.post("GitHub 新星日报", subtitle, String(text || ""));
      log("已提交系统通知请求");
    } catch (e) {
      log("通知接口异常：" + String(e));
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
    var name = clean(repo.name || fullName.split("/")[1], 42);
    var lang = clean(repo.language || "其他", 16);
    var markers = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];
    var marker = markers[index] || String(index + 1) + ".";
    var heading = marker + " " + shortText(name, 29) + "  ★" + stars(repo.stargazers_count);
    var detail = shortText(lang + " · " + summary(repo.description), 52);
    return heading + "\n   " + detail;
  }

  // HTTP 回调异常或丢失时，不让本次执行无声超时。
  setTimeout(function () {
    notify("获取超时", "GitHub API 18 秒内没有响应。请检查 Loon 日志及 api.github.com 的网络连接。");
  }, 18000);

  try {
    log("请求近 7 天项目（Top " + maxItems + "）");
    $httpClient.get({
      url: url,
      timeout: 10000,
      insecure: false,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "LoonGitHubRising/1.5"
      }
    }, function (error, response, body) {
      if (completed) return;
      try {
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
        var now = new Date();
      var dateLabel = (now.getMonth() + 1) + "月" + now.getDate() + "日";
      notify(dateLabel + " · 近7天新建 · Top " + lines.length, lines.join("\n\n"));
      } catch (e) {
        notify("数据处理异常", clean(e && e.stack ? e.stack : e, 160));
      }
    });
  } catch (e) {
    notify("运行异常", clean(e, 160));
  }
})();
