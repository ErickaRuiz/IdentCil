import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController, AlertController, ToastController } from '@ionic/angular';
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
  IonCardContent,
  IonModal,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  documentTextOutline,
  timeOutline,
  createOutline,
  trashOutline,
  addCircleOutline,
  checkmarkDoneOutline
} from 'ionicons/icons';

import { SupabaseService } from '../services/supabase';
import { normalizarSerie } from '../services/cilindro-estado';

@Component({
  selector: 'app-historial-salidas',
  templateUrl: './historial_salida.html',
  styleUrls: ['./historial_salida.scss'],
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
    IonCardContent,
    IonModal,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput
  ]
})
export class HistorialSalidasPage {
  listaSalidas: any[] = [];
  cargando: boolean = false;

  // Mapa id -> nombre de almacén, cargado aparte (no depende de FK/join)
  mapaAlmacenes: { [id: number]: string } = {};
  listaAlmacenes: any[] = [];

  // Fecha (ms) del ÚLTIMO recojo de cada serie, leída de la tabla `recojos`.
  // Si un cilindro se recogió DESPUÉS de una salida, esa salida ya quedó
  // resuelta (el cilindro volvió) y deja de mostrarse en este historial.
  ultimoRecojoPorSerie: Map<string, number> = new Map();

  // id del registro de salida -> cilindros que se muestran en él (los que
  // todavía no se han recogido desde esta salida).
  visiblesPorId: Map<any, any[]> = new Map();

  // --- Detalle / Modal ---
  modalDetalleAbierto: boolean = false;
  itemSeleccionado: any = null;

  // --- Edición / Modal ---
  modalEditarAbierto: boolean = false;
  itemEditando: any = null;
  formEdicion: any = { estado: '', almacenDestinoId: null, observacion: '', cilindros: [] };
  serieNuevaEdicion: string = '';
  guardandoEdicion: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private alertController: AlertController,
    private toastCtrl: ToastController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({ arrowBackOutline, documentTextOutline, timeOutline, createOutline, trashOutline, addCircleOutline, checkmarkDoneOutline });
  }

  ionViewWillEnter() {
    this.cargarHistorial();
  }

  async cargarAlmacenes() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('almacenes')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al obtener almacenes:', error);
        return;
      }

      this.listaAlmacenes = data || [];
      this.mapaAlmacenes = {};
      this.listaAlmacenes.forEach((alm: any) => {
        this.mapaAlmacenes[alm.id] = alm.nombre;
      });
    } catch (err) {
      console.error('Error inesperado al cargar almacenes:', err);
    }
  }

  /**
   * Lee de `recojos` la fecha del último recojo de cada serie. Con eso se
   * sabe si una salida ya fue "cerrada" (el cilindro volvió) o si el
   * cilindro sigue afuera.
   */
  async cargarMovimientosRecojo() {
    const mapa = new Map<string, number>();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('recojos')
        .select('codigo_qr, fecha_recojo')
        .order('fecha_recojo', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('Error al leer recojos:', error);
      } else {
        (data || []).forEach((fila: any) => {
          const serie = normalizarSerie(fila.codigo_qr);
          const fecha = Date.parse(fila.fecha_recojo);
          if (!serie || isNaN(fecha)) return;
          const previa = mapa.get(serie);
          if (previa === undefined || fecha > previa) mapa.set(serie, fecha);
        });
      }
    } catch (err) {
      console.error('Error inesperado al leer los recojos:', err);
    }

    this.ultimoRecojoPorSerie = mapa;
  }

  /**
   * Recalcula qué cilindros se muestran en cada tarjeta de salida. Los
   * registros vienen ordenados del más reciente al más antiguo, así que cada
   * serie se asigna a su salida MÁS RECIENTE (sin duplicados, aunque haya
   * salido varias veces). Se oculta si ya tiene un recojo posterior a esa
   * salida: ya volvió, así que deja de figurar como pendiente.
   */
  private recalcularVisibles(datos: any[]) {
    const asignadas = new Set<string>();
    const mapa = new Map<any, any[]>();

    for (const item of datos) {
      const fechaSalida = Date.parse(item?.created_at) || 0;
      const lista: any[] = Array.isArray(item?.cilindros_egresados) ? item.cilindros_egresados : [];

      const visibles = lista.filter((c: any) => {
        const serie = normalizarSerie(c?.numero_serie);
        if (!serie || asignadas.has(serie)) return false;
        asignadas.add(serie);

        const ultimoRecojo = this.ultimoRecojoPorSerie.get(serie) ?? 0;
        return ultimoRecojo <= fechaSalida; // true = todavía no se recoge
      });

      mapa.set(item.id, visibles);
    }

    this.visiblesPorId = mapa;
  }

  /** Cilindros de esta salida que aún no se han recogido. */
  cilindrosVisibles(item: any): any[] {
    return this.visiblesPorId.get(item?.id) || [];
  }

    async cargarHistorial() {
    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      await Promise.all([
        this.cargarAlmacenes(),
        this.cargarMovimientosRecojo()
      ]);

      const { data, error } = await this.supabaseService.supabase
        .from('salida_cilindros')
        .select(`
          id,
          created_at,
          estado,
          almacen_id,
          almacen_destino_id,
          observacion,
          cilindros_egresados,
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
        console.error('Error al obtener salidas:', error);
        this.listaSalidas = [];
      } else {
        const todas = data || [];
        this.recalcularVisibles(todas);
        // Solo se muestran las salidas que aún tienen al menos un cilindro
        // pendiente de recojo; las que ya volvieron por completo dejan de
        // figurar aquí (viven en el historial de recojos / ingresos).
        this.listaSalidas = todas.filter((item: any) => this.cilindrosVisibles(item).length > 0);
      }
    } catch (err) {
      console.error('Error inesperado:', err);
      this.listaSalidas = [];
      this.visiblesPorId = new Map();
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  // Quién se llevó el cilindro
  obtenerNombreEntidad(item: any): string {
    if (item?.clientes?.nombre_razon_social) {
      return item.clientes.nombre_razon_social.toUpperCase();
    }
    return 'CLIENTE NO REGISTRADO';
  }

  obtenerDocumentoEntidad(item: any): string {
    return item?.clientes?.num_documento || '';
  }

  // De dónde salió el cilindro
  obtenerNombreAlmacen(item: any): string {
    if (item?.almacen_id && this.mapaAlmacenes[item.almacen_id]) {
      return this.mapaAlmacenes[item.almacen_id];
    }
    return item?.almacen_id ? `Almacén #${item.almacen_id}` : 'No especificado';
  }

  // A qué almacén se transfirió (solo aplica si fue un movimiento interno)
  obtenerNombreAlmacenDestino(item: any): string {
    if (item?.almacen_destino_id && this.mapaAlmacenes[item.almacen_destino_id]) {
      return this.mapaAlmacenes[item.almacen_destino_id];
    }
    return item?.almacen_destino_id ? `Almacén #${item.almacen_destino_id}` : '';
  }

  verDetalle(item: any) {
    this.itemSeleccionado = item;
    this.modalDetalleAbierto = true;
  }

  cerrarDetalle() {
    this.modalDetalleAbierto = false;
    this.itemSeleccionado = null;
  }

  // --- Editar ---
  abrirEditar(item: any, event: Event) {
    event.stopPropagation();
    this.itemEditando = item;
    this.formEdicion = {
      estado: item.estado || 'LLENO',
      almacenDestinoId: item.almacen_destino_id || null,
      observacion: item.observacion || '',
      cilindros: (item.cilindros_egresados || []).map((c: any) => ({ ...c }))
    };
    this.serieNuevaEdicion = '';
    this.modalEditarAbierto = true;
  }

  cerrarEditar() {
    this.modalEditarAbierto = false;
    this.itemEditando = null;
  }

  eliminarCilindroDeEdicion(index: number) {
    this.formEdicion.cilindros.splice(index, 1);
  }

  async agregarCilindroAEdicion() {
    const serie = this.serieNuevaEdicion.trim();
    if (!serie) return;

    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select('*')
      .eq('numero_serie', serie)
      .single();

    if (error || !data) {
      await this.mostrarAlerta('No encontrado', 'El cilindro ingresado no existe.');
      return;
    }

    this.formEdicion.cilindros.push({
      numero_serie: data.numero_serie,
      tipo_gas: data.tipo_gas,
      capacidad: `${data.litros || data.contenido || ''} ${data.unidad_medida || ''}`.trim()
    });

    this.serieNuevaEdicion = '';
    this.cdRef.detectChanges();
  }

  async guardarEdicion() {
    if (!this.itemEditando) return;

    if (!this.formEdicion.cilindros || this.formEdicion.cilindros.length === 0) {
      await this.mostrarAlerta('Atención', 'El registro debe tener al menos un cilindro.');
      return;
    }

    this.guardandoEdicion = true;
    this.cdRef.detectChanges();

    try {
      const { error } = await this.supabaseService.supabase
        .from('salida_cilindros')
        .update({
          estado: this.formEdicion.estado,
          almacen_destino_id: this.formEdicion.almacenDestinoId,
          observacion: this.formEdicion.observacion ? this.formEdicion.observacion.trim() : null,
          cilindros_egresados: this.formEdicion.cilindros
        })
        .eq('id', this.itemEditando.id);

      if (error) throw error;

      await this.mostrarToast('Registro actualizado correctamente.', 'success');
      this.cerrarEditar();
      await this.cargarHistorial();
    } catch (err: any) {
      console.error('Error al actualizar:', err);
      await this.mostrarAlerta('Error', err.message || 'No se pudo actualizar el registro.');
    } finally {
      this.guardandoEdicion = false;
      this.cdRef.detectChanges();
    }
  }

  // --- Eliminar ---
  async confirmarEliminar(item: any, event: Event) {
    event.stopPropagation();

    const alert = await this.alertController.create({
      header: 'Eliminar registro',
      message: '¿Seguro que deseas eliminar este registro de salida? Esta acción no se puede deshacer.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => this.eliminarSalida(item)
        }
      ]
    });

    await alert.present();
  }

  async eliminarSalida(item: any) {
    try {
      const { error } = await this.supabaseService.supabase
        .from('salida_cilindros')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      await this.mostrarToast('Registro eliminado.', 'success');
      await this.cargarHistorial();
    } catch (err: any) {
      console.error('Error al eliminar:', err);
      await this.mostrarAlerta('Error', err.message || 'No se pudo eliminar el registro.');
    }
  }

  async mostrarAlerta(titulo: string, mensaje: string) {
    const alert = await this.alertController.create({
      header: titulo,
      message: mensaje,
      buttons: ['OK']
    });
    await alert.present();
  }

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 2200,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  regresar() {
    this.navCtrl.back();
  }
}