export interface RelationshipStyle {
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: string;
}

export const getRelationshipTypeStyle = (type: string): RelationshipStyle => {
  switch (type) {
    case 'Interested':
      return {
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-600',
        borderColor: 'border-yellow-200',
        icon: '💡',
      };
    case 'Purchased':
    case 'Sold':
      return {
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
        icon: '✅',
      };
    case 'For Sale':
      return {
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
        icon: '💼',
      };
    case 'Past Owner':
    case 'Owned':
      return {
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200',
        icon: '🕓',
      };
    default:
      return {
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200',
        icon: '📋',
      };
  }
};
