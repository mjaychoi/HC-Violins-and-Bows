// src/app/clients/utils/tagUtils.ts
// Tag utility functions
export const getTagColor = (tag: string): string => {
  // Ownership group - 연녹색
  if (['Owner', 'Dealer', 'Collector'].includes(tag)) {
    return 'bg-green-50 text-green-700 border border-green-200';
  }

  // Role group - 연파랑색
  if (['Musician', 'Technician', 'Teacher', 'Student'].includes(tag)) {
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  }

  // Status group - 연노랑색 또는 회색
  if (['Active', 'Passive', 'Inactive'].includes(tag)) {
    if (tag === 'Active')
      return 'bg-green-50 text-green-700 border border-green-200';
    if (tag === 'Passive')
      return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
    return 'bg-gray-100 text-gray-700 border border-gray-200';
  }

  // Default
  return 'bg-gray-50 text-gray-700 border border-gray-200';
};

export const sortTags = (tags: string[]): string[] => {
  return tags.sort((a, b) => {
    if (a === 'Owner') return -1;
    if (b === 'Owner') return 1;
    return a.localeCompare(b);
  });
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Available':
      return 'bg-green-100 text-green-800';
    case 'Booked':
      return 'bg-yellow-100 text-yellow-800';
    case 'Sold':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getInterestColor = (interest: string | null): string => {
  if (!interest) return 'bg-gray-100 text-gray-600';

  const lowerInterest = interest.toLowerCase();

  // Active/High interest - 진한 초록
  if (
    lowerInterest.includes('active') ||
    lowerInterest.includes('high') ||
    lowerInterest.includes('very') ||
    lowerInterest.includes('urgent')
  ) {
    return 'bg-green-500 text-white';
  }

  // Medium interest - 중간 초록
  if (
    lowerInterest.includes('medium') ||
    lowerInterest.includes('moderate') ||
    lowerInterest.includes('interested') ||
    lowerInterest.includes('considering')
  ) {
    return 'bg-green-300 text-green-800';
  }

  // Low interest - 연한 초록
  if (
    lowerInterest.includes('low') ||
    lowerInterest.includes('passive') ||
    lowerInterest.includes('maybe') ||
    lowerInterest.includes('someday')
  ) {
    return 'bg-green-100 text-green-700';
  }

  // Passive/Inactive - 회색
  if (
    lowerInterest.includes('passive') ||
    lowerInterest.includes('inactive') ||
    lowerInterest.includes('not') ||
    lowerInterest.includes('no')
  ) {
    return 'bg-gray-200 text-gray-600';
  }

  // Default - 연한 파랑
  return 'bg-blue-100 text-blue-700';
};
