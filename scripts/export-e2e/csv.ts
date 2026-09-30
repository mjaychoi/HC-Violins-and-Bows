export type CsvRow = Record<string, string>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  if (records.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = records[0] ?? [];
  const rows = records.slice(1).map(record => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = record[index] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      record.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records.filter(item => item.some(value => value.length > 0));
}

export function numericCell(value: string): number {
  const normalized = value.replace(/[$,]/g, '').trim();
  return Number(normalized);
}
