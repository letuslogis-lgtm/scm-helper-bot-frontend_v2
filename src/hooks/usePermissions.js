import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

export function usePermissions(userProfile) {
  const [permissions, setPermissions] = useState(null);

  useEffect(() => {
    supabase
      .from('menu_permissions')
      .select('menu_id, action, allowed_roles')
      .then(({ data }) => setPermissions(data ?? []));
  }, []);

  const can = useCallback(
    (menuId, action) => {
      if (!permissions || !userProfile?.role) return false;
      const rule = permissions.find(p => p.menu_id === menuId && p.action === action);
      if (!rule) return false;
      return rule.allowed_roles.includes(userProfile.role);
    },
    [permissions, userProfile?.role]
  );

  return { can, permissionsLoaded: permissions !== null };
}
