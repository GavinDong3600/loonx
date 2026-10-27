/*
 * LoonHitokoto.js - 每日一言 (Loon native notification)
 * Quote API: https://developer.hitokoto.cn/sentence/
 *
 * Focus: literature (d), poetry (i), philosophy (k), witty sayings (l).
 * Community-submitted quotes; attribution may not always be accurate.
 * No token, no browser jump, no persistent/daily deduplication.
 *
 * Add to existing Loon [Script]:
 * generic then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonHitokoto.js") with tag="每日一言·手动", timeout=25
 * cron "45 10 * * *" then script("https://raw.githubusercontent.com/GavinDong3600/loonx/main/scripts/LoonHitokoto.js") with tag="每日一言·定时", timeout=25, enable=false
 */
(function () {
  "use strict";

  var PATH = "/?encode=json&c=d&c=i&c=k&c=l&min_length=8&max_length=90";
  var HOSTS = [
    "https://international.v1.hitokoto.cn",
    "https://v1.hitokoto.cn"
  ];
  var doneOnce = false;

  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function finish(subtitle, content) {
    if (doneOnce) return;
    doneOnce = true;
    try {
      $notification.post("每日一言", subtitle, content);
    } catch (e) {
      console.log("[LoonHitokoto] Notification failed: " + String(e));
    }
    $done();
  }
  function request(index, previousError) {
    if (index >= HOSTS.length) {
      return finish("获取失败", clean(previousError || "无法连接句子服务", 180));
    }
    try {
      $httpClient.get({
        url: HOSTS[index] + PATH,
        timeout: 7000,
        insecure: false,
        headers: { Accept: "application/json" }
      }, function (error, response, body) {
        var status = Number(response && (response.status || response.statusCode));
        if (error || status !== 200) {
          return request(index + 1, "HTTP " + (status || "网络异常"));
        }
        try {
          var data = JSON.parse(String(body || ""));
          if (!data || typeof data.hitokoto !== "string" || !data.hitokoto.trim()) {
            return request(index + 1, "接口没有返回有效的句子");
          }
          var category = {
            d: "文学", i: "诗词", k: "哲学", l: "趣味"
          }[String(data.type || "")] || "随机";
          var quote = clean(data.hitokoto, 260);
          var author = clean(data.from_who, 50);
          var work = clean(data.from, 70);
          var source = author && work ? author + " · " + work : (author || work || "来源未知");
          finish(category + " · " + source, "「" + quote + "」");
        } catch (e) {
          request(index + 1, "JSON 解析失败");
        }
      });
    } catch (e) {
      request(index + 1, "请求异常：" + clean(e, 90));
    }
  }
  request(0);
})();
