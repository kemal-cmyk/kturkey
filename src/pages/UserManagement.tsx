import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, UserPlus, Edit2, UserX, Loader2, X, AlertCircle } from 'lucide-react';

interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: 'board_member' | 'homeowner';
  is_active: boolean;
  units: { id: string; unit_number: string }[];
}

interface Unit {
  id: string;
  unit_number: string;
}

export default function UserManagement() {
  const { isSuperAdmin, currentSite } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'invite' | 'edit'>('invite');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'homeowner' as 'board_member' | 'homeowner',
    unit_ids: [] as string[],
  });

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate('/dashboard');
    }
  }, [isSuperAdmin, navigate]);

  useEffect(() => {
    if (currentSite) {
      fetchUsers();
      fetchUnits();
    }
  }, [currentSite]);

  const fetchUsers = async () => {
    if (!currentSite) return;

    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.access_token) {
        setError('You must be logged in to perform this action');
        setLoading(false);
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list_users',
          site_id: currentSite.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || 'Failed to fetch users';
        throw new Error(`[${response.status}] ${errorMsg}`);
      }

      setUsers(result.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async () => {
    if (!currentSite) return;

    const { data } = await supabase
      .from('units')
      .select('id, unit_number')
      .eq('site_id', currentSite.id)
      .order('unit_number');

    setUnits(data || []);
  };

  const handleInvite = () => {
    setModalMode('invite');
    setSelectedUser(null);
    setFormData({
      email: '',
      full_name: '',
      role: 'homeowner',
      unit_ids: [],
    });
    setShowModal(true);
  };

  const handleEdit = (user: User) => {
    setModalMode('edit');
    setSelectedUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      unit_ids: user.units.map(u => u.id),
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite) return;

    setLoading(true);
    setError('');
    setSuccess('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.access_token) {
      setError('You must be logged in to perform this action');
      setLoading(false);
      return;
    }

    try {

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;

      if (modalMode === 'invite') {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'invite_user',
            email: formData.email,
            full_name: formData.full_name,
            site_id: currentSite.id,
            role: formData.role,
            unit_ids: formData.role === 'homeowner' ? formData.unit_ids : [],
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          const errorMsg = result.error || 'Failed to invite user';
          throw new Error(`[${response.status}] ${errorMsg}`);
        }

        setSuccess('User invited successfully');
      } else {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update_user',
            user_id: selectedUser?.user_id,
            site_id: currentSite.id,
            role: formData.role,
            unit_ids: formData.role === 'homeowner' ? formData.unit_ids : [],
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          const errorMsg = result.error || 'Failed to update user';
          throw new Error(`[${response.status}] ${errorMsg}`);
        }

        setSuccess('User updated successfully');
      }

      setShowModal(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    if (!currentSite) return;
    if (!confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} ${user.email}?`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.access_token) {
      setError('You must be logged in to perform this action');
      setLoading(false);
      return;
    }

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deactivate_user',
          user_id: user.user_id,
          site_id: currentSite.id,
          deactivated: user.is_active,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || 'Failed to update user status';
        throw new Error(`[${response.status}] ${errorMsg}`);
      }

      setSuccess(`User ${user.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUnitToggle = (unitId: string) => {
    setFormData(prev => ({
      ...prev,
      unit_ids: prev.unit_ids.includes(unitId)
        ? prev.unit_ids.filter(id => id !== unitId)
        : [...prev.unit_ids, unitId],
    }));
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-[#002561]" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                <p className="text-gray-600 mt-1">Manage users and their roles</p>
              </div>
            </div>
            <button
              onClick={handleInvite}
              disabled={!currentSite || loading}
              className="flex items-center space-x-2 px-4 py-2.5 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-5 h-5" />
              <span>Invite User</span>
            </button>
          </div>

          {!currentSite && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800">Please select a site to manage users</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <p className="text-green-800">{success}</p>
            <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {currentSite && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading && users.length === 0 ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#002561] mx-auto mb-4" />
                <p className="text-gray-600">Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No users found for this site</p>
                <button
                  onClick={handleInvite}
                  className="mt-4 text-[#002561] hover:underline"
                >
                  Invite your first user
                </button>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Units
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => (
                    <tr key={user.user_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.full_name || 'N/A'}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          user.role === 'board_member'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role === 'board_member' ? 'Board Member' : 'Homeowner'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {user.units.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.units.map(unit => (
                                <span key={unit.id} className="inline-flex px-2 py-0.5 text-xs bg-gray-100 rounded">
                                  {unit.unit_number}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">No units</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          user.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="text-[#002561] hover:text-[#003875] p-2 rounded-lg hover:bg-gray-100"
                            title="Edit user"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(user)}
                            className={`p-2 rounded-lg hover:bg-gray-100 ${
                              user.is_active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                            }`}
                            title={user.is_active ? 'Deactivate user' : 'Activate user'}
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {modalMode === 'invite' ? 'Invite User' : 'Edit User'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalMode === 'invite' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                      placeholder="user@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                      placeholder="John Doe"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role *
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="board_member"
                      checked={formData.role === 'board_member'}
                      onChange={e => setFormData({ ...formData, role: e.target.value as 'board_member' })}
                      className="text-[#002561] focus:ring-[#002561]"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Board Member</div>
                      <div className="text-xs text-gray-500">Can manage site operations</div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="homeowner"
                      checked={formData.role === 'homeowner'}
                      onChange={e => setFormData({ ...formData, role: e.target.value as 'homeowner' })}
                      className="text-[#002561] focus:ring-[#002561]"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Homeowner</div>
                      <div className="text-xs text-gray-500">Limited access to own unit</div>
                    </div>
                  </label>
                </div>
              </div>

              {formData.role === 'homeowner' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign Units {modalMode === 'invite' && '(Optional)'}
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
                    {units.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">
                        No units available
                      </div>
                    ) : (
                      units.map(unit => (
                        <label
                          key={unit.id}
                          className="flex items-center space-x-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                        >
                          <input
                            type="checkbox"
                            checked={formData.unit_ids.includes(unit.id)}
                            onChange={() => handleUnitToggle(unit.id)}
                            className="text-[#002561] focus:ring-[#002561] rounded"
                          />
                          <span className="text-sm text-gray-900">{unit.unit_number}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>{modalMode === 'invite' ? 'Invite User' : 'Update User'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
