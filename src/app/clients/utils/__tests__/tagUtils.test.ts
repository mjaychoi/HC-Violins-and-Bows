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
    expect(getTagColor('Unknown Tag')).toBe(
      'bg-gray-100 text-gray-700 border border-gray-300 ring-1 ring-gray-200'
    );
  });

  it('returns matching text colors for known tags with default fallback', () => {
    expect(getTagTextColor('Musician')).toBe('text-indigo-800');
    expect(getTagTextColor('Other')).toBe('text-slate-800');
    expect(getTagTextColor('SomethingElse')).toBe('text-gray-700');
  });

  it('prioritizes Owner when sorting tags and orders remaining alphabetically', () => {
    const tags = ['Musician', 'Owner', 'Dealer'];
    const sorted = sortTags([...tags]);
    expect(sorted).toEqual(['Owner', 'Dealer', 'Musician']);
  });

  it('returns status colors with a neutral default', () => {
    expect(getStatusColor('Available')).toBe('bg-green-100 text-green-800');
    expect(getStatusColor('Booked')).toBe('bg-yellow-100 text-yellow-800');
    expect(getStatusColor('Sold')).toBe('bg-red-100 text-red-800');
    expect(getStatusColor('Unknown')).toBe('bg-gray-100 text-gray-800');
  });

  it('maps interest values to intensity-based colors', () => {
    expect(getInterestColor(null)).toBe('bg-gray-100 text-gray-600');
    expect(getInterestColor('Active buyer')).toBe('bg-green-500 text-white');
    expect(getInterestColor('Medium interest')).toBe(
      'bg-green-300 text-green-800'
    );
    expect(getInterestColor('Passive maybe')).toBe(
      'bg-green-100 text-green-700'
    );
    expect(getInterestColor('Not interested')).toBe(
      'bg-green-300 text-green-800'
    );
    expect(getInterestColor('No interest')).toBe('bg-gray-200 text-gray-600');
    expect(getInterestColor('Curious')).toBe('bg-blue-100 text-blue-700');
  });
});
