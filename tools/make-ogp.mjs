/**
 * ogp.png（SNSカード表示用・1200×630）を生成する。
 *   node tools/make-ogp.mjs
 * カーブは index.html の計算エンジンをそのまま呼んで描くため、模式図ではなく実際の試算結果。
 * Playwright が必要（レンダリングに使用）。
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";

const ROOT = new URL("..", import.meta.url);
const html = readFileSync(new URL("index.html", ROOT), "utf8");
const engine = html.split("<script>")[1].split("</script>")[0]
  .split("/* ========================= UI ========================= */")[0];
const M = new Function(engine + "\nreturn {simulate,walls,YEARS};")();

// 令和8年分・19〜22歳の子・週20時間未満。150万円の壁で手取りが落ちるのが最も伝わる構成
const cfg = {
  year: 2026, P: M.YEARS[2026], role: "child1922", hasSupporter: true, isStudent: false,
  supporterIncome: 6000000, age40: false, weekly: 0, firmSize: 1, regimeId: "post2610",
  kidsCount: 3, uniKids: 2, uniType: "private",
  pHealth: 9.85, pCare: 1.62, pKodomo: 0.23, pPension: 18.30, pKoyo: 0.50, pKokunen: 17920,
  kokuhoMode: "estimate", pKokuhoRate: 10.61, pKokuhoFlat: 35000, pKokuhoByosei: 30000,
  pKokuhoCap: 960000, pJuminFlat: 5000, pKyuchi: 350000,
};

const MAX = 2200000, W = 1200, H = 630, cx = 576, cy = 196, cw = 556, ch = 306;
const X = v => cx + (v / MAX) * cw, Y = v => cy + ch - (v / MAX) * ch;

const pts = [];
for (let s = 0; s <= MAX; s += 10000) pts.push([s, M.simulate(s, cfg).net]);
const path = "M" + pts.map(([x, y]) => `${X(x).toFixed(1)} ${Y(Math.max(0, y)).toFixed(1)}`).join(" L");
const drop = pts.find(p => p[0] === 1500000);

// ラベルを出す壁は間隔が空く3本のみ（169万は178万と23pxしか離れず衝突する）
const LABELLED = new Set([1190000, 1500000, 1780000]);
const wallSvg = M.walls(cfg).filter(w => w.amount <= MAX).map(w => {
  const on = LABELLED.has(w.amount);
  const col = w.kind === "tuition" ? "#d03b3b" : w.kind === "shaho" ? "#eda100" : "#c3c2b7";
  return `<line x1="${X(w.amount)}" y1="${cy}" x2="${X(w.amount)}" y2="${cy + ch}" stroke="${col}" stroke-width="${on ? 2 : 1}" opacity="${on ? .9 : .55}"/>`
    + (on ? `<text x="${X(w.amount)}" y="${cy - 10}" text-anchor="middle" font-size="17" font-weight="700" fill="#52514e">${w.amount / 10000}万</text>` : "");
}).join("");

const page = `<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;background:#fcfcfb;color:#0b0b0b;
 font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
 position:relative;overflow:hidden}
.bar{position:absolute;top:0;left:0;width:100%;height:8px;background:#2a78d6}
.L{position:absolute;left:64px;top:88px;width:470px}
h1{font-size:58px;letter-spacing:-.025em;line-height:1.12;font-weight:700}
.sub{margin-top:20px;font-size:23px;color:#52514e;line-height:1.6}
.sub b{color:#0b0b0b}
.chips{margin-top:32px;display:flex;flex-wrap:wrap;gap:9px}
.chip{font-size:19px;font-weight:600;padding:6px 15px;border-radius:999px;
 background:#f2f1ed;border:1px solid rgba(11,11,11,.10)}
.foot{position:absolute;left:64px;bottom:36px;font-size:17px;color:#898781}
.cap{position:absolute;left:${cx}px;top:${cy + ch + 18}px;width:${cw}px;
 font-size:17px;color:#52514e;text-align:center}
svg{position:absolute;inset:0}
</style>
<div class="bar"></div>
<div class="L">
  <h1>年収の壁<br>シミュレーター</h1>
  <div class="sub">立場・年分・働き方を変えると、手取りと<br><b>家族の税負担</b>がどう動くかがわかる</div>
  <div class="chips"><span class="chip">配偶者</span><span class="chip">19〜22歳</span><span class="chip">学生</span><span class="chip">多子世帯</span></div>
</div>
<div class="foot">令和7〜10年分の税制・社会保険に対応　／　制度基準日 2026年8月</div>
<svg viewBox="0 0 ${W} ${H}">
  <line x1="${cx}" y1="${cy + ch}" x2="${cx + cw}" y2="${cy + ch}" stroke="#c3c2b7" stroke-width="1"/>
  <line x1="${X(0)}" y1="${Y(0)}" x2="${X(MAX)}" y2="${Y(MAX)}" stroke="#898781" stroke-width="1" opacity=".45"/>
  ${wallSvg}
  <path d="${path}" fill="none" stroke="#2a78d6" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${X(drop[0])}" cy="${Y(drop[1])}" r="7" fill="#2a78d6" stroke="#fcfcfb" stroke-width="3"/>
</svg>
<div class="cap">年収を上げても手取りが減る区間がある</div>`;

const tmp = new URL("tools/.ogp-tmp.html", ROOT);
writeFileSync(tmp, page);

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.goto(tmp.href);
await p.waitForTimeout(500);
await p.screenshot({ path: new URL("ogp.png", ROOT).pathname });
await browser.close();
unlinkSync(tmp);
console.log("ogp.png を生成しました（1200×630）");
