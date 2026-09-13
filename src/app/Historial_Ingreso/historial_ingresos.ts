import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// 1. IMPORTANTE: NavController se importa desde '@ionic/angular'
import { NavController } from '@ionic/angular';

// 2. IMPORTANTE: Los componentes UI Standalone se importan desde '@ionic/angular/standalone'
import { 
  IonHeader, 
  IonToolbar, 
  IonButtons, 
  IonButton, 
  IonIcon, 
  IonTitle, 
  IonContent, 
  IonRefresher, 
  IonRefresherContent, 
  IonSpinner, 
  IonCard, 
  IonCardContent 
} from '@ionic/angular/';

import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-historial-ingresos',
  templateUrl: './historial_ingresos.html',
  styleUrls: ['./historial_ingresos.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    IonHeader, 
    IonToolbar, 
    IonButtons, 
    IonButton, 
    IonIcon, 
    IonTitle, 
    IonContent, 
    IonRefresher, 
    IonRefresherContent, 
    IonSpinner, 
    IonCard, 
    IonCardContent
  ]
})
export class HistorialIngresosPage {
  listaIngresos: any[] = [];
  cargando: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {}

  ionViewWillEnter() {
    this.cargarHistorial();
  }

  async cargarHistorial() {
    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('ingreso_cilindros')
        .select(`
          id,
          created_at,
          propiedad,
          estado,
          almacen_id,
          observacion,
          cilindros_ingresados,
          cliente_id,
          clientes:cliente_id (
            id,
            nombre_razon_social,
            num_documento,
            tipo_documento
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error al obtener ingresos:', error);
        this.listaIngresos = [];
      } else {
        this.listaIngresos = data || [];
      }
    } catch (err) {
      console.error('Error inesperado:', err);
      this.listaIngresos = [];
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  obtenerNombreEntidad(item: any): string {
    if (item.propiedad === 'ELECTRAMETAL') {
      return 'ELECTRAMETAL NORPERU SAC';
    }

    if (item.clientes && item.clientes.nombre_razon_social) {
      return item.clientes.nombre_razon_social.toUpperCase();
    }

    if (item.propiedad === 'Proveedor') {
      return 'PROVEEDOR NO REGISTRADO';
    }

    return 'ENTIDAD NO REGISTRADA';
  }

  regresar() {
    this.navCtrl.back();
  }
}