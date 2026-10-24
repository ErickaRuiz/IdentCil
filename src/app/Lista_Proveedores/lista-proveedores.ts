import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
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
  IonIcon,
  IonSearchbar,
  IonSpinner,
  IonModal,
  AlertController,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  storefrontOutline,
  searchOutline,
  createOutline,
  trashOutline,
  callOutline,
  mailOutline,
  locationOutline,
  personCircleOutline,
  addCircleOutline,
  logoWhatsapp,
  calendarOutline,
  businessOutline,
  notificationsOutline
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';

@Component({
  selector: 'app-lista-proveedores',
  templateUrl: './lista-proveedores.html',
  styleUrls: ['./lista-proveedores.scss'],
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
    IonIcon,
    IonSearchbar,
    IonSpinner,
    IonModal
  ]
})
export class ListaProveedoresPage implements OnInit {

  private supabaseService = inject(SupabaseService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  cargando: boolean = false;
  filtro: string = '';
  listaProveedores: any[] = [];
  proveedoresFiltrados: any[] = [];

  // Detalle del proveedor
  isModalOpen: boolean = false;
  proveedorSeleccionado: any = null;

  constructor() {
    addIcons({
      storefrontOutline,
      searchOutline,
      createOutline,
      trashOutline,
      callOutline,
      mailOutline,
      locationOutline,
      personCircleOutline,
      addCircleOutline,
      logoWhatsapp,
      calendarOutline,
      businessOutline,
      notificationsOutline
    });
  }

  ngOnInit() {
    this.obtenerProveedores();
  }

  // Se recarga cada vez que se vuelve a la pantalla (por ejemplo, después de editar)
  ionViewWillEnter() {
    this.obtenerProveedores();
  }

  async obtenerProveedores() {
    this.cargando = true;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('proveedores')
        .select('*')
        .order('fecha_registro', { ascending: false });

      if (error) throw error;

      this.listaProveedores = data || [];
      this.aplicarFiltro();
    } catch (err: any) {
      console.error('Error al cargar proveedores:', err);
      this.mostrarToast('No se pudo cargar la lista de proveedores', 'danger');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  filtrarProveedores(event: any) {
    this.filtro = (event?.detail?.value || '').toLowerCase().trim();
    this.aplicarFiltro();
  }

  private aplicarFiltro() {
    const termino = this.filtro;

    if (!termino) {
      this.proveedoresFiltrados = [...this.listaProveedores];
      return;
    }

    this.proveedoresFiltrados = this.listaProveedores.filter(p =>
      (p.razon_social || '').toLowerCase().includes(termino) ||
      (p.ruc || '').toLowerCase().includes(termino) ||
      (p.persona_responsable || '').toLowerCase().includes(termino)
    );
  }

  // ===================== DETALLE =====================

  verDetalle(item: any) {
    this.proveedorSeleccionado = item;
    this.isModalOpen = true;
  }

  cerrarDetalle() {
    this.isModalOpen = false;
    this.proveedorSeleccionado = null;
  }

  editarDesdeDetalle() {
    const item = this.proveedorSeleccionado;
    this.cerrarDetalle();
    if (item) this.editarProveedor(item);
  }

  // Enlace para llamar directo al número registrado
  get enlaceLlamada(): string {
    const tel = this.soloDigitos(this.proveedorSeleccionado?.telefono);
    return tel ? `tel:${tel}` : '';
  }

  // Enlace de WhatsApp (si el número tiene 9 dígitos se antepone el 51 de Perú)
  get enlaceWhatsApp(): string {
    let tel = this.soloDigitos(this.proveedorSeleccionado?.telefono);
    if (!tel) return '';
    if (tel.length === 9) tel = '51' + tel;
    return `https://wa.me/${tel}`;
  }

  // Enlace para escribir directo al correo registrado
  get enlaceCorreo(): string {
    const email = (this.proveedorSeleccionado?.email || '').trim();
    return email ? `mailto:${email}` : '';
  }

  private soloDigitos(valor: any): string {
    return String(valor || '').replace(/[^0-9]/g, '');
  }

  formatearFecha(valor: any): string {
    if (!valor) return 'N/A';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return 'N/A';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  irARegistro() {
    this.router.navigate(['/registro-proveedores']);
  }

  editarProveedor(item: any) {
    if (item?.id) {
      this.router.navigate(['/registro-proveedores', item.id]);
    }
  }

  async eliminarProveedor(item: any) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro que quieres eliminar al proveedor ${item.razon_social} (RUC ${item.ruc})?`,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Sí',
          role: 'destructive',
          handler: () => {
            this.segundaConfirmacion(item);
          }
        }
      ]
    });
    await alert.present();
  }

  private async segundaConfirmacion(item: any) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar',
      message: 'Esta acción no se puede deshacer. ¿Confirmas que quieres eliminar este proveedor?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'destructive',
          handler: () => {
            this.ejecutarEliminacion(item);
          }
        }
      ]
    });
    await alert.present();
  }

  private async ejecutarEliminacion(item: any) {
    const { error } = await this.supabaseService.supabase
      .from('proveedores')
      .delete()
      .eq('id', item.id);

    if (error) {
      console.error('Error al eliminar proveedor:', error.message);
      this.mostrarToast('No se pudo eliminar el proveedor', 'danger');
      return;
    }

    this.mostrarToast('Proveedor eliminado correctamente', 'success');
    this.obtenerProveedores();
  }

  private async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 2500,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}