/*
 * LoonDaily60s.js — 每天 60 秒读懂世界（Loon 原生版）
 *
 * 功能：纯 iOS 通知（展开看新闻图）、手动执行、日期校验、重复推送保护、图片失败转文字。
 * 通知不配置 openUrl：不会跳转 Safari 或外部新闻网页。
 * 数据来源（非新闻真实性背书）：
 *   https://github.com/vikiboss/60s-static-host (MIT)
 *   https://github.com/vikiboss/60s
 * 灵感参考（未复制其混淆代码）：
 *   https://github.com/ddgksf2013/Scripts/blob/master/60s.js
 *
 * 将下列两行添加到 Loon 配置已有的 [Script] 段，不要重复写 [Script]：
 *
 * generic then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonDaily60s.js", "manual") with tag="每日60秒·手动", timeout=40
 * cron "30 10 * * *" then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonDaily60s.js", "cron") with tag="每日60秒·定时", timeout=40, enable=false
 *
 * 先执行 Generic 测试；确认成功后将 Cron 的 enable 改为 true。
 * Cron 时间按设备本地时区解释；新闻数据以北京时间日期核验。
 * iOS 后台定时不保证严格准时执行。
 */
(function () {
  "use strict";

  var API_STATIC = "https://60s-static.viki.moe/60s/";
  var API_FALLBACK = "https://60s.viki.moe/v2/60s";
  var STORE_KEY = "loonx.daily60s.lastNotifiedDate.v1";
  var manual = typeof $argument === "string" && $argument.toLowerCase().indexOf("manual") !== -1;
  var beijingToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  var finished = false;

  function log(message) {
    console.log("[LoonDaily60s] " + message);
  }

  function done() {
    if (finished) return;
    finished = true;
    $done();
  }

  function failure(message) {
    log(message);
    if (manual) {
      $notification.post("每日60秒", "获取失败", message);
    }
    done();
  }

  function fetchJson(url, callback) {
    try {
      $httpClient.get({
        url: url,
        timeout: 8000,
        insecure: false,
        headers: { Accept: "application/json" }
      }, function (error, response, body) {
        if (error) return callback("网络错误：" + String(error));
        var status = Number(response && (response.status || response.statusCode));
        if (status !== 200) return callback("HTTP " + (status || "未知"));
        try {
          var raw = JSON.parse(String(body || ""));
          var data = raw && raw.data && typeof raw.data === "object" ? raw.data : raw;
          if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date || ""))) {
            return callback("响应日期无效");
          }
          if (!Array.isArray(data.news) || data.news.length === 0) {
            return callback("新闻列表为空");
          }
          callback(null, data);
        } catch (e) {
          callback("JSON 解析失败");
        }
      });
    } catch (e) {
      callback("请求异常：" + String(e));
    }
  }

  function checkImage(url, callback) {
    try {
      $httpClient.head({
        url: url,
        timeout: 4500,
        insecure: false,
        headers: { Accept: "image/png,image/*" }
      }, function (error, response) {
        var status = Number(response && (response.status || response.statusCode));
        callback(!error && status >= 200 && status < 300);
      });
    } catch (e) {
      callback(false);
    }
  }

  function notify(data, mediaUrl) {
    var date = String(data.date);
    var fresh = date === beijingToday;
    var rows = data.news.slice(0, mediaUrl ? 3 : 6).map(function (news, i) {
      return (i + 1) + ". " + String(news).replace(/\s+/g, " ").slice(0, 110);
    });
    var subtitle = date + " · " + data.news.length + " 条";
    if (!fresh) subtitle += " · 非今日";
    var content = rows.join("\n") + (mediaUrl ? "\n长按或展开 iOS 通知查看完整新闻图片" : "\n图片不可用，以上为新闻文字摘要");
    // 只添加 mediaUrl，绝不设置 openUrl，防止点击通知打开浏览器。
    var attach = mediaUrl ? { mediaUrl: mediaUrl } : undefined;
    try {
      $notification.post("每天60秒读懂世界", subtitle, content, attach);
      // 不依赖脚本 Tag：Generic 与 Cron 共用去重键。
      $persistentStore.write(date, STORE_KEY);
      log("已提交通知：" + date + "，图片：" + (mediaUrl ? "是" : "否"));
    } catch (e) {
      log("通知失败：" + String(e));
    }
    done();
  }

  function deliver(data) {
    var date = String(data.date);
    if (!manual && date !== beijingToday) {
      log("数据尚未更新：今天=" + beijingToday + "，接口=" + date + "；定时任务不推送过期日报");
      return done();
    }
    if (!manual && $persistentStore.read(STORE_KEY) === date) {
      log("当日已推送，跳过：" + date);
      return done();
    }

    var imagePrimary = "https://60s-static.viki.moe/images/" + date + ".png";
    var imageBackup = "https://cdn.jsdelivr.net/gh/vikiboss/60s-static-host@main/static/images/" + date + ".png";
    checkImage(imagePrimary, function (ok) {
      if (ok) return notify(data, imagePrimary);
      checkImage(imageBackup, function (backupOk) {
        notify(data, backupOk ? imageBackup : null);
      });
    });
  }

  // 当天静态 JSON 优先，公共 API 仅在静态源不可用时访问，降低公共 API 额度消耗。
  fetchJson(API_STATIC + beijingToday + ".json", function (error, data) {
    if (!error) return deliver(data);
    log("静态源不可用（" + error + "），尝试公共 API");
    fetchJson(API_FALLBACK, function (fallbackError, fallbackData) {
      if (fallbackError) return failure("静态源和公共 API 均不可用：" + fallbackError);
      deliver(fallbackData);
    });
  });
})();
