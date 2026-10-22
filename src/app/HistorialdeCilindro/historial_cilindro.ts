import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
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
  IonSearchbar,
  IonModal,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { jsPDF } from 'jspdf';
import {
  downloadOutline,
  peopleOutline,
  arrowBackOutline,
  searchOutline,
  flaskOutline,
  timeOutline,
  addCircleOutline,
  arrowDownCircleOutline,
  exitOutline,
  arrowUpCircleOutline,
  businessOutline,
  locationOutline,
  chevronForwardOutline
} from 'ionicons/icons';

type TipoEvento = 'REGISTRO' | 'INGRESO' | 'SALIDA' | 'RECOJO';

interface EventoHistorial {
  tipo: TipoEvento;
  titulo: string;
  etiqueta: string;          // "Almacén" / "Lo tiene" / ...
  detalle: string;           // almacén o cliente principal
  extra?: string;            // línea adicional (ej. "Entregado por: ...")
  cliente?: string;          // cliente involucrado (para la sección de clientes)
  almacenDestino?: string;   // almacén al que llega (ingreso, recojo, traslado)
  esTraslado?: boolean;      // salida a otro almacén (no a un cliente)
  fecha: Date;
  conHora: boolean;
}

/** Un período en que un cliente tuvo el cilindro (desde que salió hasta que volvió). */
interface TenenciaCliente {
  cliente: string;
  desde: Date;
  conHoraDesde: boolean;
  hasta: Date | null;      // null = todavía lo tiene
  conHoraHasta: boolean;
}

/** Un período en que el cilindro estuvo en un almacén. */
interface EstanciaAlmacen {
  almacen: string;
  desde: Date;
  conHoraDesde: boolean;
  hasta: Date | null;      // null = todavía está ahí
  conHoraHasta: boolean;
}

interface CilindroHistorial {
  id: any;
  serie: string;
  tipoGas: string;
  clienteNombre: string;
  clienteDoc: string;
  situacion: 'DENTRO' | 'FUERA' | 'SIN_MOVIMIENTOS';
  eventos: EventoHistorial[];
  tenencias: TenenciaCliente[];
  estancias: EstanciaAlmacen[];
}

@Component({
  selector: 'app-historial-cilindro',
  templateUrl: './historial_cilindro.html',
  styleUrls: ['./historial_cilindro.scss'],
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonModal,
    IonSpinner
  ]
})
export class HistorialDeCilindroPage implements OnInit {

  cargando = false;
  private cargaEnCurso = false;
  /** Avisos técnicos: qué tablas se leyeron, cuántas filas y con qué columnas. */
  diagnostico: string[] = [];
  filtro = '';
  cilindros: CilindroHistorial[] = [];
  cilindrosFiltrados: CilindroHistorial[] = [];

  isModalOpen = false;
  seleccionado: CilindroHistorial | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private navCtrl: NavController
  ) {
    addIcons({
      downloadOutline,
      peopleOutline,
      arrowBackOutline,
      searchOutline,
      flaskOutline,
      timeOutline,
      addCircleOutline,
      arrowDownCircleOutline,
      exitOutline,
      arrowUpCircleOutline,
      businessOutline,
      locationOutline,
      chevronForwardOutline
    });
  }

  ngOnInit() {
    this.cargarHistorial();
  }

  ionViewWillEnter() {
    this.cargarHistorial();
  }

  // ===== CARGA DE DATOS =====

  /** Lee una tabla completa; si no existe o falla, devuelve [] sin romper la pantalla. */
  private async leerTabla(nombre: string, avisos: string[]): Promise<any[]> {
    try {
      const { data, error } = await this.supabaseService.supabase.from(nombre).select('*');
      if (error) {
        console.warn(`[Historial] No se pudo leer "${nombre}":`, error.message);
        avisos.push(`⚠ No se pudo leer "${nombre}": ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn(`[Historial] Error leyendo "${nombre}":`, err);
      avisos.push(`⚠ Error leyendo "${nombre}"`);
      return [];
    }
  }

  async cargarHistorial() {
    if (this.cargaEnCurso) return;
    this.cargaEnCurso = true;
    this.cargando = true;
    this.cdRef.detectChanges();

    const avisos: string[] = [];

    try {
      const [respCilindros, ingresos, salidas, recojos, almacenes, clientes] = await Promise.all([
        this.supabaseService.supabase
          .from('cilindros')
          .select(`*, clientes ( nombre_razon_social, tipo_documento, num_documento )`)
          .order('created_at', { ascending: false }),
        this.leerTabla('ingreso_cilindros', avisos),
        this.leerTabla('salida_cilindros', avisos),
        this.leerTabla('recojos', avisos),
        this.leerTabla('almacenes', avisos),
        this.leerTabla('clientes', avisos)
      ]);

      // Resumen visible en pantalla (se puede quitar cuando todo funcione)
      const resumen = (nombre: string, filas: any[]) =>
        `${nombre}: ${filas.length} filas · columnas: ${filas[0] ? Object.keys(filas[0]).join(', ') : '—'}`;
      avisos.push(
        resumen('ingreso_cilindros', ingresos),
        resumen('salida_cilindros', salidas),
        resumen('recojos', recojos),
        resumen('almacenes', almacenes)
      );

      if (respCilindros.error) {
        console.error('[Historial] Error al leer cilindros:', respCilindros.error.message);
        avisos.push(`⚠ No se pudo leer "cilindros": ${respCilindros.error.message}`);
        this.cilindros = [];
        this.diagnostico = avisos;
        this.aplicarFiltro();
        return;
      }

      const mapAlmacen = new Map<string, string>();
      almacenes.forEach(a => mapAlmacen.set(String(a.id), this.nombreDeAlmacen(a)));

      const mapCliente = new Map<string, string>();
      clientes.forEach(c => mapCliente.set(String(c.id), c.nombre_razon_social || ''));

      const idxIngresos = this.indexar(ingresos);
      const idxSalidas = this.indexar(salidas);
      const idxRecojos = this.indexar(recojos);

      let cruzados = 0;

      this.cilindros = (respCilindros.data || []).map((c: any) => {
        const serie: string = c.numero_serie || 'SIN SERIE';
        const eventos: EventoHistorial[] = [];

        // Registro del cilindro en el sistema
        if (c.created_at) {
          eventos.push({
            tipo: 'REGISTRO',
            titulo: 'Registrado en el sistema',
            etiqueta: 'Propietario',
            detalle: c.clientes?.nombre_razon_social || 'Sin propietario',
            fecha: new Date(c.created_at),
            conHora: true
          });
        }

        // INGRESO: cliente_id = quién lo trajo · almacen_id = en qué almacén quedó
        this.filasDe(idxIngresos, c).forEach(r => {
          const f = this.fechaDe(r, []);
          if (!f) return;
          const almacen = this.almacenPorId(r.almacen_id, mapAlmacen) || 'Sin almacén asignado';
          const cliente = r.cliente_id != null ? (mapCliente.get(String(r.cliente_id)) || '') : '';
          eventos.push({
            tipo: 'INGRESO',
            titulo: 'Ingresó a ELECTRAMETAL',
            etiqueta: 'Almacén',
            detalle: almacen,
            extra: cliente ? `Entregado por: ${cliente.toUpperCase()}` : undefined,
            cliente: cliente || undefined,
            almacenDestino: almacen,
            fecha: f.fecha,
            conHora: f.conHora
          });
        });

        // SALIDA: cliente_id = a quién salió · almacen_id = de qué almacén · almacen_destino_id = traslado
        this.filasDe(idxSalidas, c).forEach(r => {
          const f = this.fechaDe(r, []);
          if (!f) return;
          const cliente = r.cliente_id != null ? (mapCliente.get(String(r.cliente_id)) || '') : '';
          const origen = this.almacenPorId(r.almacen_id, mapAlmacen);
          const destino = this.almacenPorId(r.almacen_destino_id, mapAlmacen);
          const esTraslado = !cliente && !!destino;
          eventos.push({
            tipo: 'SALIDA',
            titulo: esTraslado ? 'Salió (traslado entre almacenes)' : 'Salió de ELECTRAMETAL',
            etiqueta: esTraslado ? 'Trasladado a' : 'Lo tiene',
            detalle: esTraslado ? destino : (cliente || 'Cliente sin nombre registrado'),
            extra: origen ? `Salió del almacén: ${origen.toUpperCase()}` : undefined,
            cliente: esTraslado ? undefined : (cliente || 'Cliente sin nombre registrado'),
            almacenDestino: esTraslado ? destino : undefined,
            esTraslado,
            fecha: f.fecha,
            conHora: f.conHora
          });
        });

        // RECOJO: cliente = de quién se recogió · almacen_destino_id = adónde llegó
        this.filasDe(idxRecojos, c).forEach(r => {
          const f = this.fechaDe(r, ['fecha_recojo']);
          if (!f) return;
          const cliente = this.nombreCliente(r, mapCliente);
          const destino = this.almacenPorId(r.almacen_destino_id, mapAlmacen);
          const partes: string[] = [];
          if (cliente) partes.push(`Recogido de: ${cliente.toUpperCase()}`);
          if (r.motivo) partes.push(`Motivo: ${r.motivo}`);
          eventos.push({
            tipo: 'RECOJO',
            titulo: 'Se recogió',
            etiqueta: 'Llegó a',
            detalle: destino || 'Almacén sin especificar',
            extra: partes.length ? partes.join(' · ') : undefined,
            cliente: cliente || undefined,
            almacenDestino: destino || undefined,
            fecha: f.fecha,
            conHora: f.conHora
          });
        });

        if (eventos.length > 1) cruzados++;

        // Más reciente primero
        eventos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
        const cronologicos = [...eventos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

        // Clientes que lo tuvieron: de cada salida a un cliente hasta el siguiente ingreso o recojo
        const tenencias: TenenciaCliente[] = [];
        let tenenciaAbierta: TenenciaCliente | null = null;
        cronologicos.forEach(e => {
          if (e.tipo === 'SALIDA' && !e.esTraslado) {
            if (tenenciaAbierta) { tenenciaAbierta.hasta = e.fecha; tenenciaAbierta.conHoraHasta = e.conHora; }
            tenenciaAbierta = { cliente: e.cliente || e.detalle, desde: e.fecha, conHoraDesde: e.conHora, hasta: null, conHoraHasta: true };
            tenencias.push(tenenciaAbierta);
          } else if ((e.tipo === 'INGRESO' || e.tipo === 'RECOJO' || e.esTraslado) && tenenciaAbierta) {
            tenenciaAbierta.hasta = e.fecha;
            tenenciaAbierta.conHoraHasta = e.conHora;
            tenenciaAbierta = null;
          }
        });
        tenencias.reverse();

        // Almacenes donde estuvo: desde que llega a uno hasta que sale de él
        const estancias: EstanciaAlmacen[] = [];
        let estanciaAbierta: EstanciaAlmacen | null = null;
        cronologicos.forEach(e => {
          const llegaAAlmacen = e.tipo === 'INGRESO' || e.tipo === 'RECOJO' || e.esTraslado;
          if (llegaAAlmacen && e.almacenDestino) {
            if (estanciaAbierta) { estanciaAbierta.hasta = e.fecha; estanciaAbierta.conHoraHasta = e.conHora; }
            estanciaAbierta = { almacen: e.almacenDestino, desde: e.fecha, conHoraDesde: e.conHora, hasta: null, conHoraHasta: true };
            estancias.push(estanciaAbierta);
          } else if (e.tipo === 'SALIDA' && estanciaAbierta) {
            estanciaAbierta.hasta = e.fecha;
            estanciaAbierta.conHoraHasta = e.conHora;
            estanciaAbierta = null;
          }
        });
        estancias.reverse();

        // Dónde está ahora: el último ingreso/salida/recojo manda
        const ultimoMov = eventos.find(e => e.tipo !== 'REGISTRO');
        const situacion: CilindroHistorial['situacion'] =
          !ultimoMov ? 'SIN_MOVIMIENTOS'
            : (ultimoMov.tipo === 'SALIDA' && !ultimoMov.esTraslado ? 'FUERA' : 'DENTRO');

        return {
          id: c.id,
          serie,
          tipoGas: c.tipo_gas || 'NO ESPECIFICADO',
          clienteNombre: c.clientes?.nombre_razon_social || 'SIN CLIENTE',
          clienteDoc: `${c.clientes?.tipo_documento || 'DOC'}: ${c.clientes?.num_documento || '-'}`,
          situacion,
          eventos,
          tenencias,
          estancias
        } as CilindroHistorial;
      });

      avisos.push(`Cilindros con movimientos encontrados: ${cruzados} de ${this.cilindros.length}`);
      this.diagnostico = avisos;
      this.aplicarFiltro();
    } catch (err) {
      console.error('[Historial] Error inesperado:', err);
    } finally {
      this.cargando = false;
      this.cargaEnCurso = false;
      this.cdRef.detectChanges();
    }
  }

  // ===== AYUDAS PARA CRUZAR MOVIMIENTOS CON CADA CILINDRO =====

  private claveSerie(v: any): string {
    return String(v ?? '').trim().toLowerCase();
  }

  /**
   * Agrupa filas de movimientos (ingresos, salidas, recojos) por id de cilindro
   * y por número de serie. Cada fila puede traer varios cilindros: un lote en
   * columnas como cilindros_ingresados / cilindros_egresados (arreglo, JSON o
   * texto separado por comas), o un solo código en codigo_qr.
   */
  private indexar(filas: any[]): Map<string, any[]> {
    const mapa = new Map<string, any[]>();
    const agregar = (clave: string, fila: any) => {
      const lista = mapa.get(clave) || [];
      if (!lista.includes(fila)) lista.push(fila);
      mapa.set(clave, lista);
    };

    const indexarValor = (v: any, fila: any, comoId: boolean, comoSerie: boolean) => {
      if (v == null || v === '') return;

      if (typeof v === 'string') {
        const t = v.trim();
        if (t.startsWith('[') || t.startsWith('{')) {
          try { indexarValor(JSON.parse(t), fila, comoId, comoSerie); return; } catch { /* no era JSON */ }
        }
        t.split(/[,;\n]+/).map(s => s.trim()).filter(s => s).forEach(s => {
          if (comoSerie) agregar('s:' + this.claveSerie(s), fila);
          if (comoId && /^\d+$/.test(s)) agregar('id:' + s, fila);
        });
        return;
      }

      if (typeof v === 'number') {
        if (comoId) agregar('id:' + v, fila);
        if (comoSerie) agregar('s:' + this.claveSerie(v), fila);
        return;
      }

      if (Array.isArray(v)) {
        v.forEach(x => indexarValor(x, fila, comoId, comoSerie));
        return;
      }

      if (typeof v === 'object') {
        // Objeto de un cilindro: { id, numero_serie, ... } o un contenedor { series: [...] }
        indexarValor(v.cilindro_id ?? v.id, fila, true, false);
        indexarValor(v.numero_serie ?? v.serie ?? v.codigo, fila, false, true);
        Object.keys(v).forEach(k => {
          if (/cilindros|series|items|lista/i.test(k)) indexarValor(v[k], fila, true, true);
        });
      }
    };

    filas.forEach(f => {
      Object.keys(f).forEach(k => {
        if (/cilindro_id|id_cilindro/i.test(k)) indexarValor(f[k], f, true, false);
        else if (/serie|codigo_qr|^codigo$/i.test(k)) indexarValor(f[k], f, false, true);
        else if (/cilindro/i.test(k)) indexarValor(f[k], f, true, true);
      });
    });
    return mapa;
  }

  private filasDe(indice: Map<string, any[]>, cilindro: any): any[] {
    const resultado = new Set<any>();
    (indice.get('id:' + cilindro.id) || []).forEach(f => resultado.add(f));
    (indice.get('s:' + this.claveSerie(cilindro.numero_serie)) || []).forEach(f => resultado.add(f));
    return Array.from(resultado);
  }

  /**
   * Obtiene fecha y hora de un movimiento. Si la columna trae solo la fecha
   * (ej. fecha_recojo), se completa la hora con created_at cuando es el mismo día.
   */
  private fechaDe(fila: any, preferidas: string[]): { fecha: Date, conHora: boolean } | null {
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/;
    const claveFecha = Object.keys(fila).find(k => /^fecha/i.test(k) && fila[k]);
    const candidatos = [
      ...preferidas.map(k => fila[k]),
      fila.fecha_hora,
      fila.fecha,
      claveFecha ? fila[claveFecha] : null,
      fila.created_at
    ];
    const valor = candidatos.find(v => !!v);
    if (!valor) return null;

    if (typeof valor === 'string' && soloFecha.test(valor)) {
      const [y, m, dia] = valor.split('-').map(Number);
      const local = new Date(y, m - 1, dia);

      if (fila.hora) {
        const d = new Date(`${valor}T${fila.hora}`);
        if (!isNaN(d.getTime())) return { fecha: d, conHora: true };
      }
      if (fila.created_at) {
        const c = new Date(fila.created_at);
        if (!isNaN(c.getTime()) &&
          c.getFullYear() === y && c.getMonth() === m - 1 && c.getDate() === dia) {
          return { fecha: c, conHora: true };
        }
      }
      return { fecha: local, conHora: false };
    }

    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : { fecha: d, conHora: true };
  }

  /** Nombre de un almacén: usa nombre/descripcion o, si no, la primera columna de texto. */
  private nombreDeAlmacen(a: any): string {
    if (a.nombre || a.nombre_almacen || a.descripcion) {
      return a.nombre || a.nombre_almacen || a.descripcion;
    }
    const clave = Object.keys(a).find(k => !/^(id|created_at|updated_at)$/i.test(k) && typeof a[k] === 'string' && a[k]);
    return clave ? a[clave] : '';
  }

  private almacenPorId(id: any, mapa: Map<string, string>): string {
    if (id == null) return '';
    return mapa.get(String(id)) || '';
  }

  /** Cliente de un recojo: la columna "cliente" puede ser un nombre o un id de cliente. */
  private nombreCliente(fila: any, mapa: Map<string, string>): string {
    if (fila.cliente_id != null && mapa.get(String(fila.cliente_id))) {
      return mapa.get(String(fila.cliente_id)) as string;
    }
    if (fila.cliente != null) {
      const porId = mapa.get(String(fila.cliente));
      if (porId) return porId;
      if (typeof fila.cliente === 'string' && fila.cliente.trim()) return fila.cliente.trim();
    }
    return '';
  }

  // ===== PDF DEL HISTORIAL =====

  /** Fecha con el día de la semana, ej. "martes, 20 de octubre de 2026". */
  fechaLarga(d: Date): string {
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  private fmtFecha(d: Date): string {
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private fmtHora(d: Date): string {
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  private fmtFechaHora(d: Date | null, conHora: boolean): string {
    if (!d) return 'Actualmente';
    return conHora ? `${this.fmtFecha(d)} ${this.fmtHora(d)}` : this.fmtFecha(d);
  }

  descargarPdf(item: CilindroHistorial) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 14;
    const ANCHO = 210;
    let y = M;

    const asegurarEspacio = (alto: number) => {
      if (y + alto > 285) {
        doc.addPage();
        y = M;
      }
    };

    // Encabezado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('ELECTRAMETAL NORPERÚ S.A.C.', M, y + 5);
    y += 11;
    doc.setFontSize(12);
    doc.text('Historial de cilindro', M, y);
    y += 3;
    doc.setDrawColor(0, 168, 89);
    doc.setLineWidth(0.6);
    doc.line(M, y, ANCHO - M, y);
    y += 7;

    // Datos del cilindro
    const estado = item.situacion === 'DENTRO' ? 'Dentro de planta'
      : item.situacion === 'FUERA' ? 'Fuera de planta' : 'Sin movimientos';
    const datos: [string, string][] = [
      ['Serie', item.serie],
      ['Tipo de gas', item.tipoGas],
      ['Propietario', item.clienteNombre],
      ['Documento', item.clienteDoc],
      ['Situación actual', estado],
      ['Emitido', `${this.fmtFecha(new Date())} ${this.fmtHora(new Date())}`]
    ];
    doc.setFontSize(10);
    datos.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${k}:`, M, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(v), M + 38, y);
      y += 6;
    });
    y += 4;

    const encabezadoTabla = (cols: [string, number][]) => {
      doc.setFillColor(230, 247, 239);
      doc.rect(M, y - 4.5, ANCHO - M * 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      cols.forEach(([t, x]) => doc.text(t, x, y));
      y += 6;
    };

    const tablaPeriodos = (
      titulo: string,
      vacio: string,
      colNombre: string,
      filas: { nombre: string, desde: Date, conHoraDesde: boolean, hasta: Date | null, conHoraHasta: boolean }[]
    ) => {
      asegurarEspacio(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(titulo, M, y);
      y += 6;

      if (filas.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(vacio, M, y);
        y += 8;
        return;
      }

      encabezadoTabla([[colNombre, M + 2], ['Desde', 112], ['Hasta', 154]]);
      doc.setFont('helvetica', 'normal');
      filas.forEach(f => {
        const lineas: string[] = doc.splitTextToSize(f.nombre.toUpperCase(), 92);
        const alto = Math.max(lineas.length * 4.5, 5) + 2;
        asegurarEspacio(alto);
        doc.setFontSize(9);
        doc.text(lineas, M + 2, y);
        doc.text(this.fmtFechaHora(f.desde, f.conHoraDesde), 112, y);
        doc.text(this.fmtFechaHora(f.hasta, f.conHoraHasta), 154, y);
        y += alto;
      });
      y += 4;
    };

    tablaPeriodos('Clientes que lo tuvieron', 'Sin salidas registradas.', 'Cliente',
      item.tenencias.map(t => ({ nombre: t.cliente, desde: t.desde, conHoraDesde: t.conHoraDesde, hasta: t.hasta, conHoraHasta: t.conHoraHasta })));

    tablaPeriodos('Almacenes donde estuvo', 'Sin ingresos registrados.', 'Almacén',
      item.estancias.map(e => ({ nombre: e.almacen, desde: e.desde, conHoraDesde: e.conHoraDesde, hasta: e.hasta, conHoraHasta: e.conHoraHasta })));

    // Movimientos (orden cronológico)
    asegurarEspacio(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Movimientos', M, y);
    y += 6;
    encabezadoTabla([['Fecha', M + 2], ['Hora', 42], ['Movimiento', 62], ['Detalle', 106]]);

    const cronologicos = [...item.eventos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    doc.setFont('helvetica', 'normal');
    cronologicos.forEach(e => {
      const texto = `${e.etiqueta}: ${e.detalle.toUpperCase()}` + (e.extra ? `\n${e.extra}` : '');
      const lineas: string[] = doc.splitTextToSize(texto, ANCHO - M - 106);
      const alto = Math.max(lineas.length * 4.5, 5) + 2;
      asegurarEspacio(alto);
      doc.setFontSize(9);
      doc.text(this.fmtFecha(e.fecha), M + 2, y);
      doc.text(e.conHora ? this.fmtHora(e.fecha) : '-', 42, y);
      doc.text(e.titulo, 62, y);
      doc.text(lineas, 106, y);
      y += alto;
    });

    const nombre = item.serie.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`historial_${nombre}.pdf`);
  }

  // ===== BÚSQUEDA =====

  filtrarCilindros(event: any) {
    this.filtro = (event?.detail?.value || '').toLowerCase().trim();
    this.aplicarFiltro();
  }

  private aplicarFiltro() {
    const t = this.filtro;
    if (!t) {
      this.cilindrosFiltrados = [...this.cilindros];
    } else {
      this.cilindrosFiltrados = this.cilindros.filter(c =>
        c.serie.toLowerCase().includes(t) ||
        c.tipoGas.toLowerCase().includes(t) ||
        c.clienteNombre.toLowerCase().includes(t)
      );
    }
    this.cdRef.detectChanges();
  }

  obtenerClaseGas(tipoGas: string): string {
    if (!tipoGas) return '';
    const gas = tipoGas.toUpperCase();

    if (gas.includes('OXÍGENO') || gas.includes('OXIGENO')) return 'gas-oxigeno';
    if (gas.includes('ACETILENO')) return 'gas-acetileno';
    if (gas.includes('MEZCLA') || gas.includes('ESTARGOR') || gas.includes('ARGÓN') || gas.includes('ARGON')) return 'gas-estargor';
    if (gas.includes('NITRÓGENO') || gas.includes('NITROGENO')) return 'gas-nitrogeno';
    if (gas.includes('DIÓXIDO') || gas.includes('DIOXIDO') || gas.includes('CO2')) return 'gas-co2';

    return '';
  }

  iconoEvento(tipo: TipoEvento): string {
    switch (tipo) {
      case 'INGRESO': return 'arrow-down-circle-outline';
      case 'SALIDA': return 'exit-outline';
      case 'RECOJO': return 'arrow-up-circle-outline';
      default: return 'add-circle-outline';
    }
  }

  // ===== DETALLE =====

  verHistorial(item: CilindroHistorial) {
    this.seleccionado = item;
    this.isModalOpen = true;
  }

  cerrarDetalle() {
    this.isModalOpen = false;
    this.seleccionado = null;
  }

  regresar() {
    this.navCtrl.back();
  }
}