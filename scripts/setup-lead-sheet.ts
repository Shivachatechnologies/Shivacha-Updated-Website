/**
 * One-time setup for the Google Sheet lead database.
 *   GOOGLE_SHEETS_LEADS_ID=... GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... npm run leads:setup-sheet
 * Creates the "Leads" tab if needed, writes the header row, freezes it, and adds a status dropdown.
 */
import { getAccessToken } from "../lib/google/serviceAccount";
import { LEAD_COLUMNS, STATUS_COLUMN_INDEX } from "../lib/leads/columns";
import { LEAD_STATUSES } from "../lib/leads/options";
import { SHEET_TAB } from "../lib/leads/store";

async function main() {
  const id = process.env.GOOGLE_SHEETS_LEADS_ID;
  if (!id) throw new Error("Set GOOGLE_SHEETS_LEADS_ID");
  const token = await getAccessToken(["https://www.googleapis.com/auth/spreadsheets"]);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data;
  };

  const meta = await call(`${base}?fields=sheets.properties(sheetId,title)`);
  let sheet = meta.sheets?.find((s: { properties: { title: string } }) => s.properties.title === SHEET_TAB)?.properties;
  if (!sheet) {
    const r = await call(`${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_TAB } } }] }) });
    sheet = r.replies[0].addSheet.properties;
    console.log(`Created tab "${SHEET_TAB}"`);
  }

  await call(`${base}/values/${encodeURIComponent(`${SHEET_TAB}!A1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [LEAD_COLUMNS.map((c) => c.header)] }),
  });

  await call(`${base}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 } }, fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
        { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.95, blue: 0.98 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
        {
          setDataValidation: {
            range: { sheetId: sheet.sheetId, startRowIndex: 1, startColumnIndex: STATUS_COLUMN_INDEX, endColumnIndex: STATUS_COLUMN_INDEX + 1 },
            rule: { condition: { type: "ONE_OF_LIST", values: LEAD_STATUSES.map((s) => ({ userEnteredValue: s })) }, strict: true, showCustomUi: true },
          },
        },
      ],
    }),
  });
  console.log(`Sheet ready: https://docs.google.com/spreadsheets/d/${id}/edit#gid=${sheet.sheetId}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
