import { Instrument } from '@/types';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

/**
 * 예시 악기 데이터 생성
 */
export function generateSampleInstruments(
  existingSerialNumbers: string[] = []
): Array<Omit<Instrument, 'id' | 'created_at'>> {
  // 각 악기를 생성할 때마다 serial numbers를 업데이트하여 중복 방지
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
      note: '예시 데이터: 유명한 Stradivarius 바이올린',
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
      note: '예시 데이터: Guarneri 바이올린',
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
      note: '예시 데이터: Tourte 활',
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
      note: '예시 데이터: Montagnana 첼로',
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
      note: '예시 데이터: Amati 비올라',
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
