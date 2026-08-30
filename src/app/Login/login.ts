import { Component, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class LoginPage implements OnInit {
  loginForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private supabaseService: SupabaseService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    try {
      const { email, password } = this.loginForm.value;
      const { data, error } = await this.supabaseService.signIn(email, password);

      if (error) {
        alert('Error al iniciar sesión: ' + error.message);
        console.error('Error de autenticación:', error.message);
        return;
      }

      if (data?.user) {
        // Guardar datos clave localmente
        localStorage.setItem('emailUsuario', data.user.email || '');
        const meta = data.user.user_metadata;
        if (meta?.['nombre']) localStorage.setItem('nombreUsuario', meta['nombre']);
        if (meta?.['genero']) localStorage.setItem('generoUsuario', meta['genero']);

        // Forzar navegación dentro de NgZone para asegurar el cambio de ruta
        this.ngZone.run(() => {
          this.router.navigate(['/home']);
        });
      }
    } catch (e) {
      console.error('Error inesperado al iniciar sesión:', e);
    }
  }

  goToRegister() {
    this.router.navigate(['/registro']);
  }
}