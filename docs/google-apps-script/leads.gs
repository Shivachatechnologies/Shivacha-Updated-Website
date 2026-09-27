/**
 * Shivacha Technologies — website lead database (Google Apps Script)
 *
 * Paste this whole file into the Google Sheet owned by sales@shivacha.com:
 *   Extensions → Apps Script → replace Code.gs → Save.
 * Then:
 *   1. Replace PASTE_A_LONG_RANDOM_SECRET below with your own secret (20+ random characters).
 *   2. Run the `setup` function once (▶ Run) and allow access when Google asks.
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *   4. Copy the Web app URL (ends in /exec) into the website server settings:
 *        GOOGLE_SHEETS_WEBHOOK_URL    = that URL
 *        GOOGLE_SHEETS_WEBHOOK_SECRET = the same secret as below
 *
 * The website sends one row per lead; this script only appends rows to the "Leads" tab.
 * Requests without the correct secret are rejected, so the public URL cannot be used to write.
 */

const SECRET = "PASTE_A_LONG_RANDOM_SECRET";
const SHEET_NAME = "Leads";

const HEADERS = [
  "Lead ID", "Date & Time (UTC)", "Name", "Email", "Phone", "Company", "Country", "Service", "Budget",
  "Project Description", "Source Page", "Landing Page", "UTM Source", "UTM Medium", "UTM Campaign",
  "Lead Score", "Lead Status", "Assigned Sales Person", "Notes", "Last Contacted", "Next Follow-up (UTC)",
  "Score Label", "Form", "Referrer", "Extra Details",
];
const STATUSES = ["New", "Contacted", "Qualified", "Meeting", "Proposal", "Negotiation", "Won", "Lost", "Nurture"];
const STATUS_COLORS = {
  "New": "#e6f0fb", "Contacted": "#fff4e0", "Qualified": "#e7f7ef", "Meeting": "#e0f2fe", "Proposal": "#ede9fe",
  "Negotiation": "#fdf2e3", "Won": "#d1fadf", "Lost": "#fde8e8", "Nurture": "#fef3c7",
};
/** Earlier status names, mapped to the current pipeline by updateStatuses(). */
const LEGACY_STATUSES = { "Proposal Sent": "Proposal", "Follow-up": "Nurture" };

/** Run once from the editor: creates the Leads tab, header, dropdown and colours. */
function setup() {
  const sheet = getSheet_(SHEET_NAME);
  if (sheet.getLastRow() === 0) formatSheet_(sheet, HEADERS, STATUSES, HEADERS.indexOf("Lead Status"));
  Logger.log("Leads sheet ready: " + SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

/**
 * Run once from the editor after updating this script on an existing sheet: renames legacy statuses
 * (Proposal Sent → Proposal, Follow-up → Nurture) and refreshes the Lead Status dropdown and colours.
 * Rows and all other columns are left untouched.
 */
function updateStatuses() {
  const sheet = getSheet_(SHEET_NAME);
  const col = HEADERS.indexOf("Lead Status") + 1;
  const last = sheet.getLastRow();
  const statusRange = sheet.getRange(2, col, 4999, 1);
  statusRange.clearDataValidations();
  if (last > 1) {
    const range = sheet.getRange(2, col, last - 1, 1);
    const values = range.getValues().map(function (r) { return [LEGACY_STATUSES[r[0]] || r[0]]; });
    range.setValues(values);
  }
  statusRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  const others = sheet.getConditionalFormatRules().filter(function (rule) {
    return !rule.getRanges().some(function (r) { return r.getColumn() === col; });
  });
  const rules = STATUSES.map(function (st) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(st).setBackground(STATUS_COLORS[st] || "#ffffff").setRanges([statusRange]).build();
  });
  sheet.setConditionalFormatRules(others.concat(rules));
  Logger.log("Lead statuses updated.");
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!SECRET || SECRET === "PASTE_A_LONG_RANDOM_SECRET" || data.secret !== SECRET) return json_({ ok: false, error: "unauthorized" });
    if (!Array.isArray(data.row) || data.row.length === 0 || data.row.length > 60) return json_({ ok: false, error: "bad row" });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = getSheet_(data.sheet || SHEET_NAME);
      if (sheet.getLastRow() === 0) {
        formatSheet_(sheet, data.headers || HEADERS, data.statuses || STATUSES, typeof data.statusIndex === "number" ? data.statusIndex : HEADERS.indexOf("Lead Status"));
      }
      // Values are written as plain text/numbers; anything that looks like a formula is prefixed with '.
      const row = data.row.map(function (v) {
        if (typeof v === "number") return v;
        const s = String(v == null ? "" : v).slice(0, 50000);
        return /^[=+\-@]/.test(s) ? "'" + s : s;
      });
      sheet.appendRow(row);
      const n = sheet.getLastRow();
      const url = SpreadsheetApp.getActiveSpreadsheet().getUrl() + "#gid=" + sheet.getSheetId() + "&range=A" + n;
      return json_({ ok: true, row: n, url: url });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: "Shivacha lead database" });
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function formatSheet_(sheet, headers, statuses, statusIndex) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setFontColor("#ffffff").setBackground("#0073cc");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
  const statusCol = statusIndex + 1;
  const statusRange = sheet.getRange(2, statusCol, 4999, 1);
  statusRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(false).build());
  const rules = statuses.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(STATUS_COLORS[s] || "#ffffff").setRanges([statusRange]).build();
  });
  sheet.setConditionalFormatRules(rules);
  const widths = { "Project Description": 360, "Notes": 280, "Email": 220, "Service": 200, "Extra Details": 260 };
  headers.forEach(function (h, i) { sheet.setColumnWidth(i + 1, widths[h] || 150); });
  sheet.getRange(1, 1, 1, headers.length).createFilter();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
