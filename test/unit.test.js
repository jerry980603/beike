/* 單元測試：node test/unit.test.js */
var BK = require("../core.js");
var pass = 0, fail = 0;
function t(name, f) {
  try { f(); pass++; } catch (e) { fail++; console.log("✗ " + name + "：" + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " 期望 " + JSON.stringify(b) + "，得到 " + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || "應該成立"); }

var D0 = new Date(2026, 9, 20, 20, 0).getTime();       // 10/20 晚上 8 點
function day(n, h) { return new Date(2026, 9, 20 + n, h == null ? 20 : h, 0).getTime(); }
function mk(n, extra) {
  var a = [];
  for (var i = 1; i <= n; i++) a.push(Object.assign({ id: "d#" + i, subj: "國文", q: "第" + i + "題＿＿", a: "答" + i, opts: ["甲", "乙", "丙"] }, extra && extra(i)));
  return a;
}
/* 答一題：ok 為 true/false */
function ans(S, sess, q, good, now) { return BK.submit(S, sess, q, { ok: good, rt: 3000, pick: good ? q.card.a : "甲" }, now); }
/* 塞一筆舊格式的進度，再跑 normalize 換成記憶模型（跟真的舊存檔一樣） */
function item(S, id, o) { S.items[id] = Object.assign({ pos: 0, due: 0, seen: 1, right: 1, wrong: 0, lapses: 0, hard: false, hardOk: [], lastUp: "", lastDn: "", lastAt: 0 }, o); BK.normalize(S); }
/* 舊測試用：國文每天 30 張新卡（新的預設是英 12、生 12、國 6） */
function B30() { var S = BK.blank(D0); S.set.newBy["國文"] = 30; return S; }

t("新卡先測答對 → 記成勉強，約 1 天後考填空", function () {
  BK.init(mk(1)); var S = BK.blank(D0), s = BK.startSession(S, D0), q = BK.next(S, s, D0);
  eq(q.kind, "P"); eq(q.fmt, "M"); eq(q.opts.length, 4);
  ans(S, s, q, true, D0);
  var it = S.items["d#1"];
  eq(it.due, BK.addDays(D0, 1)); ok(it.fl, "下次考填空"); ok(Math.abs(it.s - 1.4003) < 1e-6, "穩定度＝勉強的初始值");
  eq(BK.next(S, s, D0), null);
  eq(BK.makeQ(S, "d#1", "V").fmt, "F");
});

t("新卡先測答錯 → 隔 10 題再考、答對明天再考選擇題", function () {
  BK.init(mk(12)); var S = B30(), s = BK.startSession(S, D0);
  var q = BK.next(S, s, D0); ans(S, s, q, false, D0);
  var seen = [];
  for (var i = 0; i < 11; i++) { var x = BK.next(S, s, D0); seen.push(x.id + x.kind); ans(S, s, x, true, D0); }
  eq(seen.indexOf("d#1L"), 10, "第 11 題才再考");
  var it = S.items["d#1"];
  eq(it.due, BK.addDays(D0, 1)); ok(!it.fl, "剛看過答案，明天還是選擇題"); eq(it.lapses, 0, "學新卡答錯不算 lapses");
});

t("隔不開的再考留到明天", function () {
  BK.init(mk(1)); var S = BK.blank(D0), s = BK.startSession(S, D0);
  ans(S, s, BK.next(S, s, D0), false, D0);
  eq(BK.next(S, s, D0), null); eq(BK.left(s), 1);
  ok(BK.reviewDue(S, day(1)).indexOf("d#1") >= 0, "明天會排到");
});

t("複習答對：穩定度變大、間隔拉長；同一天再答對不再算", function () {
  BK.init(mk(1)); var S = BK.blank(D0); item(S, "d#1", { pos: 2, due: D0 });
  var it = S.items["d#1"]; eq(it.s, 3, "舊的第 2 階換成穩定度 3 天"); ok(it.fl);
  var s = BK.startSession(S, D0), q = BK.next(S, s, D0);
  eq(q.fmt, "F", "答對過選擇題就考填空"); eq(q.mode, "type");
  ans(S, s, q, true, D0);
  ok(it.s > 8 && it.s < 16, "到期時答對，穩定度約變 4 倍：" + it.s);
  eq(it.due, BK.addDays(D0, Math.round(it.s)));
  var s0 = it.s; it.due = D0;
  var s2 = BK.startSession(S, D0 + 3600000); ans(S, s2, BK.next(S, s2, D0 + 3600000), true, D0 + 3600000);
  eq(it.s, s0, "同一天不再更新"); eq(it.due, BK.addDays(D0, 1));
});

t("「其實算對」記成勉強，間隔比記得短", function () {
  BK.init(mk(2)); var S = BK.blank(D0); item(S, "d#1", { pos: 2, due: D0 }); item(S, "d#2", { pos: 2, due: D0 });
  var s = BK.startSession(S, D0), a = BK.next(S, s, D0), b = BK.next(S, s, D0);
  BK.submit(S, s, a, { ok: true, rt: 3000, grade: 2 }, D0); ans(S, s, b, true, D0);
  ok(S.items[a.id].s < S.items[b.id].s, "勉強 < 記得");
});

t("到期的先考最可能忘的（記得機率最低的先）", function () {
  BK.init(mk(3)); var S = BK.blank(D0);
  item(S, "d#1", { pos: 4, due: D0 }); item(S, "d#2", { pos: 2, due: D0 - 5 * 86400000 }); item(S, "d#3", { pos: 1, due: D0 - 86400000 });
  eq(BK.reviewDue(S, D0), ["d#2", "d#3", "d#1"]);
});

t("複習答錯：穩定度變小、lapses+1、隔 10 題再考；同一天再錯不再扣", function () {
  BK.init(mk(1)); var S = BK.blank(D0); item(S, "d#1", { pos: 3, due: D0 });
  var it = S.items["d#1"], s0 = it.s;
  var s = BK.startSession(S, D0); ans(S, s, BK.next(S, s, D0), false, D0);
  ok(it.s < s0 / 2, "穩定度變小：" + s0 + " → " + it.s); eq(it.lapses, 1); eq(s.later[0].after, 1 + BK.LAG);
  var s1 = it.s;
  s.n += 10; var r = BK.next(S, s, D0); eq(r.kind, "R");
  ans(S, s, r, false, D0); eq(it.s, s1); eq(it.lapses, 1);
  s.n += 10; ans(S, s, BK.next(S, s, D0), true, D0);
  eq(it.s, s1, "再考答對不更新"); eq(it.due, BK.addDays(D0, 1));
});

t("答錯 4 次變頑固卡；不同天答對 2 次畢業", function () {
  BK.init(mk(1)); var S = BK.blank(D0); item(S, "d#1", { pos: 1, due: D0, lapses: 3 });
  var s = BK.startSession(S, D0); ans(S, s, BK.next(S, s, D0), false, D0);
  ok(S.items["d#1"].hard, "變頑固");
  var s1 = BK.startSession(S, day(1)), q = BK.next(S, s1, day(1)); eq(q.kind, "H");
  ans(S, s1, q, true, day(1)); ok(S.items["d#1"].hard, "一天還不夠");
  var s2 = BK.startSession(S, day(2)); ans(S, s2, BK.next(S, s2, day(2)), true, day(2));
  var it = S.items["d#1"]; ok(!it.hard); eq(it.lapses, 0);
});

t("頑固卡每天最多 10 張、等最久的先", function () {
  BK.init(mk(15)); var S = BK.blank(D0);
  for (var i = 1; i <= 15; i++) item(S, "d#" + i, { pos: 0, due: D0 - i * 86400000, hard: true, lapses: 4 });
  var s = BK.startSession(S, D0);
  eq(s.queue.length, 10); eq(s.queue[0].id, "d#15");
});

t("填空：長答案自己判、打字不管全形和標點、alt 也算對", function () {
  BK.init([{ id: "x#1", subj: "化學", q: "水的化學式是＿＿", a: "H₂O", alt: ["水"], opts: ["a", "b", "c"] },
           { id: "x#2", subj: "國文", q: "＿＿", a: "唐代古文運動的領袖人物", opts: ["a", "b", "c"] }]);
  var c = BK.card("x#1");
  ok(BK.checkFill(c, " h2o ")); ok(BK.checkFill(c, "水")); ok(!BK.checkFill(c, "")); ok(!BK.checkFill(c, "H2O2"));
  var m = { id: "x#3", a: "−5×1" }, mn = { id: "x#4", a: "Mn²⁺" }, d = { id: "x#5", a: "+2.5" };
  ok(BK.checkFill(m, "-5x1")); ok(BK.checkFill(m, "－5*1")); ok(!BK.checkFill(m, "5x1"), "負號不能省");
  ok(BK.checkFill(mn, "Mn2+")); ok(!BK.checkFill(mn, "Mn2")); ok(BK.checkFill(d, "+2.5")); ok(!BK.checkFill(d, "+25"), "小數點不能省");
  var S = BK.blank(D0); item(S, "x#2", { pos: 2, due: D0 }); item(S, "x#1", { pos: 2, due: D0 });
  eq(BK.makeQ(S, "x#2", "V").mode, "self");
  var q1 = BK.makeQ(S, "x#1", "V"); eq(q1.mode, "type"); ok(q1.hint, "有上下標要提示怎麼打");
  ok(!BK.makeQ(S, "x#2", "V").hint);
});

t("各科新卡額度：英 12、生 12、國 6，明天再上", function () {
  var list = [];
  ["國文", "生物", "英文"].forEach(function (sj) { for (var i = 1; i <= 20; i++) list.push({ id: sj + "#" + i, subj: sj, q: "第" + i + "＿＿", a: sj + i, opts: ["x", "y", "z"] }); });
  BK.init(list); var S = BK.blank(D0), s = BK.startSession(S, D0);
  eq(s.queue.length, 30);
  var cnt = {}; s.queue.forEach(function (x) { var k = x.id.split("#")[0]; cnt[k] = (cnt[k] || 0) + 1; });
  eq(cnt, { "國文": 6, "生物": 12, "英文": 12 });
  eq(BK.home(S, D0, "英文").newToday, 12);
  var q; while ((q = BK.next(S, s, D0))) ans(S, s, q, true, D0);
  eq(BK.home(S, D0).newToday, 0); eq(BK.home(S, D0, "國文").newWaiting, 14);
  eq(BK.home(S, day(1), "國文").newToday, 6); eq(BK.home(S, day(1), "英文").newToday, 8);
});

t("只練一科：只出那一科的到期卡和新卡", function () {
  var list = [];
  ["國文", "英文"].forEach(function (sj) { for (var i = 1; i <= 3; i++) list.push({ id: sj + "#" + i, subj: sj, q: "第" + i + "＿＿", a: sj + i, opts: ["x", "y", "z"] }); });
  BK.init(list); var S = BK.blank(D0); item(S, "國文#1", { pos: 2, due: D0 }); item(S, "英文#1", { pos: 2, due: D0 });
  var s = BK.startSession(S, D0, "英文");
  eq(s.queue.map(function (x) { return x.id + x.kind; }), ["英文#1V", "英文#2P", "英文#3P"]);
  eq(BK.subjects(S, D0).map(function (h) { return h.subj + h.due + "/" + h.newToday; }), ["國文1/2", "英文1/2"]);
});

t("今天全部上：只有今天不限新卡，明天恢復", function () {
  BK.init(mk(58)); var S = BK.blank(D0);
  BK.allToday(S, D0);
  eq(BK.home(S, D0).newToday, 58);
  var s = BK.startSession(S, D0); eq(s.queue.length, 58);
  BK.init(mk(80)); eq(BK.home(S, day(1)).newToday, 6, "明天恢復國文每天 6 張");
});

t("先複習、再上新卡；段考卡先上", function () {
  BK.init(mk(3, function (i) { return i === 3 ? { exam: "2026-11-05" } : {}; }));
  var S = BK.blank(D0); item(S, "d#2", { pos: 1, due: D0 });
  var s = BK.startSession(S, D0);
  eq(s.queue.map(function (x) { return x.id + x.kind; }), ["d#2V", "d#3P", "d#1P"]);
});

t("段考卡：下次日期不超過考前一天", function () {
  BK.init(mk(1, function () { return { exam: "2026-10-26" }; }));
  var S = BK.blank(D0); item(S, "d#1", { pos: 3, due: D0 });
  var s = BK.startSession(S, D0); ans(S, s, BK.next(S, s, D0), true, D0);
  eq(BK.dateStr(S.items["d#1"].due), "2026-10-25");
  var after = new Date(2026, 9, 27, 20).getTime(); S.items["d#1"].due = after;
  var s2 = BK.startSession(S, after); ans(S, s2, BK.next(S, s2, after), true, after);
  ok(S.items["d#1"].due > BK.addDays(after, 7), "考完照常拉長");
});

t("10 分鐘內剛答過的，重開練習也要隔 10 題", function () {
  BK.init(mk(1)); var S = BK.blank(D0); item(S, "d#1", { pos: 1, due: D0, lastAt: D0 - 120000 });
  var s = BK.startSession(S, D0);
  eq(s.queue.length, 0); eq(s.later.length, 1); eq(BK.next(S, s, D0), null);
});

t("考前總複習：learnEnd 之後不上新卡，晚到期的平均排到 1/20", function () {
  BK.init(mk(30)); var S = BK.blank(D0);
  var now = new Date(2027, 0, 11, 20).getTime(), fd = BK.parseDate("2027-01-20");
  for (var i = 1; i <= 20; i++) item(S, "d#" + i, { pos: 5, due: BK.addDays(now, 20 + i), lapses: i % 3 });
  var s = BK.startSession(S, now);
  eq(S.finalAt, "2027-01-11");
  ok(s.queue.every(function (x) { return x.kind !== "P"; }), "不上新卡");
  for (i = 1; i <= 20; i++) ok(S.items["d#" + i].due <= fd, "d#" + i + " 排在 1/20 前");
  ok(s.queue.length >= 2, "今天就有幾張");
});

t("作廢的卡不再出現；卡片被刪掉的進度不出錯", function () {
  BK.init(mk(2)); var S = BK.blank(D0); item(S, "d#1", { pos: 1, due: D0 }); item(S, "gone#1", { pos: 1, due: D0 });
  BK.exclude(S, "d#2", D0);
  var s = BK.startSession(S, D0);
  eq(s.queue.map(function (x) { return x.id; }), ["d#1"]);
});

t("答錯後按「不用背了」：不再考", function () {
  BK.init(mk(12)); var S = B30(), s = BK.startSession(S, D0);
  var q = BK.next(S, s, D0); ans(S, s, q, false, D0); BK.exclude(S, q.id, D0, s);
  eq(BK.left(s), 11); var x, ids = [];
  while ((x = BK.next(S, s, D0))) { ids.push(x.id); ans(S, s, x, true, D0); }
  ok(ids.indexOf(q.id) < 0, "不再出現");
});

t("設定第 2 版：舊存檔的預設值換成新卡 30、目標 20；自己改過的不動", function () {
  var a = BK.normalize({ set: { budget: 15, newMax: 20 } });
  eq([a.set.budget, a.set.newMax, a.set.sv], [20, 30, 3]);
  eq(a.set.newBy, { "英文": 12, "生物": 12, "國文": 6 }, "第 3 版加各科額度");
  var b = BK.normalize({ set: { budget: 30, newMax: 20 } });
  eq([b.set.budget, b.set.newMax], [30, 30]);
  var c = BK.normalize({ set: { budget: 15, newMax: 20, sv: 2 } });
  eq([c.set.budget, c.set.newMax], [15, 20], "第 2 版之後改回 15／20 就照使用者的");
  var d = BK.normalize({ set: { sv: 3, newBy: { "英文": 20 } } });
  eq(d.set.newBy, { "英文": 20 }, "自己改過的額度不動");
  eq([BK.blank(D0).set.budget, BK.blank(D0).set.newMax], [20, 30]);
});

t("新卡各科輪流上，同一科照匯入順序", function () {
  var list = [];
  ["國文", "國文", "國文", "生物", "生物", "英文"].forEach(function (s, i) { list.push({ id: "c#" + (i + 1), subj: s, q: "＿＿", a: "a" + i, opts: ["x", "y", "z"] }); });
  BK.init(list); var S = BK.blank(D0);
  eq(BK.newWaiting(S), ["c#1", "c#4", "c#6", "c#2", "c#5", "c#3"]);
});

t("進度與熟度：各科張數、三段熟度、頑固卡、估完成日", function () {
  var list = [];
  for (var i = 1; i <= 50; i++) list.push({ id: "c#" + i, subj: i <= 30 ? "國文" : "英文", q: "＿＿", a: "a" + i, opts: ["x", "y", "z"] });
  list.push({ id: "e#1", subj: "化學", side: "段考", folder: "化", q: "＿＿", a: "b", opts: ["x", "y", "z"] });
  BK.init(list); var S = BK.blank(D0);
  item(S, "c#1", { pos: 0 }); item(S, "c#2", { pos: 1 }); item(S, "c#3", { pos: 2 });
  item(S, "c#4", { pos: 5 }); item(S, "c#5", { pos: 1, hard: true, lapses: 4 }); item(S, "c#31", { pos: 4 });
  BK.exclude(S, "c#30", D0);
  var p = BK.progress(S, D0), zh = p.subs[0], en = p.subs[1];
  eq(p.subs.length, 2, "段考卡不算");
  eq([zh.subj, zh.total, zh.started, zh.learn, zh.recall, zh.know, zh.hard], ["國文", 29, 5, 1, 2, 1, 1]);
  eq([en.subj, en.total, en.started, en.know], ["英文", 20, 1, 1]);
  eq(p.left, 43);
  eq([zh.left, zh.done, en.left, en.done], [24, "2026-10-23", 19, "2026-10-21"], "國文每天 6 張、英文 12 張");
  eq(p.done, "2026-10-23", "全部上完看最慢的那科");
});

t("再來 10 張：今天多 10 張新卡（可以只加一科），明天照常", function () {
  BK.init(mk(60)); var S = BK.blank(D0), s = BK.startSession(S, D0), q;
  while ((q = BK.next(S, s, D0))) ans(S, s, q, true, D0);
  eq(BK.home(S, D0).newToday, 0);
  BK.moreNew(S, D0, 10); eq(BK.home(S, D0).newToday, 10);
  var s2 = BK.startSession(S, D0); eq(s2.queue.length, 10);
  while ((q = BK.next(S, s2, D0))) ans(S, s2, q, true, D0);
  eq(BK.home(S, D0).newToday, 0, "加的 10 張用完了");
  BK.moreNew(S, D0, 10, "國文"); eq(BK.home(S, D0, "國文").newToday, 10);
  eq(BK.home(S, day(1)).newToday, 6, "明天照常國文 6 張");
});

t("重要度：3 先上，1 放補充資料夾不排程；已開始的 1 照樣排程", function () {
  var list = [
    { id: "a#1", subj: "國文", q: "＿＿", a: "a1", opts: ["x", "y", "z"] },
    { id: "a#2", subj: "國文", pri: 3, q: "＿＿", a: "a2", opts: ["x", "y", "z"] },
    { id: "a#3", subj: "國文", pri: 1, q: "＿＿", a: "a3", opts: ["x", "y", "z"] },
    { id: "b#1", subj: "生物", pri: 1, q: "＿＿", a: "b1", opts: ["x", "y", "z"] },
    { id: "b#2", subj: "生物", pri: 3, q: "＿＿", a: "b2", opts: ["x", "y", "z"] },
    { id: "b#3", subj: "生物", q: "＿＿", a: "b3", opts: ["x", "y", "z"] },
    { id: "e#1", subj: "化學", side: "段考", folder: "化學｜氧化還原", q: "＿＿", a: "e", opts: ["x", "y", "z"] }];
  BK.init(list); var S = BK.blank(D0);
  eq(BK.newWaiting(S), ["a#2", "b#2", "a#1", "b#3"]);
  eq(BK.folders(S).map(function (f) { return f.name; }), ["化學｜氧化還原"], "沒寫 kind 只給段考");
  eq(BK.folders(S, "補充").map(function (f) { return f.name + f.n; }), ["補充｜國文1", "補充｜生物1"]);
  item(S, "a#3", { pos: 2, due: D0 });
  ok(BK.reviewDue(S, D0).indexOf("a#3") >= 0, "已開始的重要度 1 照樣複習");
  var p = BK.progress(S, D0), zh = p.subs[0], bio = p.subs[1];
  eq([zh.total, zh.extra, bio.total, bio.extra], [3, 0, 2, 1]);
  var s = BK.startFolder(S, "補充｜生物", "M", D0), q = BK.next(S, s, D0);
  eq(q.id, "b#1"); BK.submit(S, s, q, { ok: true, rt: 1000 }, D0);
  ok(!S.items["b#1"], "資料夾練習不建立排程進度");
});

t("學測、段考分開：段考卡不進排程，只在資料夾", function () {
  BK.init(mk(3).concat([
    { id: "e#1", subj: "化學", side: "段考", folder: "化學｜氧化還原", q: "甲＿＿", a: "乙", opts: ["x", "y", "z"] },
    { id: "e#2", subj: "化學", side: "段考", folder: "化學｜氧化還原", q: "丙＿＿", a: "丁", opts: ["x", "y", "z"] },
    { id: "e#3", subj: "國文", side: "段考", folder: "國文｜師說", q: "戊＿＿", a: "己", opts: ["x", "y", "z"] }]));
  var S = BK.blank(D0);
  eq(BK.home(S, D0).total, 3); eq(BK.newWaiting(S).length, 3);
  eq(BK.folders(S).map(function (f) { return f.name + f.n; }), ["化學｜氧化還原2", "國文｜師說1"]);
  item(S, "e#1", { pos: 2, due: D0 });   // 以前在學測練過、後來改成段考：不再排程
  eq(BK.reviewDue(S, D0).length, 0);
});

t("段考資料夾：練到每張都答對一次；不影響學測排程", function () {
  var list = [];
  for (var i = 1; i <= 6; i++) list.push({ id: "e#" + i, subj: "化學", side: "段考", folder: "化", q: "第" + i + "＿＿", a: "答" + i, opts: ["x", "y", "z"] });
  BK.init(list); var S = BK.blank(D0), s = BK.startFolder(S, "化", "F", D0);
  eq(s.lag, 3); var q, order = [], wrongOnce = { "e#2": 1, "e#6": 1 };
  while ((q = BK.next(S, s, D0))) {
    eq(q.fmt, "F"); order.push(q.id);
    var good = !wrongOnce[q.id]; delete wrongOnce[q.id];
    BK.submit(S, s, q, { ok: good, rt: 2000 }, D0);
    ok(order.length < 20, "不會無限迴圈");
  }
  eq(order.length, 8, "6 張＋2 張再考");
  eq(Object.keys(S.items).length, 0, "沒有建立學測進度");
  var r = BK.endFolder(S, s, D0);
  eq([r.ok, r.n, r.done], [4, 6, true]); eq(S.fd["化"].t, "2026-10-20");
  var s2 = BK.startFolder(S, "化", "M", D0); eq(BK.next(S, s2, D0).opts.length, 4);
});

t("舊存檔換成記憶模型：穩定度、上次複習、填空", function () {
  BK.init(mk(2)); var S = BK.blank(D0);
  S.items["d#1"] = { pos: 4, due: D0 + 3 * 86400000, lapses: 2 }; S.items["d#2"] = { pos: 0, due: D0 };
  BK.normalize(S);
  var a = S.items["d#1"], b = S.items["d#2"];
  eq([a.s, a.d, a.fl, a.lr], [14, 6, true, D0 - 11 * 86400000]);
  eq([b.s, b.fl], [0.5, false]);
  var before = JSON.stringify(S.items); BK.normalize(S); eq(JSON.stringify(S.items), before, "再跑一次不變");
});

t("事件紀錄與每日紀錄", function () {
  BK.init(mk(1)); var S = BK.blank(D0), s = BK.startSession(S, D0);
  ans(S, s, BK.next(S, s, D0), true, D0); BK.addTime(S, 200000, D0);
  var l = S.log["2026-10-20"]; eq([l.a, l.c, l.n, l.ms], [1, 1, 1, 90000]);
  eq(S.ev[0].slice(1, 4), ["d#1", "PM", 1]);
});

console.log((fail ? "✗" : "✓") + " 單元測試 " + pass + "/" + (pass + fail));
process.exitCode = fail ? 1 : 0;
