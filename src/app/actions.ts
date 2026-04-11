'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';

export async function createUserWithRole(email: string, password: string, role: string, shopId: string | null) {
  try {
    // Check missing fields
    if (!email || !password || !role) {
      return { error: 'Thiếu thông tin bắt buộc' };
    }

    // 1. Create Auth User
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return { error: authError?.message || 'Không thể tạo user Auth' };
    }

    // 2. Insert into custom Users table
    const { error: dbError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      shop_id: shopId,
      role: role,
      email: email
    });

    if (dbError) {
      // Rollback Auth user creation if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { error: dbError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
