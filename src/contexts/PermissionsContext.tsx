import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface PermissionsContextType {
  canAccess: (path: string) => boolean;
  allowedPaths: string[];
  loading: boolean;
  reloadPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin, userRole } = useAuth();
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPermissions();
  }, [user, userRole, isSuperAdmin]);

  const loadPermissions = async () => {
    setLoading(true);

    if (!user) {
      setAllowedPaths([]);
      setLoading(false);
      return;
    }

    if (isSuperAdmin) {
      setAllowedPaths(['*']);
      setLoading(false);
      return;
    }

    if (!userRole) {
      setAllowedPaths([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('page_path')
        .eq('role', userRole);

      if (error) {
        console.error('Failed to load permissions:', error);
        setAllowedPaths([]);
      } else {
        const paths = data?.map(p => p.page_path) || [];
        setAllowedPaths(paths);
      }
    } catch (err) {
      console.error('Error loading permissions:', err);
      setAllowedPaths([]);
    } finally {
      setLoading(false);
    }
  };

  const reloadPermissions = async () => {
    await loadPermissions();
  };

  const canAccess = (path: string): boolean => {
    if (!user) return false;

    if (isSuperAdmin) return true;

    if (allowedPaths.includes('*')) return true;

    return allowedPaths.includes(path);
  };

  return (
    <PermissionsContext.Provider value={{ canAccess, allowedPaths, loading, reloadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
