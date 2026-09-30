import { todayLocalYMD } from '../../src/utils/dateParsing';
import {
  EXPECTED_ITEM_CSV_HEADERS,
  EXPECTED_SALES_CSV_HEADERS,
  EXPORT_E2E_ITEM_CONSIGNMENT_PRICE,
  EXPORT_E2E_ITEM_COST_PRICE,
  EXPORT_E2E_ITEM_RETAIL_PRICE,
  EXPORT_E2E_KEEP_SALE_DATE,
  EXPORT_E2E_KEEP_SALE_PRICE,
  type ExportFixtureMarkers,
} from './constants';
import { numericCell, parseCsv } from './csv';

function fail(message: string): never {
  throw new Error(message);
}

export function assertItemAdminCsv(options: {
  filename: string;
  csv: string;
  markers: ExportFixtureMarkers;
  reservedUserId: string;
  reservedConnectionId: string;
}): void {
  if (!options.filename.endsWith('.csv')) {
    fail(`Item export filename is not a csv file: ${options.filename}`);
  }
  const expectedName = `items-${todayLocalYMD()}.csv`;
  if (options.filename !== expectedName) {
    fail(
      `Item export filename ${options.filename} does not match ${expectedName}`
    );
  }

  const parsed = parseCsv(options.csv);
  if (parsed.headers.join('|') !== [...EXPECTED_ITEM_CSV_HEADERS].join('|')) {
    fail(`Item CSV headers were ${parsed.headers.join(', ')}`);
  }

  const keep = parsed.rows.find(
    row => row['Item Number'] === `'${options.markers.keepSerial}`
  );
  if (!keep) {
    fail('Filtered item CSV is missing the kept synthetic item.');
  }
  if (parsed.rows.length !== 1) {
    fail(`Filtered item CSV row count was ${parsed.rows.length}, expected 1.`);
  }
  if (options.csv.includes(options.markers.dropSerial)) {
    fail('Filtered item CSV contains the filtered-out synthetic item.');
  }
  if (
    options.csv.includes(options.markers.orgBSerial) ||
    options.csv.includes(options.markers.orgBItemNote) ||
    options.csv.includes(options.markers.orgBMaker)
  ) {
    fail('Item CSV contains Org B fixture markers.');
  }

  if (keep.Maker !== `'${options.markers.keepMaker}`) {
    fail('Item maker cell was not formula-escaped.');
  }
  if (keep.Type !== `'${options.markers.keepType}`) {
    fail('Item type cell was not formula-escaped.');
  }
  if (keep.Certificate !== 'Yes') {
    fail(
      `Item certificate cell was ${JSON.stringify(keep.Certificate)}. The dashboard list omits certificate_name, so a certified item exports as Yes.`
    );
  }
  if (keep.Note !== options.markers.keepNote) {
    fail('Item note did not preserve quotes, commas, or the line break.');
  }
  if (!keep.Note.includes('바이올린')) {
    fail('Item CSV did not preserve Unicode.');
  }
  if (Number(keep.Year) !== 1721) {
    fail(`Item year was ${keep.Year}`);
  }
  if (numericCell(keep['Retail Price']) !== EXPORT_E2E_ITEM_RETAIL_PRICE) {
    fail(`Item retail price was ${keep['Retail Price']}`);
  }
  if (keep.Status !== 'Available') {
    fail(`Item status was ${keep.Status}`);
  }

  const hidden = [
    String(EXPORT_E2E_ITEM_COST_PRICE),
    String(EXPORT_E2E_ITEM_CONSIGNMENT_PRICE),
    options.reservedUserId,
    options.reservedConnectionId,
    'cost_price',
    'consignment_price',
    'reserved_by_user_id',
    'reserved_connection_id',
  ];
  for (const secretField of hidden) {
    if (options.csv.includes(secretField)) {
      fail('Item CSV contains an internal or sensitive field.');
    }
  }
}

export function assertSalesAdminCsv(options: {
  filename: string;
  csv: string;
  markers: ExportFixtureMarkers;
  keepSaleId: string;
}): void {
  if (!options.filename.endsWith('.csv')) {
    fail(`Sales export filename is not a csv file: ${options.filename}`);
  }
  const expectedName = 'sales-history-20200315-20200315.csv';
  if (options.filename !== expectedName) {
    fail(
      `Sales export filename ${options.filename} does not match ${expectedName}`
    );
  }

  const parsed = parseCsv(options.csv);
  if (parsed.headers.join('|') !== [...EXPECTED_SALES_CSV_HEADERS].join('|')) {
    fail(`Sales CSV headers were ${parsed.headers.join(', ')}`);
  }
  if (parsed.rows.length !== 1) {
    fail(`Filtered sales CSV row count was ${parsed.rows.length}, expected 1.`);
  }
  const row = parsed.rows[0];
  if (!row) {
    fail('Filtered sales CSV had no data row.');
  }
  if (row['Sale ID'] !== options.keepSaleId) {
    fail('Filtered sales CSV did not contain the kept sale.');
  }
  if (row.Notes !== options.markers.keepSaleNote) {
    fail('Sales notes did not preserve quotes, commas, or Unicode.');
  }
  if (!row.Notes.includes('바이올린')) {
    fail('Sales CSV did not preserve Unicode.');
  }
  if (row['Client Name'] !== 'Export KeepA') {
    fail(`Sales client name was ${row['Client Name']}`);
  }
  if (row['Client Email'] !== options.markers.orgAClientEmail) {
    fail('Sales client email did not match the synthetic client.');
  }
  if (row.Status !== 'Paid') {
    fail(`Sales status was ${row.Status}`);
  }
  if (numericCell(row.Amount) !== EXPORT_E2E_KEEP_SALE_PRICE) {
    fail(`Sales amount was ${row.Amount}`);
  }
  if (!row.Date.includes('2020')) {
    fail(`Sales date was ${row.Date}`);
  }
  if (
    options.csv.includes(options.markers.dropSaleNote) ||
    options.csv.includes(options.markers.orgBSaleNote) ||
    options.csv.includes(options.markers.orgBMaker)
  ) {
    fail('Sales CSV contains a filtered-out or cross-org marker.');
  }
  if (row.Date !== 'Mar 15, 2020') {
    fail(
      `Sales date format was ${row.Date}, expected current generateCSV output.`
    );
  }
  void EXPORT_E2E_KEEP_SALE_DATE;
}

export function assertMemberExportBlocked(options: {
  surface: 'item' | 'sales';
  buttonCount: number;
  disabled: boolean | null;
  title: string | null;
}): 'absent' | 'disabled' {
  if (options.buttonCount === 0) {
    return 'absent';
  }
  if (options.buttonCount === 1 && options.disabled) {
    if (options.surface === 'sales' && options.title !== 'Admin only') {
      fail(
        `Sales export control was disabled with title ${options.title ?? 'none'}.`
      );
    }
    return 'disabled';
  }
  fail(
    `${options.surface} export control was available (count=${options.buttonCount}, disabled=${String(options.disabled)}).`
  );
}
