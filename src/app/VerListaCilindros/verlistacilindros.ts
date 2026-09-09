import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavController, AlertController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonModal
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  arrowBackOutline, 
  searchOutline, 
  flaskOutline, 
  createOutline, 
  trashOutline,
  closeOutline 
} from 'ionicons/icons';

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
    IonSearchbar,
    IonModal
  ]
})
export class VerListaCilindrosPage implements OnInit {

  filtroCilindro: string = '';
  listaCilindros: any[] = [];
  cilindrosFiltrados: any[] = [];

  isModalOpen: boolean = false;
  cilindroSeleccionado: any = null;

  constructor(
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private navCtrl: NavController,
    private alertCtrl: AlertController,
    private router: Router
  ) {
    addIcons({ 
      arrowBackOutline, 
      searchOutline, 
      flaskOutline, 
      createOutline, 
      trashOutline,
      closeOutline 
    });
  }

  ngOnInit() {
    this.obtenerCilindros();
  }

  ionViewWillEnter() {
    this.obtenerCilindros();
  }

  async obtenerCilindros() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('cilindros')
        .select(`
          *,
          clientes (
            nombre_razon_social,
            tipo_documento,
            num_documento
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error de Supabase:', error.message);
        const { data: dataSimple, error: errorSimple } = await this.supabaseService.supabase
          .from('cilindros')
          .select('*')
          .order('created_at', { ascending: false });

        if (!errorSimple && dataSimple) {
          this.procesarCilindros(dataSimple);
        }
        return;
      }

      if (data) {
        this.procesarCilindros(data);
      }
    } catch (err) {
      console.error('Error inesperado:', err);
    }
  }

  procesarCilindros(data: any[]) {
    this.listaCilindros = data.map((item: any) => ({
      id: item.id,
      cliente_id: item.cliente_id || item.clienteId,
      numeroSerie: item.numero_serie || item.numeroSerie || 'SIN SERIE',
      tipoGas: item.tipo_gas || item.tipoGas || 'NO ESPECIFICADO',
      marca: item.marca,
      anio_fabricacion: item.anio_fabricacion || item.anioFabricacion,
     // En verlistacilindros.ts -> procesarCilindros()
m3: item.unidad_medida || item.m3 || item.unidadMedida || 'N/A',
      peso: item.peso,
      ancho_diametro: item.ancho_diametro || item.anchoDiametro,
      largo_altura: item.largo_altura || item.largoAltura,
      litros: item.litros,
      contenido: item.contenido,
      color: item.color,
      ph: item.ph,
      procedencia: item.procedencia,
      capacidad: item.capacidad,
      clienteNombre: item.clientes?.nombre_razon_social || 'SIN CLIENTE',
      clienteDocTipo: item.clientes?.tipo_documento || 'DOC',
      clienteDocNum: item.clientes?.num_documento || '-'
    }));

    if (this.filtroCilindro) {
      this.filtrarCilindros({ detail: { value: this.filtroCilindro } });
    } else {
      this.cilindrosFiltrados = [...this.listaCilindros];
    }

    this.cdRef.detectChanges();
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

  verDetalleCilindro(item: any) {
    this.cilindroSeleccionado = item;
    this.isModalOpen = true;
  }

  cerrarDetalle() {
    this.isModalOpen = false;
    this.cilindroSeleccionado = null;
  }

  // REDIRECCIÓN CORREGIDA SEGÚN TUS RUTAS DECLARADAS: /registrocilindros/:id
  editarCilindro(item: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    if (item?.id) {
      this.router.navigate(['/registrocilindros', item.id]);
    }
  }

  async eliminarCilindro(item: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro de eliminar el cilindro con serie ${item.numeroSerie}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            const { error } = await this.supabaseService.supabase
              .from('cilindros')
              .delete()
              .eq('id', item.id);

            if (error) {
              console.error('Error al eliminar el cilindro:', error.message);
              return;
            }

            this.obtenerCilindros();
          }
        }
      ]
    });

    await alert.present();
  }

  regresar() {
    this.navCtrl.back();
  }
}