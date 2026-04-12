'use client';

import { useAuth } from '@/components/AuthProvider';

export default function Footer() {
  const { shop } = useAuth();
  
  if (!shop) return null;

  return (
    <footer className="w-full py-4 px-6 border-t border-gray-100 mt-auto bg-gray-50/50">
      <div className="max-w-7xl mx-auto flex justify-between items-center text-gray-400">
        <p className="text-[10px] uppercase font-bold tracking-widest">
          © {new Date().getFullYear()} {shop.name}
        </p>
        <p className="text-[10px] italic">
          Liên hệ SĐT: <span className="font-bold text-blue-500">{shop.contact_phone || '---'}</span>
        </p>
      </div>
    </footer>
  );
}
