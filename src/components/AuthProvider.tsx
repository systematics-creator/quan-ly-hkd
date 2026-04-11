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
    // Listen to auth state changes only - onAuthStateChange fires INITIAL_SESSION on load
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (!currentUser) {
          setAppUser(null);
          setShop(null);
          setLoading(false);
          return;
        }

        // Fetch user profile from DB
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentUser.id)
            .single();

          if (!userData) {
            // No profile found → sign out and redirect
            await supabase.auth.signOut();
            setAppUser(null);
            setShop(null);
            setLoading(false);
            return;
          }

          setAppUser(userData as AppUser);

          // super_admin has no shop
          if (userData.role === 'super_admin') {
            setShop(null);
            setLoading(false);
            return;
          }

          // Fetch shop
          if (userData.shop_id) {
            const { data: shopData } = await supabase
              .from('shops')
              .select('*')
              .eq('id', userData.shop_id)
              .single();

            if (shopData) {
              setShop(shopData as Shop);
              // Check expiry
              if (!shopData.is_active || new Date(shopData.expire_at) < new Date()) {
                setLoading(false);
                router.push('/blocked');
                return;
              }
            } else {
              setShop(null);
            }
          }
        } catch (err) {
          console.error('AuthProvider error:', err);
          setAppUser(null);
          setShop(null);
        } finally {
          setLoading(false);
        }
      }
    );

    return () => {
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
