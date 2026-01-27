import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, UserPlus, Edit2, UserX, Loader2, X, AlertCircle, Trash2, CheckCircle, Key } from 'lucide-react';

type UserRole = 'admin' | 'board_member' | 'homeowner' | 'manager' | 'staff' | 'resident';

interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
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
    role: 'homeowner' as UserRole,
    unit_ids: [] as string[],
    password: '', // <--- NEW STATE
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
      const { data, error: rpcError } = await supabase.rpc('get_site_users', { p_site_id: currentSite.id });
      if (rpcError) throw new Error(rpcError.message);

      const mappedUsers: User[] = (data || []).map((u: any) => ({
        user_id: u.user_id,
        email: u.email || 'unknown',
        full_name: u.full_name || '',
        role: u.role as UserRole,
        is_active: u.is_active,
        units: Array.isArray(u.units) ? u.units : [],
      }));
      setUsers(mappedUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async () => {
    if (!currentSite) return;
    const { data } = await supabase.from('units').select('id, unit_number').eq('site_id', currentSite.id).order('unit_number');
    setUnits(data || []);
  };

  const handleInvite = () => {
    setModalMode('invite');
    setSelectedUser(null);
    setFormData({ email: '', full_name: '', role: 'homeowner', unit_ids: [], password: '' });
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
      password: '', // Always blank on edit start
    });
    setShowModal(true);
  };

  const handleDelete = async (user: User) => {
    if (!currentSite) return;
    if (!confirm(`Are you sure you want to DELETE ${user.full_name || user.email}?`)) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete_user', user_id: user.user_id, site_id: currentSite.id }),
      });

      if (!response.ok) throw new Error('Failed to delete user');
      setSuccess('User deleted successfully');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite) return;

    setLoading(true);
    setError('');
    setSuccess('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        action: modalMode === 'invite' ? 'invite_user' : 'update_user',
        site_id: currentSite.id,
        role: formData.role,
        unit_ids: ['homeowner', 'resident'].includes(formData.role) ? formData.unit_ids : [],
        password: formData.password || undefined, // Only send if typed
      };

      if (modalMode === 'invite') {
        payload.email = formData.email;
        payload.full_name = formData.full_name;
      } else {
        payload.user_id = selectedUser?.user_id;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Operation failed');

      setSuccess(modalMode === 'invite' ? 'User invited/created successfully' : 'User updated successfully');
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
     // ... (Logic same as before, simplified for brevity here) ...
     // It calls the manage-users function with 'deactivate_user'
     const { data: { session } } = await supabase.auth.getSession();
     if (!session) return;
     await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'deactivate_user', user_id: user.user_id, site_id: currentSite.id, deactivated: user.is_active }),
      });
      fetchUsers();
  };

  const handleUnitToggle = (unitId: string) => {
    setFormData(prev => ({
      ...prev,
      unit_ids: prev.unit_ids.includes(unitId) ? prev.unit_ids.filter(id => id !== unitId) : [...prev.unit_ids, unitId],
    }));
  };

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="w-8 h-8 text-[#002561]" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
              <p className="text-gray-600 mt-1">Manage users, roles, and access</p>
            </div>
          </div>
          <button onClick={handleInvite} disabled={!currentSite || loading} className="flex items-center space-x-2 px-4 py-2.5 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors disabled:opacity-50">
            <UserPlus className="w-5 h-5" /> <span>Invite User</span>
          </button>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-center"><AlertCircle className="w-5 h-5 mr-2"/>{error}</div>}
        {success && <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-center"><CheckCircle className="w-5 h-5 mr-2"/>{success}</div>}

        {currentSite && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map(user => (
                  <tr key={user.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{user.full_name || 'N/A'}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {user.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.units.length > 0 ? user.units.map(u => (<span key={u.id} className="px-2 py-0.5 text-xs bg-gray-100 rounded">{u.unit_number}</span>)) : <span className="text-gray-400 text-xs">No units</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{user.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => handleEdit(user)} className="text-blue-600 hover:bg-blue-50 p-2 rounded" title="Edit"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDeactivate(user)} className={`${user.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'} p-2 rounded`}><UserX className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(user)} className="text-red-600 hover:bg-red-50 p-2 rounded"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">{modalMode === 'invite' ? 'Invite / Create User' : 'Edit User'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalMode === 'invite' && (
                <>
                  <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]" /></div>
                  <div><label className="block text-sm font-medium mb-1">Full Name</label><input type="text" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]" /></div>
                </>
              )}
              
              {/* PASSWORD FIELD - NEW */}
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                   <Key className="w-4 h-4" /> Password {modalMode === 'edit' && <span className="text-gray-400 font-normal">(Leave blank to keep current)</span>}
                </label>
                <input 
                  type="text" // Visible text so you can see what you are setting
                  minLength={6}
                  placeholder={modalMode === 'edit' ? "Enter new password to reset" : "Set initial password (optional)"}
                  value={formData.password} 
                  onChange={e => setFormData({ ...formData, password: e.target.value })} 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561] font-mono text-sm bg-gray-50" 
                />
                <p className="text-xs text-gray-500 mt-1">
                  {modalMode === 'invite' 
                    ? "If set, user is created immediately. If blank, an email invite is sent." 
                    : "Enter a value here to manually reset this user's password."}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <div className="space-y-2">
                   {/* Role Options */}
                   {['admin', 'board_member', 'homeowner'].map(r => (
                     <label key={r} className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer ${formData.role === r ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}>
                        <input type="radio" value={r} checked={formData.role === r} onChange={e => setFormData({ ...formData, role: r as any })} />
                        <span className="capitalize">{r.replace('_', ' ')}</span>
                     </label>
                   ))}
                </div>
              </div>

              {['homeowner', 'resident'].includes(formData.role) && (
                <div>
                  <label className="block text-sm font-medium mb-2">Assign Units</label>
                  <div className="border rounded-lg max-h-32 overflow-y-auto">
                    {units.map(unit => (
                      <label key={unit.id} className="flex items-center space-x-3 p-3 hover:bg-gray-50 border-b last:border-0 cursor-pointer">
                        <input type="checkbox" checked={formData.unit_ids.includes(unit.id)} onChange={() => handleUnitToggle(unit.id)} className="rounded text-[#002561]" />
                        <span className="text-sm">{unit.unit_number}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003875] flex justify-center items-center">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{modalMode === 'invite' ? 'Create User' : 'Save Changes'}</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}