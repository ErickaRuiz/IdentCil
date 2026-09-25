import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { 
  IonHeader, 
  IonToolbar, 
  IonButtons, 
  IonMenuButton, 
  IonContent, 
  IonCard, 
  IonCardContent, 
  IonIcon, 
  IonButton 
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  arrowDownCircleOutline, 
  arrowUpCircleOutline, 
  documentTextOutline, 
  logOutOutline, 
  businessOutline, 
  peopleOutline, exitOutline } from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, 
    IonToolbar, 
    IonButtons, 
    IonMenuButton, 
    IonContent, 
    IonCard, 
    IonCardContent, 
    IonIcon, 
    IonButton
  ]
})
export class HomePage implements OnInit {
  saludo: string = 'Bienvenido';
  nombre: string = 'Usuario';

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {
    addIcons({logOutOutline,arrowDownCircleOutline,exitOutline,arrowUpCircleOutline,businessOutline,peopleOutline,documentTextOutline});
  }

  async ngOnInit() {
    await this.obtenerDatosUsuario();
  }

  ionViewWillEnter() {
    this.obtenerDatosUsuario();
  }

  async obtenerDatosUsuario() {
    // 1. Lectura inmediata local
    const localNombre = localStorage.getItem('nombreUsuario');
    const localSaludo = localStorage.getItem('saludoUsuario');

    if (localNombre) this.nombre = localNombre;
    if (localSaludo) this.saludo = localSaludo;

    // 2. Obtener usuario directo de Supabase
    try {
      const user = await this.supabaseService.getUser();

      if (user) {
        if (user.email) {
          localStorage.setItem('emailUsuario', user.email);
        }

        const metadata = user.user_metadata;
        if (metadata) {
          if (metadata['nombre']) {
            this.nombre = metadata['nombre'];
            localStorage.setItem('nombreUsuario', this.nombre);
          }

          if (metadata['saludo']) {
            this.saludo = metadata['saludo'];
          } else if (metadata['genero']) {
            this.saludo = metadata['genero'] === 'Femenino' ? 'Bienvenida' : 'Bienvenido';
          }
          localStorage.setItem('saludoUsuario', this.saludo);
        }
      }
    } catch (e) {
      console.error('Error al obtener usuario:', e);
    }
  }

  navegarA(ruta: string) {
    this.router.navigate([ruta]);
  }

  async cerrarSesion() {
    localStorage.clear();
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}