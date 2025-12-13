// src/app/clients/utils/tagUtils.ts
// Tag utility functions
export const getTagColor = (tag: string): string => {
  // Tag-specific colors for better visual distinction
  const tagColorMap: Record<string, string> = {
    // Ownership tags
    Owner:
      'bg-emerald-100 text-emerald-800 border border-emerald-300 ring-1 ring-emerald-200',
    Dealer:
      'bg-teal-100 text-teal-800 border border-teal-300 ring-1 ring-teal-200',
    Collector:
      'bg-cyan-100 text-cyan-800 border border-cyan-300 ring-1 ring-cyan-200',

    // Role tags
    Musician:
      'bg-indigo-100 text-indigo-800 border border-indigo-300 ring-1 ring-indigo-200',
    Technician:
      'bg-violet-100 text-violet-800 border border-violet-300 ring-1 ring-violet-200',
    Teacher:
      'bg-purple-100 text-purple-800 border border-purple-300 ring-1 ring-purple-200',
    Student:
      'bg-blue-100 text-blue-800 border border-blue-300 ring-1 ring-blue-200',

    // Status tags
    Active:
      'bg-green-100 text-green-800 border border-green-300 ring-1 ring-green-200',
    Passive:
      'bg-amber-100 text-amber-800 border border-amber-300 ring-1 ring-amber-200',
    Inactive:
      'bg-gray-100 text-gray-800 border border-gray-300 ring-1 ring-gray-200',

    // Other common tags
    Other:
      'bg-slate-100 text-slate-800 border border-slate-300 ring-1 ring-slate-200',
  };

  // Return specific color if tag exists in map, otherwise use default
  return (
    tagColorMap[tag] ||
    'bg-gray-100 text-gray-700 border border-gray-300 ring-1 ring-gray-200'
  );
};

// Extract text color class from tag color for use in editing mode
export const getTagTextColor = (tag: string): string => {
  const tagTextColorMap: Record<string, string> = {
    Owner: 'text-emerald-800',
    Dealer: 'text-teal-800',
    Collector: 'text-cyan-800',
    Musician: 'text-indigo-800',
    Technician: 'text-violet-800',
    Teacher: 'text-purple-800',
    Student: 'text-blue-800',
    Active: 'text-green-800',
    Passive: 'text-amber-800',
    Inactive: 'text-gray-800',
    Other: 'text-slate-800',
  };

  return tagTextColorMap[tag] || 'text-gray-700';
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
