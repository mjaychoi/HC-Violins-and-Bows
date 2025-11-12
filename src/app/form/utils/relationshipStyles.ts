export interface RelationshipStyle {
  bgColor: string;
  textColor: string;
  borderColor: string;
  activeBorder: string;
  icon: string;
}

export const getRelationshipTypeStyle = (type: string): RelationshipStyle => {
  switch (type) {
    case 'Interested':
      return {
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-600',
        borderColor: 'border-yellow-200',
        activeBorder: 'border-yellow-600',
        icon: '💡',
      };
    case 'Booked':
      return {
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
        activeBorder: 'border-blue-600',
        icon: '📅',
      };
    case 'Sold':
      return {
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
        activeBorder: 'border-green-600',
        icon: '✅',
      };
    case 'Owned':
      return {
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-700',
        borderColor: 'border-purple-200',
        activeBorder: 'border-purple-600',
        icon: '🏠',
      };
    default:
      return {
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200',
        activeBorder: 'border-gray-600',
        icon: '📋',
      };
  }
};
