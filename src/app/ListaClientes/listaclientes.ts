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
import { pencilOutline, trashOutline, createOutline, businessOutline, personOutline } from 'ionicons/icons';
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
  modalEdicionAbierto: boolean = false;

  clienteSeleccionado: any = {
    id: null,
    tipo_documento: 'RUC',
    num_documento: '',
    nombre_razon_social: '',
    direccion: '',
    telefono: '',
    email: ''
  };

  constructor() {
    addIcons({ pencilOutline, trashOutline, createOutline, businessOutline, personOutline });
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

  cerrarModal() {
    this.modalEdicionAbierto = false;
  }

  async actualizarCliente() {
    this.cargando = true;
    try {
      const { error } = await this.supabaseService.supabase
        .from('clientes')
        .update(this.clienteSeleccionado)
        .eq('id', this.clienteSeleccionado.id);

      if (error) throw error;

      this.mostrarToast('Cliente actualizado correctamente', 'success');
      this.cerrarModal();
      this.obtenerClientes();
    } catch (err: any) {
      this.mostrarToast('Error al actualizar cliente', 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
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