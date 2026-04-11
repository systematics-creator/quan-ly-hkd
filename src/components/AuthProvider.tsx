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
  store_code: string;
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
    let isFetching = false;

    const syncProfile = async (session: any) => {
      if (isFetching || !mounted || !session?.user) return;
      try {
        isFetching = true;
        const { data: userData, error: userError } = await supabase
          .from('users').select('*').eq('id', session.user.id).single();

        if (!userError && userData && mounted) {
          setAppUser(userData as AppUser);
          localStorage.setItem('appUser', JSON.stringify(userData));
          
          if (userData.role !== 'super_admin' && userData.shop_id) {
            const { data: shopData } = await supabase
              .from('shops').select('*').eq('id', userData.shop_id).single();
            if (mounted && shopData) {
              setShop(shopData as Shop);
              localStorage.setItem('shop', JSON.stringify(shopData));
            }
          }
        }
      } catch (err) {
        console.error('Sync error:', err);
      } finally {
        isFetching = false;
        if (mounted) setLoading(false);
      }
    };

    // 1. Phá bỏ mọi sự chờ đợi sau 1.5 giây
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 1500);

    // 2. Tải nhanh session
    const init = async () => {
      const cachedSession = typeof window !== 'undefined' ? localStorage.getItem('sb-session-cache') : null;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session) {
        setUser(session.user);
        const cachedUser = localStorage.getItem('appUser');
        const cachedShop = localStorage.getItem('shop');
        if (cachedUser) setAppUser(JSON.parse(cachedUser));
        if (cachedShop) setShop(JSON.parse(cachedShop));
        
        setLoading(false); 
        syncProfile(session);
      } else {
        setLoading(false);
      }
    };

    init();

    // 3. Listener
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const currentUser = session?.user ?? null;
        if (currentUser) {
           setUser(currentUser);
           setLoading(false);
           syncProfile(session);
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('appUser');
        localStorage.removeItem('shop');
        setUser(null);
        setAppUser(null);
        setShop(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setAppUser(null);
    setShop(null);
    setLoading(false);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, appUser, shop, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
