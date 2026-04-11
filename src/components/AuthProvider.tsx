'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

type AppUser = {
  id: string;
  shop_id: string | null;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  email: string;
};

type Shop = {
  id: string;
  name: string;
  expire_at: string;
  is_active: boolean;
};

type AuthContextType = {
  user: User | null;
  appUser: AppUser | null;
  shop: Shop | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  shop: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const fetchUserData = async (authUser: User) => {
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();
        
        if (userError || !userData) {
          if (mounted) {
            setAppUser(null);
            setShop(null);
          }
          // If the user's DB row is wiped, force logout to reset state
          await supabase.auth.signOut();
          return;
        }

        if (!mounted) return;
        setAppUser(userData as AppUser);

        if (userData.role === 'super_admin' && !userData.shop_id) {
          setShop(null);
          return;
        }

        const { data: shopData, error: shopError } = await supabase
          .from('shops')
          .select('*')
          .eq('id', userData.shop_id)
          .single();

        if (shopError || !shopData) {
          if (mounted) setShop(null);
          return;
        }

        if (mounted) setShop(shopData as Shop);

        if (userData.role !== 'super_admin' && (new Date(shopData.expire_at) < new Date() || !shopData.is_active)) {
          router.push('/blocked');
        }
      } catch (err) {
        console.error("fetchUserData error", err);
      }
    };

    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (data?.session?.user) {
          if (mounted) setUser(data.session.user);
          await fetchUserData(data.session.user);
        } else {
          if (mounted) setUser(null);
        }
      } catch (err) {
        console.error("getSession error", err);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user || null;
        if (mounted) setUser(currentUser);
        
        if (currentUser) {
          await fetchUserData(currentUser);
        } else {
          if (mounted) {
            setAppUser(null);
            setShop(null);
          }
        }
        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, appUser, shop, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
