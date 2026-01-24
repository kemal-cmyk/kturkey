import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Home, Building2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Site {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  unit_number: string;
}

export default function Onboarding() {
  const { currentSite, refreshSites } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'site' | 'units' | 'complete'>('site');
  const [sites, setSites] = useState<Site[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentSite) {
      navigate('/dashboard');
    } else {
      fetchSites();
    }
  }, [currentSite, navigate]);

  const fetchSites = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be logged in');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-onboarding`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_sites' }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load sites');
      }

      setSites(result.sites || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async (siteId: string) => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be logged in');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-onboarding`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_units', site_id: siteId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load units');
      }

      setUnits(result.units || []);
      setStep('units');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load units');
    } finally {
      setLoading(false);
    }
  };

  const handleSiteSelect = (siteId: string) => {
    setSelectedSiteId(siteId);
    fetchUnits(siteId);
  };

  const handleUnitToggle = (unitId: string) => {
    setSelectedUnitIds(prev =>
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  const handleComplete = async () => {
    if (selectedUnitIds.length === 0) {
      setError('Please select at least one unit');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be logged in');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-onboarding`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'complete_onboarding',
          site_id: selectedSiteId,
          unit_ids: selectedUnitIds,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409 && result.conflicts) {
          throw new Error(`Units already owned: ${result.conflicts.join(', ')}`);
        }
        throw new Error(result.error || 'Failed to complete onboarding');
      }

      setStep('complete');
      await refreshSites();
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  if (currentSite) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#002561] to-[#003875] px-8 py-6 text-white">
          <div className="flex items-center space-x-3">
            <Home className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Welcome to Site Manager</h1>
              <p className="text-blue-100 mt-1">Complete your onboarding to get started</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {step === 'site' && (
            <div>
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-[#002561] text-white rounded-full flex items-center justify-center font-semibold">
                    1
                  </div>
                  <div className="w-20 h-1 bg-gray-200"></div>
                  <div className="w-8 h-8 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center font-semibold">
                    2
                  </div>
                </div>
              </div>

              <div className="text-center mb-8">
                <Building2 className="w-12 h-12 text-[#002561] mx-auto mb-3" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Your Site</h2>
                <p className="text-gray-600">Choose the residential complex where you live</p>
              </div>

              {loading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#002561] mx-auto mb-4" />
                  <p className="text-gray-600">Loading sites...</p>
                </div>
              ) : sites.length === 0 ? (
                <div className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No sites available</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {sites.map(site => (
                    <button
                      key={site.id}
                      onClick={() => handleSiteSelect(site.id)}
                      disabled={loading}
                      className="w-full p-6 border-2 border-gray-200 rounded-lg hover:border-[#002561] hover:bg-blue-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-[#002561] to-[#003875] rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                            <Building2 className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{site.name}</h3>
                            <p className="text-sm text-gray-500">Click to continue</p>
                          </div>
                        </div>
                        <div className="text-[#002561] opacity-0 group-hover:opacity-100 transition-opacity">
                          →
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'units' && (
            <div>
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="w-20 h-1 bg-[#002561]"></div>
                  <div className="w-8 h-8 bg-[#002561] text-white rounded-full flex items-center justify-center font-semibold">
                    2
                  </div>
                </div>
              </div>

              <div className="text-center mb-8">
                <Home className="w-12 h-12 text-[#002561] mx-auto mb-3" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Your Unit(s)</h2>
                <p className="text-gray-600">Choose the apartment(s) you own</p>
              </div>

              {loading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#002561] mx-auto mb-4" />
                  <p className="text-gray-600">Loading units...</p>
                </div>
              ) : units.length === 0 ? (
                <div className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No available units</p>
                  <button
                    onClick={() => setStep('site')}
                    className="mt-4 text-[#002561] hover:underline"
                  >
                    Go back
                  </button>
                </div>
              ) : (
                <>
                  <div className="border border-gray-300 rounded-lg max-h-80 overflow-y-auto mb-6">
                    {units.map(unit => (
                      <label
                        key={unit.id}
                        className="flex items-center space-x-4 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUnitIds.includes(unit.id)}
                          onChange={() => handleUnitToggle(unit.id)}
                          className="w-5 h-5 text-[#002561] focus:ring-[#002561] rounded"
                        />
                        <div className="flex-1">
                          <span className="text-base font-medium text-gray-900">
                            Unit {unit.unit_number}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('site');
                        setSelectedUnitIds([]);
                      }}
                      disabled={loading}
                      className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={loading || selectedUnitIds.length === 0}
                      className="flex-1 px-6 py-3 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <span>Complete Onboarding</span>
                          <span className="text-sm bg-white/20 px-2 py-0.5 rounded">
                            {selectedUnitIds.length}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Aboard!</h2>
              <p className="text-gray-600 mb-4">
                Your onboarding is complete. Redirecting to dashboard...
              </p>
              <Loader2 className="w-6 h-6 animate-spin text-[#002561] mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
