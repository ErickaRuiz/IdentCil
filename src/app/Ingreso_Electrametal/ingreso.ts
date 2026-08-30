import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonFooter,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  arrowBackOutline, 
  searchOutline, 
  qrCodeOutline, 
  trashOutline, 
  checkmarkDoneOutline 
} from 'ionicons/icons';
import { IonBackButton } from "@ionic/angular";

@Component({
  selector: 'app-ingreso',
  templateUrl: './ingreso.html',
  styleUrls: ['./ingreso.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonCardContent,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonFooter,
    IonSpinner
  ]
})
export class IngresoPage {

  razonSocial: string = 'ELECTRAMETAL NORPERU SAC';
  rucProveedor: string = '20536193805';
  propiedad: string = 'ELECTRAMETAL';
  estado: string = 'VACIO';
  
  serieActual: string = '';
  listaCilindros: any[] = [];
  cargando: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({
      arrowBackOutline,
      searchOutline,
      qrCodeOutline,
      trashOutline,
      checkmarkDoneOutline
    });
  }

  regresar() {
    this.navCtrl.back();
  }

  obtenerUnidadMedida(tipoGas: string): string {
    if (!tipoGas) return '';
    const gas = tipoGas.toUpperCase();

    if (gas.includes('ACETILENO') || gas.includes('DIÓXIDO') || gas.includes('DIOXIDO') || gas.includes('CO2')) {
      return 'Kg';
    }
    return 'm³';
  }

  async buscarYAgregarCilindro() {
    const serie = this.serieActual.trim().toUpperCase();
    if (!serie) return;

    if (this.listaCilindros.some(c => c.numeroSerie === serie)) {
      alert('Esta serie ya está en la lista de ingreso.');
      this.serieActual = '';
      return;
    }

    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select('id, numero_serie, tipo_gas, capacidad')
      .eq('numero_serie', serie)
      .single();

    if (error || !data) {
      alert('Cilindro no encontrado en el sistema. Registre la serie primero.');
      return;
    }

    const unidad = this.obtenerUnidadMedida(data.tipo_gas);
    this.listaCilindros.push({
      id: data.id,
      numeroSerie: data.numero_serie,
      tipoGas: data.tipo_gas || 'NO ESPECIFICADO',
      capacidad: data.capacidad ? `${data.capacidad} ${unidad}` : '-'
    });

    this.serieActual = '';
    this.cdRef.detectChanges();
  }

  abrirEscanerML() {
    console.log('Escáner activado');
  }

  eliminarSerie(index: number) {
    this.listaCilindros.splice(index, 1);
  }

  async guardarIngreso() {
    if (this.listaCilindros.length === 0) return;

    this.cargando = true;

    try {
      const registrosMovimiento = this.listaCilindros.map(c => ({
        cilindro_id: c.id,
        tipo_movimiento: 'INGRESO',
        propiedad: this.propiedad,
        estado_cilindro: this.estado,
        created_at: new Date()
      }));

      const { error: errMov } = await this.supabaseService.supabase
        .from('movimientos_cilindros')
        .insert(registrosMovimiento);

      if (errMov) throw errMov;

      const ids = this.listaCilindros.map(c => c.id);
      const { error: errUpdate } = await this.supabaseService.supabase
        .from('cilindros')
        .update({
          estado_actual: 'EN ALMACÉN',
          estado_contenido: this.estado
        })
        .in('id', ids);

      if (errUpdate) throw errUpdate;

      alert(`¡Se registraron ${this.listaCilindros.length} cilindro(s) correctamente!`);
      this.listaCilindros = [];
    } catch (err: any) {
      alert('Error al guardar el ingreso: ' + (err.message || err));
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }
}