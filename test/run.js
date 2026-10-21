/* 跑全部測試：node test/run.js */
var cp = require("child_process"), fs = require("fs"), vm = require("vm"), bad = 0;
/* 介面的檔案 Node 跑不了，至少檢查語法（曾經漏一個換行讓整個 App 打不開） */
["app.js", "core.js", "sw.js", "cards.js"].forEach(function (f) {
  try { new vm.Script(fs.readFileSync(__dirname + "/../" + f, "utf8"), { filename: f }); }
  catch (e) { bad++; console.log("✗ " + f + " 語法錯誤：" + e.message); }
});
["unit.test.js", "sim.test.js"].forEach(function (f) {
  try { console.log(cp.execFileSync(process.execPath, [__dirname + "/" + f], { encoding: "utf8" }).trim().split("\n").pop()); }
  catch (e) { bad++; console.log((e.stdout || "") + (e.stderr || "")); }
});
process.exitCode = bad ? 1 : 0;
