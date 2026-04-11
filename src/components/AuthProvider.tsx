'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

type AppUser = {
  id: string;
  shop_id: string;
  role: 'admin' | 'manager' | 'user';
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
    const fetchUserData = async (authUser: User) => {
      // 1. Get custom user details
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (userError || !userData) {
        console.error('Error fetching user details:', userError);
        setAppUser(null);
        setShop(null);
        return;
      }

      setAppUser(userData as AppUser);

      // 2. Get shop details
      const { data: shopData, error: shopError } = await supabase
        .from('shops')
        .select('*')
        .eq('id', userData.shop_id)
        .single();

      if (shopError || !shopData) {
        console.error('Error fetching shop details:', shopError);
        setShop(null);
        return;
      }

      setShop(shopData as Shop);

      // Check if shop is expired
      if (new Date(shopData.expire_at) < new Date() || !shopData.is_active) {
        // Handle blocked access logic here if needed (e.g., redirect to blocked page)
        router.push('/blocked');
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user || null;
        setUser(currentUser);
        
        if (currentUser) {
          await fetchUserData(currentUser);
        } else {
          setAppUser(null);
          setShop(null);
        }
        setLoading(false);
      }
    );

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchUserData(session.user).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
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
