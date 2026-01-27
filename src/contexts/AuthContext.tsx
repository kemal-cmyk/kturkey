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
    const superAdmin = data?.is_super_admin || false;
    setIsSuperAdmin(superAdmin);
    return superAdmin;
  };

  const fetchSites = async (userId: string, superAdmin: boolean) => {
    let userSites: Site[] = [];
    let roles: any[] = [];

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
        .select('*, sites(*)')
        .eq('user_id', userId);
      roles = userRoles || [];
      userSites = roles.map((r: any) => r.sites).filter(Boolean);
    }

    setSites(userSites);

    // LOGIC FIX: Always allow updating the current site data if it exists
    // This ensures that if you change a site name, it reflects immediately
    if (userSites.length > 0) {
      const storedSiteId = localStorage.getItem('currentSiteId');
      
      // Try to find stored site, otherwise fallback to first site
      const targetSite = userSites.find(s => s.id === storedSiteId) || userSites[0];

      setCurrentSite(targetSite);
        
      // Determine Role
      if (superAdmin) {
        setCurrentRole({ role: 'admin' } as UserSiteRole);
      } else {
        const role = roles.find((r: any) => r.site_id === targetSite.id);
        setCurrentRole(role || null);
      }
    }
  };

  const refreshSites = async () => {
    if (user) {
      await fetchSites(user.id, isSuperAdmin);
    }
  };

  useEffect(() => {
    // 1. Initial Session Check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const superAdmin = await fetchProfile(session.user.id);
        await fetchSites(session.user.id, superAdmin);
      }
      setLoading(false);
    });

    // 2. Event Listener - BALANCED
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // We still ignore 'TOKEN_REFRESHED' to prevent infinite loops.
      // But we allow 'SIGNED_IN', 'INITIAL_SESSION', and 'USER_UPDATED'
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        if (session?.user) {
          const superAdmin = await fetchProfile(session.user.id);
          await fetchSites(session.user.id, superAdmin);
        }
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setIsSuperAdmin(false);
        setSites([]);
        setCurrentSite(null);
        setCurrentRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSetCurrentSite = (site: Site) => {
    // REMOVED THE STRICT CHECK HERE.
    // We allow setting the site even if IDs match, so data refreshes.
    
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