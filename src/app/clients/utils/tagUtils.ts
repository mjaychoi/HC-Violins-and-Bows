// src/app/clients/utils/tagUtils.ts
// Tag utility functions
export const getTagColor = (tag: string): string => {
  switch (tag) {
    case 'Musician': return 'bg-blue-100 text-blue-800'
    case 'Dealer': return 'bg-green-100 text-green-800'
    case 'Collector': return 'bg-purple-100 text-purple-800'
    case 'Owner': return 'bg-orange-100 text-orange-800'
    case 'Other': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export const sortTags = (tags: string[]): string[] => {
  return tags.sort((a, b) => {
    if (a === 'Owner') return -1
    if (b === 'Owner') return 1
    return a.localeCompare(b)
  })
}

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Available': return 'bg-green-100 text-green-800'
    case 'Booked': return 'bg-yellow-100 text-yellow-800'
    case 'Sold': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}
