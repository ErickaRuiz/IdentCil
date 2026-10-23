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
  IonModal
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { jsPDF } from 'jspdf';
import {
  downloadOutline,
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
    IonModal
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

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private alertController: AlertController,
    private toastCtrl: ToastController,
    private cdRef: ChangeDetectorRef,
    private router: Router
  ) {
    addIcons({ downloadOutline, arrowBackOutline, documentTextOutline, timeOutline, createOutline, trashOutline, addCircleOutline, checkmarkDoneOutline });
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
            tipo_documento,
            direccion
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

  // Dirección del cliente/empresa según su registro de clientes. Si el cliente ya no
  // tiene dirección, se usa la que quedó guardada con los cilindros de la salida.
  obtenerDireccionEntidad(item: any): string {
    const delRegistro = item?.clientes?.direccion;
    if (delRegistro && String(delRegistro).trim()) return String(delRegistro).trim();

    const lista: any[] = Array.isArray(item?.cilindros_egresados) ? item.cilindros_egresados : [];
    const guardada = lista.find((c: any) => c?.destino_direccion)?.destino_direccion;
    return guardada ? String(guardada).trim() : '';
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

  // ===== COMPROBANTE DE ENTREGA EN PDF =====

  /**
   * Genera el comprobante de entrega al cliente: datos del cliente, su
   * ubicación, el almacén de salida, la fecha y hora, y todos los cilindros
   * que se llevó con su gas y capacidad.
   */
  descargarComprobante(item: any, event?: Event) {
    event?.stopPropagation();
    if (!item) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 14;
    const ANCHO = 210;
    let y = M;

    const asegurarEspacio = (alto: number) => {
      if (y + alto > 280) {
        doc.addPage();
        y = M;
      }
    };

    const fecha = new Date(item.created_at);
    const fechaTxt = isNaN(fecha.getTime()) ? '-' :
      fecha.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const horaTxt = isNaN(fecha.getTime()) ? '-' :
      fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    const numero = String(item.id ?? '').padStart(6, '0');

    // Cilindros que se entregaron en esta salida (todos los del registro)
    const cilindros: any[] = Array.isArray(item.cilindros_egresados) ? item.cilindros_egresados : [];

    // --- Encabezado ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('ELECTRAMETAL NORPERÚ S.A.C.', M, y + 5);
    doc.setFontSize(10);
    doc.text(`N° ${numero}`, ANCHO - M, y + 5, { align: 'right' });
    y += 11;
    doc.setFontSize(13);
    doc.text('COMPROBANTE DE ENTREGA DE CILINDROS', M, y);
    y += 3;
    doc.setDrawColor(225, 29, 72);
    doc.setLineWidth(0.6);
    doc.line(M, y, ANCHO - M, y);
    y += 8;

    // --- Datos de la salida y del cliente ---
    const fila = (etiqueta: string, valor: string) => {
      const lineas: string[] = doc.splitTextToSize(valor || '-', ANCHO - M * 2 - 42);
      asegurarEspacio(lineas.length * 5 + 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${etiqueta}:`, M, y);
      doc.setFont('helvetica', 'normal');
      doc.text(lineas, M + 42, y);
      y += lineas.length * 5 + 1.5;
    };

    const clienteDoc = item?.clientes
      ? `${item.clientes.tipo_documento || 'DOC'}: ${item.clientes.num_documento || '-'}`
      : '-';

    fila('Fecha de salida', fechaTxt);
    fila('Hora de salida', horaTxt);
    fila('Cliente / Empresa', this.obtenerNombreEntidad(item));
    fila('Documento', clienteDoc);
    fila('Dirección / Ubicación', this.obtenerDireccionEntidad(item) || 'No registrada');
    fila('Salió del almacén', this.obtenerNombreAlmacen(item));
    const destino = this.obtenerNombreAlmacenDestino(item);
    if (destino) fila('Transferido al almacén', destino);
    y += 4;

    // --- Tabla de cilindros ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Cilindros entregados (${cilindros.length})`, M, y);
    y += 6;

    const encabezadoTabla = () => {
      doc.setFillColor(253, 232, 236);
      doc.rect(M, y - 4.5, ANCHO - M * 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('N°', M + 2, y);
      doc.text('Serie', M + 14, y);
      doc.text('Tipo de gas', M + 70, y);
      doc.text('Capacidad', M + 130, y);
      y += 6;
    };
    encabezadoTabla();

    doc.setFont('helvetica', 'normal');
    cilindros.forEach((c: any, i: number) => {
      if (y + 7 > 280) {
        doc.addPage();
        y = M;
        encabezadoTabla();
        doc.setFont('helvetica', 'normal');
      }
      doc.setFontSize(9);
      doc.text(String(i + 1), M + 2, y);
      doc.text(String(c?.numero_serie || '-'), M + 14, y);
      doc.text(String(c?.tipo_gas || '-').toUpperCase(), M + 70, y);
      doc.text(String(c?.capacidad || '-'), M + 130, y);
      y += 6;
    });
    y += 2;

    // --- Resumen: unidades por tipo de gas y capacidad ---
    const resumen = new Map<string, number>();
    cilindros.forEach((c: any) => {
      const clave = `${String(c?.tipo_gas || 'SIN GAS').toUpperCase()} · ${c?.capacidad || 'sin capacidad'}`;
      resumen.set(clave, (resumen.get(clave) || 0) + 1);
    });

    asegurarEspacio(14 + resumen.size * 5);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(M, y, ANCHO - M, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`TOTAL DE UNIDADES: ${cilindros.length}`, M, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    resumen.forEach((cantidad, clave) => {
      asegurarEspacio(6);
      doc.text(`• ${cantidad} × ${clave}`, M + 2, y);
      y += 5;
    });

    // --- Observación ---
    if (item.observacion) {
      y += 3;
      const lineas: string[] = doc.splitTextToSize(`Observación: ${item.observacion}`, ANCHO - M * 2);
      asegurarEspacio(lineas.length * 5 + 4);
      doc.setFont('helvetica', 'italic');
      doc.text(lineas, M, y);
      y += lineas.length * 5;
    }

    // --- Firmas ---
    asegurarEspacio(40);
    y += 22;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.line(M + 6, y, M + 78, y);
    doc.line(ANCHO - M - 78, y, ANCHO - M - 6, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ENTREGADO POR', M + 42, y, { align: 'center' });
    doc.text('RECIBIDO CONFORME (CLIENTE)', ANCHO - M - 42, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('ELECTRAMETAL NORPERÚ S.A.C.', M + 42, y, { align: 'center' });
    doc.text('Nombre, DNI y firma', ANCHO - M - 42, y, { align: 'center' });

    doc.save(`comprobante_entrega_${numero}.pdf`);
  }

  verDetalle(item: any) {
    this.itemSeleccionado = item;
    this.modalDetalleAbierto = true;
  }

  cerrarDetalle() {
    this.modalDetalleAbierto = false;
    this.itemSeleccionado = null;
  }

  // --- Editar: abre el formulario completo de Salida con este registro cargado ---
  abrirEditar(item: any, event?: Event) {
    event?.stopPropagation();
    if (!item?.id) return;

    this.router.navigate(['/salida'], { queryParams: { editar: item.id } });
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