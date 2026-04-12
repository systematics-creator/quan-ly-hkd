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

export async function updateUserInShop(userId: string, email: string, password?: string, role?: string) {
  try {
    // 1. Update Auth User if password is provided
    if (password) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password
      });
      if (authError) return { error: authError.message };
    }

    // 2. Update custom Users table
    const updates: any = { email };
    if (role) updates.role = role;

    const { error: dbError } = await supabaseAdmin.from('users').update(updates).eq('id', userId);
    if (dbError) return { error: dbError.message };

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteUserFromShop(userId: string) {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteShopAndUsers(shopId: string) {
  try {
    const { data: shopUsers } = await supabaseAdmin.from('users').select('id').eq('shop_id', shopId);
    if (shopUsers && shopUsers.length > 0) {
      for (const u of shopUsers) {
        await supabaseAdmin.auth.admin.deleteUser(u.id);
      }
    }
    const { error } = await supabaseAdmin.from('shops').delete().eq('id', shopId);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
