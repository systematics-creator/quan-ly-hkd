'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut } from 'lucide-react';

export default function DashboardPage() {
  const { user, appUser, shop, loading, signOut } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [productName, setProductName] = useState('');
  const [cash, setCash] = useState(0);
  const [transfer, setTransfer] = useState(0);
  
  // Settings
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (appUser) {
      fetchSettings();
    }
  }, [appUser]);

  const fetchSettings = async () => {
    const { data } = await supabase.from('shop_settings').select('*').single();
    if (data) setSettings(data);
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    
    // Auto generate accounting amount
    // Rule: accounting_amount > transfer, within min/max
    let acc_amount = transfer + 10000; // Example base rule
    
    if (settings) {
      if (acc_amount < settings.min_amount) acc_amount = settings.min_amount;
      if (acc_amount > settings.max_amount) acc_amount = settings.max_amount;
    }

    const { error } = await supabase.from('daily_records').insert({
      shop_id: appUser.shop_id,
      date,
      product_name: productName,
      cash,
      transfer,
      accounting_amount: acc_amount
    });

    if (error) {
      alert('Error creating record: ' + error.message);
    } else {
      alert('Record created!');
      setProductName('');
      setCash(0);
      setTransfer(0);
    }
  };

  if (loading || !user) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{shop?.name || 'Dashboard'}</h1>
          <p className="text-sm text-gray-500">Role: {appUser?.role}</p>
        </div>
        <button onClick={signOut} className="flex items-center text-gray-600 hover:text-gray-900">
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </button>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        
        {/* Daily Input Form - Accessible to everyone */}
        <section className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Daily Input</h2>
          <form onSubmit={handleCreateRecord} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Product</label>
              <input type="text" value={productName} onChange={e => setProductName(e.target.value)} required placeholder="Product name" className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cash</label>
              <input type="number" value={cash} onChange={e => setCash(Number(e.target.value))} required min="0" className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Transfer</label>
              <input type="number" value={transfer} onChange={e => setTransfer(Number(e.target.value))} required min="0" className="w-full border rounded-lg p-2" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">
                Save Record
              </button>
            </div>
          </form>
        </section>

        {/* Manager/Admin Modules */}
        {appUser?.role !== 'user' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Reports</h2>
              <p className="text-sm text-gray-500 mb-4">View monthly and yearly analytics.</p>
              <button className="text-blue-600 hover:underline">View Reports &rarr;</button>
            </section>
            
            {(appUser?.role === 'admin' || appUser?.role === 'manager') && (
              <section className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Settings</h2>
                <p className="text-sm text-gray-500 mb-4">Configure limits and targets.</p>
                <button className="text-blue-600 hover:underline">Manage Settings &rarr;</button>
              </section>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
