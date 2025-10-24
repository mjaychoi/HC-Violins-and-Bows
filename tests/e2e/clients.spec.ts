import { test, expect } from '@playwright/test'

test.describe('Clients Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clients')
  })

  test('should display the clients page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
  })

  test('should show add client button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible()
  })

  test('should have search functionality', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search clients/i)
    await expect(searchInput).toBeVisible()
    
    await searchInput.fill('John')
    await expect(searchInput).toHaveValue('John')
  })

  test('should show filters button', async ({ page }) => {
    await expect(page.getByText('Filters')).toBeVisible()
  })

  test('should display sidebar navigation', async ({ page }) => {
    await expect(page.getByText('Inventory App')).toBeVisible()
    await expect(page.getByText('Items')).toBeVisible()
    await expect(page.getByText('Clients')).toBeVisible()
    await expect(page.getByText('Connected Clients')).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible()
  })
})

test.describe('Client Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clients')
  })

  test('should open add client modal', async ({ page }) => {
    await page.getByRole('button', { name: /add/i }).click()
    
    // Wait for modal to appear
    await expect(page.getByText(/add.*client/i)).toBeVisible()
  })

  test('should fill client form', async ({ page }) => {
    await page.getByRole('button', { name: /add/i }).click()
    
    await page.getByLabel(/first name/i).fill('John')
    await page.getByLabel(/last name/i).fill('Doe')
    await page.getByLabel(/email/i).fill('john@example.com')
    await page.getByLabel(/contact number/i).fill('123-456-7890')
    
    await expect(page.getByLabel(/first name/i)).toHaveValue('John')
    await expect(page.getByLabel(/last name/i)).toHaveValue('Doe')
    await expect(page.getByLabel(/email/i)).toHaveValue('john@example.com')
    await expect(page.getByLabel(/contact number/i)).toHaveValue('123-456-7890')
  })

  test('should select tags', async ({ page }) => {
    await page.getByRole('button', { name: /add/i }).click()
    
    await page.getByLabel('Owner').check()
    await page.getByLabel('Musician').check()
    
    await expect(page.getByLabel('Owner')).toBeChecked()
    await expect(page.getByLabel('Musician')).toBeChecked()
  })

  test('should show interest dropdown when relevant tags are selected', async ({ page }) => {
    await page.getByRole('button', { name: /add/i }).click()
    
    await page.getByLabel('Musician').check()
    
    await expect(page.getByLabel(/interest/i)).toBeVisible()
  })

  test('should close modal on cancel', async ({ page }) => {
    await page.getByRole('button', { name: /add/i }).click()
    
    await page.getByRole('button', { name: /cancel/i }).click()
    
    await expect(page.getByText(/add.*client/i)).not.toBeVisible()
  })
})

test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/**', route => route.abort())
    
    await page.goto('/clients')
    
    // Should still show the page even with network errors
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
  })

  test('should show error messages for form validation', async ({ page }) => {
    await page.getByRole('button', { name: /add/i }).click()
    
    // Try to submit without required fields
    await page.getByRole('button', { name: /add client/i }).click()
    
    // Should show validation errors
    await expect(page.getByText(/required/i)).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('should navigate between pages', async ({ page }) => {
    await page.goto('/clients')
    
    // Navigate to dashboard
    await page.getByText('Items').click()
    await expect(page).toHaveURL('/dashboard')
    
    // Navigate to form page
    await page.getByText('Connected Clients').click()
    await expect(page).toHaveURL('/form')
    
    // Navigate back to clients
    await page.getByText('Clients').click()
    await expect(page).toHaveURL('/clients')
  })
})

test.describe('Accessibility', () => {
  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/clients')
    
    // Check for proper heading structure
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    
    // Check for proper button labels
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible()
    
    // Check for proper form labels
    await page.getByRole('button', { name: /add/i }).click()
    await expect(page.getByLabel(/first name/i)).toBeVisible()
    await expect(page.getByLabel(/last name/i)).toBeVisible()
  })

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/clients')
    
    // Tab through the page
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Should be able to navigate without mouse
    await expect(page.locator(':focus')).toBeVisible()
  })
})
