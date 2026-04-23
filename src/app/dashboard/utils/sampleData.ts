import { Instrument } from '@/types';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

/**
 * Build sample instruments for dashboard demo data.
 */
export function generateSampleInstruments(
  existingSerialNumbers: string[] = []
): Array<Omit<Instrument, 'id' | 'created_at'>> {
  // Track serials as we go to avoid duplicates
  const currentSerialNumbers = [...existingSerialNumbers];

  const sampleInstruments: Array<Omit<Instrument, 'id' | 'created_at'>> = [
    {
      status: 'Available',
      maker: 'Stradivarius',
      type: 'Violin',
      subtype: 'Violin',
      year: 1715,
      price: 5000000,
      certificate: true,
      size: '4/4',
      weight: null,
      ownership: null,
      note: 'Sample data: famous Stradivarius violin',
      serial_number: (() => {
        const serial = generateInstrumentSerialNumber(
          'Violin',
          currentSerialNumbers
        );
        currentSerialNumbers.push(serial);
        return serial;
      })(),
    },
    {
      status: 'Available',
      maker: 'Guarneri',
      type: 'Violin',
      subtype: 'Violin',
      year: 1740,
      price: 3500000,
      certificate: true,
      size: '4/4',
      weight: null,
      ownership: null,
      note: 'Sample data: Guarneri violin',
      serial_number: (() => {
        const serial = generateInstrumentSerialNumber(
          'Violin',
          currentSerialNumbers
        );
        currentSerialNumbers.push(serial);
        return serial;
      })(),
    },
    {
      status: 'Booked',
      maker: 'Tourte',
      type: 'Bow',
      subtype: 'Violin Bow',
      year: 1820,
      price: 800000,
      certificate: true,
      size: null,
      weight: '60g',
      ownership: null,
      note: 'Sample data: Tourte bow',
      serial_number: (() => {
        const serial = generateInstrumentSerialNumber(
          'Bow',
          currentSerialNumbers
        );
        currentSerialNumbers.push(serial);
        return serial;
      })(),
    },
    {
      status: 'Available',
      maker: 'Montagnana',
      type: 'Cello',
      subtype: 'Cello',
      year: 1730,
      price: 8000000,
      certificate: true,
      size: '4/4',
      weight: null,
      ownership: null,
      note: 'Sample data: Montagnana cello',
      serial_number: (() => {
        const serial = generateInstrumentSerialNumber(
          'Cello',
          currentSerialNumbers
        );
        currentSerialNumbers.push(serial);
        return serial;
      })(),
    },
    {
      status: 'Available',
      maker: 'Amati',
      type: 'Viola',
      subtype: 'Viola',
      year: 1680,
      price: 2500000,
      certificate: true,
      size: '16.5"',
      weight: null,
      ownership: null,
      note: 'Sample data: Amati viola',
      serial_number: (() => {
        const serial = generateInstrumentSerialNumber(
          'Viola',
          currentSerialNumbers
        );
        currentSerialNumbers.push(serial);
        return serial;
      })(),
    },
  ];

  return sampleInstruments;
}
