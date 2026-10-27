/*
 * LoonSetu.js — 每日随机插画（Loon 原生通知版）
 *
 * 参考 ddgksf2013/Scripts 的 setu.js 实现目标；本代码独立编写。
 * 源脚本使用旧版 Lolicon API 和 Quantumult X $task/$notify。
 * 本版使用 Lolicon API v2 + Loon $httpClient/$notification/$done。
 * 强制 r18=0，并再次校验返回项的 r18 字段；这是普通插画模式，
 * 但第三方内容分类不能保证所有图片都完全适合每个人。
 * 不配置 openUrl，不弹浏览器；长按 iOS 通知查看图片。
 * 不使用 API Key、不保存执行日期、不启用 MITM。
 *
 * API 文档：https://github.com/Tsuk1ko/lolicon-api-docs/blob/main/setu.md
 * 参考原作：https://github.com/ddgksf2013/Scripts/blob/master/setu.js
 *
 * 在 Loon 配置已有的 [Script] 内添加（不要重复写 [Script]）：
 *
 * generic then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonSetu.js") with tag="随机插画·手动", timeout=40
 * cron "40 10 * * *" then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonSetu.js") with tag="随机插画·定时", timeout=40, enable=false
 *
 * 请先手动测试；满意后按需将 Cron 的 enable=false 改为 true。
 * iOS 后台 Cron 不保证精确触发。
 */
(function () {
  "use strict";

  var API = "https://api.lolicon.app/setu/v2";
  var SEARCH_TAG = "";       // 可留空随机抽取；例如："风景"
  var EXCLUDE_AI = false;    // 可手动修改为 true，以筛除 AI 作品
  var finished = false;

  function log(text) {
    console.log("[LoonSetu] " + text);
  }

  function done() {
    if (finished) return;
    finished = true;
    $done();
  }

  function safeText(text, max) {
    return String(text == null ? "" : text).replace(/[\r\n\t]+/g, " ").slice(0, max);
  }

  function safeImageUrl(url) {
    if (typeof url !== "string" || !/^https:\/\/[^\s]+$/i.test(url)) return "";
    // 图片由第三方 API 提供的 Pixiv 代理域名加载，不允许意外的非 Pixiv 地址。
    var hostname = url.match(/^https:\/\/([^/:?#]+)/i);
    if (!hostname || !/^(?:i\.pixiv\.re|i\.pixiv\.cat)$/i.test(hostname[1])) return "";
    return url;
  }

  function notifyError(message) {
    log(message);
    $notification.post("随机插画", "获取失败", safeText(message, 180));
    done();
  }

  function checkImage(url, callback) {
    if (!url) return callback(false);
    try {
      $httpClient.head({
        url: url,
        timeout: 6500,
        insecure: false
      }, function (error, response) {
        var status = Number(response && (response.status || response.statusCode));
        // 405 表示不支持 HEAD，不等于 GET 一定不可访问。
        callback(!error && (status >= 200 && status < 300 || status === 405));
      });
    } catch (e) {
      log("图片检查异常：" + String(e));
      callback(false);
    }
  }

  function showPicture(item, url) {
    var title = safeText(item.title || "随机插画", 90);
    var author = safeText(item.author || "未知作者", 55);
    var subtitle = "画师：" + author;
    var content = "《" + title + "》\n长按或展开通知查看插画";
    try {
      // 只传 mediaUrl，绝不传 openUrl；通知展开显示图片，不调用浏览器。
      $notification.post("每日随机插画", subtitle, content, { mediaUrl: url });
      log("已发送图片通知：" + title);
    } catch (e) {
      log("通知失败：" + String(e));
    }
    done();
  }

  function imageFallback(item) {
    // 通知图片不可用时发送可见的文字错误，而非静默退出。
    $notification.post("随机插画", "图片不可用",
      "《" + safeText(item.title || "未命名作品", 90) + "》\n第三方图片代理不可访问，请稍后再试。");
    done();
  }

  function handleResult(body) {
    var json;
    try {
      json = JSON.parse(String(body || ""));
    } catch (e) {
      return notifyError("API 响应不是有效 JSON");
    }
    if (!json || typeof json !== "object") return notifyError("API 响应无效");
    if (json.error) return notifyError("API：" + safeText(json.error, 110));
    if (!Array.isArray(json.data) || json.data.length === 0) {
      return notifyError("未找到符合条件的插画");
    }

    // API 也已设置 r18=0；这里二次确认，不推送标记为 R18 或缺少分类的项目。
    var item = json.data.find(function (one) {
      return one && (one.r18 === false || one.r18 === 0);
    });
    if (!item) return notifyError("返回结果未通过普通插画检查");

    var urls = item.urls || {};
    var primary = safeImageUrl(urls.regular);
    var backup = safeImageUrl(urls.small);
    if (!primary && !backup) return notifyError("图片链接缺失或来源未受信任");
    checkImage(primary, function (ok) {
      if (ok) return showPicture(item, primary);
      checkImage(backup, function (fallbackOk) {
        if (fallbackOk) return showPicture(item, backup);
        return imageFallback(item);
      });
    });
  }

  var url = API + "?r18=0&num=1&size=regular&size=small" +
    (SEARCH_TAG ? "&tag=" + encodeURIComponent(SEARCH_TAG) : "") +
    (EXCLUDE_AI ? "&excludeAI=true" : "");

  try {
    $httpClient.get({
      url: url,
      timeout: 10000,
      insecure: false,
      headers: { Accept: "application/json" }
    }, function (error, response, body) {
      if (error) return notifyError("网络错误：" + safeText(error, 100));
      var status = Number(response && (response.status || response.statusCode));
      if (status !== 200) return notifyError("API HTTP " + (status || "未知"));
      handleResult(body);
    });
  } catch (e) {
    notifyError("请求异常：" + safeText(e, 100));
  }
})();