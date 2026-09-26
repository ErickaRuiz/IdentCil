import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { SupabaseService } from '../services/supabase';
import { sesionGuard } from './sesion.guard';

function configurar(getSession: () => Promise<unknown>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: { supabase: { auth: { getSession } } } },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    sesionGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
  ) as Promise<boolean | UrlTree>;
}

function rutaDe(resultado: boolean | UrlTree): string {
  return TestBed.inject(Router).serializeUrl(resultado as UrlTree);
}

describe('sesionGuard', () => {
  it('deja pasar con sesión iniciada', async () => {
    const resultado = await configurar(async () => ({ data: { session: { user: {} } } }));
    expect(resultado).toBe(true);
  });

  it('lleva al login sin sesión', async () => {
    const resultado = await configurar(async () => ({ data: { session: null } }));
    expect(rutaDe(resultado)).toBe('/login');
  });

  it('lleva al login si no se puede leer la sesión', async () => {
    const resultado = await configurar(async () => {
      throw new Error('almacenamiento no disponible');
    });
    expect(rutaDe(resultado)).toBe('/login');
  });
});
