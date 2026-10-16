/* 跑全部測試：node test/run.js */
var cp = require("child_process"), bad = 0;
["unit.test.js", "sim.test.js"].forEach(function (f) {
  try { console.log(cp.execFileSync(process.execPath, [__dirname + "/" + f], { encoding: "utf8" }).trim().split("\n").pop()); }
  catch (e) { bad++; console.log((e.stdout || "") + (e.stderr || "")); }
});
process.exitCode = bad ? 1 : 0;
