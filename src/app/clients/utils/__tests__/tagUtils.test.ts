import {
  getInterestColor,
  getStatusColor,
  getTagColor,
  getTagTextColor,
  sortTags,
} from '../tagUtils';

describe('tagUtils', () => {
  it('returns mapped colors for known tags and falls back to default', () => {
    expect(getTagColor('Owner')).toContain('emerald');
    expect(getTagColor('Collector')).toContain('cyan');
    // ✅ FIXED: Unknown tag는 Default 토큰 사용 (text-gray-700)
    expect(getTagColor('Unknown Tag')).toBe(
      'bg-gray-100 text-gray-700 border-gray-300 ring-1 ring-gray-200'
    );
  });

  it('returns matching text colors for known tags with default fallback', () => {
    expect(getTagTextColor('Musician')).toBe('text-indigo-800');
    expect(getTagTextColor('Other')).toBe('text-slate-800');
    // ✅ FIXED: Unknown tag는 Default 토큰 사용 (text-gray-700)
    expect(getTagTextColor('SomethingElse')).toBe('text-gray-700');
  });

  it('prioritizes Owner when sorting tags and orders remaining alphabetically', () => {
    const tags = ['Musician', 'Owner', 'Dealer'];
    const sorted = sortTags([...tags]);
    expect(sorted).toEqual(['Owner', 'Dealer', 'Musician']);
  });

  it('returns status colors with a neutral default', () => {
    expect(getStatusColor('Available')).toBe(
      'bg-green-100 text-green-800 border-green-200'
    );
    expect(getStatusColor('Booked')).toBe(
      'bg-purple-100 text-purple-800 border-purple-200'
    ); // ✅ FIXED: purple
    expect(getStatusColor('Sold')).toBe(
      'bg-green-100 text-green-800 border-green-200'
    );
    expect(getStatusColor('Unknown')).toBe(
      'bg-gray-100 text-gray-800 border-gray-200'
    );
  });

  it('maps interest values to intensity-based colors', () => {
    expect(getInterestColor(null)).toBe(
      'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
    ); // ✅ FIXED: muted variant
    expect(getInterestColor('Active buyer')).toBe(
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
    ); // ✅ FIXED: muted variant
    expect(getInterestColor('Medium interest')).toBe(
      'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' // ✅ FIXED: muted variant
    );
    expect(getInterestColor('Passive maybe')).toBe(
      'bg-gray-100 text-gray-500 ring-1 ring-gray-200' // ✅ FIXED: muted variant
    );
    expect(getInterestColor('Not interested')).toBe(
      'bg-gray-100 text-gray-500 ring-1 ring-gray-200' // ✅ FIXED: muted variant
    );
    expect(getInterestColor('No interest')).toBe(
      'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
    ); // ✅ FIXED: muted variant
    expect(getInterestColor('Curious')).toBe(
      'bg-blue-50 text-blue-600 ring-1 ring-blue-100'
    ); // ✅ FIXED: muted variant
  });
});
