import type { Instrument } from '@/types';
import { todayLocalYMD } from '@/utils/dateParsing';
import {
  downloadItemCSV,
  generateItemCSV,
  ITEM_CSV_HEADERS,
} from '../itemCsvExport';

const makeItem = (overrides: Partial<Instrument> = {}): Instrument => ({
  id: 'item-1',
  serial_number: 'ITEM-001',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: null,
  year: 1700,
  price: 1250.5,
  certificate: false,
  certificate_name: null,
  note: 'Ready',
  status: 'Available',
  ownership: 'Store',
  size: null,
  weight: null,
  cost_price: 900,
  consignment_price: 800,
  reserved_by_user_id: 'private-user',
  reserved_connection_id: 'private-connection',
  created_at: '2026-07-29T00:00:00.000Z',
  ...overrides,
});

describe('Item CSV export', () => {
  it('uses the exact eight-column order and excludes hidden fields', () => {
    const csv = generateItemCSV([makeItem()]);
    const [header] = csv.split('\n');

    expect(header).toBe(ITEM_CSV_HEADERS.join(','));
    expect(ITEM_CSV_HEADERS).toEqual([
      'Item Number',
      'Maker',
      'Type',
      'Year',
      'Retail Price',
      'Certificate',
      'Note',
      'Status',
    ]);
    expect(csv).not.toContain('cost_price');
    expect(csv).not.toContain('consignment_price');
    expect(csv).not.toContain('reserved_by_user_id');
    expect(csv).not.toContain('private-user');
    expect(csv).not.toContain('private-connection');
  });

  it('exports every supplied matching row in its canonical order', () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      makeItem({
        id: `item-${index}`,
        serial_number: `ITEM-${String(index).padStart(3, '0')}`,
      })
    );
    const rows = generateItemCSV(items).split('\n');

    expect(rows).toHaveLength(26);
    expect(rows[1]).toContain('ITEM-000');
    expect(rows[25]).toContain('ITEM-024');
  });

  it('uses machine-readable prices and empty fields for null values', () => {
    const csv = generateItemCSV([
      makeItem({ price: 50000 }),
      makeItem({
        id: 'item-2',
        serial_number: null,
        maker: null,
        type: null,
        year: null,
        price: null,
        note: null,
      }),
    ]);

    expect(csv).toContain(',50000,');
    expect(csv).toContain(',,,,,No,,Available');
    expect(csv).not.toContain('$');
    expect(csv).not.toContain('50,000');
  });

  it('maps logical Certificate metadata without consulting PDF counts', () => {
    const items = [
      makeItem({ certificate: false, certificate_name: 'ignored.pdf' }),
      makeItem({
        id: 'item-2',
        certificate: true,
        certificate_name: 'Named Certificate',
      }),
      makeItem({
        id: 'item-3',
        certificate: true,
        certificate_name: '   ',
      }),
    ] as Array<Instrument & { certificatePdfCount?: number }>;
    items[0].certificatePdfCount = 9;
    items[1].certificatePdfCount = 0;

    const csv = generateItemCSV(items);

    expect(csv).toContain(',No,');
    expect(csv).toContain(',Named Certificate,');
    expect(csv).toContain(',Yes,');
    expect(csv).not.toContain('certificatePdfCount');
  });

  it('escapes commas, quotes, line breaks, Unicode, and formula-like values', () => {
    const csv = generateItemCSV([
      makeItem({
        serial_number: '=1+1',
        maker: '  +SUM(A1:A2)',
        type: '@command',
        certificate: true,
        certificate_name: '-danger',
        note: '한글, “violin”\nsecond "line"',
      }),
    ]);

    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'  +SUM(A1:A2)");
    expect(csv).toContain("'@command");
    expect(csv).toContain("'-danger");
    expect(csv).toContain('"한글, “violin”\nsecond ""line"""');
  });

  it('downloads UTF-8 CSV with the local-date filename and no BOM', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:item-csv');
    URL.revokeObjectURL = jest.fn();
    let clickedDownload = '';
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedDownload = this.download;
      });

    try {
      const filename = downloadItemCSV([makeItem()]);
      expect(filename).toBe(`items-${todayLocalYMD()}.csv`);
      expect(clickedDownload).toBe(filename);
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:item-csv');
      expect(generateItemCSV([makeItem()]).charCodeAt(0)).not.toBe(0xfeff);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
