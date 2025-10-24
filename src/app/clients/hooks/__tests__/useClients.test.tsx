// src/app/clients/hooks/__tests__/useClients.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { useClients } from '../useClients'
import { Client } from '@/types'

// Mock the apiClient
jest.mock('@/utils/apiClient', () => ({
  apiClient: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}))

// Mock the error handler
jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn()
  })
}))

import { apiClient } from '@/utils/apiClient'

describe('useClients', () => {
  const mockClient: Client = {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Owner'],
    interest: 'Active',
    note: 'Test note',
    created_at: new Date().toISOString()
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with empty clients and loading state', () => {
    const { result } = renderHook(() => useClients())
    
    expect(result.current.clients).toEqual([])
    expect(result.current.loading).toBe(true)
    expect(result.current.submitting).toBe(false)
  })

  it('should fetch clients successfully', async () => {
    const mockClients = [mockClient]
    ;(apiClient.query as jest.Mock).mockResolvedValue({
      data: mockClients,
      error: null
    })

    const { result } = renderHook(() => useClients())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.clients).toEqual(mockClients)
    expect(apiClient.query).toHaveBeenCalledWith('clients', {
      orderBy: { column: 'created_at', ascending: false }
    })
  })

  it('should handle fetch clients error', async () => {
    const mockError = new Error('Fetch failed')
    ;(apiClient.query as jest.Mock).mockResolvedValue({
      data: null,
      error: mockError
    })

    const { result } = renderHook(() => useClients())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.clients).toEqual([])
  })

  it('should create client successfully', async () => {
    const newClientData = {
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '987-654-3210',
      email: 'jane@example.com',
      tags: ['Musician'],
      interest: 'Passive',
      note: 'New client'
    }

    const createdClient = { ...newClientData, id: '2', created_at: new Date().toISOString() }
    ;(apiClient.create as jest.Mock).mockResolvedValue({
      data: createdClient,
      error: null
    })

    const { result } = renderHook(() => useClients())

    let createdClientResult
    await act(async () => {
      createdClientResult = await result.current.createClient(newClientData)
    })

    expect(createdClientResult).toEqual(createdClient)
    expect(result.current.clients).toContain(createdClient)
    expect(apiClient.create).toHaveBeenCalledWith('clients', newClientData)
  })

  it('should handle create client error', async () => {
    const newClientData = {
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '987-654-3210',
      email: 'jane@example.com',
      tags: ['Musician'],
      interest: 'Passive',
      note: 'New client'
    }

    const mockError = new Error('Create failed')
    ;(apiClient.create as jest.Mock).mockResolvedValue({
      data: null,
      error: mockError
    })

    const { result } = renderHook(() => useClients())

    let createdClientResult
    await act(async () => {
      createdClientResult = await result.current.createClient(newClientData)
    })

    expect(createdClientResult).toBeNull()
    expect(result.current.clients).toEqual([])
  })

  it('should update client successfully', async () => {
    const updatedClient = { ...mockClient, first_name: 'Johnny' }
    ;(apiClient.update as jest.Mock).mockResolvedValue({
      data: updatedClient,
      error: null
    })

    const { result } = renderHook(() => useClients())

    // First, set up initial state
    act(() => {
      result.current.clients = [mockClient]
    })

    let updatedClientResult
    await act(async () => {
      updatedClientResult = await result.current.updateClient('1', { first_name: 'Johnny' })
    })

    expect(updatedClientResult).toEqual(updatedClient)
    expect(apiClient.update).toHaveBeenCalledWith('clients', '1', { first_name: 'Johnny' })
  })

  it('should handle update client error', async () => {
    const mockError = new Error('Update failed')
    ;(apiClient.update as jest.Mock).mockResolvedValue({
      data: null,
      error: mockError
    })

    const { result } = renderHook(() => useClients())

    let updatedClientResult
    await act(async () => {
      updatedClientResult = await result.current.updateClient('1', { first_name: 'Johnny' })
    })

    expect(updatedClientResult).toBeNull()
  })

  it('should delete client successfully', async () => {
    ;(apiClient.delete as jest.Mock).mockResolvedValue({
      success: true,
      error: null
    })

    const { result } = renderHook(() => useClients())

    // First, set up initial state
    act(() => {
      result.current.clients = [mockClient]
    })

    let deleteResult
    await act(async () => {
      deleteResult = await result.current.removeClient('1')
    })

    expect(deleteResult).toBe(true)
    expect(result.current.clients).toEqual([])
    expect(apiClient.delete).toHaveBeenCalledWith('clients', '1')
  })

  it('should handle delete client error', async () => {
    const mockError = new Error('Delete failed')
    ;(apiClient.delete as jest.Mock).mockResolvedValue({
      success: false,
      error: mockError
    })

    const { result } = renderHook(() => useClients())

    let deleteResult
    await act(async () => {
      deleteResult = await result.current.removeClient('1')
    })

    expect(deleteResult).toBe(false)
  })

  it('should set submitting state during operations', async () => {
    ;(apiClient.create as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: mockClient, error: null }), 100))
    )

    const { result } = renderHook(() => useClients())

    expect(result.current.submitting).toBe(false)

    act(() => {
      result.current.createClient({
        first_name: 'Jane',
        last_name: 'Smith',
        contact_number: '987-654-3210',
        email: 'jane@example.com',
        tags: ['Musician'],
        interest: 'Passive',
        note: 'New client'
      })
    })

    expect(result.current.submitting).toBe(true)

    await waitFor(() => {
      expect(result.current.submitting).toBe(false)
    })
  })
})
