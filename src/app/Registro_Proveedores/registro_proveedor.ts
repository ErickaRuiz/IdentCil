import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  IonIcon,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  storefrontOutline,
  createOutline,
  cardOutline,
  documentTextOutline,
  businessOutline,
  locationOutline,
  callOutline,
  mailOutline,
  personCircleOutline,
  listOutline,
  logoWhatsapp,
  notificationsOutline
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-registro-proveedor',
  templateUrl: './registro_proveedor.html',
  styleUrls: ['./registro_proveedor.scss'],
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
    IonIcon
  ]
})
export class RegistroProveedorPage implements OnInit {

  private supabaseService = inject(SupabaseService);
  private toastController = inject(ToastController);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  cargando: boolean = false;
  proveedorId: string | null = null;
  esEdicion: boolean = false;

  proveedor = {
    ruc: '',
    razon_social: '',
    persona_responsable: '',
    direccion: '',
    telefono: '',
    email: '',
    medio_alerta: 'WHATSAPP'   // WHATSAPP o CORREO: por dónde recibirá las alertas automáticas
  };

  constructor() {
    addIcons({
      storefrontOutline,
      createOutline,
      cardOutline,
      documentTextOutline,
      businessOutline,
      locationOutline,
      callOutline,
      mailOutline,
      personCircleOutline,
      listOutline,
      logoWhatsapp,
      notificationsOutline
    });
  }

  ngOnInit() {
    const idParam = this.route.snapshot.paramMap.get('id');

    if (idParam) {
      this.proveedorId = idParam;
      this.esEdicion = true;
      this.cargarDatosProveedor(idParam);
    }
  }

  async cargarDatosProveedor(id: string) {
    this.cargando = true;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('proveedores')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        this.proveedor = {
          ruc: data.ruc || '',
          razon_social: data.razon_social || '',
          persona_responsable: data.persona_responsable || '',
          direccion: data.direccion || '',
          telefono: data.telefono || '',
          email: data.email || '',
          medio_alerta: data.medio_alerta || 'WHATSAPP'
        };
      }
    } catch (error: any) {
      console.error('Error al cargar proveedor:', error);
      this.mostrarToast('Error al obtener datos del proveedor', 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  // Solo números y máximo 11 dígitos (RUC)
  filtrarNumero(event: any) {
    let valor = (event.target.value || '').replace(/[^0-9]/g, '');
    if (valor.length > 11) {
      valor = valor.substring(0, 11);
    }
    this.proveedor.ruc = valor;
    event.target.value = valor;
  }

  seleccionarMedioAlerta(medio: 'WHATSAPP' | 'CORREO') {
    this.proveedor.medio_alerta = medio;
  }

  async guardarProveedor() {
    const ruc = this.proveedor.ruc.trim();

    if (ruc.length !== 11) {
      this.mostrarToast('El RUC debe contener exactamente 11 dígitos', 'warning');
      return;
    }

    if (!this.proveedor.razon_social.trim()) {
      this.mostrarToast('La razón social es obligatoria', 'warning');
      return;
    }

    // El medio elegido para las alertas necesita su dato de contacto
    if (this.proveedor.medio_alerta === 'WHATSAPP' && !this.proveedor.telefono.trim()) {
      this.mostrarToast('Ingresa el teléfono para enviar las alertas por WhatsApp', 'warning');
      return;
    }

    if (this.proveedor.medio_alerta === 'CORREO' && !/^\S+@\S+\.\S+$/.test(this.proveedor.email.trim())) {
      this.mostrarToast('Ingresa un correo válido para enviar las alertas por Gmail', 'warning');
      return;
    }

    this.cargando = true;
    this.cdr.detectChanges();

    try {
      const datos = {
        ruc,
        razon_social: this.proveedor.razon_social.trim(),
        persona_responsable: this.proveedor.persona_responsable.trim() || null,
        direccion: this.proveedor.direccion.trim() || null,
        telefono: this.proveedor.telefono.trim() || null,
        email: this.proveedor.email.trim() || null,
        medio_alerta: this.proveedor.medio_alerta
      };

      if (this.esEdicion && this.proveedorId) {
        const { error } = await this.supabaseService.supabase
          .from('proveedores')
          .update(datos)
          .eq('id', this.proveedorId);

        if (error) throw error;
        this.mostrarToast('Proveedor actualizado correctamente', 'success');
      } else {
        // Evita registrar dos veces el mismo RUC
        const { data: existente, error: errorBusqueda } = await this.supabaseService.supabase
          .from('proveedores')
          .select('id')
          .eq('ruc', ruc)
          .maybeSingle();

        if (errorBusqueda) throw errorBusqueda;

        if (existente) {
          this.mostrarToast('Ya existe un proveedor registrado con ese RUC', 'warning');
          return;
        }

        const { error } = await this.supabaseService.supabase
          .from('proveedores')
          .insert([{ ...datos, fecha_registro: new Date().toISOString() }]);

        if (error) throw error;
        this.mostrarToast('Proveedor registrado con éxito', 'success');
      }

      this.router.navigate(['/lista-proveedores']);
    } catch (error: any) {
      console.error('Error al guardar proveedor:', error);
      this.mostrarToast('Error al guardar: ' + (error.message || 'Intente de nuevo'), 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  verLista() {
    this.router.navigate(['/lista-proveedores']);
  }

  async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 2500,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }
}