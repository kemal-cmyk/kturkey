import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Users, Search, Loader2, Phone, Mail, Home } from 'lucide-react';
import type { Unit } from '../types/database';

export default function Residents() {
  const { currentSite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentSite) {
      fetchResidents();
    }
  }, [currentSite]);

  const fetchResidents = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data } = await supabase
      .from('units')
      .select('*')
      .eq('site_id', currentSite.id)
      .not('owner_name', 'is', null)
      .order('owner_name');

    setUnits(data || []);
    setLoading(false);
  };

  const filteredUnits = units.filter(unit =>
    unit.owner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    unit.unit_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Residents</h1>
        <p className="text-gray-600">{units.length} residents in this site</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search residents..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
            />
          </div>
        </div>

        {filteredUnits.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No residents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredUnits.map((unit) => (
              <div
                key={unit.id}
                className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-[#002561]/10 rounded-full flex items-center justify-center">
                    <span className="text-[#002561] font-bold text-lg">
                      {unit.owner_name?.[0] || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {unit.owner_name}
                    </p>
                    <div className="flex items-center text-sm text-gray-500 mt-1">
                      <Home className="w-4 h-4 mr-1" />
                      {unit.block ? `${unit.block}-` : ''}{unit.unit_number}
                    </div>
                    {unit.owner_phone && (
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <Phone className="w-4 h-4 mr-1" />
                        {unit.owner_phone}
                      </div>
                    )}
                    {unit.owner_email && (
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <Mail className="w-4 h-4 mr-1" />
                        <span className="truncate">{unit.owner_email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
