import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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
  IonSearchbar
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  timeOutline,
  createOutline,
  trashOutline,
  searchOutline,
  addCircleOutline,
  checkmarkDoneOutline, documentTextOutline } from 'ionicons/icons';

import { SupabaseService } from '../services/supabase';
import { normalizarSerie } from '../services/cilindro-estado';

@Component({
  selector: 'app-historial-ingresos',
  templateUrl: './historial_ingresos.html',
  styleUrls: ['./historial_ingresos.scss'],
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
    IonSearchbar
  ]
})
export class HistorialIngresosPage {
  listaIngresos: any[] = [];
  listaIngresosFiltrada: any[] = [];
  terminoBusqueda: string = '';
  cargando: boolean = false;

  // Mapa id -> nombre de almacén, cargado aparte para no depender de una FK/join
  mapaAlmacenes: { [id: number]: string } = {};
  listaAlmacenes: any[] = [];

  // Fecha (ms) del ÚLTIMO movimiento de cada serie, leída de los historiales:
  // la última salida (salida_cilindros) y el último recojo (recojos). Un
  // cilindro está fuera cuando su última salida es MÁS NUEVA que su último
  // ingreso y su último recojo. No depende de la tabla `cilindros`, así que
  // funciona también con salidas registradas antes.
  ultimaSalidaPorSerie: Map<string, number> = new Map();
  ultimoRecojoPorSerie: Map<string, number> = new Map();

  // id del registro de ingreso -> cilindros que se muestran en él. Cada serie
  // aparece UNA sola vez: en su ingreso más reciente y solo si está en planta.
  visiblesPorId: Map<any, any[]> = new Map();

  // --- Detalle / Modal ---
  modalDetalleAbierto: boolean = false;
  itemSeleccionado: any = null;

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private alertController: AlertController,
    private toastCtrl: ToastController,
    private cdRef: ChangeDetectorRef,
    private router: Router
  ) {
    addIcons({arrowBackOutline,documentTextOutline,searchOutline,createOutline,trashOutline,addCircleOutline,checkmarkDoneOutline,timeOutline});
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
   * Lee de los historiales la fecha de la última salida y del último recojo de
   * cada serie. Así, en cuanto un cilindro tiene una salida más reciente que
   * su ingreso, deja de mostrarse aquí (ya vive en el historial de salidas /
   * lista de recojo), y cuando se recoge y vuelve a ingresar, reaparece.
   */
  async cargarMovimientosDeSalida() {
    const salidas = new Map<string, number>();
    const recojos = new Map<string, number>();

    const guardarMax = (mapa: Map<string, number>, serie: string, fecha: number) => {
      if (!serie || isNaN(fecha)) return;
      const previa = mapa.get(serie);
      if (previa === undefined || fecha > previa) mapa.set(serie, fecha);
    };

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('salida_cilindros')
        .select('created_at, cilindros_egresados')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('Error al leer salida_cilindros:', error);
      } else {
        (data || []).forEach((fila: any) => {
          const fecha = Date.parse(fila.created_at);
          let lista: any = fila.cilindros_egresados;
          if (typeof lista === 'string') {
            try { lista = JSON.parse(lista); } catch { lista = []; }
          }
          if (!Array.isArray(lista)) return;
          lista.forEach((c: any) =>
            guardarMax(salidas, normalizarSerie(c?.numero_serie ?? c?.numeroSerie ?? c?.serie), fecha)
          );
        });
      }
    } catch (err) {
      console.error('Error inesperado al leer las salidas:', err);
    }

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('recojos')
        .select('codigo_qr, fecha_recojo')
        .order('fecha_recojo', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('Error al leer recojos:', error);
      } else {
        (data || []).forEach((fila: any) =>
          guardarMax(recojos, normalizarSerie(fila.codigo_qr), Date.parse(fila.fecha_recojo))
        );
      }
    } catch (err) {
      console.error('Error inesperado al leer los recojos:', err);
    }

    this.ultimaSalidaPorSerie = salidas;
    this.ultimoRecojoPorSerie = recojos;
  }

  /**
   * Recalcula qué cilindros se muestran en cada registro. Los registros vienen
   * ordenados del más reciente al más antiguo, así que cada serie se asigna a
   * su ingreso MÁS RECIENTE y no se repite en los anteriores (sin duplicados,
   * aunque el cilindro haya ingresado varias veces). Y se oculta si tiene una
   * salida posterior a ese ingreso (y a su último recojo): ya salió.
   */
  private recalcularVisibles() {
    const asignadas = new Set<string>();
    const mapa = new Map<any, any[]>();

    for (const item of this.listaIngresos) {
      const fechaIngreso = Date.parse(item?.created_at) || 0;
      const lista: any[] = Array.isArray(item?.cilindros_ingresados) ? item.cilindros_ingresados : [];

      const visibles = lista.filter((c: any) => {
        const serie = normalizarSerie(c.numero_serie || c.numeroSerie || c.serie);
        if (!serie || asignadas.has(serie)) return false;
        asignadas.add(serie);

        const ultimaSalida = this.ultimaSalidaPorSerie.get(serie) ?? 0;
        const ultimoRecojo = this.ultimoRecojoPorSerie.get(serie) ?? 0;
        const yaSalio = ultimaSalida > Math.max(fechaIngreso, ultimoRecojo);
        return !yaSalio;
      });

      mapa.set(item.id, visibles);
    }

    this.visiblesPorId = mapa;
  }

  /**
   * Cilindros de un registro de ingreso que están actualmente en planta y
   * cuyo ingreso más reciente es este registro. Es lo que se muestra en las
   * tarjetas de este historial.
   */
  cilindrosVisibles(item: any): any[] {
    return this.visiblesPorId.get(item?.id) || [];
  }

  async cargarHistorial() {
    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      // Cargamos los almacenes y las series que están fuera de planta en paralelo,
      // sin depender de un join/FK
      await Promise.all([
        this.cargarAlmacenes(),
        this.cargarMovimientosDeSalida()
      ]);

      const { data, error } = await this.supabaseService.supabase
        .from('ingreso_cilindros')
        .select(`
          id,
          created_at,
          propiedad,
          estado,
          almacen_id,
          observacion,
          cilindros_ingresados,
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
        console.error('Error al obtener ingresos:', error);
        this.listaIngresos = [];
      } else {
        this.listaIngresos = data || [];
      }

      this.recalcularVisibles();
      this.aplicarFiltro();
    } catch (err) {
      console.error('Error inesperado:', err);
      this.listaIngresos = [];
      this.listaIngresosFiltrada = [];
      this.visiblesPorId = new Map();
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  // --- Buscador ---
  filtrarHistorial(event: any) {
    this.terminoBusqueda = (event?.detail?.value || '').toString();
    this.aplicarFiltro();
  }

  aplicarFiltro() {
    const termino = this.terminoBusqueda.toLowerCase().trim();

    // Solo se muestran registros que aún tengan al menos un cilindro en
    // planta; los que ya salieron por completo viven en el historial de
    // salidas / lista de recojo.
    const conCilindrosActivos = this.listaIngresos.filter(
      (item: any) => this.cilindrosVisibles(item).length > 0
    );

    if (!termino) {
      this.listaIngresosFiltrada = conCilindrosActivos;
      this.cdRef.detectChanges();
      return;
    }

    this.listaIngresosFiltrada = conCilindrosActivos.filter((item: any) => {
      const entidad = this.obtenerNombreEntidad(item).toLowerCase();
      const almacen = this.obtenerNombreAlmacen(item).toLowerCase();
      const estado = String(item.estado || item.motivo || '').toLowerCase();
      const propiedad = String(item.propiedad || '').toLowerCase();
      const observacion = String(item.observacion || item.observaciones || '').toLowerCase();
      const series = this.cilindrosVisibles(item)
        .map((c: any) => String(c.numero_serie || c.numeroSerie || c.serie || '').toLowerCase())
        .join(' ');

      return entidad.includes(termino) ||
        almacen.includes(termino) ||
        estado.includes(termino) ||
        propiedad.includes(termino) ||
        observacion.includes(termino) ||
        series.includes(termino);
    });

    this.cdRef.detectChanges();
  }

  obtenerNombreEntidad(item: any): string {
    if (item.propiedad === 'ELECTRAMETAL') {
      return 'ELECTRAMETAL NORPERU SAC';
    }

    if (item.clientes && item.clientes.nombre_razon_social) {
      return item.clientes.nombre_razon_social.toUpperCase();
    }

    if (item.propiedad === 'Proveedor') {
      return 'PROVEEDOR NO REGISTRADO';
    }

    return 'ENTIDAD NO REGISTRADA';
  }

  // Documento (RUC/DNI) de la entidad, si existe
  obtenerDocumentoEntidad(item: any): string {
    if (item?.clientes?.num_documento) {
      return item.clientes.num_documento;
    }
    return '';
  }

  // Origen / almacén donde quedó registrado el ingreso
  obtenerNombreAlmacen(item: any): string {
    if (item?.almacen_id && this.mapaAlmacenes[item.almacen_id]) {
      return this.mapaAlmacenes[item.almacen_id];
    }
    return item?.almacen_id ? `Almacén #${item.almacen_id}` : 'No especificado';
  }

  // Abre el modal con el detalle completo del registro
  verDetalle(item: any) {
    this.itemSeleccionado = item;
    this.modalDetalleAbierto = true;
  }

  cerrarDetalle() {
    this.modalDetalleAbierto = false;
    this.itemSeleccionado = null;
  }

  // --- Editar: abre el formulario completo de Ingreso con este registro cargado ---
  abrirEditar(item: any, event?: Event) {
    event?.stopPropagation();
    if (!item?.id) return;

    this.router.navigate(['/ingreso'], { queryParams: { editar: item.id } });
  }

  // --- Eliminar ---
  async confirmarEliminar(item: any, event: Event) {
    event.stopPropagation();

    const alert = await this.alertController.create({
      header: 'Eliminar registro',
      message: '¿Seguro que deseas eliminar este registro de ingreso? Esta acción no se puede deshacer.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => this.eliminarIngreso(item)
        }
      ]
    });

    await alert.present();
  }

  async eliminarIngreso(item: any) {
    try {
      const { error } = await this.supabaseService.supabase
        .from('ingreso_cilindros')
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