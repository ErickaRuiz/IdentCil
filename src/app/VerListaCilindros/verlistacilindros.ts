import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular'; // Importar NavController
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../services/supabase';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, searchOutline, flaskOutline } from 'ionicons/icons';

@Component({
  selector: 'app-ver-lista-cilindros',
  templateUrl: './verlistacilindros.html',
  styleUrls: ['./verlistacilindros.scss'],
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    FormsModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar
  ]
})
export class VerListaCilindrosPage implements OnInit {

  filtroCilindro: string = '';
  listaCilindros: any[] = [];
  cilindrosFiltrados: any[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private navCtrl: NavController
  ) {
    addIcons({
      arrowBackOutline,
      searchOutline,
      flaskOutline
    });
  }

  ngOnInit() {
    this.obtenerCilindros();
  }

  ionViewWillEnter() {
    // Se ejecuta cada vez que se navega a esta pantalla
    this.obtenerCilindros();
  }

  async obtenerCilindros() {
    // Consulta con JOIN trayendo datos del cilindro y del cliente asignado
    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select(`
        id,
        numero_serie,
        tipo_gas,
        clientes (
          nombre_razon_social,
          tipo_documento,
          num_documento
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al cargar cilindros:', error.message);
      return;
    }

    if (data) {
      // Mapeo de datos respetando las propiedades que consume la plantilla HTML
      this.listaCilindros = data.map((item: any) => ({
        id: item.id,
        numeroSerie: item.numero_serie,
        tipoGas: item.tipo_gas,
        clienteNombre: item.clientes?.nombre_razon_social || 'SIN CLIENTE',
        clienteDocTipo: item.clientes?.tipo_documento || 'DOC',
        clienteDocNum: item.clientes?.num_documento || '-'
      }));

      this.cilindrosFiltrados = [...this.listaCilindros];
      this.cdRef.detectChanges();
    }
  }

  filtrarCilindros(event: any) {
    const termino = (event.detail.value || '').toLowerCase().trim();
    this.filtroCilindro = termino;

    if (!termino) {
      this.cilindrosFiltrados = [...this.listaCilindros];
      return;
    }

    this.cilindrosFiltrados = this.listaCilindros.filter(c => {
      const serie = (c.numeroSerie || '').toLowerCase();
      const gas = (c.tipoGas || '').toLowerCase();
      const cliente = (c.clienteNombre || '').toLowerCase();
      const doc = (c.clienteDocNum || '').toLowerCase();

      return serie.includes(termino) || 
             gas.includes(termino) || 
             cliente.includes(termino) || 
             doc.includes(termino);
    });
  }

  obtenerClaseGas(tipoGas: string): string {
  if (!tipoGas) return '';
  const gas = tipoGas.toUpperCase();

  if (gas.includes('OXÍGENO') || gas.includes('OXIGENO')) return 'gas-oxigeno';
  if (gas.includes('ACETILENO')) return 'gas-acetileno';
  if (gas.includes('MEZCLA') || gas.includes('ESTARGOR') || gas.includes('ARGÓN') || gas.includes('ARGON')) return 'gas-estargor';
  if (gas.includes('NITRÓGENO') || gas.includes('NITROGENO')) return 'gas-nitrogeno';
  if (gas.includes('DIÓXIDO') || gas.includes('DIOXIDO') || gas.includes('CO2')) return 'gas-co2';

  return '';
}
regresar() {
    this.navCtrl.back();
  }

}