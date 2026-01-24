import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  Receipt,
  AlertTriangle,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Home,
  Ticket,
  Plus,
  Wallet,
  BarChart2,
  UserCog,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, profile, isSuperAdmin, sites, currentSite, currentRole, signOut, setCurrentSite } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

  const isAdmin = isSuperAdmin || currentRole?.role === 'admin';
  const isBoardMember = currentRole?.role === 'board_member';
  const isHomeowner = currentRole?.role === 'homeowner' && !isSuperAdmin;

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, show: true },
    { name: 'Units', href: '/units', icon: Home, show: isAdmin || isBoardMember },
    { name: 'Residents', href: '/residents', icon: Users, show: isAdmin || isBoardMember },
    { name: 'Financial Periods', href: '/fiscal-periods', icon: Calendar, show: isAdmin },
    { name: 'Budget', href: '/budget', icon: Wallet, show: isAdmin || isBoardMember },
    { name: 'Ledger', href: '/ledger', icon: Receipt, show: isAdmin || isBoardMember },
    { name: 'Budget vs Actual', href: '/budget-vs-actual', icon: FileText, show: isAdmin || isBoardMember },
    { name: 'Monthly Income & Expenses', href: '/monthly-income-expenses', icon: BarChart2, show: isAdmin || isBoardMember },
    { name: 'Debt Tracking', href: '/debt-tracking', icon: AlertTriangle, show: isAdmin || isBoardMember },
    { name: 'Reports', href: '/reports', icon: FileText, show: true },
    { name: 'Support Tickets', href: '/tickets', icon: Ticket, show: true },
    { name: 'My Account', href: '/my-account', icon: Users, show: isHomeowner },
    { name: 'User Management', href: '/user-management', icon: UserCog, show: isSuperAdmin },
    { name: 'Settings', href: '/settings', icon: Settings, show: isAdmin },
  ].filter(item => item.show);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleSiteChange = (site: typeof currentSite) => {
    if (site) {
      setCurrentSite(site);
      setSiteDropdownOpen(false);
    }
  };

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#002561] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-white p-2 rounded-lg hover:bg-white/10"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="text-white font-bold text-lg">KTurkey</span>
        <div className="w-10" />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#002561] transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <div className="flex items-center space-x-3">
              <Building2 className="w-8 h-8 text-white" />
              <span className="text-white font-bold text-xl">KTurkey</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-4 border-b border-white/10">
            {sites.length > 0 ? (
              <div className="relative">
                <button
                  onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20 transition-colors"
                >
                  <span className="truncate">{currentSite?.name || 'Select Site'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {siteDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden z-10">
                    {sites.map(site => (
                      <button
                        key={site.id}
                        onClick={() => handleSiteChange(site)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                          site.id === currentSite?.id ? 'bg-gray-50 text-[#002561] font-medium' : 'text-gray-700'
                        }`}
                      >
                        {site.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : isAdmin ? (
              <div className="text-white/70 text-sm text-center py-2">
                No sites yet
              </div>
            ) : null}

            {isAdmin && (
              <Link
                to="/sites/new"
                onClick={() => setSidebarOpen(false)}
                className="mt-3 flex items-center justify-center space-x-2 px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Site</span>
              </Link>
            )}

            <div className="mt-3 px-1">
              {isSuperAdmin ? (
                <span className="inline-block px-2 py-1 text-xs rounded-full bg-amber-500/30 text-amber-200 font-medium">
                  Super Admin
                </span>
              ) : currentRole && (
                <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                  currentRole.role === 'admin' ? 'bg-blue-500/20 text-blue-200' :
                  currentRole.role === 'board_member' ? 'bg-green-500/20 text-green-200' :
                  'bg-gray-500/20 text-gray-200'
                }`}>
                  {currentRole.role === 'admin' ? 'Administrator' :
                   currentRole.role === 'board_member' ? 'Board Member' : 'Homeowner'}
                </span>
              )}
            </div>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white text-[#002561] font-medium'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="px-4 py-4 border-t border-white/10">
            <div className="flex items-center space-x-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
                {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {profile?.full_name || 'User'}
                </p>
                <p className="text-white/50 text-xs truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-3 w-full px-3 py-2.5 text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="lg:pl-64">
        <div className="pt-16 lg:pt-0 min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
