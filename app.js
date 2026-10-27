/* 背科練習 — 畫面（app.js）。邏輯都在 core.js */
(function () {
  "use strict";
  var KEY = "beike_state";
  var $main = document.getElementById("main"), $daily = document.getElementById("daily");
  var S, sess = null, cur = null, shownAt = 0, firstKey = 0, lastTick = Date.now(), stats = null;
  var KIND = { P: "新卡", L: "新卡", M: "複習", F: "複習", H: "頑固", R: "再考", V: "複習", D: "段考" };

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

  /* ---------- 首頁：學測（照排程）／段考（資料夾，要背時進去練） ---------- */
  var TAB_KEY = "beike_tab", tab = "學測";
  try { tab = localStorage.getItem(TAB_KEY) === "段考" ? "段考" : "學測"; } catch (e) { }
  function home() {
    sess = null; cur = null;
    daily();
    var html = '<div class="tabs"><button data-t="學測" class="' + (tab === "學測" ? "on" : "") + '">學測</button>' +
      '<button data-t="段考" class="' + (tab === "段考" ? "on" : "") + '">段考</button></div>';
    html += tab === "段考" ? examHtml() : xueceHtml();
    html += settingsHtml();
    $main.innerHTML = html;
    [].forEach.call($main.querySelectorAll(".tabs button"), function (b) {
      b.onclick = function () { tab = b.dataset.t; try { localStorage.setItem(TAB_KEY, tab); } catch (e) { } home(); };
    });
    if (tab === "段考") bindExam(); else bindXuece();
    bindSettings();
  }

  function xueceHtml() {
    var h = BK.home(S, Date.now());
    var bars = "", on = Math.min(10, Math.round(h.min / h.budget * 10));
    for (var i = 0; i < 10; i++) bars += '<i class="' + (i < on ? "on" : "") + '"></i>';
    var todo = h.hard + h.due + h.newToday;
    var html = '<div class="card"><div class="clock"><b>' + h.min + "</b> / " + h.budget + " 分鐘</div>" +
      '<div class="bar">' + bars + "</div>" +
      '<div class="small">保底 ' + h.floor + " 分鐘；做到就算有守住</div>";
    if (!h.total) {
      return html + '<div class="note">還沒有學測卡片。把要背的筆記拍照，放進電腦的 <b>data/背科/待匯入/</b>，跟 Claude 說「匯入背科」。</div></div>';
    }
    html += '<ul class="plan">' +
      (h.hard ? "<li><span>頑固卡</span><span class='n'>" + h.hard + "</span></li>" : "") +
      "<li><span>到期複習</span><span class='n'>" + h.due + "</span></li>" +
      "<li><span>新卡</span><span class='n'>" + h.newToday + (h.newWaiting > h.newToday ? "（另外 " + (h.newWaiting - h.newToday) + " 張排隊）" : "") + "</span></li></ul>";
    if (todo) html += '<button class="btn" id="go">開始</button>';
    else if (h.soon) html += '<div class="note">剛答錯的 ' + h.soon + " 張，隔 10 分鐘以上再考比較有效；晚一點再回來，或明天會排到。</div>";
    else html += '<div class="done">今天的都練完了 ✓</div>';
    if (h.min >= h.budget && todo) html += '<div class="note">今天已經練滿 ' + h.budget + " 分鐘，可以繼續，但不用勉強。</div>";
    return html + "</div>" + progressHtml() + extraHtml();
  }
  /* 進度與熟度：每科一條長條（熟／記得／剛學／頑固／還沒開始） */
  function progressHtml() {
    var p = BK.progress(S, Date.now());
    if (!p.subs.length) return "";
    var pct = function (n, t) { return (n / t * 100).toFixed(1) + "%"; };
    var html = '<div class="card"><div class="ptitle"><b>進度</b><span class="small">' +
      (p.left ? (p.done ? "新卡預計 " + p.done.slice(5).replace("-", "/") + " 全部上完" : "新卡在 1/10 前上不完") : "新卡都上完了 ✓") + "</span></div>";
    p.subs.forEach(function (r) {
      html += '<div class="prow"><div class="phead"><span>' + esc(r.subj) + '</span><span class="small">' + r.started + " / " + r.total +
        (r.hard ? "　頑固 " + r.hard : "") + "</span></div>" +
        '<div class="pbar">' +
        '<i class="k" style="width:' + pct(r.know, r.total) + '"></i>' +
        '<i class="r" style="width:' + pct(r.recall, r.total) + '"></i>' +
        '<i class="l" style="width:' + pct(r.learn, r.total) + '"></i>' +
        '<i class="h" style="width:' + pct(r.hard, r.total) + '"></i></div>' +
        '<div class="small">熟 ' + r.know + "・記得 " + r.recall + "・剛學 " + r.learn + (r.extra ? "　另有補充 " + r.extra : "") + "</div></div>";
    });
    return html + '<p class="small mt">熟＝隔 14 天以上還答對；記得＝填空答對過；剛學＝還在考選擇題。</p></div>';
  }
  function bindXuece() {
    var go = document.getElementById("go");
    if (go) go.onclick = start;
    bindExam();   // 學測補充資料夾的按鈕
  }

  function examHtml() {
    var fs = BK.folders(S);
    if (!fs.length) {
      return '<div class="card"><div class="note">還沒有段考資料夾。匯入筆記時跟 Claude 說「放段考」，並說是哪一科、哪個主題。</div></div>';
    }
    return foldersHtml(fs, true) + '<p class="small">資料夾裡會練到每張都答對一次；答錯的隔幾題再考。這裡練的不影響學測的排程。</p>';
  }
  /* 學測補充：重要度 1 的卡，不進每天的排程，有空進去練 */
  function extraHtml() {
    var fs = BK.folders(S, "補充");
    if (!fs.length) return "";
    return '<h2 class="sec">學測補充</h2>' + foldersHtml(fs, false) +
      '<p class="small">比較冷僻的卡，不排進每天的複習；有空進去練到全對。覺得其實很重要，按「回報」跟 Claude 說。</p>';
  }
  function foldersHtml(fs, bySubj) {
    var html = "", subj = null;
    if (!bySubj) html += '<div class="card">';
    fs.forEach(function (f) {
      if (bySubj && f.subj !== subj) {
        if (subj !== null) html += "</div>";
        subj = f.subj;
        html += '<h2 class="sec">' + esc(subj) + '</h2><div class="card">';
      }
      var L = f.last, info = "還沒練過";
      if (L) info = "上次 " + L.t.slice(5).replace("-", "/") + "：第一次就答對 " + L.ok + " / " + L.seen + (L.done ? "" : "（沒練完）");
      var name = f.name.indexOf("｜") >= 0 ? f.name.slice(f.name.indexOf("｜") + 1) : f.name;
      html += '<div class="fold"><div><div>' + esc(name) + ' <span class="small">' + f.n + ' 張</span></div><div class="small">' + info + "</div></div>" +
        '<div class="btns"><button class="btn sm soft" data-f="' + esc(f.name) + '" data-m="M">選擇</button>' +
        '<button class="btn sm" data-f="' + esc(f.name) + '" data-m="F">填空</button></div></div>';
    });
    return html + "</div>";
  }
  function bindExam() {
    [].forEach.call($main.querySelectorAll(".fold button"), function (b) {
      b.onclick = function () { startDrill(b.dataset.f, b.dataset.m); };
    });
  }

  function settingsHtml() {
    var h = BK.home(S, Date.now()), nExam = BK.folders(S).reduce(function (a, f) { return a + f.n; }, 0);
    return '<details class="card"><summary>設定與紀錄</summary>' +
      '<div class="setrow"><span>學測每天目標（分鐘）</span><select id="budget">' +
      [10, 15, 20, 30].map(function (m) { return "<option" + (m === S.set.budget ? " selected" : "") + ">" + m + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="setrow"><span>學測 ' + h.total + " 張、段考 " + nExam + " 張；回報 " + S.bad.length + " 題</span></div>" +
      (h.newWaiting > h.newToday ? '<button class="btn ghost mt" id="all">學測：今天 ' + h.newWaiting + " 張新卡全部上</button>" : "") +
      '<button class="btn ghost mt" id="copyBad"' + (S.bad.length ? "" : " disabled") + ">複製回報給 Claude</button>" +
      '<button class="btn ghost mt" id="backup">複製備份</button>' +
      '<button class="btn ghost mt" id="restore">貼上備份還原</button>' +
      '<p class="small">題目由 Claude 依你的筆記產生，不是大考中心的題目；有問題請按「回報」。</p></details>';
  }
  function bindSettings() {
    var all = document.getElementById("all");
    if (all) all.onclick = function () {
      if (!confirm("今天把學測排隊的新卡全部上（明天恢復每天 " + S.set.newMax + " 張）？\n張數多會練比較久，記得留時間睡覺。")) return;
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
  function start() { begin(BK.startSession(S, Date.now())); }
  function startDrill(name, f) { begin(BK.startFolder(S, name, f, Date.now())); }
  function begin(x) {
    sess = x;
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
    var c = cur.card, html = '<div class="card"><div class="meta"><span class="tag">' + esc(c.subj) + '</span><span class="tag gray">' + (sess.folder ? esc(sess.folder) : KIND[cur.kind]) + "</span></div>" +
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
        (res.again ? '<p class="small">隔 ' + (sess.folder ? sess.lag : BK.LAG) + " 題再考一次。</p>" : "");
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
    var left = BK.left(sess), x = sess, msg = "";
    var n = stats ? stats.n : 0, ok = stats ? stats.ok : 0;
    if (x.folder) {
      var r = BK.endFolder(S, x, Date.now());
      if (r) msg = '<div class="card"><b>' + esc(x.folder) + (r.done ? "：練完了 ✓" : "：中途結束") + "</b>" +
        '<div class="small">第一次就答對 ' + r.ok + " / " + r.seen + " 張" + (r.done ? "；答錯的都再考到答對了" : "；還有 " + left + " 張沒答對") + "</div></div>";
    } else if (n) {
      msg = '<div class="card"><b>這次 ' + n + " 題，答對 " + ok + "</b>" +
        (left ? '<div class="small">還有 ' + left + " 張沒考到或要隔開再考，明天會排到。</div>" : "") + "</div>";
    }
    sess = null; save();
    var e = document.querySelector("header .end"); if (e) e.remove();
    home();
    if (msg) $main.insertAdjacentHTML("afterbegin", msg);
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
