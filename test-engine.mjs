// index.html の計算エンジンをそのまま抜き出して検証する（出荷するコードそのものをテストする）
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const script = html.split("<script>")[1].split("</script>")[0];
const engine = script.split("/* ========================= UI ========================= */")[0];
const mod = new Function(engine + "\nreturn {YEARS,kyuyoShotoku,incomeForShotoku,incomeTax,taxOf,simulate,walls,socialInsurance,supporterDeduction,lookup,TOKUTEI_SHINZOKU,HAIGUSHA_TOKUBETSU_I,HAIGUSHA_KOJO_I,stdMonthly,REGIMES,man,yen};")();
const { YEARS, kyuyoShotoku, incomeForShotoku, taxOf, simulate, walls, socialInsurance,
        supporterDeduction, lookup, TOKUTEI_SHINZOKU, HAIGUSHA_TOKUBETSU_I,
        HAIGUSHA_KOJO_I, stdMonthly } = mod;

const R = [];
let ng = 0;
const ok = (name, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) ng++;
  R.push([name, String(got), String(want), pass ? "OK" : "★NG"]);
};
const info = (name, got) => R.push([name, String(got), "-", "参考"]);

const base = (year, over = {}) => ({
  year, P: YEARS[year], role: "child1922", hasSupporter: true,
  isStudent: false, supporterIncome: 6000000, age40: false,
  weekly: 1, firmSize: 51, regimeId: year === 2025 ? "pre2610" : "post2610",
  kidsCount: 1, uniKids: 0, uniType: "private",
  pHealth: 9.85, pCare: 1.62, pKodomo: 0.23, pPension: 18.30, pKoyo: 0.50,
  pKokunen: 17920, kokuhoMode: "estimate", pKokuhoRate: 12.5, pKokuhoFlat: 66300, pKokuhoCap: 1130000,
  pJuminFlat: 5000, pHikazei: 450000, ...over,
});
// 「◯◯万円の壁」は社会保険料控除を織り込まない法令上のラインなので、
// 社会保険料控除ゼロで taxOf を直接叩いて検証する。
const tax = (year, shunyu) => {
  const r = taxOf(shunyu, YEARS[year], 0, 0, 0, { hikazeiLimit: 450000, juminFlat: 5000 });
  return { it: r.tax, jt: r.jumin };
};

console.log("\n──────── 令和7年分（2025）：改正前の壁 ────────");
ok("年収1,600,000 所得税ゼロ", tax(2025, 1600000).it, 0);
ok("年収1,610,000 所得税あり", tax(2025, 1610000).it > 0, true);
ok("年収1,100,000 住民税ゼロ", tax(2025, 1100000).jt, 0);
ok("年収1,110,000 住民税あり", tax(2025, 1110000).jt > 0, true);
ok("年収1,230,000 の合計所得＝58万", kyuyoShotoku(1230000, YEARS[2025]), 580000);
ok("子1,500,000 特定親族特別控除63万", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1500000, YEARS[2025]), 1), 630000);
ok("子1,880,000 控除3万", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1880000, YEARS[2025]), 1), 30000);
ok("子1,890,000 控除0", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1890000, YEARS[2025]), 1), 0);
ok("配偶者1,600,000 控除38万", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(1600000, YEARS[2025]), 1), 380000);
ok("配偶者2,014,000 控除3万", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(2014000, YEARS[2025]), 1), 30000);
ok("配偶者2,020,000 控除0", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(2020000, YEARS[2025]), 1), 0);

console.log("──────── 令和8年分（2026）：178万円の壁 ────────");
ok("給与所得控除の最低保障74万（年収2,200,000）", 2200000 - kyuyoShotoku(2200000, YEARS[2026]), 740000);
ok("年収1,900,000 の給与所得控除も74万", 1900000 - kyuyoShotoku(1900000, YEARS[2026]), 740000);
ok("年収2,500,000 は段階計算（30%+8万）", 2500000 - kyuyoShotoku(2500000, YEARS[2026]), 830000);
ok("年収1,780,000 所得税ゼロ", tax(2026, 1780000).it, 0);
ok("年収1,790,000 所得税あり", tax(2026, 1790000).it > 0, true);
ok("年収1,190,000 住民税ゼロ", tax(2026, 1190000).jt, 0);
ok("年収1,200,000 住民税あり", tax(2026, 1200000).jt > 0, true);
ok("年収1,360,000 の合計所得＝62万（扶養の要件）", kyuyoShotoku(1360000, YEARS[2026]), 620000);
ok("子1,590,000 特定親族特別控除63万（満額）", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1590000, YEARS[2026]), 1), 630000);
ok("子1,600,000 控除61万（逓減開始）", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1600000, YEARS[2026]), 1), 610000);
ok("子1,970,000 控除3万", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1970000, YEARS[2026]), 1), 30000);
ok("子1,980,000 控除0", lookup(TOKUTEI_SHINZOKU, kyuyoShotoku(1980000, YEARS[2026]), 1), 0);
ok("配偶者1,690,000 控除38万（満額）", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(1690000, YEARS[2026]), 1), 380000);
ok("配偶者1,700,000 控除36万", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(1700000, YEARS[2026]), 1), 360000);
ok("配偶者2,070,000 控除3万", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(2070000, YEARS[2026]), 1), 30000);
ok("配偶者2,080,000 控除0", lookup(HAIGUSHA_TOKUBETSU_I, kyuyoShotoku(2080000, YEARS[2026]), 1), 0);
ok("配偶者1,360,000 は配偶者控除38万", supporterDeduction("spouse", kyuyoShotoku(1360000, YEARS[2026]), YEARS[2026], 4360000)[0], 380000);
ok("勤労学生 年収1,630,000 まで適用",
   simulate(1630000, base(2026, { isStudent: true, weekly: 0, firmSize: 1 })).kinroOK, true);
ok("勤労学生 年収1,640,000 は不適用",
   simulate(1640000, base(2026, { isStudent: true, weekly: 0, firmSize: 1 })).kinroOK, false);

console.log("──────── 令和9年分（2027）＝令和8年分と同一 ────────");
ok("令和9年分も178万円が非課税ライン", tax(2027, 1780000).it, 0);
ok("令和9年分 1,790,000 で課税", tax(2027, 1790000).it > 0, true);

console.log("──────── 令和10年分（2028・特例終了後の予定） ────────");
ok("非課税ラインが168万に低下", tax(2028, 1680000).it, 0);
ok("年収1,690,000 で課税", tax(2028, 1690000).it > 0, true);
ok("扶養の要件は給与収入131万", kyuyoShotoku(1310000, YEARS[2028]), 620000);
info("合計所得132万の段差：年収2,010,000の基礎控除", lookup(YEARS[2028].kisoIncome, kyuyoShotoku(2010000, YEARS[2028])));
info("　　　　　　　　　　年収2,020,000の基礎控除", lookup(YEARS[2028].kisoIncome, kyuyoShotoku(2020000, YEARS[2028])));

console.log("──────── 標準報酬月額 ────────");
ok("報酬88,000円 → 標準報酬88,000", stdMonthly(88000, false), 88000);
ok("報酬92,999円 → 標準報酬88,000", stdMonthly(92999, false), 88000);
ok("報酬93,000円 → 標準報酬98,000", stdMonthly(93000, false), 98000);
ok("厚生年金の下限88,000が効く", stdMonthly(60000, true), 88000);
ok("厚生年金の上限650,000が効く", stdMonthly(900000, true), 650000);

console.log("──────── 社会保険の適用拡大タイムライン ────────");
const si = (shunyu, over) => socialInsurance(shunyu, base(2026, over)).status;
ok("2026年9月まで・年収105万は扶養内", si(1050000, { regimeId: "pre2610" }), "fuyou");
ok("2026年9月まで・年収106万で社保加入", si(1060000, { regimeId: "pre2610" }), "shaho");
ok("2026年10月以降・年収80万でも社保加入（賃金要件撤廃）", si(800000, { regimeId: "post2610" }), "shaho");
ok("2026年10月以降・週20時間未満なら年収129万は扶養内", si(1290000, { regimeId: "post2610", weekly: 0 }), "fuyou");
ok("2026年10月以降・週20時間未満で年収130万は国保", si(1300000, { regimeId: "post2610", weekly: 0 }), "kokuho");
ok("従業員40人・2026年10月時点は対象外", si(1500000, { regimeId: "post2610", firmSize: 36 }), "kokuho");
ok("従業員40人・2027年10月以降は加入", si(1500000, { regimeId: "post2710", firmSize: 36 }), "shaho");
ok("学生は週20時間でも適用除外", si(1200000, { isStudent: true }), "fuyou");
ok("学生でも週30時間以上なら加入", si(1200000, { isStudent: true, weekly: 2 }), "shaho");
ok("学生・年収130万超は国保（年金は納付特例）",
   socialInsurance(1400000, base(2026, { isStudent: true, weekly: 0 })).pension, 0);

console.log("──────── 壁の金額の換算（合計所得→給与収入） ────────");
ok("令和8年分 住民税45万 → 119万円", incomeForShotoku(450000, YEARS[2026]), 1190000);
ok("令和8年分 基礎控除104万 → 178万円", incomeForShotoku(1040000, YEARS[2026]), 1780000);
ok("令和8年分 扶養要件62万 → 136万円", incomeForShotoku(620000, YEARS[2026]), 1360000);
ok("令和8年分 特定親族85万 → 159万円", incomeForShotoku(850000, YEARS[2026]), 1590000);
ok("令和8年分 特定親族123万 → 197万円", incomeForShotoku(1230000, YEARS[2026]), 1970000);
ok("令和8年分 配偶者95万 → 169万円", incomeForShotoku(950000, YEARS[2026]), 1690000);
ok("令和8年分 配偶者133万 → 207万円", incomeForShotoku(1330000, YEARS[2026]), 2070000);
ok("令和7年分 基礎控除95万 → 160万円", incomeForShotoku(950000, YEARS[2025]), 1600000);
ok("令和7年分 住民税45万 → 110万円", incomeForShotoku(450000, YEARS[2025]), 1100000);
ok("令和10年分 基礎控除99万 → 168万円", incomeForShotoku(990000, YEARS[2028]), 1680000);
ok("令和10年分 扶養要件62万 → 131万円", incomeForShotoku(620000, YEARS[2028]), 1310000);

console.log("──────── 手取り逆転と家族への影響 ────────");
const c25 = base(2025, { weekly: 0, regimeId: "pre2610" });
const n129 = simulate(1290000, c25).net, n130 = simulate(1300000, c25).net;
info("令和7年分 年収129万の手取り", n129.toLocaleString());
info("令和7年分 年収130万の手取り（扶養外れ）", n130.toLocaleString());
ok("130万円の壁で手取りが逆転する", n130 < n129, true);

const c26 = base(2026, { role: "child1922", supporterIncome: 6000000, weekly: 0 });
const p159 = simulate(1590000, c26).sup.increase, p198 = simulate(1980000, c26).sup.increase;
info("親(年収600万)の増税：子の年収159万時点", p159.toLocaleString());
info("親(年収600万)の増税：子の年収198万時点", p198.toLocaleString());
ok("控除満額（159万）では親の増税ゼロ", p159, 0);
ok("控除消滅（198万）では親が増税", p198 > 50000, true);

const cSpouse = base(2026, { role: "spouse", supporterIncome: 6000000, weekly: 0 });
ok("配偶者：年収169万まで扶養者の増税ゼロ", simulate(1690000, cSpouse).sup.increase, 0);
ok("配偶者：年収208万で扶養者が増税", simulate(2080000, cSpouse).sup.increase > 0, true);

const cChild23 = base(2026, { role: "child23", supporterIncome: 6000000, weekly: 0 });
const d136 = simulate(1360000, cChild23).sup.increase, d137 = simulate(1370000, cChild23).sup.increase;
info("23歳以上の子：年収136万での親の増税", d136.toLocaleString());
info("23歳以上の子：年収137万での親の増税", d137.toLocaleString());
ok("扶養控除は1万円の差で一気に消える（崖）", d136 === 0 && d137 > 50000, true);

console.log("──────── 壁の一覧（令和8年分・19〜22歳の子・週20時間） ────────");
const wl = walls(base(2026, { role: "child1922", kidsCount: 3, uniKids: 2 }));
wl.forEach(w => info(`  ${(w.amount/10000).toFixed(0)}万円`, w.name));
ok("賃金要件撤廃後は106万円の壁が出ない", wl.some(w => w.amount === 1056000), false);
ok("178万円の壁がある", wl.some(w => w.amount === 1780000), true);
ok("多子世帯の壁がある", wl.some(w => w.kind === "tuition"), true);

const wl25 = walls(base(2025, { role: "child1922", regimeId: "pre2610" }));
ok("令和7年分では106万円の壁が出る", wl25.some(w => w.amount === 1056000), true);
ok("令和7年分では160万円の壁が出る", wl25.some(w => w.amount === 1600000), true);


console.log("──────── 国民健康保険の2モード ────────");
const kEst = socialInsurance(1400000, base(2026, { weekly: 0, kokuhoMode: "estimate" }));
const kMan = socialInsurance(1400000, base(2026, { weekly: 0, kokuhoMode: "manual" }));
ok("概算モードは概算フラグが立つ", kEst.kokuhoEstimated, true);
ok("自治体入力モードは概算フラグが立たない", kMan.kokuhoEstimated, false);
info("概算モードの国保料（年収140万）", kEst.health.toLocaleString());
info("自治体入力モード（12.5%/66,300円）の国保料", kMan.health.toLocaleString());
ok("入力した料率が実際に効いている", kEst.health !== kMan.health, true);
const kCare = socialInsurance(1400000, base(2026, { weekly: 0, kokuhoMode: "estimate", age40: true }));
ok("40歳以上は介護納付金分が上乗せされる", kCare.health > kEst.health, true);
ok("賦課限度額113万円が効く", socialInsurance(20000000, base(2026, { weekly: 0, hasSupporter: false })).health, 1130000);

console.log();
console.table(R.map(([n,g,w,s]) => ({ 検証項目:n, 結果:g, 期待:w, 判定:s })));
console.log(ng ? `\n★ NG ${ng}件` : `\n全アサーション PASS（${R.filter(r=>r[3]==="OK").length}件）`);
process.exit(ng ? 1 : 0);
