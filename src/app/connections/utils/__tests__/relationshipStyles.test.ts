import { getRelationshipTypeStyle } from '../relationshipStyles';

describe('relationshipStyles', () => {
  it('returns styles for known relationship types', () => {
    expect(getRelationshipTypeStyle('Interested')).toEqual({
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-600',
      borderColor: 'border-yellow-200',
      activeBorder: 'border-yellow-600',
      icon: '💡',
    });

    expect(getRelationshipTypeStyle('Sold')).toEqual({
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      activeBorder: 'border-green-600',
      icon: '✅',
    });
  });

  it('falls back to default styles for unknown types', () => {
    expect(getRelationshipTypeStyle('SomethingElse')).toEqual({
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
      activeBorder: 'border-gray-600',
      icon: '📋',
    });
  });
});
