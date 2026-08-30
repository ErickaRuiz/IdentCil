import { Component, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { 
  IonHeader, IonToolbar, IonButtons, IonMenuButton, 
  IonTitle, IonContent, IonIcon, IonButton 
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  personOutline, mailOutline, transgenderOutline, 
  createOutline, closeOutline, cameraOutline 
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.html',
  styleUrls: ['./perfil.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, IonHeader, 
    IonToolbar, IonButtons, IonMenuButton, IonTitle, 
    IonContent, IonIcon, 
  ]
})
export class PerfilPage {
  nombre: string = '';
  genero: string = '';
  email: string = '';
  fotoUrl: string | null = null;
  editando: boolean = false;
  perfilForm: FormGroup;

  constructor(
    private supabaseService: SupabaseService,
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    addIcons({ 
      personOutline, mailOutline, transgenderOutline, 
      createOutline, closeOutline, cameraOutline 
    });

    this.perfilForm = this.fb.group({
      nombre: ['', Validators.required],
      genero: ['', Validators.required]
    });
  }

  ionViewWillEnter() {
    this.cargarDatosDirectos();
  }

  
async cargarDatosDirectos() {
  // 1. Carga inmediata desde localStorage
  const localEmail = localStorage.getItem('emailUsuario');
  const localNombre = localStorage.getItem('nombreUsuario');
  const localGenero = localStorage.getItem('generoUsuario');

  if (localEmail) this.email = localEmail;
  if (localNombre) this.nombre = localNombre;
  if (localGenero) this.genero = localGenero;
  this.fotoUrl = localStorage.getItem('fotoPerfil');

  this.perfilForm.patchValue({
    nombre: this.nombre || 'Usuario',
    genero: this.genero || 'No especificado'
  });

  this.cd.detectChanges();

  // 2. Consulta a Supabase obteniendo directamente el objeto usuario
  try {
    const user = await this.supabaseService.getUser();

    this.ngZone.run(() => {
      if (user && user.email) {
        this.email = user.email;
        localStorage.setItem('emailUsuario', user.email);
      }

      const meta = user?.user_metadata;
      if (meta?.['nombre']) {
        this.nombre = meta['nombre'];
        localStorage.setItem('nombreUsuario', this.nombre);
      }
      if (meta?.['genero']) {
        this.genero = meta['genero'];
        localStorage.setItem('generoUsuario', this.genero);
      }

      this.perfilForm.patchValue({
        nombre: this.nombre,
        genero: this.genero
      });

      this.cd.detectChanges();
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
  }
}

 toggleEdicion() {
  this.editando = !this.editando;
  if (this.editando) {
    this.perfilForm.patchValue({
      nombre: this.nombre,
      genero: this.genero,
      email: this.email // <-- Seteamos el valor inicial
    });
  }
}

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.fotoUrl = reader.result as string;
        localStorage.setItem('fotoPerfil', this.fotoUrl);
        this.cd.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

async guardarCambios() {
  if (this.perfilForm.invalid) return;

  const { nombre, genero, email } = this.perfilForm.value;

  try {
    // Se envía el email junto con los metadatos
    const { data, error } = await this.supabaseService.updateUserProfile(nombre, genero, email);

    if (error) {
      alert('Error al actualizar perfil: ' + error.message);
      return;
    }

    this.ngZone.run(() => {
      this.nombre = nombre;
      this.genero = genero;
      this.email = email;

      localStorage.setItem('nombreUsuario', nombre);
      localStorage.setItem('generoUsuario', genero);
      localStorage.setItem('emailUsuario', email);

      this.editando = false;
      this.cd.detectChanges();
      alert('Perfil actualizado con éxito');
    });
  } catch (e) {
    console.error('Error inesperado al guardar:', e);
  }
}

ngOnInit() {
  this.perfilForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    genero: ['Femenino', [Validators.required]],
    email: ['', [Validators.required, Validators.email]] // <-- Campo de correo agregado
  });

  
}
}