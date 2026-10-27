/*
 * LoonNASAAPOD.js - NASA 每日宇宙图 (Loon native notification)
 * NASA current APOD API (migrated in September 2026):
 * https://science.nasa.gov/wp-json/wp/v2/apod-basic
 * API reference: https://api.nasa.gov/
 *
 * Add to existing Loon [Script] section:
 * generic then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonNASAAPOD.js") with tag="NASA每日宇宙图", timeout=35
 * cron "15 12 * * *" then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonNASAAPOD.js") with tag="NASA宇宙图·定时", timeout=35, enable=false
 *
 * Notification only, no browser opening, no API key, no daily deduplication.
 * Date is NASA's publication date and may differ from local calendar date.
 * APOD images may be copyrighted; use only for personal viewing.
 */
(function () {
  "use strict";

  var API = "https://science.nasa.gov/wp-json/wp/v2/apod-basic";
  var finished = false;

  function log(message) { console.log("[LoonNASAAPOD] " + message); }
  function end() {
    if (finished) return;
    finished = true;
    $done();
  }
  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
      .replace(/&#39;|&#x27;/gi, "'").replace(/\s+/g, " ")
      .trim().slice(0, max);
  }
  function notify(subtitle, body, image) {
    try {
      if (image) {
        $notification.post("NASA · 每日宇宙图", subtitle, body, { mediaUrl: image });
      } else {
        $notification.post("NASA · 每日宇宙图", subtitle, body);
      }
    } catch (e) {
      log("Notification failed: " + String(e));
    }
    end();
  }
  function imageAllowed(url) {
    return typeof url === "string" &&
      /^https:\/\/(?:[a-z0-9-]+\.)*nasa\.gov(?:[/?#]|$)/i.test(url) ? url : "";
  }
  function show(data) {
    if (Array.isArray(data)) data = data[0];
    if (!data || typeof data !== "object" || !data.title) {
      return notify("数据异常", "NASA API 没有返回有效的天文图信息。");
    }
    var date = clean(data.date || "日期未知", 25);
    var title = clean(data.title, 95);
    var detail = clean(data.explanation || data.alt || "", 280);
    var credit = clean(data.credit || data.copyright || "", 85);
    var subtitle = date + " · " + (data.media_type === "video" ? "视频封面" : "天文摄影");
    var body = title + (detail ? "\n" + detail : "") + (credit ? "\nCredit: " + credit : "");
    var image = imageAllowed(data.hdurl);
    if (!image) return notify(subtitle, body + "\n本期没有可直接展示的 NASA 图片。");
    try {
      $httpClient.head({ url: image, timeout: 7000, insecure: false },
        function (error, response) {
          var code = Number(response && (response.status || response.statusCode));
          if (!error && ((code >= 200 && code < 300) || code === 405)) {
            return notify(subtitle, body + "\n长按通知展开图片", image);
          }
          log("Image HEAD unavailable: " + (error || code));
          notify(subtitle, body + "\n图片暂不可用，显示文字摘要。");
        });
    } catch (e) {
      log("Image probe failed: " + String(e));
      notify(subtitle, body + "\n图片暂不可用，显示文字摘要。");
    }
  }
  try {
    $httpClient.get({
      url: API, timeout: 10000, insecure: false,
      headers: { Accept: "application/json" }
    }, function (error, response, body) {
      if (error) return notify("请求失败", clean(error, 150));
      var code = Number(response && (response.status || response.statusCode));
      if (code !== 200) return notify("请求失败", "NASA API HTTP " + code);
      try {
        show(JSON.parse(String(body || "")));
      } catch (e) {
        notify("数据异常", "NASA API JSON 解析失败：" + clean(e, 100));
      }
    });
  } catch (e) {
    notify("请求异常", clean(e, 150));
  }
})();
