import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment'; // Ajusta los '../' según el nivel de carpetas
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonSearchbar, IonList, IonItem, IonLabel, IonIcon, IonButton, IonSpinner,
  IonModal, IonInput, IonSelect, IonSelectOption, ToastController, AlertController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  pencilOutline, trashOutline, createOutline, businessOutline, personOutline,
  callOutline, logoWhatsapp, mailOutline, locationOutline, cardOutline,
  calendarOutline, personCircleOutline, closeOutline, notificationsOutline
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-listaclientes',
  templateUrl: './listaclientes.html',
  styleUrls: ['./listaclientes.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonSearchbar, IonItem, IonLabel,
    IonIcon, IonButton, IonSpinner, IonModal, IonInput, 
  ]
})
export class ListaClientesComponent implements OnInit {

  private supabaseService = inject(SupabaseService);
  private toastController = inject(ToastController);
  private alertController = inject(AlertController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  clientes: any[] = [];
  clientesFiltrados: any[] = [];
  cargando: boolean = true;

  // Detalle del cliente
  detalleAbierto: boolean = false;
  clienteDetalle: any = null;
  telefonosDetalle: { texto: string; wa: string; tel: string }[] = [];
  correosDetalle: { texto: string; mailto: string }[] = [];

  constructor() {
    addIcons({
      pencilOutline, trashOutline, createOutline, businessOutline, personOutline,
      callOutline, logoWhatsapp, mailOutline, locationOutline, cardOutline,
      calendarOutline, personCircleOutline, closeOutline, notificationsOutline
    });
  }

  ngOnInit() {
    this.obtenerClientes();
  }

  ionViewWillEnter() {
    this.obtenerClientes();
  }

  async obtenerClientes() {
    this.cargando = true;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('clientes')
        .select('*');

      if (error) {
        console.error('Error de Supabase:', error);
        throw error;
      }

      console.log('Datos recibidos de Supabase:', data);
      this.clientes = this.ordenarLista(data || []);
      this.clientesFiltrados = [...this.clientes];
    } catch (err: any) {
      console.error('Error al consultar clientes:', err);
      this.clientes = [];
      this.clientesFiltrados = [];
      this.mostrarToast('Error al cargar datos', 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges(); // Forzar renderizado en pantalla
    }
  }

  filtrarClientes(event: any) {
    const texto = event.target.value ? event.target.value.toLowerCase().trim() : '';

    if (!texto) {
      this.clientesFiltrados = [...this.clientes];
      return;
    }

    this.clientesFiltrados = this.clientes.filter((c) => {
      const nombre = c.nombre_razon_social ? c.nombre_razon_social.toLowerCase() : '';
      const doc = c.num_documento ? c.num_documento.toLowerCase() : '';
      return nombre.includes(texto) || doc.includes(texto);
    });
  }

  abrirEditar(id: number) {
    this.router.navigate(['/registrocliente', id]);
  }

  // ===================== DETALLE DEL CLIENTE =====================

  verDetalle(cliente: any) {
    this.clienteDetalle = cliente;
    this.telefonosDetalle = this.procesarTelefonos(cliente?.telefono);
    this.correosDetalle = this.procesarCorreos(cliente?.email);
    this.detalleAbierto = true;
  }

  cerrarDetalle() {
    this.detalleAbierto = false;
    this.clienteDetalle = null;
  }

  editarDesdeDetalle() {
    const id = this.clienteDetalle?.id;
    this.cerrarDetalle();
    if (id) {
      this.abrirEditar(id);
    }
  }

  // Convierte el campo teléfono en enlaces de WhatsApp y llamada.
  // Acepta varios números separados por "/", "," o ";".
  // Celulares peruanos de 9 dígitos (empiezan con 9) reciben el prefijo 51.
  private procesarTelefonos(valor: any): { texto: string; wa: string; tel: string }[] {
    if (!valor) return [];

    return String(valor)
      .split(/[\/,;]/)
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(texto => {
        let digitos = texto.replace(/\D/g, '');
        if (digitos.startsWith('00')) digitos = digitos.substring(2);

        let wa = '';
        if (digitos.length === 9 && digitos.startsWith('9')) {
          wa = `https://wa.me/51${digitos}`;
        } else if (digitos.length === 11 && digitos.startsWith('519')) {
          wa = `https://wa.me/${digitos}`;
        }

        const tel = digitos ? `tel:${digitos}` : '';
        return { texto, wa, tel };
      })
      .filter(t => t.tel);
  }

  // Convierte el campo email en enlaces mailto. Acepta varios correos separados por ";" "," o espacios.
  private procesarCorreos(valor: any): { texto: string; mailto: string }[] {
    if (!valor) return [];

    return String(valor)
      .split(/[;,\s]+/)
      .map(c => c.trim())
      .filter(c => c.includes('@'))
      .map(texto => ({ texto, mailto: `mailto:${texto}` }));
  }

  async confirmarEliminar(id: number) {
    const alert = await this.alertController.create({
      header: 'Confirmar Eliminación',
      message: '¿Estás seguro de que deseas eliminar este cliente?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => this.eliminarCliente(id)
        }
      ]
    });
    await alert.present();
  }

  async eliminarCliente(id: any) {
    this.clientes = this.clientes.filter(c => c.id !== id);
    this.clientesFiltrados = this.clientesFiltrados.filter(c => c.id !== id);
    this.cdr.detectChanges();

    try {
      const { error } = await this.supabaseService.supabase
        .from('clientes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      this.mostrarToast('Cliente eliminado', 'warning');
    } catch (err: any) {
      this.mostrarToast('Error al eliminar registro', 'danger');
      this.obtenerClientes();
    }
  }

  private ordenarLista(lista: any[]): any[] {
    return lista.sort((a, b) =>
      (a.nombre_razon_social || '').localeCompare(b.nombre_razon_social || '', 'es', { sensitivity: 'base' })
    );
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