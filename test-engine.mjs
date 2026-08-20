// index.html の計算エンジンをそのまま抜き出して検証する（出荷するコードそのものをテストする）
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const script = html.split("<script>")[1].split("</script>")[0];
const engine = script.split("/* ========================= UI ========================= */")[0];
const mod = new Function(engine + "\nreturn {chouseiKojo,hikazeiLimits,fuyoNinteiLimit,tashiLimitShotoku,FUYO_NINTEI_LIMIT_1922,JINTEKI_SA,KOKUHO_ESTIMATE,YEARS,kyuyoShotoku,incomeForShotoku,incomeTax,taxOf,simulate,walls,socialInsurance,supporterDeduction,lookup,TOKUTEI_SHINZOKU,HAIGUSHA_TOKUBETSU_I,HAIGUSHA_KOJO_I,stdMonthly,REGIMES,man,yen};")();
const { chouseiKojo, hikazeiLimits, fuyoNinteiLimit, tashiLimitShotoku,
        FUYO_NINTEI_LIMIT_1922, JINTEKI_SA, KOKUHO_ESTIMATE, YEARS, kyuyoShotoku, incomeForShotoku, taxOf, simulate, walls, socialInsurance,
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
  pKokunen: 17920, kokuhoMode: "estimate", pKokuhoRate: 10.61, pKokuhoFlat: 35000,
  pKokuhoByosei: 30000, pKokuhoCap: 960000,
  pJuminFlat: 5000, pKyuchi: 350000, ...over,
});
// 「◯◯万円の壁」は社会保険料控除を織り込まない法令上のラインなので、
// 社会保険料控除ゼロで taxOf を直接叩いて検証する。
const tax = (year, shunyu) => {
  const r = taxOf(shunyu, YEARS[year], 0, 0, 0, { hikazeiBase: 350000, juminFlat: 5000 });
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
ok("2026年10月以降・週20時間未満なら年収129万は扶養内（23歳以上）",
   si(1290000, { regimeId: "post2610", weekly: 0, role: "child23" }), "fuyou");
ok("2026年10月以降・週20時間未満で年収130万は国保（23歳以上）",
   si(1300000, { regimeId: "post2610", weekly: 0, role: "child23" }), "kokuho");
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
const c25 = base(2025, { weekly: 0, regimeId: "pre2610", role: "child23" });
const n129 = simulate(1290000, c25).net, n130 = simulate(1300000, c25).net;
info("令和7年分 年収129万の手取り（23歳以上の子）", n129.toLocaleString());
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
const kEst = socialInsurance(1400000, base(2026, { weekly: 0, role: "child23", kokuhoMode: "estimate" }));
const kMan = socialInsurance(1400000, base(2026, { weekly: 0, role: "child23", kokuhoMode: "manual", pKokuhoRate: 14.0, pKokuhoFlat: 50000, pKokuhoByosei: 45000 }));
ok("概算モードは概算フラグが立つ", kEst.kokuhoEstimated, true);
ok("自治体入力モードは概算フラグが立たない", kMan.kokuhoEstimated, false);
info("概算モードの国保料（年収140万）", kEst.health.toLocaleString());
info("自治体入力モード（14.0%/均等5万/平等4.5万）の国保料", kMan.health.toLocaleString());
ok("入力した料率が実際に効いている", kEst.health !== kMan.health, true);
const kCare = socialInsurance(1400000, base(2026, { weekly: 0, role: "child23", kokuhoMode: "estimate", age40: true }));
ok("40歳以上は介護納付金分が上乗せされる", kCare.health > kEst.health, true);
ok("40歳未満の賦課限度額は96万円", socialInsurance(20000000, base(2026, { weekly: 0, hasSupporter: false })).health, 960000);


console.log("──────── 一次資料監査①: 給与所得控除の境界帯（令和8年分） ────────");
ok("2,190,999円 → 通常計算", kyuyoShotoku(2190999, YEARS[2026]), 1450999);
ok("2,191,000円 → 定額 1,451,000", kyuyoShotoku(2191000, YEARS[2026]), 1451000);
ok("2,192,999円 → 定額 1,451,000", kyuyoShotoku(2192999, YEARS[2026]), 1451000);
ok("2,193,000円 → 定額 1,453,000", kyuyoShotoku(2193000, YEARS[2026]), 1453000);
ok("2,195,999円 → 定額 1,453,000", kyuyoShotoku(2195999, YEARS[2026]), 1453000);
ok("2,196,000円 → 定額 1,456,000", kyuyoShotoku(2196000, YEARS[2026]), 1456000);
ok("2,199,999円 → 定額 1,456,000", kyuyoShotoku(2199999, YEARS[2026]), 1456000);
ok("2,200,000円 → 通常計算 1,460,000", kyuyoShotoku(2200000, YEARS[2026]), 1460000);
ok("帯は令和9年分にも適用される", kyuyoShotoku(2194000, YEARS[2027]), 1453000);
ok("帯は令和7年分には適用されない", kyuyoShotoku(2194000, YEARS[2025]), 1455800);
ok("帯は単調非減少（逆転しない）", (() => {
  let prev = -1;
  for (let x = 2180000; x <= 2210000; x += 1000) {
    const v = kyuyoShotoku(x, YEARS[2026]); if (v < prev) return false; prev = v;
  } return true; })(), true);

console.log("──────── 一次資料監査②: 住民税の控除の下限（58万→62万） ────────");
ok("令和8年分 配偶者 給与収入136万は配偶者控除33万（住民税）",
   supporterDeduction("spouse", kyuyoShotoku(1360000, YEARS[2026]), YEARS[2026], 4360000)[1], 330000);
ok("令和8年分 配偶者 給与収入137万は配偶者特別控除33万（住民税）",
   supporterDeduction("spouse", kyuyoShotoku(1370000, YEARS[2026]), YEARS[2026], 4360000)[1], 330000);
ok("令和8年分 特定親族 給与収入169万の住民税控除は45万",
   supporterDeduction("child1922", kyuyoShotoku(1690000, YEARS[2026]), YEARS[2026], 4360000)[1], 450000);
ok("令和8年分 特定親族 給与収入170万（合計所得96万）は41万",
   supporterDeduction("child1922", kyuyoShotoku(1700000, YEARS[2026]), YEARS[2026], 4360000)[1], 410000);
ok("令和7年分は下限が58万のまま（給与収入123万で扶養）",
   supporterDeduction("spouse", kyuyoShotoku(1230000, YEARS[2025]), YEARS[2025], 4360000)[1], 330000);

console.log("──────── 一次資料監査③: 基礎控除2,350万円超の逓減 ────────");
ok("合計所得2,400万円の基礎控除", lookup(YEARS[2026].kisoIncome, 24000000), 480000);
ok("合計所得2,450万円の基礎控除", lookup(YEARS[2026].kisoIncome, 24500000), 320000);
ok("合計所得2,500万円の基礎控除", lookup(YEARS[2026].kisoIncome, 25000000), 160000);
ok("合計所得2,500万円超の基礎控除", lookup(YEARS[2026].kisoIncome, 25000001), 0);

console.log("──────── 一次資料監査④: 調整控除の人的控除差 ────────");
ok("特定親族特別控除の人的控除差は0円", JINTEKI_SA.shinzokuTokubetsu, 0);
ok("配偶者特別控除の人的控除差は0円", JINTEKI_SA.haigushaTokubetsu, 0);
ok("特定扶養控除の人的控除差は18万円", JINTEKI_SA.fuyoTokutei, 180000);
ok("配偶者控除の人的控除差は5万／4万／2万", JINTEKI_SA.haigushaKojo, [50000,40000,20000]);
ok("特定親族特別控除が効く区間で差額0が返る",
   supporterDeduction("child1922", kyuyoShotoku(1700000, YEARS[2026]), YEARS[2026], 4360000)[2], 0);
ok("特定扶養控除の区間では18万が返る",
   supporterDeduction("child1922", kyuyoShotoku(1360000, YEARS[2026]), YEARS[2026], 4360000)[2], 180000);
ok("配偶者特別控除が効く区間で差額0が返る",
   supporterDeduction("spouse", kyuyoShotoku(1700000, YEARS[2026]), YEARS[2026], 4360000)[2], 0);
{
  const c = base(2026, { role: "child1922", supporterIncome: 6000000, weekly: 0 });
  const at170 = simulate(1700000, c).sup;
  info("親の住民税（子の年収170万・修正後）", at170.jumin.toLocaleString());
  info("親の増税額（子の年収170万・修正後）", at170.increase.toLocaleString());
}

console.log("──────── 一次資料監査⑤: 国保（平等割・軽減） ────────");
ok("概算値に平等割が入っている", KOKUHO_ESTIMATE.byosei > 0, true);
{
  const c = base(2026, { weekly: 0, role: "single", hasSupporter: false });
  const k130 = socialInsurance(1300000, c), k180 = socialInsurance(1800000, c);
  ok("年収130万（給与所得56万）は5割軽減", k130.kokuhoKeigen, 0.5);
  ok("年収180万（給与所得106万）は軽減なし", k180.kokuhoKeigen, 0);
  ok("年収117万（給与所得43万）は7割軽減", socialInsurance(1170000, c).kokuhoKeigen, 0.7);
  ok("年収174万（給与所得100万）は2割軽減", socialInsurance(1740000, c).kokuhoKeigen, 0.2);
  info("年収130万の国保料（軽減後）", k130.health.toLocaleString());
  info("年収180万の国保料（軽減なし）", k180.health.toLocaleString());
  ok("軽減により低所得側の保険料が下がる", k130.health < k180.health, true);
  const cB = base(2026, { weekly: 0, role: "single", hasSupporter: false, kokuhoMode: "manual", pKokuhoByosei: 0 });
  ok("平等割0を入力すると保険料が下がる",
     socialInsurance(1800000, cB).health < socialInsurance(1800000,
       base(2026, { weekly: 0, role: "single", hasSupporter: false, kokuhoMode: "manual" })).health, true);
}


console.log("──────── PRレビュー① 調整控除は合計所得2,500万円超で適用なし ────────");
ok("合計所得2,500万円ちょうどは適用あり", chouseiKojo(3000000, 230000, 25000000) > 0, true);
ok("合計所得2,500万円超は0円", chouseiKojo(3000000, 230000, 25000001), 0);
ok("2,500万円超でも課税所得が小さい場合は0円", chouseiKojo(100000, 230000, 30000000), 0);

console.log("──────── PRレビュー② 19〜22歳の被扶養者認定は150万円未満 ────────");
ok("19〜22歳の認定基準は150万円", fuyoNinteiLimit(base(2026, { role: "child1922" })), 1500000);
ok("配偶者は130万円のまま", fuyoNinteiLimit(base(2026, { role: "spouse" })), 1300000);
ok("23歳以上の子も130万円のまま", fuyoNinteiLimit(base(2026, { role: "child23" })), 1300000);
{
  const c = base(2026, { role: "child1922", weekly: 0 });
  ok("19〜22歳・年収140万は扶養内のまま", socialInsurance(1400000, c).status, "fuyou");
  ok("19〜22歳・年収149万も扶養内", socialInsurance(1490000, c).status, "fuyou");
  ok("19〜22歳・年収150万で扶養を外れる", socialInsurance(1500000, c).status, "kokuho");
  const cs = base(2026, { role: "spouse", weekly: 0 });
  ok("配偶者・年収140万は扶養外", socialInsurance(1400000, cs).status, "kokuho");
  const w = walls(c);
  ok("壁の一覧に150万円の壁が出る", w.some(x => x.amount === 1500000 && x.name.includes("150万円")), true);
  ok("19〜22歳に130万円の壁は出ない", w.some(x => x.amount === 1300000), false);
}

console.log("──────── PRレビュー③ 住民税の非課税限度額（扶養人数・級地） ────────");
ok("単身・1級地の均等割非課税限度額", hikazeiLimits(350000, 0).kintou, 450000);
ok("単身・1級地の所得割非課税限度額", hikazeiLimits(350000, 0).shotokuwari, 450000);
ok("扶養1人・1級地の均等割", hikazeiLimits(350000, 1).kintou, 1010000);
ok("扶養1人・1級地の所得割", hikazeiLimits(350000, 1).shotokuwari, 1120000);
ok("扶養2人・1級地の所得割", hikazeiLimits(350000, 2).shotokuwari, 1470000);
ok("3級地・単身の限度額", hikazeiLimits(280000, 0).kintou, 380000);
{
  // 所得割は非課税だが均等割は課税、という区間が存在する
  const r = taxOf(1790000, YEARS[2026], 0, 0, 0, { hikazeiBase: 350000, juminFlat: 5000, dependents: 1 });
  ok("扶養1人・給与収入179万（合計所得105万）は均等割のみ課税", r.jumin, 5000);
  ok("　同上：所得割は非課税", r.wariHikazei, true);
  ok("　同上：均等割は課税", r.kintouHikazei, false);
  const lowSup = simulate(1000000, base(2026, { role:"child1922", supporterIncome: 1900000, weekly: 0 }));
  info("扶養者の年収190万・本人100万のときの扶養者の住民税", lowSup.sup.jumin.toLocaleString());
}

console.log("──────── PRレビュー④ 多子世帯：特定親族は合計所得95万円まで算入 ────────");
ok("19〜22歳の算入上限は合計所得95万円", tashiLimitShotoku("child1922", YEARS[2026]), 950000);
ok("それ以外は扶養の所得要件", tashiLimitShotoku("child23", YEARS[2026]), 620000);
ok("令和7年分では給与収入160万円に相当",
   incomeForShotoku(tashiLimitShotoku("child1922", YEARS[2025]), YEARS[2025]), 1600000);
ok("令和8年分では給与収入169万円に相当",
   incomeForShotoku(tashiLimitShotoku("child1922", YEARS[2026]), YEARS[2026]), 1690000);
{
  const w = walls(base(2026, { role: "child1922", kidsCount: 3, uniKids: 2 }));
  const tw = w.find(x => x.kind === "tuition");
  ok("多子世帯の壁が136万円ではなく169万円になる", tw.amount, 1690000);
  const w23 = walls(base(2026, { role: "child23", kidsCount: 3, uniKids: 2 }));
  ok("23歳以上は従来どおり136万円", w23.find(x => x.kind === "tuition").amount, 1360000);
}

console.log("──────── PRレビュー⑤ 国保の賦課限度額は区分別の合計 ────────");
{
  const young = base(2026, { weekly: 0, role: "single", hasSupporter: false });
  const old40 = base(2026, { weekly: 0, role: "single", hasSupporter: false, age40: true });
  ok("40歳未満の限度額は96万円（介護分を含まない）",
     socialInsurance(30000000, young).health, 960000);
  ok("40〜64歳の限度額は113万円", socialInsurance(30000000, old40).health, 1130000);
  ok("概算値に区分別の限度額が入っている",
     KOKUHO_ESTIMATE.capBase + KOKUHO_ESTIMATE.capCare, 1130000);
}

console.log();
console.table(R.map(([n,g,w,s]) => ({ 検証項目:n, 結果:g, 期待:w, 判定:s })));
console.log(ng ? `\n★ NG ${ng}件` : `\n全アサーション PASS（${R.filter(r=>r[3]==="OK").length}件）`);
process.exit(ng ? 1 : 0);
