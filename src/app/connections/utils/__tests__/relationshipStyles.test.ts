import { getRelationshipTypeStyle } from '../relationshipStyles';
import { RelationshipType } from '@/types';

describe('relationshipStyles', () => {
  it('returns styles for known relationship types', () => {
    expect(getRelationshipTypeStyle('Interested')).toEqual({
      bgColor: 'bg-amber-100', // ✅ FIXED: amber
      textColor: 'text-amber-800', // ✅ FIXED: amber
      borderColor: 'border-amber-200', // ✅ FIXED: amber
      activeBorder: 'border-amber-600', // ✅ FIXED: amber
      icon: '💡',
    });

    expect(getRelationshipTypeStyle('Sold')).toEqual({
      bgColor: 'bg-red-100', // ✅ FIXED: red
      textColor: 'text-red-800', // ✅ FIXED: red
      borderColor: 'border-red-200', // ✅ FIXED: red
      activeBorder: 'border-red-600', // ✅ FIXED: red
      icon: '✅',
    });
  });

  it('falls back to default styles for unknown types', () => {
    // FIXED: Type cast to RelationshipType for testing default case
    // In production, this should never happen as RelationshipType is a union type
    expect(
      getRelationshipTypeStyle('SomethingElse' as RelationshipType)
    ).toEqual({
      bgColor: 'bg-gray-100', // ✅ FIXED: soft variant
      textColor: 'text-gray-800', // ✅ FIXED: soft variant
      borderColor: 'border-gray-200',
      activeBorder: 'border-gray-600',
      icon: '📋',
    });
  });
});
