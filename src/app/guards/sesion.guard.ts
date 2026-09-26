import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase';

/**
 * Exige haber iniciado sesión para entrar en una pantalla; si no, lleva al
 * login.
 *
 * Es la mitad visible de la protección: evita que la app muestre pantallas
 * vacías o con errores a quien no ha entrado. La protección real de los datos
 * son las políticas RLS de Supabase (supabase/politicas_rls.sql), porque la
 * clave de la app es pública y cualquiera podría consultar la base de datos
 * sin pasar por la app.
 */
export const sesionGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  try {
    // getSession lee la sesión guardada en el dispositivo: no hace llamadas de red.
    const { data } = await supabase.supabase.auth.getSession();
    return data.session ? true : router.createUrlTree(['/login']);
  } catch {
    return router.createUrlTree(['/login']);
  }
};
