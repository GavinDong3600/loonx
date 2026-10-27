/*
 * Loon Network Check - minimal, read-only demo
 * Compatible with Loon's Generic and Cron script triggers.
 * Checks two named policies through HTTPS and reports their visible exit IPs.
 * Does not change policy selection, DNS, nodes, or rules.
 */
(function () {
  "use strict";

  var target = "https://www.cloudflare.com/cdn-cgi/trace";
  var checks = [
    { label: "美国测速", node: "美国测速" },
    { label: "JMS → Linode", node: "JMS → Linode" }
  ];
  var groups = ["YouTube", "Spotify", "国际网站", "Netflix", "金融支付"];
  var results = new Array(checks.length);
  var remaining = checks.length;
  var ended = false;

  function parseTrace(body) {
    var record = {};
    String(body || "").split(/\r?\n/).forEach(function (line) {
      var pos = line.indexOf("=");
      if (pos > 0) {
        record[line.slice(0, pos)] = line.slice(pos + 1);
      }
    });
    return record;
  }

  function finishOne() {
    remaining -= 1;
    if (remaining !== 0 || ended) return;
    ended = true;

    var successCount = results.filter(function (r) { return r.ok; }).length;
    var routeLines = results.map(function (r) {
      return r.ok
        ? r.label + "：" + r.ip + " (" + (r.loc || "未知地区") + ", " + r.ms + "ms)"
        : r.label + "：失败（" + r.error + "）";
    });
    var chosen = groups.map(function (name) {
      var selected = "不可读取";
      try {
        selected = $config.getSelectedPolicy(name) || "未选择";
      } catch (e) {
        selected = "读取失败";
      }
      return name + " → " + selected;
    });

    console.log("[Loon Network Check] " + JSON.stringify({
      at: new Date().toISOString(),
      checks: results,
      groups: chosen
    }));

    $notification.post(
      "Loon 网络巡检",
      successCount + "/" + checks.length + " 条出口路径成功",
      routeLines.concat(chosen).join("\n")
    );
    $done();
  }

  checks.forEach(function (check, index) {
    var start = Date.now();
    try {
      $httpClient.get({
        url: target + "?loon_check=" + Date.now() + "_" + index,
        node: check.node,
        timeout: 8000,
        insecure: false,
        headers: { Accept: "text/plain" }
      }, function (error, response, body) {
        var ms = Date.now() - start;
        if (error) {
          results[index] = { label: check.label, ok: false, error: String(error), ms: ms };
        } else if (!response || Number(response.status) !== 200) {
          results[index] = {
            label: check.label, ok: false,
            error: "HTTP " + (response ? response.status : "无响应"), ms: ms
          };
        } else {
          var info = parseTrace(body);
          results[index] = info.ip
            ? { label: check.label, ok: true, ip: info.ip, loc: info.loc || "", ms: ms }
            : { label: check.label, ok: false, error: "响应中未找到 ip", ms: ms };
        }
        finishOne();
      });
    } catch (e) {
      results[index] = { label: check.label, ok: false, error: String(e), ms: Date.now() - start };
      finishOne();
    }
  });
})();
