import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  MessageSquare, Plus, Search, Filter, 
  Clock, Loader2, X, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent'; // Updated to match DB (urgent vs critical)
  category: string;
  created_at: string;
  updated_at: string;
  unit_number?: string;
  created_by_name?: string;
}

export default function Tickets() {
  const { user, currentSite, role } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'other', // FIX: Default must be in the allowed list
  });

  // Check if user is staff (can manage tickets)
  const canManage = ['admin', 'manager', 'board_member', 'staff'].includes(role || '');

  useEffect(() => {
    if (currentSite) fetchTickets();
  }, [currentSite, user]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('support_tickets') 
        .select(`
          *,
          profiles:created_by (full_name),
          units:unit_id (unit_number)
        `)
        .eq('site_id', currentSite?.id)
        .order('created_at', { ascending: false });

      // If resident, only see own tickets
      if (!canManage) {
        query = query.eq('created_by', user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setTickets(data.map(t => ({
        ...t,
        created_by_name: t.profiles?.full_name,
        unit_number: t.units?.unit_number
      })) as Ticket[]);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    // 1. Optimistic Update
    const originalTickets = [...tickets];
    setTickets(tickets.map(t => 
      t.id === ticketId ? { ...t, status: newStatus as any } : t
    ));

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      if (error) throw error;
      
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status');
      setTickets(originalTickets);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !user) return;

    setSubmitting(true);
    try {
      // 1. Try to find the user's unit (Safe fetch)
      const { data: userUnits } = await supabase
        .from('units')
        .select('id')
        .eq('owner_id', user.id)
        .eq('site_id', currentSite.id)
        .limit(1);

      // Admins might not have a unit, so this stays null
      const unitId = userUnits && userUnits.length > 0 ? userUnits[0].id : null;

      const { error } = await supabase.from('support_tickets').insert({
        site_id: currentSite.id,
        created_by: user.id,
        unit_id: unitId, 
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        category: formData.category,
      });

      if (error) {
        console.error('Supabase Insert Error:', error);
        throw error;
      }

      setShowModal(false);
      setFormData({ title: '', description: '', priority: 'medium', category: 'other' });
      fetchTickets();
    } catch (error) {
      console.error('Full Error Object:', error);
      alert('Failed to create ticket. Check console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
      case 'closed': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8">
          <div className="flex items-center space-x-3 mb-4 sm:mb-0">
            <MessageSquare className="w-8 h-8 text-[#002561]" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
              <p className="text-gray-600">
                {canManage ? 'Manage resident requests' : 'Submit and track your requests'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center space-x-2 bg-[#002561] text-white px-4 py-2 rounded-lg hover:bg-[#003875] transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Ticket</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select 
              className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#002561]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Ticket List */}
        <div className="space-y-4">
          {loading ? (
             <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#002561]" /></div>
          ) : filteredTickets.length === 0 ? (
             <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
               <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
               <p className="text-gray-500">No tickets found</p>
             </div>
          ) : (
            filteredTickets.map(ticket => (
              <div key={ticket.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      
                      {/* STATUS CHANGER (Admins Only) */}
                      {canManage ? (
                        <select
                          value={ticket.status}
                          onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                          className={`text-xs font-bold uppercase rounded-full px-3 py-1 border-2 cursor-pointer focus:ring-2 focus:ring-[#002561] focus:outline-none transition-colors ${getStatusColor(ticket.status)}`}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      ) : (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                      )}

                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize 
                        ${ticket.priority === 'high' || ticket.priority === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                        {ticket.priority}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {format(new Date(ticket.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{ticket.title}</h3>
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{ticket.description}</p>
                    
                    <div className="flex items-center text-xs text-gray-500 gap-4">
                       {ticket.unit_number && <span className="font-medium text-gray-900">Unit: {ticket.unit_number}</span>}
                       {ticket.created_by_name && <span>By: {ticket.created_by_name}</span>}
                       <span className="italic bg-gray-50 px-2 rounded">Category: {ticket.category}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* New Ticket Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Create New Ticket</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]"
                  placeholder="e.g., Leaking pipe in kitchen"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  required
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]"
                  placeholder="Describe the issue in detail..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    {/* FIXED: Options match DB Constraints EXACTLY */}
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="elevator">Elevator</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="security">Security</option>
                    <option value="garden">Garden/Landscape</option>
                    <option value="parking">Parking</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#002561]"
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value as any})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003875] flex justify-center items-center">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}