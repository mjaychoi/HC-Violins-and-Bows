"use client"

import React from 'react'
import { Instrument, ClientInstrument } from '@/types'
import { formatInstrumentPrice, formatInstrumentYear, getStatusColor, getStatusIcon } from '../utils/dashboardUtils'
import { classNames } from '@/utils/classNames'

interface ItemListProps {
  items: Instrument[]
  loading: boolean
  onItemClick: (item: Instrument) => void
  onEditClick: (item: Instrument) => void
  onDeleteClick: (item: Instrument) => void
  clientRelationships: ClientInstrument[]
  getSortArrow: (field: string) => string
  onSort: (field: string) => void
}

export default function ItemList({
  items,
  loading,
  onItemClick,
  onEditClick,
  onDeleteClick,
  clientRelationships,
  getSortArrow,
  onSort
}: ItemListProps) {
  const getItemClients = (itemId: string) => {
    return clientRelationships.filter(rel => rel.instrument_id === itemId)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg">No items found</div>
        <div className="text-gray-400 text-sm mt-2">Try adjusting your search or filters</div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Items ({items.length})
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className={classNames.table}>
          <thead className={classNames.tableHeader}>
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort('maker')}
              >
                Maker {getSortArrow('maker')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort('type')}
              >
                Type {getSortArrow('type')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort('year')}
              >
                Year {getSortArrow('year')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort('price')}
              >
                Price {getSortArrow('price')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort('status')}
              >
                Status {getSortArrow('status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Clients
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => {
              const itemClients = getItemClients(item.id)
              
              return (
                <tr key={item.id} className={classNames.tableRow}>
                  <td className={classNames.tableCell}>
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {item.maker}
                        </div>
                        <div className="text-sm text-gray-500">
                          {item.type}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className={classNames.tableCell}>
                    <div className="text-sm text-gray-900">{item.type}</div>
                  </td>
                  
                  <td className={classNames.tableCell}>
                    <div className="text-sm text-gray-900">
                      {formatInstrumentYear(item.year)}
                    </div>
                  </td>
                  
                  <td className={classNames.tableCell}>
                    <div className="text-sm text-gray-900">
                      {formatInstrumentPrice(item.price)}
                    </div>
                  </td>
                  
                  <td className={classNames.tableCell}>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)} {item.status}
                    </span>
                  </td>
                  
                  <td className={classNames.tableCell}>
                    <div className="flex flex-wrap gap-1">
                      {itemClients.slice(0, 2).map((rel, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {rel.client?.first_name} {rel.client?.last_name}
                        </span>
                      ))}
                      {itemClients.length > 2 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          +{itemClients.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>
                  
                  <td className={classNames.tableCell}>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => onItemClick(item)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        View
                      </button>
                      <button
                        onClick={() => onEditClick(item)}
                        className="text-green-600 hover:text-green-900 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteClick(item)}
                        className="text-red-600 hover:text-red-900 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
