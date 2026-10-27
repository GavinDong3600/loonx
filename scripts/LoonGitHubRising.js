/*
 * LoonGitHubRising.js v2.1 - 单张 Top 10 GitHub 新星图片日报
 * 结合每日60秒图片海报 + LoonSetu (Pixiv) 的 mediaUrl 通知机制。
 * GitHub Actions 生成单张 Top 10 精简海报和相同榜单的 latest.json。
 * 图片缺失时使用清单中的 10 个项目分四条通知；清单过期时回退 GitHub Search。
 *
 * 原 Loon 配置 URL 保持不变，无需 API Token，不去重，无 openUrl。
 * generic then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonGitHubRising.js") with tag="GitHub新星项目", timeout=30
 * cron "35 12 * * *" then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonGitHubRising.js") with tag="GitHub新星·定时", timeout=30, enable=false
 */
(function () {
  "use strict";
  var ROOT = "https://raw.githubusercontent.com/GavinDong3600/loonx/main/assets/github-rising/";
  var today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  var since = new Date(Date.now() + 8 * 3600000 - 7 * 86400000).toISOString().slice(0, 10);
  var search = "https://api.github.com/search/repositories?q=" +
    encodeURIComponent("created:>=" + since + " stars:>=5 fork:false") +
    "&sort=stars&order=desc&per_page=10";
  var finished = false;
  var start = Date.now();

  function log(s) { console.log("[LoonGitHubRising] " + s); }
  function safe(s, max) {
    return String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 180);
  }
  function stars(n) {
    n = Number(n) || 0;
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
  }
  function done() {
    if (finished) return;
    finished = true;
    log("结束，耗时 " + (Date.now() - start) + "ms");
    $done();
  }
  function post(subtitle, content, url) {
    try {
      $notification.post("GitHub 新星日报", subtitle, content, url ? { mediaUrl: url } : undefined);
      log("已提交通知：" + subtitle + (url ? "（图片）" : "（文字）"));
    } catch (e) {
      log("通知接口异常：" + safe(e, 160));
      if (url) {
        try { $notification.post("GitHub 新星日报", subtitle, content); } catch (_) {}
      }
    }
  }
  function fail(message) {
    if (finished) return;
    post("获取失败", safe(message, 200));
    done();
  }
  function getJson(url, timeout, callback, headers) {
    try {
      $httpClient.get({ url: url, timeout: timeout, insecure: false,
        headers: headers || { Accept: "application/json" }
      }, function (error, response, body) {
        if (finished) return;
        if (error) return callback("网络错误：" + safe(error, 100));
        var status = Number(response && (response.status || response.statusCode));
        if (status !== 200) return callback("HTTP " + status);
        try { callback(null, JSON.parse(String(body || ""))); }
        catch (_) { callback("JSON 解析失败"); }
      });
    } catch (e) { callback("请求异常：" + safe(e, 100)); }
  }
  function valid(repo) {
    return !!repo && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(String(repo.full_name || ""));
  }
  function brief(value) {
    var s = safe(value, 170).replace(/https?:\/\/\S+/g, "");
    if (!s) return "暂无简介";
    if (/[\u3400-\u9fff]/.test(s)) {
      var clause = s.split(/[。！？!?；;]/)[0];
      if ((clause.match(/[\u3400-\u9fff]/g) || []).length >= 7) s = clause;
    }
    return s.slice(0, 58) + (s.length > 58 ? "…" : "");
  }
  function row(repo, number) {
    var name = safe(repo.name || repo.full_name.split("/")[1], 32);
    var count = repo.stars == null ? repo.stargazers_count : repo.stars;
    return (number < 10 ? "0" : "") + number + "  " + name + "  ★" + stars(count) +
      "\n" + safe(repo.language || "其他", 15) + " · " + brief(repo.description);
  }
  function textPart(items, first, last, page, pages) {
    var lines = [];
    for (var i = first; i < last && i < items.length; i++) {
      if (valid(items[i])) lines.push(row(items[i], i + 1));
    }
    if (lines.length) post(today + " · " + page + "/" + pages + " · 第" +
      (first + 1) + "–" + Math.min(last, items.length) + "名", lines.join("\n\n"));
  }
  function splitText(items, reason) {
    if (finished) return;
    log("文字降级：" + reason);
    if (!Array.isArray(items) || !items.length) return fail("榜单数据为空");
    var ranges = [[0, 3], [3, 6], [6, 8], [8, 10]];
    var count = ranges.filter(function (range) { return range[0] < items.length; }).length;
    for (var i = 0; i < count; i++) {
      textPart(items, ranges[i][0], ranges[i][1], i + 1, count);
    }
    done();
  }
  function liveFallback(reason) {
    log("海报不可用，回退 GitHub 实时 API：" + reason);
    getJson(search, 10500, function (error, data) {
      if (error) return fail("海报不可用，GitHub API " + error);
      if (!data || !Array.isArray(data.items)) return fail("API 榜单数据无效");
      splitText(data.items.filter(valid).slice(0, 10), reason);
    }, { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
         "User-Agent": "LoonGitHubRising/2.1" });
  }
  function checkImage(url, callback) {
    try {
      $httpClient.head({ url: url, timeout: 5000, insecure: false }, function (error, response) {
        if (finished) return;
        var code = Number(response && (response.status || response.statusCode));
        callback(!error && code >= 200 && code < 300);
      });
    } catch (e) {
      log("海报检查异常：" + safe(e, 100));
      callback(false);
    }
  }
  function preview(items) {
    var lines = [];
    for (var i = 0; i < 2 && i < items.length; i++) {
      lines.push((i + 1) + ". " + safe(items[i].name, 30) + " ★" + stars(items[i].stars));
    }
    return lines.join("\n") + "\n展开通知查看完整 Top 10 图片海报";
  }
  function publish(data) {
    var posterUrl = ROOT + today + ".png";
    checkImage(posterUrl, function (ok) {
      if (finished) return;
      if (!ok) return splitText(data.items, "当天海报图片不可用");
      post(today + " · 近7天新建 · Top 10", preview(data.items), posterUrl);
      done();
    });
  }
  setTimeout(function () {
    if (!finished) fail("请求超过 27 秒，请查看 Loon 网络日志");
  }, 27000);
  getJson(ROOT + "latest.json", 8000, function (error, data) {
    if (error) return liveFallback(error);
    if (!data || data.date !== today || !Array.isArray(data.items) ||
        data.items.length !== 10 || !data.items.every(valid) ||
        data.version !== 2 ||
        data.poster_url !== ROOT + today + ".png") {
      return liveFallback("无当日可用海报或清单校验失败");
    }
    publish(data);
  });
})();
