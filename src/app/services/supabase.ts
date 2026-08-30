import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async signUp(email: string, password: string, nombre: string, genero: string) {
    return await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: nombre,
          nombre: nombre,
          genero: genero,
          saludo: genero === 'Femenino' ? 'Bienvenida' : 'Bienvenido'
        }
      }
    });
  }

  signIn(email: string, pass: string) {
    return this.supabase.auth.signInWithPassword({ email, password: pass });
  }

  async getUser() {
    const { data } = await this.supabase.auth.getUser();
    return data?.user || null;
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

async updateUserProfile(nombre: string, genero: string, email?: string) {
  const payload: any = {
    data: { 
      nombre: nombre,
      full_name: nombre,
      name: nombre,
      display_name: nombre, // <--- Esta es la clave que Supabase está leyendo para esa columna
      genero: genero
    }
  };

  if (email) {
    payload.email = email;
  }

  return await this.supabase.auth.updateUser(payload);
}
}