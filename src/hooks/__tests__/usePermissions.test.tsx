import { renderHook } from '@/test-utils/render';
import { TestAuthProvider } from '@/test-utils/TestAuthProvider';
import { usePermissions } from '../usePermissions';

function renderPermissions(
  value: Parameters<typeof TestAuthProvider>[0]['value']
) {
  return renderHook(() => usePermissions(), {
    wrapper: ({ children }) => (
      <TestAuthProvider value={value}>{children}</TestAuthProvider>
    ),
  });
}

describe('usePermissions', () => {
  it('is not ready while auth is still loading', () => {
    const { result } = renderPermissions({
      loading: true,
      user: null,
      role: 'member',
      hasOrgContext: false,
    });

    expect(result.current.permissionsReady).toBe(false);
    expect(result.current.canViewInvoices).toBe(false);
    expect(result.current.canCreateTask).toBe(false);
    expect(result.current.canManageTasks).toBe(false);
    expect(result.current.invoiceAccessDisabledReason).toBe(
      'Checking permissions'
    );
  });

  it('is not ready when no user is resolved', () => {
    const { result } = renderPermissions({
      loading: false,
      user: null,
      role: 'member',
      hasOrgContext: false,
    });

    expect(result.current.permissionsReady).toBe(false);
    expect(result.current.canViewInvoices).toBe(false);
  });

  it('treats a member with org context as read-only for tasks and invoices', () => {
    const { result } = renderPermissions({
      role: 'member',
      hasOrgContext: true,
      loading: false,
    });

    expect(result.current.permissionsReady).toBe(true);
    expect(result.current.canViewInvoices).toBe(false);
    expect(result.current.canCreateTask).toBe(false);
    expect(result.current.canManageTasks).toBe(false);
    expect(result.current.canCreateInvoice).toBe(false);
    expect(result.current.canEditInvoice).toBe(false);
    expect(result.current.canDeleteInvoice).toBe(false);
    expect(result.current.canManageInvoiceSettings).toBe(false);
    expect(result.current.invoiceAccessDisabledReason).toBe('Admin only');
    expect(result.current.createTaskDisabledReason).toBe('Admin only');

    expect(result.current.canCreateNote).toBe(true);
    expect(result.current.canCreateContactLog).toBe(true);
    expect(result.current.canManageClients).toBe(false);
    expect(result.current.canManageConnections).toBe(false);
    expect(result.current.canManageInstruments).toBe(false);
    expect(result.current.canManageSales).toBe(false);
    expect(result.current.canExportSales).toBe(false);
  });

  it('allows admin task and invoice access with org context', () => {
    const { result } = renderPermissions({
      role: 'admin',
      hasOrgContext: true,
      loading: false,
    });

    expect(result.current.permissionsReady).toBe(true);
    expect(result.current.canViewInvoices).toBe(true);
    expect(result.current.canCreateTask).toBe(true);
    expect(result.current.canManageTasks).toBe(true);
    expect(result.current.canCreateInvoice).toBe(true);
    expect(result.current.canEditInvoice).toBe(true);
    expect(result.current.canDeleteInvoice).toBe(true);
    expect(result.current.canManageInvoiceSettings).toBe(true);
    expect(result.current.invoiceAccessDisabledReason).toBeUndefined();
    expect(result.current.createTaskDisabledReason).toBeUndefined();
  });

  it('denies admin invoice and task mutations without org context', () => {
    const { result } = renderPermissions({
      role: 'admin',
      hasOrgContext: false,
      loading: false,
    });

    expect(result.current.permissionsReady).toBe(true);
    expect(result.current.canViewInvoices).toBe(false);
    expect(result.current.canCreateTask).toBe(false);
    expect(result.current.canManageTasks).toBe(false);
    expect(result.current.invoiceAccessDisabledReason).toBe(
      'Organization context required'
    );
    expect(result.current.createTaskDisabledReason).toBe(
      'Organization context required'
    );
  });
});
