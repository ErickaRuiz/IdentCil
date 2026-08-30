import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.html',
  styleUrls: ['./registro.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class RegistroPage implements OnInit {
  registroForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit() {
    this.registroForm = this.fb.group({
      nombre: ['', Validators.required],
      genero: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  async onSubmit() {
    if (this.registroForm.invalid) return;

    const { email, password, nombre, genero } = this.registroForm.value;

    const { data, error } = await this.supabaseService.signUp(email, password, nombre, genero);

    if (error) {
      alert('Error en el registro: ' + error.message);
    } else {
      // Preguardar datos en localStorage
      localStorage.setItem('emailUsuario', email);
      localStorage.setItem('nombreUsuario', nombre);
      localStorage.setItem('generoUsuario', genero);

      alert('Registro exitoso. Procede a iniciar sesión.');
      this.router.navigate(['/login']);
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}