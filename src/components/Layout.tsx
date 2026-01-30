import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage, Language } from '../contexts/LanguageContext';
import { usePermissions } from '../contexts/PermissionsContext';
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
  ChevronRight,
  Home,
  Ticket,
  Plus,
  Wallet,
  BarChart2,
  UserCog,
  Globe,
  Shield,
  BookOpen,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const languageLabels: Record<Language, string> = {
  en: 'EN',
  tr: 'TR',
  ru: 'RU',
  de: 'DE',
  nl: 'NL',
  fa: 'FA',
  no: 'NO',
  sv: 'SV',
  fi: 'FI',
  da: 'DA',
};

export default function Layout({ children }: LayoutProps) {
  const { user, profile, isSuperAdmin, sites, currentSite, currentRole, signOut, setCurrentSite } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { canAccess } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  
  // State for collapsible groups
  const [financeOpen, setFinanceOpen] = useState(true);

  const isAdmin = isSuperAdmin || currentRole?.role === 'admin';

  // Define Navigation Structure with Groups
  const rawNavigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Units', href: '/units', icon: Home },
    { name: 'Residents', href: '/residents', icon: Users },
    { name: 'Resident Statement', href: '/resident-statement', icon: FileText },
    
    // FINANCE GROUP
    {
      name: 'Finance',
      icon: Wallet, // Group Icon
      type: 'group',
      isOpen: financeOpen,
      toggle: () => setFinanceOpen(!financeOpen),
      children: [
        { name: 'Ledger', href: '/ledger', icon: Receipt },
        { name: 'Budget', href: '/budget', icon: Wallet },
        { name: 'Financial Periods', href: '/fiscal-periods', icon: Calendar },
        { name: 'Budget vs Actual', href: '/budget-vs-actual', icon: FileText },
        { name: 'Income & Expenses', href: '/monthly-income-expenses', icon: BarChart2 },
        { name: 'Debt Tracking', href: '/debt-tracking', icon: AlertTriangle },
      ]
    },

    { name: 'Support Tickets', href: '/tickets', icon: Ticket },
    { name: 'My Account', href: '/my-account', icon: Users },
    { name: 'User Management', href: '/user-management', icon: UserCog },
    { name: 'Language', href: '/language-settings', icon: Globe },
    { name: 'Role & Permissions', href: '/role-settings', icon: Shield },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  // Filter Navigation based on permissions
  const navigation = rawNavigation.reduce((acc: any[], item: any) => {
    if (item.type === 'group') {
      // Filter children of the group
      const filteredChildren = item.children.filter((child: any) => canAccess(child.href));
      
      // Only show group if it has accessible children
      if (filteredChildren.length > 0) {
        acc.push({ ...item, children: filteredChildren });
      }
    } else {
      // Normal Item check
      if (canAccess(item.href)) {
        acc.push(item);
      }
    }
    return acc;
  }, []);

  // Auto-expand Finance group if we are currently on a finance page
  useEffect(() => {
    const financePaths = ['/ledger', '/budget', '/fiscal-periods', '/budget-vs-actual', '/monthly-income-expenses', '/debt-tracking'];
    if (financePaths.some(path => location.pathname.startsWith(path))) {
      setFinanceOpen(true);
    }
  }, [location.pathname]);

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
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#002561] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-white p-2 rounded-lg hover:bg-white/10"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="text-white font-bold text-lg">KTurkey</span>
        <div className="relative">
          <button
            onClick={() => setLangDropdownOpen(!langDropdownOpen)}
            className="text-white p-2 rounded-lg hover:bg-white/10 flex items-center space-x-1"
          >
            <Globe className="w-5 h-5" />
            <span className="text-xs font-medium">{languageLabels[language]}</span>
          </button>
          {langDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden z-10 min-w-[100px]">
              {(Object.keys(languageLabels) as Language[]).map(lang => (
                <button
                  key={lang}
                  onClick={() => {
                    setLanguage(lang);
                    setLangDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                    lang === language ? 'bg-gray-50 text-[#002561] font-medium' : 'text-gray-700'
                  }`}
                >
                  {languageLabels[lang]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#002561] transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
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

          {/* Site Selector */}
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

          {/* Navigation Links */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item: any) => {
              // RENDER GROUP
              if (item.type === 'group') {
                const Icon = item.icon;
                return (
                  <div key={item.name} className="space-y-1">
                    <button
                      onClick={item.toggle}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-white/90 hover:bg-white/10 hover:text-white rounded-lg transition-colors group"
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      {item.isOpen ? (
                        <ChevronDown className="w-4 h-4 text-white/50" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-white/50" />
                      )}
                    </button>
                    
                    {/* Children */}
                    {item.isOpen && (
                      <div className="pl-4 space-y-1 mt-1 border-l-2 border-white/10 ml-4">
                        {item.children.map((child: any) => {
                          const ChildIcon = child.icon;
                          const isChildActive = location.pathname === child.href;
                          return (
                            <Link
                              key={child.name}
                              to={child.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isChildActive
                                  ? 'bg-white text-[#002561] font-medium'
                                  : 'text-white/70 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <ChildIcon className="w-4 h-4" />
                              <span>{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // RENDER SINGLE ITEM
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

            {/* User Manual Link */}
            <Link
              to="/manual"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors mt-4 border-t border-white/10 ${
                location.pathname === '/manual'
                  ? 'bg-white text-[#002561] font-medium'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span>User Manual</span>
            </Link>
          </nav>

          {/* Sidebar Footer (User Profile) */}
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