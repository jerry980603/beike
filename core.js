/* ============================================================
   背科練習 — 核心邏輯（core.js）
   純邏輯、不碰 DOM：排程、出題、對答案。瀏覽器用 window.BK；Node 用 require。
   設計：學測作戰室 data/背科/設計.md。規則照單字 v2（docs/單字改版設計.md），程式另外寫。
   用法：init(卡片) → normalize(存檔) 或 blank(now) → home(S, now) → startSession →
         反覆 next / submit；介面另外呼叫 addTime 記時間。
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- 0. 常數 ---------- */
  var DAY = 86400000;
  /* 階梯：pos ＝ 已經通過幾階，通過後隔幾天再考。學測只剩約 100 天，比單字 v2 短 */
  var INT = [0, 1, 3, 7, 14, 30, 60];
  var MAXPOS = INT.length - 1;
  var FILL_FROM = 2;          // pos ≥ 2 改考填空（先選後填：Kang 等 2007、Rowland 2014）
  var TYPE_MAX = 6;           // 答案不超過 6 個字：打字自動對；更長：想好後自己判對錯
  var NEW_MAX = 20;           // 每天最多上幾張新卡
  var HARD_IN = 4, HARD_MAX = 10, HARD_OUT = 2;   // 答錯 4 次變頑固卡；每天最多 10 張；不同天答對 2 次畢業
  var LAG = 10;               // 答錯後再考至少隔 10 題（看完答案馬上考只考到短期記憶）
  var RECENT = 10 * 60000;    // 重開練習時，10 分鐘內剛答過的也要先隔 LAG 題
  var EV_KEEP = 20000;
  var DEF_SET = { budget: 15, floor: 5, newMax: NEW_MAX, learnEnd: "2027-01-10", finalDay: "2027-01-20" };

  /* ---------- 1. 小工具 ---------- */
  var rnd = Math.random;
  function setRandom(f) { rnd = f || Math.random; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateStr(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function parseDate(s) {
    var p = String(s).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
  }
  function dayStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { var d = new Date(dayStart(ms)); d.setDate(d.getDate() + n); return d.getTime(); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  /* 對答案前先統一：全形半形、大小寫、空白標點都不管（H₂O＝H2O、Mn²⁺＝Mn2+）。
     正負號要留著（a＝−5×1 跟 5×1 不一樣）：各種負號都當成 -，× 和 * 當成 x */
  function squash(s) {
    return String(s == null ? "" : s).normalize("NFKC").toLowerCase()
      .replace(/[−–]/g, "-").replace(/[×*]/g, "x")
      .replace(/[\s，。、；：！？「」『』（）()《》〈〉…—,;:!?'"\/]/g, "");
  }

  /* ---------- 2. 卡片 ---------- */
  var CARDS = {}, ORDER = [];
  /* 卡片由 beike.py build 產生：{id, subj, q, a, alt, opts, exam, ctx}；id ＝ "抄本檔名#n" */
  /* 學測卡（side 沒寫或「學測」）進排程；段考卡（side「段考」）只放在資料夾 folder，要背時自己進去練 */
  var FOLD = {}, FOLD_ORDER = [];
  function isExam(c) { return c && c.side === "段考"; }
  function init(list) {
    CARDS = {}; ORDER = []; FOLD = {}; FOLD_ORDER = [];
    (list || []).forEach(function (c) {
      if (!c || !c.id || CARDS[c.id]) return;
      CARDS[c.id] = c;
      if (!isExam(c)) { ORDER.push(c.id); return; }
      var f = c.folder || c.subj || "未分類";
      if (!FOLD[f]) { FOLD[f] = []; FOLD_ORDER.push(f); }
      FOLD[f].push(c.id);
    });
  }
  function card(id) { return CARDS[id] || null; }

  /* ---------- 3. 存檔 ---------- */
  function normalize(o) {
    var S = o && typeof o === "object" ? o : {};
    S.v = 1;
    S.items = S.items || {};
    S.log = S.log || {};
    S.set = Object.assign({}, DEF_SET, S.set || {});
    S.excl = S.excl || {};
    S.bad = S.bad || [];
    S.ev = S.ev || [];
    S.fd = S.fd || {};          // 段考資料夾最近一次練習：{ 資料夾: { t, ok, seen, n, fmt, done } }
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      ["pos", "due", "seen", "right", "wrong", "lapses", "lastAt"].forEach(function (k) { if (typeof it[k] !== "number") it[k] = 0; });
      it.pos = Math.max(0, Math.min(MAXPOS, it.pos));
      it.hard = !!it.hard;
      it.hardOk = it.hardOk || [];
      it.lastUp = it.lastUp || ""; it.lastDn = it.lastDn || "";
    });
    return S;
  }
  function blank(now) { return normalize({ born: now }); }
  function dayLog(S, td) { return S.log[td] || (S.log[td] = { ms: 0, a: 0, c: 0, n: 0 }); }
  function addTime(S, ms, now) { dayLog(S, dateStr(now)).ms += Math.max(0, Math.min(ms, 90000)); }

  /* ---------- 4. 排程 ---------- */
  function isDue(it, now) { return it.due < addDays(now, 1); }   // 今天之內到期都算
  function overdue(it, now) { return (now - it.due) / ((INT[it.pos] || 1) * DAY); }
  /* 下次日期：段考卡保證考前一天排到（最早明天）。
     考前總複習期間答對的不再壓到 finalDay：剛複習過、考試時還記得，全壓在同一天會塞爆 1/20（模擬抓到的） */
  function schedule(S, it, c, days, now) {
    var due = addDays(now, days);
    if (c && c.exam) {
      var ex = parseDate(c.exam);
      if (now < ex && due >= ex) due = Math.max(addDays(ex, -1), addDays(now, 1));
    }
    it.due = due;
  }
  function newWaiting(S) {
    var a = ORDER.filter(function (id) { return !S.items[id] && !S.excl[id]; });
    /* 段考卡先上（考試越近越先），其他照匯入順序 */
    var ex = a.filter(function (id) { return CARDS[id].exam; })
      .sort(function (x, y) { return CARDS[x].exam < CARDS[y].exam ? -1 : CARDS[x].exam > CARDS[y].exam ? 1 : 0; });
    return ex.concat(a.filter(function (id) { return !CARDS[id].exam; }));
  }
  function live(S) { return Object.keys(S.items).filter(function (id) { return CARDS[id] && !isExam(CARDS[id]) && !S.excl[id]; }); }
  function hardDue(S, now) {
    return live(S).filter(function (id) { var it = S.items[id]; return it.hard && isDue(it, now); })
      .sort(function (a, b) { return S.items[a].due - S.items[b].due; });
  }
  function reviewDue(S, now) {
    return live(S).filter(function (id) { var it = S.items[id]; return !it.hard && isDue(it, now); })
      .sort(function (a, b) {
        var x = S.items[a], y = S.items[b];
        return x.pos - y.pos || overdue(y, now) - overdue(x, now);
      });
  }
  function newQuota(S, now) {
    var l = dayLog(S, dateStr(now));
    if (l.all) return 100000;                        // 「今天全部上」（段考前一天用），只有今天
    if (dateStr(now) > S.set.learnEnd) return 0;    // 考前 10 天不學新東西
    return Math.max(0, S.set.newMax - l.n);
  }
  /* 段考前一天：今天不限新卡數，明天自動恢復 */
  function allToday(S, now) { dayLog(S, dateStr(now)).all = 1; S.mtime = now; }
  /* 考前總複習：learnEnd 之後第一次練習，把考前不會再到期的卡平均排到 finalDay，
     階低、錯得多的先。只做一次（finalAt） */
  function finalReview(S, now) {
    var td = dateStr(now);
    if (S.finalAt || td <= S.set.learnEnd) return 0;
    var fd = parseDate(S.set.finalDay);
    S.finalAt = td;
    if (now >= fd) return 0;
    var ids = live(S).filter(function (id) { var it = S.items[id]; return !it.hard && it.due > fd; })
      .sort(function (a, b) { var x = S.items[a], y = S.items[b]; return x.pos - y.pos || y.lapses - x.lapses; });
    var days = Math.round((fd - dayStart(now)) / DAY) + 1;
    ids.forEach(function (id, i) { S.items[id].due = addDays(now, Math.floor(i * days / ids.length)); });
    return ids.length;
  }

  /* ---------- 5. 首頁 ---------- */
  function home(S, now) {
    var td = dateStr(now), l = dayLog(S, td);
    /* 剛答錯（10 分鐘內）的先不算：馬上開始也不會考它，首頁不該顯示「開始」卻沒有題目 */
    var fresh = function (id) { return now - S.items[id].lastAt >= RECENT; };
    var h = hardDue(S, now), r = reviewDue(S, now);
    return {
      min: Math.floor(l.ms / 60000), budget: S.set.budget, floor: S.set.floor,
      hard: Math.min(h.filter(fresh).length, HARD_MAX),
      due: r.filter(fresh).length,
      soon: h.length + r.length - h.filter(fresh).length - r.filter(fresh).length,
      newToday: Math.min(newQuota(S, now), newWaiting(S).length),
      newWaiting: newWaiting(S).length,
      total: ORDER.length,
      answered: l.a, right: l.c
    };
  }

  /* ---------- 6. 一次練習 ---------- */
  /* 題目種類：P 新卡先測、L 新卡答錯後再考、M 選擇題、F 填空、R 答錯後再考（不計升降） */
  function fmt(it) { return it && it.pos >= FILL_FROM ? "F" : "M"; }
  function startSession(S, now) {
    finalReview(S, now);
    var sess = { n: 0, queue: [], later: [], done: {} };
    var recent = function (id) { var it = S.items[id]; return it && now - it.lastAt < RECENT; };
    var push = function (id, kind) {
      if (recent(id)) sess.later.push({ id: id, kind: kind, after: LAG });
      else sess.queue.push({ id: id, kind: kind });
    };
    hardDue(S, now).slice(0, HARD_MAX).forEach(function (id) { push(id, "H"); });
    reviewDue(S, now).forEach(function (id) { push(id, "V"); });
    newWaiting(S).slice(0, newQuota(S, now)).forEach(function (id) { sess.queue.push({ id: id, kind: "P" }); });
    return sess;
  }
  function makeQ(S, id, kind, force) {
    var c = CARDS[id], it = S.items[id];
    var f = force || (kind === "P" || kind === "L" ? "M" : fmt(it));
    if (f === "M" && !(c.opts && c.opts.length)) f = "F";
    var q = { id: id, kind: kind, fmt: f, subj: c.subj, q: c.q, card: c };
    if (f === "M") q.opts = shuffle([c.a].concat(c.opts));
    else q.mode = squash(c.a).length <= TYPE_MAX ? "type" : "self";
    return q;
  }
  function next(S, sess, now) {
    sess.later = sess.later.filter(function (r) { return CARDS[r.id] && !S.excl[r.id]; });
    for (var i = 0; i < sess.later.length; i++) {
      if (sess.later[i].after <= sess.n) {
        var r = sess.later.splice(i, 1)[0];
        return makeQ(S, r.id, r.kind === "V" ? fmt(S.items[r.id]) : r.kind, sess.fmt);
      }
    }
    while (sess.queue.length) {
      var s = sess.queue.shift();
      if (!CARDS[s.id] || sess.done[s.id] || S.excl[s.id]) continue;
      return makeQ(S, s.id, s.kind === "V" ? fmt(S.items[s.id]) : s.kind, sess.fmt);
    }
    /* 段考資料夾要練到全對：剩下答錯的就算還沒隔夠也拿出來（等最久的先） */
    if (sess.folder && sess.later.length) {
      sess.later.sort(function (a, b) { return a.after - b.after; });
      var x = sess.later.shift();
      return makeQ(S, x.id, x.kind, sess.fmt);
    }
    return null;   // 隔不開的再考留到明天（卡片今天還是到期，明天會排到）
  }

  /* ---------- 6b. 段考資料夾：進去練到全對，不影響學測排程 ---------- */
  function folders(S) {
    return FOLD_ORDER.map(function (f) {
      var ids = FOLD[f].filter(function (id) { return !S.excl[id]; });
      return { name: f, subj: CARDS[FOLD[f][0]].subj, n: ids.length, last: (S.fd || {})[f] || null };
    }).filter(function (x) { return x.n; });
  }
  /* fmt：「M」選擇題、「F」填空。再考的間隔：資料夾小的時候縮短，不然永遠隔不夠 */
  function startFolder(S, name, f, now) {
    var ids = (FOLD[name] || []).filter(function (id) { return !S.excl[id]; });
    return {
      folder: name, fmt: f === "F" ? "F" : "M", n: 0, done: {}, first: {}, total: ids.length,
      lag: Math.min(LAG, Math.max(2, Math.floor(ids.length / 2))),
      queue: shuffle(ids.slice()).map(function (id) { return { id: id, kind: "D" }; }), later: []
    };
  }
  function drillSubmit(S, sess, q, res, now) {
    var ok = !!res.ok, l = dayLog(S, dateStr(now));
    sess.n++; l.a++; if (ok) l.c++;
    if (!(q.id in sess.first)) sess.first[q.id] = ok;
    if (!ok) sess.later.push({ id: q.id, kind: "D", after: sess.n + sess.lag });
    sess.done[q.id] = true;
    S.ev.push([Math.round(now / 1000), q.id, "D" + q.fmt, ok ? 1 : 0, Math.round(res.rt || 0), res.pick == null ? "" : String(res.pick), -1, -1]);
    if (S.ev.length > EV_KEEP) S.ev.splice(0, S.ev.length - EV_KEEP);
    S.mtime = now;
    return { ok: ok, again: !ok };
  }
  /* 練完（或中途結束）記一筆：第一次就答對幾張、總共幾張、有沒有練完 */
  function endFolder(S, sess, now) {
    var ids = Object.keys(sess.first);
    if (!ids.length) return null;
    var r = { t: dateStr(now), ok: ids.filter(function (id) { return sess.first[id]; }).length,
              seen: ids.length, n: sess.total, fmt: sess.fmt, done: !left(sess) };
    S.fd = S.fd || {};
    S.fd[sess.folder] = r;
    S.mtime = now;
    return r;
  }
  function left(sess) { return sess.queue.length + sess.later.length; }

  /* ---------- 7. 對答案 ---------- */
  function checkFill(c, input) {
    var s = squash(input);
    if (!s) return false;
    return [c.a].concat(c.alt || []).some(function (x) { return squash(x) === s; });
  }
  function checkPick(c, pick) { return pick === c.a; }

  /* ---------- 8. 升降 ---------- */
  function newItem(now) {
    return { pos: 0, due: 0, seen: 0, right: 0, wrong: 0, lapses: 0, hard: false, hardOk: [], lastUp: "", lastDn: "", lastAt: 0, at: now };
  }
  /* res ＝ { ok, rt, pick }；回傳 { ok, again }，again ＝ 要不要排再考 */
  function submit(S, sess, q, res, now) {
    if (sess.folder) return drillSubmit(S, sess, q, res, now);
    var td = dateStr(now), c = CARDS[q.id], l = dayLog(S, td);
    var it = S.items[q.id], ok = !!res.ok, again = false;
    if (q.kind === "P") { it = S.items[q.id] = newItem(now); l.n++; }
    var before = it.pos;
    it.seen++; it.lastAt = now;
    if (ok) it.right++; else it.wrong++;
    l.a++; if (ok) l.c++;
    sess.n++;

    if (q.kind === "P" || q.kind === "L") {
      /* 新卡：先測答對＝已經會了，明天再考一次選擇題確認（猜中的機率 1/4，明天就抓得到） */
      if (ok) { it.pos = 1; it.lastUp = td; schedule(S, it, c, 1, now); }
      else { it.pos = 0; it.due = dayStart(now); again = true; }
    } else if (q.kind === "R") {
      /* 答錯後的再考：剛看過答案，不升級；答對明天再考 */
      if (ok) schedule(S, it, c, 1, now); else again = true;
    } else if (q.kind === "H") {
      if (ok) {
        if (it.hardOk.indexOf(td) < 0) it.hardOk.push(td);
        if (it.hardOk.length >= HARD_OUT) { it.hard = false; it.lapses = 0; it.hardOk = []; it.pos = 1; }
        schedule(S, it, c, 1, now);
      } else { it.due = dayStart(now); again = true; }
    } else {
      if (ok) {
        if (it.lastUp !== td) { it.pos = Math.min(MAXPOS, it.pos + 1); it.lastUp = td; schedule(S, it, c, INT[it.pos], now); }
        else schedule(S, it, c, 1, now);     // 一天只升一次
      } else {
        if (it.lastDn !== td) {              // 一天只降一次
          it.lapses++; it.pos = Math.max(0, it.pos - 1); it.lastDn = td;
          if (it.lapses >= HARD_IN && !it.hard) { it.hard = true; it.hardOk = []; }
        }
        it.due = dayStart(now); again = true;
      }
    }
    sess.done[q.id] = true;
    if (again) sess.later.push({ id: q.id, kind: q.kind === "P" || q.kind === "L" ? "L" : "R", after: sess.n + LAG });
    S.ev.push([Math.round(now / 1000), q.id, q.kind + q.fmt, ok ? 1 : 0, Math.round(res.rt || 0), res.pick == null ? "" : String(res.pick), before, it.pos]);
    if (S.ev.length > EV_KEEP) S.ev.splice(0, S.ev.length - EV_KEEP);
    S.mtime = now;
    return { ok: ok, again: again };
  }

  /* ---------- 9. 回報、作廢 ---------- */
  function report(S, q, pick, note, now) {
    S.bad.push({ id: q.id, q: q.q, a: CARDS[q.id] && CARDS[q.id].a, pick: pick || "", note: note || "", t: dateStr(now) });
    S.mtime = now;
  }
  /* 「這張不用背了」：不再出現（存檔裡留著，之後要恢復刪 excl 就好） */
  function exclude(S, id, now, sess) {
    S.excl[id] = dateStr(now); S.mtime = now;
    if (sess) sess.later = sess.later.filter(function (x) { return x.id !== id; });
  }

  var BK = {
    INT: INT, LAG: LAG, NEW_MAX: NEW_MAX, HARD_IN: HARD_IN, HARD_MAX: HARD_MAX, FILL_FROM: FILL_FROM, TYPE_MAX: TYPE_MAX,
    setRandom: setRandom, dateStr: dateStr, parseDate: parseDate, addDays: addDays, squash: squash, clone: clone,
    init: init, card: card, normalize: normalize, blank: blank, addTime: addTime, dayLog: dayLog,
    home: home, newWaiting: newWaiting, reviewDue: reviewDue, hardDue: hardDue, finalReview: finalReview,
    startSession: startSession, next: next, left: left, makeQ: makeQ,
    folders: folders, startFolder: startFolder, endFolder: endFolder,
    checkFill: checkFill, checkPick: checkPick, allToday: allToday, submit: submit, report: report, exclude: exclude
  };
  root.BK = BK;
  if (typeof module !== "undefined" && module.exports) module.exports = BK;
})(typeof window !== "undefined" ? window : this);
