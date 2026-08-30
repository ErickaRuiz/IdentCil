import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonButton, 
  IonButtons, 
  IonBackButton,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonSpinner,
  ToastController
} from '@ionic/angular';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-recojo',
  templateUrl: './recojo.html',
  styleUrls: ['./recojo.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonButton, 
    IonButtons, 
    IonBackButton,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonSpinner
  ]
})
export class RecojoComponent {

  cargando: boolean = false;

  recojo = {
    codigo_qr: '',
    cliente: '',
    estado: 'Vacío',
    motivo: 'Recarga',
    observaciones: ''
  };

  constructor(
    private supabase: SupabaseService,
    private toastController: ToastController,
    private router: Router
  ) {}

  async guardarRecojo() {
    if (!this.recojo.codigo_qr.trim() || !this.recojo.cliente.trim()) {
      this.mostrarToast('Por favor completa los campos obligatorios (*)', 'warning');
      return;
    }

    this.cargando = true;

    try {
      // Guarda el registro en la tabla 'recojos' de Supabase
      const { data, error } = await this.supabase.supabase
        .from('recojos')
        .insert([
          {
            codigo_qr: this.recojo.codigo_qr,
            cliente: this.recojo.cliente,
            estado: this.recojo.estado,
            motivo: this.recojo.motivo,
            observaciones: this.recojo.observaciones,
            fecha_recojo: new Date().toISOString()
          }
        ]);

      if (error) throw error;

      this.mostrarToast('Recojo registrado exitosamente', 'success');
      this.resetFormulario();
      this.router.navigate(['/home']);

    } catch (error: any) {
      console.error('Error al guardar el recojo:', error);
      this.mostrarToast('Error al guardar: ' + (error.message || 'Intente de nuevo'), 'danger');
    } finally {
      this.cargando = false;
    }
  }

  resetFormulario() {
    this.recojo = {
      codigo_qr: '',
      cliente: '',
      estado: 'Vacío',
      motivo: 'Recarga',
      observaciones: ''
    };
  }

  async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 3000,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }
}