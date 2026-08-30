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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonIcon,
  ToastController 
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { 
  personAddOutline, 
  cardOutline, 
  documentTextOutline, 
  businessOutline, 
  personOutline, 
  locationOutline, 
  callOutline, 
  mailOutline 
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-registrocliente',
  templateUrl: './registrocliente.html',
  styleUrls: ['./registrocliente.scss'],
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
    IonSpinner,
    IonIcon
  ]
})
export class RegistroClienteComponent implements OnInit {

  private supabaseService = inject(SupabaseService);
  private toastController = inject(ToastController);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  cargando: boolean = false;
  clienteId: string | null = null;
  esEdicion: boolean = false;

  cliente = {
    tipo_documento: 'RUC',
    num_documento: '',
    nombre_razon_social: '',
    direccion: '',
    telefono: '',
    email: ''
  };

  constructor() {
    addIcons({
      personAddOutline,
      cardOutline,
      documentTextOutline,
      businessOutline,
      personOutline,
      locationOutline,
      callOutline,
      mailOutline
    });
  }

  ngOnInit() {
    const idParam = this.route.snapshot.paramMap.get('id');
    
    if (idParam) {
      this.clienteId = idParam;
      this.esEdicion = true;
      this.cargarDatosCliente(idParam);
    } else {
      this.esEdicion = false;
    }
  }

  async cargarDatosCliente(id: string) {
    this.cargando = true;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        this.cliente = {
          tipo_documento: data.tipo_documento || 'RUC',
          num_documento: data.num_documento || '',
          nombre_razon_social: data.nombre_razon_social || '',
          direccion: data.direccion || '',
          telefono: data.telefono || '',
          email: data.email || ''
        };
      }
    } catch (error: any) {
      console.error('Error al cargar cliente:', error);
      this.mostrarToast('Error al obtener datos del cliente', 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges(); // Forzamos a Angular a llenar los inputs en pantalla
    }
  }

  filtrarNumero(event: any) {
    let valor = event.target.value.replace(/[^0-9]/g, '');
    const maxLen = this.cliente.tipo_documento === 'RUC' ? 11 : 8;
    if (valor.length > maxLen) {
      valor = valor.substring(0, maxLen);
    }
    this.cliente.num_documento = valor;
  }

  cambiarTipoDoc() {
    this.cliente.num_documento = '';
    this.cliente.nombre_razon_social = '';
  }

  async guardarCliente() {
    const esRuc = this.cliente.tipo_documento === 'RUC';
    const numDocLen = this.cliente.num_documento.trim().length;

    if (esRuc && numDocLen !== 11) {
      this.mostrarToast('El RUC debe contener exactamente 11 dígitos', 'warning');
      return;
    }

    if (!esRuc && numDocLen !== 8) {
      this.mostrarToast('El DNI debe contener exactamente 8 dígitos', 'warning');
      return;
    }

    if (!this.cliente.nombre_razon_social.trim()) {
      const msg = esRuc ? 'La razón social es obligatoria' : 'El nombre completo es obligatorio';
      this.mostrarToast(msg, 'warning');
      return;
    }

    this.cargando = true;
    this.cdr.detectChanges();

    try {
      if (this.esEdicion && this.clienteId) {
        const { error } = await this.supabaseService.supabase
          .from('clientes')
          .update({
            tipo_documento: this.cliente.tipo_documento,
            num_documento: this.cliente.num_documento,
            nombre_razon_social: this.cliente.nombre_razon_social,
            direccion: this.cliente.direccion,
            telefono: this.cliente.telefono,
            email: this.cliente.email
          })
          .eq('id', this.clienteId);

        if (error) throw error;
        this.mostrarToast('Cliente actualizado correctamente', 'success');
      } else {
        const { error } = await this.supabaseService.supabase
          .from('clientes')
          .insert([
            {
              tipo_documento: this.cliente.tipo_documento,
              num_documento: this.cliente.num_documento,
              nombre_razon_social: this.cliente.nombre_razon_social,
              direccion: this.cliente.direccion,
              telefono: this.cliente.telefono,
              email: this.cliente.email,
              fecha_registro: new Date().toISOString()
            }
          ]);

        if (error) throw error;
        this.mostrarToast('Cliente registrado con éxito', 'success');
      }

      this.router.navigate(['/listaclientes']);
    } catch (error: any) {
      console.error('Error al guardar cliente:', error);
      this.mostrarToast('Error al guardar: ' + (error.message || 'Intente de nuevo'), 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration:2500,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }

  // Convierte el valor ingresado a mayúsculas automáticamente al escribir
convertirAMayusculas(campo: keyof typeof this.cliente, event: any) {
  const valor = event.target.value || '';
  this.cliente[campo] = valor.toUpperCase();
}
}