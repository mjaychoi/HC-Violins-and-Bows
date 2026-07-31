import {
  formatRelationshipInstrumentLabel,
  INSTRUMENT_UNAVAILABLE_LABEL,
} from '../clientUtils';
import { withNormalizedDefaults } from '@/test/fixtures/rows';
import type { Instrument } from '@/types';

describe('formatRelationshipInstrumentLabel', () => {
  it('returns unavailable label when instrument is missing', () => {
    expect(formatRelationshipInstrumentLabel(null)).toBe(
      INSTRUMENT_UNAVAILABLE_LABEL
    );
    expect(formatRelationshipInstrumentLabel(undefined)).toBe(
      INSTRUMENT_UNAVAILABLE_LABEL
    );
  });

  it('formats maker and type when present', () => {
    const instrument = withNormalizedDefaults<Instrument>({
      id: 'i1',
      maker: 'Stradivari',
      type: 'Violin',
    } as Instrument);
    expect(formatRelationshipInstrumentLabel(instrument)).toBe(
      'Stradivari - Violin'
    );
  });

  it('falls back to serial number', () => {
    const instrument = withNormalizedDefaults<Instrument>({
      id: 'i2',
      serial_number: 'SN-42',
    } as Instrument);
    expect(formatRelationshipInstrumentLabel(instrument)).toBe('SN-42');
  });
});
