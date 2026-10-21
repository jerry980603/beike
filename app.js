/* 背科練習 — 畫面（app.js）。邏輯都在 core.js */
(function () {
  "use strict";
  var KEY = "beike_state";
  var $main = document.getElementById("main"), $daily = document.getElementById("daily");
  var S, sess = null, cur = null, shownAt = 0, firstKey = 0, lastTick = Date.now(), stats = null;
  var KIND = { P: "新卡", L: "新卡", M: "複習", F: "複習", H: "頑固", R: "再考", V: "複習" };

  /* ---------- 存檔 ---------- */
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { }
    try { S = BK.normalize(raw ? JSON.parse(raw) : BK.blank(Date.now())); }
    catch (e) { S = BK.blank(Date.now()); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast("存檔失敗：手機空間不足或關閉了網站資料"); }
  }

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function qHtml(q, fill) {
    var parts = esc(q).split("＿＿");
    return parts[0] + '<span class="blank">' + (fill ? esc(fill) : "&nbsp;") + "</span>" + (parts[1] || "");
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  /* 只算實際在練的時間：兩次動作之間超過 90 秒的不算（core 也會截到 90 秒） */
  function tick() {
    var now = Date.now(), ms = now - lastTick;
    lastTick = now;
    if (sess && ms < 90000) BK.addTime(S, ms, now);
  }
  function daily() {
    var h = BK.home(S, Date.now());
    $daily.textContent = "今天 " + h.min + " / " + h.budget + " 分";
  }

  /* ---------- 首頁 ---------- */
  function home() {
    sess = null; cur = null;
    var now = Date.now(), h = BK.home(S, now);
    daily();
    var bars = "", on = Math.min(10, Math.round(h.min / h.budget * 10));
    for (var i = 0; i < 10; i++) bars += '<i class="' + (i < on ? "on" : "") + '"></i>';
    var todo = h.hard + h.due + h.newToday;
    var html = '<div class="card"><div class="clock"><b>' + h.min + "</b> / " + h.budget + " 分鐘</div>" +
      '<div class="bar">' + bars + "</div>" +
      '<div class="small">保底 ' + h.floor + " 分鐘；做到就算有守住</div>";
    if (!h.total) {
      html += '<div class="note">還沒有卡片。把要背的筆記拍照，放進電腦的 <b>data/背科/待匯入/</b>，跟 Claude 說「匯入背科」。</div></div>';
    } else {
      html += '<ul class="plan">' +
        (h.hard ? "<li><span>頑固卡</span><span class='n'>" + h.hard + "</span></li>" : "") +
        "<li><span>到期複習</span><span class='n'>" + h.due + "</span></li>" +
        "<li><span>新卡</span><span class='n'>" + h.newToday + (h.newWaiting > h.newToday ? "（另外 " + (h.newWaiting - h.newToday) + " 張排隊）" : "") + "</span></li></ul>";
      if (todo) html += '<button class="btn" id="go">開始</button>';
      else if (h.soon) html += '<div class="note">剛答錯的 ' + h.soon + " 張，隔 10 分鐘以上再考比較有效；晚一點再回來，或明天會排到。</div>";
      else html += '<div class="done">今天的都練完了 ✓</div>';
      if (h.newWaiting > h.newToday) html += '<button class="btn ghost mt" id="all">明天要考：今天 ' + h.newWaiting + " 張新卡全部上</button>";
      if (h.min >= h.budget && todo) html +='<div class="note">今天已經練滿 ' + h.budget + " 分鐘，可以繼續，但不用勉強。</div>";
      html += "</div>";
    }
    html += '<details class="card"><summary>設定與紀錄</summary>' +
      '<div class="setrow"><span>每天目標</span><select id="budget">' +
      [10, 15, 20, 30].map(function (m) { return "<option" + (m === S.set.budget ? " selected" : "") + ">" + m + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="setrow"><span>卡片 ' + h.total + " 張；回報 " + S.bad.length + " 題</span></div>" +
      '<button class="btn ghost mt" id="copyBad"' + (S.bad.length ? "" : " disabled") + ">複製回報給 Claude</button>" +
      '<button class="btn ghost mt" id="backup">複製備份</button>' +
      '<button class="btn ghost mt" id="restore">貼上備份還原</button>' +
      '<p class="small">題目由 Claude 依你的筆記產生，不是大考中心的題目；有問題請按「回報」。</p></details>';
    $main.innerHTML = html;
    var go = document.getElementById("go");
    if (go) go.onclick = start;
    var all = document.getElementById("all");
    if (all) all.onclick = function () {
      if (!confirm("今天把排隊的新卡全部上（明天恢復每天 " + S.set.newMax + " 張）？\n張數多會練比較久，記得留時間睡覺。")) return;
      BK.allToday(S, Date.now()); save(); home();
    };
    document.getElementById("budget").onchange = function () { S.set.budget = +this.value; save(); home(); };
    document.getElementById("copyBad").onclick = function () {
      copy("背科回報（" + S.bad.length + " 題）\n" + S.bad.map(function (b) {
        return b.t + "｜" + b.id + "｜" + b.q + "｜答案：" + b.a + (b.pick ? "｜我答：" + b.pick : "") + (b.note ? "｜" + b.note : "");
      }).join("\n"), function () {
        if (confirm("已複製。清掉這些回報嗎？（貼給 Claude 之後再清）")) { S.bad = []; save(); home(); }
      });
    };
    document.getElementById("backup").onclick = function () { copy(JSON.stringify(S), function () { toast("已複製備份"); }); };
    document.getElementById("restore").onclick = function () {
      var t = prompt("貼上備份（會蓋掉這台的進度）");
      if (!t) return;
      try {
        var o = JSON.parse(t);
        if (!o || !o.items) throw 0;
        S = BK.normalize(o); save(); toast("已還原"); home();
      } catch (e) { alert("這不是背科的備份"); }
    };
  }
  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { prompt("複製下面的文字", text); });
    } else { prompt("複製下面的文字", text); }
  }

  /* ---------- 練習 ---------- */
  function start() {
    sess = BK.startSession(S, Date.now());
    stats = { n: 0, ok: 0 };
    lastTick = Date.now();
    var hd = document.querySelector("header");
    if (!hd.querySelector(".end")) {
      var b = document.createElement("button");
      b.className = "end"; b.textContent = "結束"; b.onclick = finish;
      hd.appendChild(b);
    }
    nextQ();
  }
  function nextQ() {
    tick(); save(); daily();
    cur = BK.next(S, sess, Date.now());
    if (!cur) return finish();
    shownAt = Date.now(); firstKey = 0;
    var c = cur.card, html = '<div class="card"><div class="meta"><span class="tag">' + esc(c.subj) + '</span><span class="tag gray">' + KIND[cur.kind] + "</span></div>" +
      '<div class="q">' + qHtml(c.q) + "</div><div id='ans'>";
    if (cur.fmt === "M") {
      html += '<div class="opts">' + cur.opts.map(function (o, i) { return '<button class="opt" data-i="' + i + '">' + esc(o) + "</button>"; }).join("") +
        '<button class="opt idk" data-i="-1">不知道</button></div>';
    } else if (cur.mode === "type") {
      html += '<input id="inp" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="填入空格的答案">' +
        '<div class="row mt"><button class="btn ghost" id="idk">不知道</button><button class="btn" id="send">送出</button></div>';
    } else {
      html += '<p class="sub">先在心裡（或紙上）想好答案，再看答案。</p><button class="btn" id="show">看答案</button>';
    }
    $main.innerHTML = html + "</div></div>";
    if (cur.fmt === "M") {
      [].forEach.call($main.querySelectorAll(".opt"), function (b) {
        b.onclick = function () { var i = +b.dataset.i; pickMC(i < 0 ? null : cur.opts[i], b); };
      });
    } else if (cur.mode === "type") {
      var inp = document.getElementById("inp");
      inp.focus();
      inp.oninput = function () { if (!firstKey) firstKey = Date.now(); };
      inp.onkeydown = function (e) { if (e.key === "Enter" && !e.isComposing) sendType(); };
      document.getElementById("send").onclick = sendType;
      document.getElementById("idk").onclick = function () { done(false, "?"); };
    } else {
      document.getElementById("show").onclick = showSelf;
    }
  }
  function rt() { return (firstKey || Date.now()) - shownAt; }
  function pickMC(pick, btn) {
    var good = pick != null && BK.checkPick(cur.card, pick);
    [].forEach.call($main.querySelectorAll(".opt"), function (b) {
      b.disabled = true;
      if (b.dataset.i >= 0 && cur.opts[b.dataset.i] === cur.card.a) b.classList.add("right");
    });
    if (!good && pick != null) btn.classList.add("wrong");
    done(good, pick == null ? "?" : pick);
  }
  function sendType() {
    var inp = document.getElementById("inp"), v = inp.value.trim();
    if (!v) return inp.focus();
    var r = rt();
    if (BK.checkFill(cur.card, v)) return done(true, v, r);
    /* 打的跟答案不一樣：給自己判，錯字、同義詞程式判不出來 */
    document.getElementById("ans").innerHTML =
      '<div class="fb bad">你寫：<b>' + esc(v) + '</b><br>答案：<span class="ans">' + esc(cur.card.a) + "</span>" +
      ctxHtml() + '</div><div class="row mt"><button class="btn ghost" id="isOk">其實算對</button><button class="btn" id="isBad">算錯</button></div>';
    document.getElementById("isOk").onclick = function () { done(true, v, r); };
    document.getElementById("isBad").onclick = function () { done(false, v, r); };
  }
  function showSelf() {
    var r = Date.now() - shownAt;
    document.getElementById("ans").innerHTML =
      '<div class="fb"><span class="ans">' + esc(cur.card.a) + "</span>" + ctxHtml() + "</div>" +
      '<div class="row mt"><button class="btn ghost" id="sBad">沒想出來／想錯</button><button class="btn" id="sOk">想對了</button></div>' +
      '<p class="small">完全想對才算對；差一點也算錯，隔幾題會再考。</p>';
    document.getElementById("sOk").onclick = function () { done(true, "自評", r); };
    document.getElementById("sBad").onclick = function () { done(false, "自評", r); };
  }
  function ctxHtml() { return cur.card.ctx ? '<div class="ctx">筆記：' + esc(cur.card.ctx) + "</div>" : ""; }

  function done(good, pick, r) {
    var q = cur, res = BK.submit(S, sess, q, { ok: good, rt: r == null ? rt() : r, pick: pick }, Date.now());
    stats.n++; if (good) stats.ok++;
    save();
    var box = document.getElementById("ans"), html = "";
    if (q.fmt !== "M") box.innerHTML = "";
    if (good) {
      html = '<div class="fb ok">✓ 答對' + (q.fmt === "M" ? "" : "：<b>" + esc(q.card.a) + "</b>") + "</div>";
    } else {
      html = '<div class="fb bad">' + (pick && pick !== "?" && pick !== "自評" ? "你答：" + esc(pick) + "<br>" : "") +
        '答案：<span class="ans">' + esc(q.card.a) + "</span>" + ctxHtml() + "</div>" +
        (res.again ? '<p class="small">隔 ' + BK.LAG + " 題再考一次。</p>" : "");
    }
    html += '<button class="btn mt" id="nx">下一題</button><div class="links"><button id="rep">回報這題有問題</button><button id="skip">這張不用背了</button></div>';
    box.insertAdjacentHTML("beforeend", html);
    var nx = document.getElementById("nx");
    nx.onclick = nextQ; nx.focus();
    document.getElementById("rep").onclick = function () {
      var note = prompt("哪裡有問題？（例：答案錯、選項也說得通、看不懂）");
      if (note == null) return;
      BK.report(S, q, pick === "?" ? "" : pick, note, Date.now()); save(); toast("已記下，之後複製給 Claude");
    };
    document.getElementById("skip").onclick = function () {
      if (!confirm("這張以後不再出現？")) return;
      BK.exclude(S, q.id, Date.now(), sess); save(); nextQ();
    };
  }
  function finish() {
    if (!sess) return home();
    tick();
    var left = BK.left(sess);
    sess = null; save();
    var e = document.querySelector("header .end"); if (e) e.remove();
    var n = stats ? stats.n : 0, ok = stats ? stats.ok : 0;
    home();
    if (n) $main.insertAdjacentHTML("afterbegin", '<div class="card"><b>這次 ' + n + " 題，答對 " + ok + "</b>" +
      (left ? '<div class="small">還有 ' + left + " 張沒考到或要隔開再考，明天會排到。</div>" : "") + "</div>");
  }

  /* ---------- 開始 ---------- */
  BK.init(window.BK_CARDS || []);
  load();
  home();
  /* 換日、從背景回來時更新首頁 */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { lastTick = Date.now(); if (!sess) home(); }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () { });
})();
