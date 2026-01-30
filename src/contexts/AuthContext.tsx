import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserSiteRole, Site } from '../types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isSuperAdmin: boolean;
  sites: Site[];
  currentSite: Site | null;
  currentRole: UserSiteRole | null;
  userRole: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: { user: User | null } | null; error: Error | null }>;
  signOut: () => Promise<void>;
  setCurrentSite: (site: Site) => void;
  refreshSites: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [currentRole, setCurrentRole] = useState<UserSiteRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data);
    setIsSuperAdmin(data?.is_super_admin || false);
    return data?.is_super_admin || false;
  };

const fetchSites = async (userId: string, superAdmin: boolean) => {
    let userSites: Site[] = [];
    let roles: UserSiteRole[] = []; // Typed correctly

    if (superAdmin) {
      const { data: allSites } = await supabase
        .from('sites')
        .select('*')
        .eq('is_active', true)
        .order('name');
      userSites = allSites || [];
    } else {
      const { data: userRoles } = await supabase
        .from('user_site_roles')
        .select('*, sites(*)') // Fetch role AND joined site data
        .eq('user_id', userId);
      
      roles = userRoles || [];
      // Extract the site objects from the joined data
      userSites = roles
        .map((r: any) => r.sites)
        .filter((s: any) => s && s.is_active !== false) // Ensure site exists and is active
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    setSites(userSites);

    // Logic to select the initial site and role
    if (userSites.length > 0) {
      const storedSiteId = localStorage.getItem('currentSiteId');
      // Try to find the last visited site, otherwise default to the first one
      const targetSite = userSites.find(s => s.id === storedSiteId) || userSites[0];

      setCurrentSite(targetSite);

      if (superAdmin) {
        // Super admins are always 'admin' effectively
        setCurrentRole({ role: 'admin', user_id: userId, site_id: targetSite.id } as UserSiteRole);
      } else {
        // Find the specific role record for this site
        const activeRole = roles.find((r: any) => r.site_id === targetSite.id);
        setCurrentRole(activeRole || null);
      }
    } else {
      // User has no sites
      setCurrentSite(null);
      setCurrentRole(null);
    }
  };

  const refreshSites = async () => {
    if (user) {
      await fetchSites(user.id, isSuperAdmin);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const superAdmin = await fetchProfile(session.user.id);
        await fetchSites(session.user.id, superAdmin);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // ✅ THE TINY FIX: Ignore background token refreshes
      if (_event === 'TOKEN_REFRESHED') return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          const superAdmin = await fetchProfile(session.user.id);
          await fetchSites(session.user.id, superAdmin);
        })();
      } else {
        setProfile(null);
        setIsSuperAdmin(false);
        setSites([]);
        setCurrentSite(null);
        setCurrentRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSetCurrentSite = (site: Site) => {
    setCurrentSite(site);
    localStorage.setItem('currentSiteId', site.id);

    if (isSuperAdmin) {
      setCurrentRole({ role: 'admin' } as UserSiteRole);
    } else {
      supabase
        .from('user_site_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('site_id', site.id)
        .maybeSingle()
        .then(({ data }) => {
          setCurrentRole(data);
        });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('currentSiteId');
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      isSuperAdmin,
      sites,
      currentSite,
      currentRole,
      userRole: currentRole?.role || null,
      loading,
      signIn,
      signUp,
      signOut,
      setCurrentSite: handleSetCurrentSite,
      refreshSites,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}