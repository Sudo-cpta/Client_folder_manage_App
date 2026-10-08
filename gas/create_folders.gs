/**
 * 顧問先フォルダ一括作成（Google Apps Script）
 * -------------------------------------------------------------
 * 「顧問先フォルダマスタ」スプレッドシートに紐づけて使うスクリプト。
 * スプレッドシート上のボタン、またはメニュー「フォルダ管理」から実行する。
 *
 * 読み取り元（同じスプレッドシート内）:
 *   - 「顧問先マスタ」シート     : 顧問先コード / 顧問先名 / 区分（法人・個人事業・個人）
 *   - 「フォルダテンプレート」シート: 階層 / フォルダ名 / 対象区分（法人・個人・共通）
 *
 * 作成先:
 *   - 初回実行時に「親フォルダID」を入力（以降は保存され入力不要）。
 *
 * 安全設計:
 *   - 既存フォルダは作成せずスキップ（重複しない）
 *   - フォルダの削除・移動は一切しない（作成のみ）
 *   - 6分の実行制限に達する前に安全に中断し、「もう一度押すと続きから再開」
 */

// 顧客一覧シート・テンプレートシートを名前で探すためのキーワード
var CUSTOMER_SHEET_KEYWORDS = ['顧問先', 'マスタ'];
var TEMPLATE_SHEET_KEYWORDS = ['テンプレート', 'フォルダ'];

// この時間を超えたら安全に中断して続きを促す（6分制限より手前）
var TIME_BUDGET_MS = 5 * 60 * 1000;

// 法人を示すキーワード（顧問先名・区分に含まれていれば法人と判定）
var CORPORATE_KEYWORDS = [
  '株式会社', '有限会社', '合同会社', '合名会社', '合資会社',
  '法人', '宗教法人', '医療法人', '社会福祉法人', '学校法人',
  '社団', '財団', '協会', '組合', '農協', '生協', '連合会',
  '株）', '有）', '(株)', '(有)', '㈱', '㈲'
];


/** スプレッドシートを開いたときにメニューを追加 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('フォルダ管理')
    .addItem('フォルダ作成', 'createFolders')
    .addSeparator()
    .addItem('親フォルダIDを再設定', 'resetParentFolderId')
    .addToUi();
}


/** メインの処理：顧客ごとにフォルダを作成する */
function createFolders() {
  var ui = SpreadsheetApp.getUi();
  var startTime = Date.now();

  var parentId = getParentFolderId_();
  if (!parentId) return;

  var parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(parentId);
  } catch (e) {
    ui.alert('親フォルダが見つかりません。IDを確認してください。\n\n' + e);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var customers = readCustomers_(ss);
  var sections = parseSections_(ss);

  if (!customers.length) {
    ui.alert('「顧問先マスタ」から顧客が読み取れませんでした。\n一覧が表示されているか確認してください（#REF! や読み込み中でないか）。');
    return;
  }
  if (!sections.length) {
    ui.alert('「フォルダテンプレート」が読み取れませんでした。');
    return;
  }

  // 中断・再開のための状態
  var props = PropertiesService.getDocumentProperties();
  var startIndex = Number(props.getProperty('RESUME_INDEX') || '0');
  var created = Number(props.getProperty('CREATED_COUNT') || '0');
  var skipped = Number(props.getProperty('SKIPPED_COUNT') || '0');
  if (startIndex === 0) { created = 0; skipped = 0; }

  for (var i = startIndex; i < customers.length; i++) {
    // 時間切れ前に安全に中断
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      props.setProperty('RESUME_INDEX', String(i));
      props.setProperty('CREATED_COUNT', String(created));
      props.setProperty('SKIPPED_COUNT', String(skipped));
      ui.alert('途中まで処理しました（' + i + ' / ' + customers.length + ' 件）。\n\n'
        + 'もう一度「フォルダ作成」を押すと、続きから再開します。');
      return;
    }

    var result = processCustomer_(parentFolder, customers[i], sections);
    created += result.created;
    skipped += result.skipped;
  }

  // 完了：状態をクリア
  props.deleteProperty('RESUME_INDEX');
  props.deleteProperty('CREATED_COUNT');
  props.deleteProperty('SKIPPED_COUNT');

  ui.alert('完了しました。\n\n'
    + '顧客　　　　： ' + customers.length + ' 件\n'
    + '新規作成　　： ' + created + ' フォルダ\n'
    + '既存スキップ： ' + skipped + ' フォルダ');
}


/** 1顧客分のフォルダを作成 */
function processCustomer_(parentFolder, customer, sections) {
  var created = 0, skipped = 0;
  var isCorp = isCorporate_(customer);

  // 顧客フォルダ（例: 101_㈲モモヤ）
  var folderName = customer.code + '_' + customer.name;
  var r1 = getOrCreateFolder_(parentFolder, folderName);
  created += r1.created; skipped += r1.skipped;
  var customerFolder = r1.folder;

  // セクションごとに、顧客タイプに合う親を1つ選んで作成
  for (var s = 0; s < sections.length; s++) {
    var parent = pickParent_(sections[s].parents, isCorp);
    if (!parent) continue;

    var r2 = getOrCreateFolder_(customerFolder, parent.name);
    created += r2.created; skipped += r2.skipped;
    var subFolder = r2.folder;

    // 顧客タイプに合う子フォルダ（その区分＋共通）を作成
    var children = sections[s].children;
    for (var c = 0; c < children.length; c++) {
      if (shouldCreate_(children[c].target, isCorp)) {
        var r3 = getOrCreateFolder_(subFolder, children[c].name);
        created += r3.created; skipped += r3.skipped;
      }
    }
  }
  return { created: created, skipped: skipped };
}


/** 指定フォルダ内に同名フォルダが無ければ作成。あればそれを返す。 */
function getOrCreateFolder_(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) {
    return { folder: it.next(), created: 0, skipped: 1 };
  }
  return { folder: parentFolder.createFolder(name), created: 1, skipped: 0 };
}


/** 顧問先マスタシートから顧客一覧を読む */
function readCustomers_(ss) {
  var sheet = findSheet_(ss, CUSTOMER_SHEET_KEYWORDS);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0];
  var idxCode = headers.indexOf('顧問先コード');
  var idxName = headers.indexOf('顧問先名');
  var idxKubun = headers.indexOf('区分');

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var code = idxCode >= 0 ? String(values[r][idxCode]).trim() : '';
    var name = idxName >= 0 ? String(values[r][idxName]).trim() : '';
    var kubun = idxKubun >= 0 ? String(values[r][idxKubun]).trim() : '';
    if (!code || !name) continue;
    out.push({ code: code, name: name, kubun: kubun });
  }
  return out;
}


/** フォルダテンプレートシートをセクション単位に変換 */
function parseSections_(ss) {
  var sheet = findSheet_(ss, TEMPLATE_SHEET_KEYWORDS);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0];
  var idxLevel = headers.indexOf('階層');
  var idxName = headers.indexOf('フォルダ名');
  var idxTarget = headers.indexOf('対象区分');

  var sections = [];
  var current = null;
  var lastWasChild = false;

  for (var r = 1; r < values.length; r++) {
    var rawLevel = idxLevel >= 0 ? String(values[r][idxLevel]).trim() : '';
    var fname = idxName >= 0 ? cleanFolderName_(String(values[r][idxName])) : '';
    var target = parseTargetType_(idxTarget >= 0 ? values[r][idxTarget] : '共通');

    if (!fname || !rawLevel) continue;
    var level = parseInt(rawLevel, 10);
    if (isNaN(level)) continue;

    if (level === 1) {
      // 新しいセクションを開始するか、現在のセクションの「対の親」として束ねるか判定。
      // 束ねるのは「法人＋個人の対」（例: 01_会社情報 と 01_基本情報）のときだけ。
      // 共通や、同種が連続する独立フォルダ（05/06/07/09/99 等）は各自で新セクション。
      var startNew = (current === null || lastWasChild);
      if (!startNew) {
        var canPair =
          (target === 'corporate' || target === 'individual') &&
          current.children.length === 0 &&
          current.parents.length > 0 &&
          current.parents.every(function (p) {
            return (p.target === 'corporate' || p.target === 'individual') &&
                   p.target !== target;
          });
        if (!canPair) startNew = true;
      }
      if (startNew) {
        current = { parents: [], children: [] };
        sections.push(current);
      }
      current.parents.push({ name: fname, target: target });
      lastWasChild = false;
    } else if (level === 2 && current !== null) {
      current.children.push({ name: fname, target: target });
      lastWasChild = true;
    }
  }
  return sections;
}


/** セクションの親候補から、顧客タイプに合う親を1つ選ぶ（一致 > 共通 > なし） */
function pickParent_(parents, isCorp) {
  var wanted = isCorp ? 'corporate' : 'individual';
  for (var i = 0; i < parents.length; i++) {
    if (parents[i].target === wanted) return parents[i];
  }
  for (var j = 0; j < parents.length; j++) {
    if (parents[j].target === 'common') return parents[j];
  }
  return null;
}


/** 子フォルダを作成すべきか（共通＝常に、法人/個人＝顧客タイプ一致時） */
function shouldCreate_(target, isCorp) {
  if (target === 'common') return true;
  if (target === 'corporate' && isCorp) return true;
  if (target === 'individual' && !isCorp) return true;
  return false;
}


/** 顧問先名・区分から法人かどうかを判定 */
function isCorporate_(customer) {
  var text = String(customer.name) + String(customer.kubun);
  for (var i = 0; i < CORPORATE_KEYWORDS.length; i++) {
    if (text.indexOf(CORPORATE_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}


/** フォルダ名からプレフィックス記号（├└│─ 等）を除去 */
function cleanFolderName_(name) {
  return String(name).replace(/^[├└│─┬┤┼\s\-|]+/, '').trim();
}


/** 対象区分の文字列を内部コードに変換 */
function parseTargetType_(v) {
  var t = String(v);
  if (t.indexOf('法人') !== -1) return 'corporate';
  if (t.indexOf('個人') !== -1) return 'individual';
  return 'common';
}


/** 名前にキーワードを含むシートを探す */
function findSheet_(ss, keywords) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var title = sheets[i].getName();
    for (var k = 0; k < keywords.length; k++) {
      if (title.indexOf(keywords[k]) !== -1) return sheets[i];
    }
  }
  return null;
}


/** 親フォルダIDを取得（未設定なら入力を促して保存） */
function getParentFolderId_() {
  var props = PropertiesService.getDocumentProperties();
  var id = props.getProperty('PARENT_FOLDER_ID');
  if (id) return id;

  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    '初期設定（初回のみ）',
    '顧客フォルダを作成するGoogleドライブの「親フォルダID」を入力してください。\n'
      + '（ドライブでフォルダを開き、URLの /folders/ 以降の文字列）',
    ui.ButtonSet.OK_CANCEL);

  if (res.getSelectedButton() !== ui.Button.OK) return null;
  id = res.getResponseText().trim();
  if (!id) {
    ui.alert('親フォルダIDが入力されませんでした。');
    return null;
  }
  props.setProperty('PARENT_FOLDER_ID', id);
  return id;
}


/** 親フォルダIDを再設定する（メニュー用） */
function resetParentFolderId() {
  PropertiesService.getDocumentProperties().deleteProperty('PARENT_FOLDER_ID');
  getParentFolderId_();
  SpreadsheetApp.getUi().alert('親フォルダIDを更新しました。');
}
