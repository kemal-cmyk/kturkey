import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { supabase } from '../lib/supabase';
import { Shield, Check, X, Save, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface Permission {
  role: string;
  page_path: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full system access' },
  { value: 'board_member', label: 'Board Member', description: 'Management access' },
  { value: 'homeowner', label: 'Homeowner', description: 'Basic resident access' },
];

const PAGES = [
  { path: '/dashboard', label: 'Dashboard', category: 'General' },
  { path: '/units', label: 'Units', category: 'Property' },
  { path: '/residents', label: 'Residents', category: 'Property' },
  { path: '/budget', label: 'Budget', category: 'Financial' },
  { path: '/fiscal-periods', label: 'Fiscal Periods', category: 'Financial' },
  { path: '/budget-vs-actual', label: 'Budget vs Actual', category: 'Financial' },
  { path: '/monthly-income-expenses', label: 'Monthly Income & Expenses', category: 'Financial' },
  { path: '/reports', label: 'Reports', category: 'Financial' },
  { path: '/ledger', label: 'Ledger', category: 'Financial' },
  { path: '/import-ledger', label: 'Import Ledger', category: 'Financial' },
  { path: '/debt-tracking', label: 'Debt Tracking', category: 'Financial' },
  { path: '/tickets', label: 'Support Tickets', category: 'Operations' },
  { path: '/users', label: 'User Management', category: 'Administration' },
  { path: '/settings', label: 'Settings', category: 'Administration' },
  { path: '/language-settings', label: 'Language Settings', category: 'Administration' },
  { path: '/role-settings', label: 'Role & Permissions', category: 'Administration' },
  { path: '/my-account', label: 'My Account', category: 'Personal' },
];

const CATEGORIES = ['General', 'Property', 'Financial', 'Operations', 'Administration', 'Personal'];

export default function RoleSettings() {
  const { isSuperAdmin, userRole } = useAuth();
  const { reloadPermissions } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [permissions, setPermissions] = useState<Record<string, Set<string>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const isAdmin = isSuperAdmin || userRole === 'admin';

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('role_permissions')
        .select('role, page_path')
        .order('role')
        .order('page_path');

      if (fetchError) throw fetchError;

      const permMap: Record<string, Set<string>> = {};
      ROLES.forEach(role => {
        permMap[role.value] = new Set();
      });

      data?.forEach((perm: Permission) => {
        if (permMap[perm.role]) {
          permMap[perm.role].add(perm.page_path);
        }
      });

      setPermissions(permMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (role: string, path: string) => {
    if (!isAdmin) return;

    setPermissions(prev => {
      const updated = { ...prev };
      if (!updated[role]) {
        updated[role] = new Set();
      }

      const roleSet = new Set(updated[role]);
      if (roleSet.has(path)) {
        roleSet.delete(path);
      } else {
        roleSet.add(path);
      }
      updated[role] = roleSet;

      return updated;
    });

    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!isAdmin) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const allPermissions: Permission[] = [];
      Object.entries(permissions).forEach(([role, paths]) => {
        paths.forEach(path => {
          allPermissions.push({ role, page_path: path });
        });
      });

      await supabase.from('role_permissions').delete().neq('role', '_invalid_');

      if (allPermissions.length > 0) {
        const { error: insertError } = await supabase
          .from('role_permissions')
          .insert(allPermissions);

        if (insertError) throw insertError;
      }

      await reloadPermissions();

      setSuccess('Permissions updated successfully');
      setHasChanges(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!isAdmin) return;

    if (!confirm('Reset all permissions to default values? This cannot be undone.')) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await supabase.from('role_permissions').delete().neq('role', '_invalid_');

      const defaultPermissions: Permission[] = [
        ...PAGES.map(p => ({ role: 'admin', page_path: p.path })),
        ...PAGES.filter(p => !p.path.includes('users') && !p.path.includes('role-settings')).map(p => ({ role: 'board_member', page_path: p.path })),
        { role: 'homeowner', page_path: '/dashboard' },
        { role: 'homeowner', page_path: '/tickets' },
        { role: 'homeowner', page_path: '/language-settings' },
        { role: 'homeowner', page_path: '/my-account' },
      ];

      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(defaultPermissions);

      if (insertError) throw insertError;

      await loadPermissions();
      await reloadPermissions();

      setSuccess('Permissions reset to defaults');
      setHasChanges(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset permissions');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-8 h-8 text-amber-600" />
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Admin Access Required</h3>
                <p className="text-gray-600 mt-1">
                  Only administrators can manage role permissions and access control settings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-[#002561]" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Role & Permissions</h1>
                <p className="text-gray-600 mt-1">Manage access control for different user roles</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleResetToDefaults}
                disabled={saving || loading}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reset to Defaults</span>
              </button>

              {hasChanges && (
                <button
                  onClick={handleSaveChanges}
                  disabled={saving || loading}
                  className="flex items-center space-x-2 px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
            <Check className="w-5 h-5 text-green-600" />
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Permission Matrix</h2>
            <p className="text-sm text-gray-600">
              Check the boxes to grant access to specific pages for each role. Changes are not saved until you click "Save Changes".
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#002561] mx-auto mb-4" />
              <p className="text-gray-600">Loading permissions...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      Page
                    </th>
                    {ROLES.map(role => (
                      <th
                        key={role.value}
                        className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">{role.label}</div>
                          <div className="text-xs text-gray-500 normal-case mt-1">{role.description}</div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {CATEGORIES.map(category => {
                    const categoryPages = PAGES.filter(p => p.category === category);
                    if (categoryPages.length === 0) return null;

                    return (
                      <>
                        <tr key={`category-${category}`} className="bg-gray-50">
                          <td colSpan={ROLES.length + 1} className="px-6 py-2">
                            <div className="text-sm font-semibold text-gray-700">{category}</div>
                          </td>
                        </tr>
                        {categoryPages.map(page => (
                          <tr key={page.path} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-200">
                              {page.label}
                            </td>
                            {ROLES.map(role => {
                              const hasPermission = permissions[role.value]?.has(page.path) || false;
                              return (
                                <td
                                  key={`${role.value}-${page.path}`}
                                  className="px-6 py-4 text-center border-r border-gray-200"
                                >
                                  <button
                                    onClick={() => togglePermission(role.value, page.path)}
                                    className={`inline-flex items-center justify-center w-10 h-10 rounded-lg transition-all ${
                                      hasPermission
                                        ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                    }`}
                                  >
                                    {hasPermission ? (
                                      <Check className="w-5 h-5" />
                                    ) : (
                                      <X className="w-5 h-5" />
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-2">Important Notes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Super Admins always have full access to all pages regardless of these settings</li>
                <li>Regular Admins will have the permissions defined in the "Admin" column</li>
                <li>Users need to log out and back in for permission changes to take full effect</li>
                <li>Be careful when removing permissions - users will lose access immediately after saving</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
