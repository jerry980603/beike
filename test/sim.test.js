/* 模擬 10/20 → 1/22：每週新增卡片、每天最多練 budget 分鐘、有些天沒練。
   檢查狀態合法、每天的量不會越積越多。記憶模型是玩具（全部【我的估計】），只看量和趨勢。
   node test/sim.test.js [每週張數=45] [每天分鐘=15] [沒練的機率=0.15] [種子=1] */
var BK = require("../core.js");
var PER_WEEK = +process.argv[2] || 45, BUDGET = +process.argv[3] || 15, SKIP = process.argv[4] != null ? +process.argv[4] : 0.15;
var seed = +process.argv[5] || 1;
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
BK.setRandom(rand);

var SEC = { M: 6, F: 10, FB: 6 };            // 每題秒數、答錯看回饋多幾秒【我的估計】
var cards = [], mem = {};                    // mem[id] = { s: 穩定度（天）, last: 上次複習 ms }
var errs = [], weeks = [], S = BK.blank(0);
S.set.budget = BUDGET;
var start = new Date(2026, 9, 20, 20).getTime(), exam = new Date(2027, 0, 22, 8).getTime();

function recall(id, now) {
  var m = mem[id];
  if (!m) return 0.3;                        // 新卡本來就會的機率
  return Math.exp(Math.log(0.9) * ((now - m.last) / 86400000) / m.s);
}
function learn(id, good, now) {
  var m = mem[id] || (mem[id] = { s: 0.5, last: now });
  m.s = good ? m.s * 2.5 : Math.max(0.5, m.s * 0.5);
  m.last = now;
}

for (var d = 0; ; d++) {
  var now = BK.addDays(start, d) + 20 * 3600000;
  if (now > exam - 86400000) break;          // 考前一天練完為止
  var wd = new Date(now).getDay();
  if ((wd === 1 || wd === 3 || wd === 6) && BK.dateStr(now) <= "2027-01-10") {
    for (var k = 0; k < PER_WEEK / 3; k++) {
      var n = cards.length + 1;
      cards.push({ id: "c#" + n, subj: ["國文", "生物", "化學", "英文"][n % 4], q: "第" + n + "題＿＿", a: "答" + n, opts: ["x", "y", "z"],
        exam: n % 5 === 0 ? BK.dateStr(BK.addDays(now, 10)) : undefined });
    }
    BK.init(cards);
  }
  var info = BK.home(S, now), sec = 0, cnt = 0;
  if (rand() >= SKIP) {
    var sess = BK.startSession(S, now), q;
    while (sec < BUDGET * 60 && (q = BK.next(S, sess, now + sec * 1000))) {
      var t = now + sec * 1000, p = recall(q.id, t);
      if (q.fmt === "M") p = p + (1 - p) * 0.25;           // 選擇題可以猜
      if (q.kind === "R" || q.kind === "L") p = Math.max(p, 0.85);   // 剛看過答案
      var good = rand() < p;
      BK.submit(S, sess, q, { ok: good, rt: 3000 }, t);
      if (q.kind !== "R" && q.kind !== "L") learn(q.id, good, t); else if (good) mem[q.id].last = t;
      if (!mem[q.id]) learn(q.id, good, t);
      sec += SEC[q.fmt] + (good ? 0 : SEC.FB); cnt++;
    }
    BK.addTime(S, sec * 1000, now);
  }
  /* 檢查狀態合法 */
  Object.keys(S.items).forEach(function (id) {
    var it = S.items[id];
    if (!(it.pos >= 0 && it.pos <= 6) || !isFinite(it.due)) errs.push(BK.dateStr(now) + " " + id + " 狀態不合法");
  });
  var w = Math.floor(d / 7);
  weeks[w] = weeks[w] || { from: BK.dateStr(now), q: 0, min: 0, days: 0, backlog: 0, wait: 0 };
  weeks[w].q += cnt; weeks[w].min += sec / 60; weeks[w].days++;
  weeks[w].backlog = BK.reviewDue(S, BK.addDays(now, 1)).length + BK.hardDue(S, BK.addDays(now, 1)).length;
  weeks[w].wait = info.newWaiting;
}

console.log("每週開始  平均題數/天  平均分鐘/天  週末到期  排隊新卡");
weeks.forEach(function (w) {
  console.log(w.from + "  " + (w.q / w.days).toFixed(0).padStart(8) + "  " + (w.min / w.days).toFixed(1).padStart(10) +
    "  " + String(w.backlog).padStart(8) + "  " + String(w.wait).padStart(8));
});
var total = cards.length, seen = Object.keys(S.items).length, good90 = 0, hard = 0, never = 0;
cards.forEach(function (c) {
  if (!S.items[c.id]) { never++; return; }
  if (recall(c.id, exam) >= 0.9) good90++;
  if (S.items[c.id].hard) hard++;
});
console.log("卡片 " + total + "、練過 " + seen + "、沒碰到 " + never + "、考試當天記得 ≥90% 的 " + Math.round(good90 / total * 100) + "%、頑固卡 " + hard);
/* 積欠看 learnEnd 前一週（之後是考前總複習，故意排很多） */
var last = weeks.filter(function (w) { return w.from <= "2027-01-03"; }).pop();
if (last.backlog > 150) errs.push(last.from + " 那週積欠 " + last.backlog + " 張，越積越多");
console.log(errs.length ? "✗ 模擬：" + errs.slice(0, 5).join("；") : "✓ 模擬：狀態都合法、沒有越積越多");
process.exitCode = errs.length ? 1 : 0;
