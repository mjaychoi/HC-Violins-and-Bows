"use client"
// src/app/clients/components/ClientList.tsx
import { Client } from '@/types'
import { getTagColor, sortTags, formatClientContact } from '../utils'

const SortIcon = ({ cls }: { cls: string }) => (
  <span aria-hidden className={cls} />
)

interface ClientListProps {
  clients: Client[]
  clientsWithInstruments: Set<string>
  onClientClick: (client: Client) => void
  onColumnSort: (column: string) => void
  getSortArrow: (column: string) => string
}

export default function ClientList({ 
  clients, 
  clientsWithInstruments, 
  onClientClick, 
  onColumnSort, 
  getSortArrow 
}: ClientListProps) {
  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">No clients found</div>
          <div className="text-gray-400 text-sm mt-2">Try adjusting your search or filters</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('last_name')}
              >
                <div className="flex items-center">
                  Last Name
                  <SortIcon cls={getSortArrow('last_name')} />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('first_name')}
              >
                <div className="flex items-center">
                  First Name
                  <SortIcon cls={getSortArrow('first_name')} />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('contact_number')}
              >
                <div className="flex items-center">
                  Contact
                  <SortIcon cls={getSortArrow('contact_number')} />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('email')}
              >
                <div className="flex items-center">
                  Email
                  <SortIcon cls={getSortArrow('email')} />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('tags')}
              >
                <div className="flex items-center">
                  Tags
                  <SortIcon cls={getSortArrow('tags')} />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('interest')}
              >
                <div className="flex items-center">
                  Interest
                  <SortIcon cls={getSortArrow('interest')} />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Instruments
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map((client) => (
              <tr
                key={client.id}
                onClick={() => onClientClick(client)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {client.last_name || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {client.first_name || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {formatClientContact(client)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {client.email || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {sortTags([...client.tags]).map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {client.interest || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {clientsWithInstruments.has(client.id) ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        None
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onClientClick(client)
                    }}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
