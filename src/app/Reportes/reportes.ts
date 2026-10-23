import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  searchOutline,
  downloadOutline,
  printOutline,
  documentTextOutline,
  exitOutline,
  cubeOutline,
  shieldCheckmarkOutline,
  swapVerticalOutline,
  closeCircleOutline,
  flaskOutline,
  chevronForwardOutline,
  alertCircleOutline
} from 'ionicons/icons';
import { jsPDF } from 'jspdf';
import { SupabaseService } from '../services/supabase';

type TipoMov = 'INGRESO' | 'SALIDA' | 'RECOJO';
type IdReporte = 'calle' | 'planta' | 'ph' | 'movimientos';

/** Un movimiento de UN cilindro (los lotes de ingreso/salida se separan en una fila por serie). */
interface Mov {
  tipo: TipoMov;
  serie: string;
  gas: string;
  capacidad: string;
  fecha: Date;
  cliente: string;
  almacen: string;     // ingreso/recojo: dónde llegó · salida: de dónde salió (o a dónde, si es traslado)
  traslado: boolean;
  detalle: string;
}

interface Situacion {
  estado: 'FUERA' | 'DENTRO' | 'SIN';
  mov?: Mov;
}

interface TablaReporte {
  id: IdReporte;
  titulo: string;
  subtitulo: string;
  cols: { t: string; w: number }[];   // w en mm (suman 182)
  filas: string[][];
  alertas: boolean[];                 // filas a resaltar en rojo
  resumen: string[];
  idxTitulo: number;                  // columna que hace de título en la vista previa
}

const SIN_UBICACION = 'Sin movimientos (ubicación no registrada)';

@Component({
  selector: 'app-reportes',
  templateUrl: './reportes.html',
  styleUrls: ['./reportes.scss'],
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
    IonSpinner
  ]
})
export class ReportesPage {

  cargando = false;
  avisos: string[] = [];

  // ---- Datos en memoria (se leen una vez al entrar: así las búsquedas son instantáneas) ----
  cilindros: any[] = [];
  almacenes: string[] = [];
  private mapAlm = new Map<string, string>();
  private mapCli = new Map<string, string>();
  private movs: Mov[] = [];
  private movsPorSerie = new Map<string, Mov[]>();
  private situaciones = new Map<string, Situacion>();

  // ---- Buscador por número de serie ----
  busqueda = '';
  sugerencias: any[] = [];
  sel: any = null;
  selMovs: Mov[] = [];
  selSit: Situacion = { estado: 'SIN' };
  sinResultado = false;

  // ---- Reportes generales ----
  reportes: { id: IdReporte; titulo: string; desc: string; icono: string }[] = [
    { id: 'calle', titulo: 'Cilindros en la calle', desc: 'Qué cliente tiene cada cilindro y hace cuántos días', icono: 'exit-outline' },
    { id: 'planta', titulo: 'Inventario en planta', desc: 'Cilindros dentro, por almacén y tipo de gas', icono: 'cube-outline' },
    { id: 'ph', titulo: 'Pruebas hidrostáticas', desc: 'Cilindros con la PH vencida o por vencer', icono: 'shield-checkmark-outline' },
    { id: 'movimientos', titulo: 'Movimientos', desc: 'Ingresos, salidas y recojos por fechas', icono: 'swap-vertical-outline' }
  ];
  reporteActivo: IdReporte | null = null;
  tabla: TablaReporte | null = null;

  // Filtros
  fTexto = '';
  fAlmacen = '';
  fGas = '';
  fMeses = '6';
  fDesde = '';
  fHasta = '';
  fTipo = '';
  readonly gases = ['OXÍGENO', 'ACETILENO', 'ARGÓN', 'NITRÓGENO', 'DIÓXIDO DE CARBONO', 'MEZCLA'];

  constructor(
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private navCtrl: NavController
  ) {
    addIcons({
      arrowBackOutline,
      searchOutline,
      downloadOutline,
      printOutline,
      documentTextOutline,
      exitOutline,
      cubeOutline,
      shieldCheckmarkOutline,
      swapVerticalOutline,
      closeCircleOutline,
      flaskOutline,
      chevronForwardOutline,
      alertCircleOutline
    });

    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hoy.getDate() - 30);
    this.fHasta = this.isoLocal(hoy);
    this.fDesde = this.isoLocal(hace30);
  }

  ionViewWillEnter() {
    this.cargarDatos();
  }

  regresar() {
    this.navCtrl.back();
  }

  // =====================================================================
  //  CARGA DE DATOS
  // =====================================================================

  private async leer(nombre: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabaseService.supabase.from(nombre).select('*');
      if (error) {
        this.avisos.push(`No se pudo leer "${nombre}": ${error.message}`);
        return [];
      }
      return data || [];
    } catch {
      this.avisos.push(`No se pudo leer "${nombre}".`);
      return [];
    }
  }

  async cargarDatos() {
    this.cargando = true;
    this.avisos = [];
    this.cdRef.detectChanges();

    try {
      const [rc, ingresos, salidas, recojos, almacenes, clientes] = await Promise.all([
        this.supabaseService.supabase
          .from('cilindros')
          .select('*, clientes ( nombre_razon_social, tipo_documento, num_documento )')
          .order('numero_serie', { ascending: true }),
        this.leer('ingreso_cilindros'),
        this.leer('salida_cilindros'),
        this.leer('recojos'),
        this.leer('almacenes'),
        this.leer('clientes')
      ]);

      if (rc.error) {
        this.avisos.push(`No se pudo leer "cilindros": ${rc.error.message}`);
      }
      this.cilindros = rc.data || [];

      this.mapAlm = new Map(almacenes.map(a => [String(a.id), a.nombre || '']));
      this.almacenes = almacenes.map(a => a.nombre).filter(n => !!n);
      this.mapCli = new Map(clientes.map(c => [String(c.id), c.nombre_razon_social || '']));

      this.armarMovimientos(ingresos, salidas, recojos);

      // Si ya había un cilindro abierto o un reporte elegido, se refrescan
      if (this.sel) this.seleccionar(this.cilindros.find(c => c.id === this.sel.id) || this.sel);
      if (this.reporteActivo) this.generar();
    } catch (err) {
      console.error('[Reportes] Error inesperado:', err);
      this.avisos.push('Ocurrió un error al cargar los datos.');
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  private clave(serie: any): string {
    return String(serie ?? '').replace(/\s+/g, '').toLowerCase();
  }

  private lote(v: any): any[] {
    if (!v) return [];
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch { return []; }
    }
    return Array.isArray(v) ? v : [];
  }

  private fecha(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Convierte los lotes de ingreso, salida y recojo en movimientos por cilindro. */
  private armarMovimientos(ingresos: any[], salidas: any[], recojos: any[]) {
    const nomAlm = (id: any) => (id != null ? this.mapAlm.get(String(id)) || '' : '');
    const nomCli = (id: any) => (id != null ? this.mapCli.get(String(id)) || '' : '');
    const movs: Mov[] = [];

    ingresos.forEach(r => {
      const f = this.fecha(r.created_at);
      if (!f) return;
      this.lote(r.cilindros_ingresados).forEach((it: any) => {
        movs.push({
          tipo: 'INGRESO',
          serie: String(it?.numero_serie ?? '').trim(),
          gas: it?.tipo_gas || '',
          capacidad: it?.capacidad || '',
          fecha: f,
          cliente: nomCli(r.cliente_id),
          almacen: nomAlm(r.almacen_id),
          traslado: false,
          detalle: r.observacion || ''
        });
      });
    });

    salidas.forEach(r => {
      const f = this.fecha(r.created_at);
      if (!f) return;
      const cliente = nomCli(r.cliente_id);
      const destino = nomAlm(r.almacen_destino_id);
      const traslado = !cliente && !!destino;
      this.lote(r.cilindros_egresados).forEach((it: any) => {
        movs.push({
          tipo: 'SALIDA',
          serie: String(it?.numero_serie ?? '').trim(),
          gas: it?.tipo_gas || '',
          capacidad: it?.capacidad || '',
          fecha: f,
          cliente,
          almacen: traslado ? destino : nomAlm(r.almacen_id),
          traslado,
          detalle: r.observacion || ''
        });
      });
    });

    recojos.forEach(r => {
      const f = this.fecha(r.fecha_recojo) || this.fecha(r.created_at);
      if (!f) return;
      movs.push({
        tipo: 'RECOJO',
        serie: String(r.codigo_qr ?? '').trim(),
        gas: '',
        capacidad: '',
        fecha: f,
        cliente: r.cliente_id != null ? nomCli(r.cliente_id) : String(r.cliente ?? ''),
        almacen: nomAlm(r.almacen_destino_id),
        traslado: false,
        detalle: [r.motivo, r.estado].filter((t: any) => !!t).join(' · ')
      });
    });

    this.movs = movs.filter(m => !!m.serie).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    // Índices por serie y situación actual (el último movimiento manda)
    this.movsPorSerie = new Map();
    this.situaciones = new Map();
    this.movs.forEach(m => {
      const k = this.clave(m.serie);
      const lista = this.movsPorSerie.get(k) || [];
      lista.push(m);
      this.movsPorSerie.set(k, lista);
      this.situaciones.set(k, { estado: (m.tipo === 'SALIDA' && !m.traslado) ? 'FUERA' : 'DENTRO', mov: m });
    });
  }

  private situacion(serie: any): Situacion {
    return this.situaciones.get(this.clave(serie)) || { estado: 'SIN' };
  }

  // =====================================================================
  //  BUSCADOR POR NÚMERO DE SERIE
  // =====================================================================

  buscarSerie(event?: any) {
    if (event) this.busqueda = (event?.detail?.value ?? '').toString();
    const t = this.busqueda.trim().toLowerCase();
    this.sinResultado = false;

    if (!t) {
      this.sugerencias = [];
      this.sel = null;
      return;
    }

    this.sugerencias = this.cilindros
      .filter(c => String(c.numero_serie || '').toLowerCase().includes(t))
      .slice(0, 8);

    // Si lo escrito coincide exacto con una serie, se abre de una vez
    const exacto = this.cilindros.find(c => this.clave(c.numero_serie) === this.clave(t));
    if (exacto) {
      this.seleccionar(exacto);
      this.sugerencias = [];
    } else {
      this.sel = null;
      this.sinResultado = this.sugerencias.length === 0;
    }
    this.cdRef.detectChanges();
  }

  /** Enter: abre el primer resultado de la lista. */
  elegirPrimero() {
    if (this.sugerencias.length > 0) {
      this.seleccionar(this.sugerencias[0]);
      this.sugerencias = [];
    }
  }

  seleccionar(c: any) {
    this.sel = c;
    this.busqueda = c.numero_serie;
    this.sugerencias = [];
    this.sinResultado = false;
    const k = this.clave(c.numero_serie);
    this.selMovs = [...(this.movsPorSerie.get(k) || [])].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    this.selSit = this.situacion(c.numero_serie);
    this.cdRef.detectChanges();
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.sugerencias = [];
    this.sel = null;
    this.sinResultado = false;
  }

  textoSituacion(): string {
    const s = this.selSit;
    if (s.estado === 'SIN' || !s.mov) return 'Sin movimientos registrados';
    if (s.estado === 'FUERA') {
      return `Fuera de planta · lo tiene ${(s.mov.cliente || 'un cliente sin nombre').toUpperCase()}`;
    }
    return `Dentro de planta · ${s.mov.almacen || 'almacén sin especificar'}`;
  }

  detalleSituacion(): string {
    const s = this.selSit;
    if (!s.mov) return '';
    if (s.estado === 'FUERA') {
      const dias = Math.floor((Date.now() - s.mov.fecha.getTime()) / 86400000);
      return `Salió el ${this.fmtCorta(s.mov.fecha)} (hace ${dias} día${dias === 1 ? '' : 's'})`;
    }
    return `Desde el ${this.fmtCorta(s.mov.fecha)}`;
  }

  tituloMov(m: Mov): string {
    if (m.tipo === 'INGRESO') return 'Ingresó a ELECTRAMETAL';
    if (m.tipo === 'RECOJO') return 'Se recogió';
    return m.traslado ? 'Traslado entre almacenes' : 'Salió de ELECTRAMETAL';
  }

  descripcionMov(m: Mov): string {
    const cli = m.cliente ? m.cliente.toUpperCase() : '';
    const alm = m.almacen ? m.almacen.toUpperCase() : '';
    if (m.tipo === 'INGRESO') {
      return [alm && `Almacén: ${alm}`, cli && `Entregó: ${cli}`].filter(t => !!t).join(' · ') || 'Almacén sin especificar';
    }
    if (m.tipo === 'RECOJO') {
      return [cli && `Recogido de: ${cli}`, alm && `Llegó a: ${alm}`].filter(t => !!t).join(' · ') || 'Sin detalle';
    }
    if (m.traslado) return alm ? `Trasladado a: ${alm}` : 'Sin detalle';
    return [cli && `Cliente: ${cli}`, alm && `Del almacén: ${alm}`].filter(t => !!t).join(' · ') || 'Sin detalle';
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

  capacidadDe(c: any): string {
    const partes: string[] = [];
    if (c?.litros) partes.push(`${c.litros} L`);
    if (c?.contenido) {
      const unidad = String(c.tipo_gas || '').toUpperCase() === 'ACETILENO' ? 'kg' : (c.unidad_medida || '');
      partes.push(`${c.contenido} ${unidad}`.trim());
    }
    return partes.join(' · ') || '-';
  }

  // =====================================================================
  //  REPORTES GENERALES
  // =====================================================================

  elegirReporte(id: IdReporte) {
    this.reporteActivo = this.reporteActivo === id ? null : id;
    this.fTexto = '';
    this.fAlmacen = '';
    this.fGas = '';
    this.fTipo = '';
    this.generar();
  }

  generar() {
    switch (this.reporteActivo) {
      case 'calle': this.tabla = this.repCalle(); break;
      case 'planta': this.tabla = this.repPlanta(); break;
      case 'ph': this.tabla = this.repPh(); break;
      case 'movimientos': this.tabla = this.repMovimientos(); break;
      default: this.tabla = null;
    }
    this.cdRef.detectChanges();
  }

  private coincide(texto: string, ...campos: any[]): boolean {
    const t = texto.trim().toLowerCase();
    if (!t) return true;
    return campos.some(c => String(c ?? '').toLowerCase().includes(t));
  }

  /** 1) Cilindros que están con clientes. */
  private repCalle(): TablaReporte {
    const ahora = Date.now();
    const items = this.cilindros
      .map(c => ({ c, s: this.situacion(c.numero_serie) }))
      .filter(x => x.s.estado === 'FUERA' && !!x.s.mov)
      .map(x => {
        const m = x.s.mov as Mov;
        return {
          serie: x.c.numero_serie,
          gas: x.c.tipo_gas || m.gas || '-',
          cliente: (m.cliente || 'Cliente sin nombre registrado').toUpperCase(),
          fecha: m.fecha,
          dias: Math.floor((ahora - m.fecha.getTime()) / 86400000)
        };
      })
      .filter(x => this.coincide(this.fTexto, x.serie, x.cliente, x.gas))
      .sort((a, b) => b.dias - a.dias);

    const clientes = new Set(items.map(i => i.cliente));
    const largos = items.filter(i => i.dias > 30).length;

    return {
      id: 'calle',
      titulo: 'Cilindros en la calle por cliente',
      subtitulo: this.fTexto ? `Filtro: "${this.fTexto}"` : 'Cilindros que salieron y todavía no se recogen',
      cols: [{ t: 'Serie', w: 32 }, { t: 'Tipo de gas', w: 34 }, { t: 'Cliente', w: 62 }, { t: 'Salió el', w: 36 }, { t: 'Días fuera', w: 18 }],
      filas: items.map(i => [i.serie, i.gas, i.cliente, this.fmtCorta(i.fecha), `${i.dias}`]),
      alertas: items.map(i => i.dias > 30),
      resumen: [
        `Total en la calle: ${items.length} cilindro(s) con ${clientes.size} cliente(s)`,
        `Con más de 30 días fuera: ${largos}`
      ],
      idxTitulo: 0
    };
  }

  /** 2) Cilindros dentro de planta, por almacén. */
  private repPlanta(): TablaReporte {
    const items = this.cilindros
      .map(c => ({ c, s: this.situacion(c.numero_serie) }))
      .filter(x => x.s.estado !== 'FUERA')
      .map(x => ({
        serie: x.c.numero_serie,
        gas: String(x.c.tipo_gas || '-').toUpperCase(),
        capacidad: this.capacidadDe(x.c),
        almacen: x.s.estado === 'DENTRO' ? (x.s.mov?.almacen || 'Almacén sin especificar') : SIN_UBICACION,
        propietario: String(x.c.clientes?.nombre_razon_social || 'SIN CLIENTE').toUpperCase()
      }))
      .filter(x => !this.fAlmacen || x.almacen === this.fAlmacen)
      .filter(x => !this.fGas || x.gas === this.fGas)
      .filter(x => this.coincide(this.fTexto, x.serie, x.propietario))
      .sort((a, b) => a.almacen.localeCompare(b.almacen) || String(a.serie).localeCompare(String(b.serie)));

    const porAlmacen = new Map<string, number>();
    items.forEach(i => porAlmacen.set(i.almacen, (porAlmacen.get(i.almacen) || 0) + 1));

    const filtros = [this.fAlmacen && `Almacén: ${this.fAlmacen}`, this.fGas && `Gas: ${this.fGas}`, this.fTexto && `Filtro: "${this.fTexto}"`]
      .filter(t => !!t).join(' · ');

    return {
      id: 'planta',
      titulo: 'Inventario de cilindros en planta',
      subtitulo: filtros || 'Todos los cilindros que están dentro de planta',
      cols: [{ t: 'Serie', w: 30 }, { t: 'Tipo de gas', w: 30 }, { t: 'Capacidad', w: 24 }, { t: 'Almacén', w: 40 }, { t: 'Propietario', w: 58 }],
      filas: items.map(i => [i.serie, i.gas, i.capacidad, i.almacen, i.propietario]),
      alertas: items.map(i => i.almacen === SIN_UBICACION),
      resumen: [
        `Total dentro de planta: ${items.length} cilindro(s)`,
        ...Array.from(porAlmacen.entries()).map(([alm, n]) => `${alm}: ${n}`)
      ],
      idxTitulo: 0
    };
  }

  /** 3) Pruebas hidrostáticas vencidas o por vencer. */
  private repPh(): TablaReporte {
    const hoy = new Date();
    const meses = Number(this.fMeses) || 6;
    const limite = new Date(hoy.getFullYear(), hoy.getMonth() + meses + 1, 0, 23, 59, 59);
    let sinFecha = 0;

    const items: { serie: string; gas: string; propietario: string; ph: string; venc: Date; vencida: boolean }[] = [];
    this.cilindros.forEach(c => {
      const m = /(\d{1,2})\s*\/\s*(\d{4})/.exec(String(c.ph || ''));
      if (!m || +m[1] < 1 || +m[1] > 12) { sinFecha++; return; }
      const venc = new Date(+m[2], +m[1], 0, 23, 59, 59);   // fin del mes indicado
      if (venc > limite) return;
      items.push({
        serie: c.numero_serie,
        gas: String(c.tipo_gas || '-').toUpperCase(),
        propietario: String(c.clientes?.nombre_razon_social || 'SIN CLIENTE').toUpperCase(),
        ph: `${String(+m[1]).padStart(2, '0')}/${m[2]}`,
        venc,
        vencida: venc < hoy
      });
    });

    const lista = items
      .filter(i => this.coincide(this.fTexto, i.serie, i.propietario))
      .sort((a, b) => a.venc.getTime() - b.venc.getTime());

    const estado = (i: { venc: Date; vencida: boolean }) => {
      if (i.vencida) return 'VENCIDA';
      const dias = Math.ceil((i.venc.getTime() - hoy.getTime()) / 86400000);
      return dias <= 60 ? `Vence en ${dias} día(s)` : `Vence en ${Math.round(dias / 30)} mes(es)`;
    };

    return {
      id: 'ph',
      titulo: 'Pruebas hidrostáticas vencidas o por vencer',
      subtitulo: `Vencidas y las que vencen en los próximos ${meses} mes(es)`,
      cols: [{ t: 'Serie', w: 32 }, { t: 'Tipo de gas', w: 32 }, { t: 'Propietario', w: 60 }, { t: 'PH (mes/año)', w: 26 }, { t: 'Estado', w: 32 }],
      filas: lista.map(i => [i.serie, i.gas, i.propietario, i.ph, estado(i)]),
      alertas: lista.map(i => i.vencida),
      resumen: [
        `Vencidas: ${lista.filter(i => i.vencida).length} · Por vencer: ${lista.filter(i => !i.vencida).length}`,
        `Sin fecha de PH registrada (no se pueden evaluar): ${sinFecha}`
      ],
      idxTitulo: 0
    };
  }

  /** 4) Movimientos en un rango de fechas. */
  private repMovimientos(): TablaReporte {
    const desde = this.fDesde ? new Date(`${this.fDesde}T00:00:00`) : null;
    const hasta = this.fHasta ? new Date(`${this.fHasta}T23:59:59`) : null;
    const etiqueta = (t: TipoMov) => t === 'INGRESO' ? 'Ingreso' : t === 'SALIDA' ? 'Salida' : 'Recojo';

    const lista = this.movs
      .filter(m => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta))
      .filter(m => !this.fTipo || m.tipo === this.fTipo)
      .filter(m => this.coincide(this.fTexto, m.serie, m.cliente, m.almacen))
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    const cuenta = (t: TipoMov) => lista.filter(m => m.tipo === t).length;
    const gasDe = (m: Mov) => m.gas || this.cilindros.find(c => this.clave(c.numero_serie) === this.clave(m.serie))?.tipo_gas || '-';

    return {
      id: 'movimientos',
      titulo: 'Movimientos de cilindros',
      subtitulo: `Del ${this.fDesde ? this.fmtIso(this.fDesde) : 'inicio'} al ${this.fHasta ? this.fmtIso(this.fHasta) : 'hoy'}`
        + (this.fTipo ? ` · Solo ${etiqueta(this.fTipo as TipoMov).toLowerCase()}s` : ''),
      cols: [{ t: 'Fecha y hora', w: 34 }, { t: 'Movimiento', w: 22 }, { t: 'Serie', w: 30 }, { t: 'Gas', w: 28 }, { t: 'Cliente', w: 40 }, { t: 'Almacén', w: 28 }],
      filas: lista.map(m => [
        this.fmtFechaHora(m.fecha),
        etiqueta(m.tipo),
        m.serie,
        String(gasDe(m)).toUpperCase(),
        (m.cliente || '-').toUpperCase(),
        (m.almacen || '-').toUpperCase()
      ]),
      alertas: lista.map(() => false),
      resumen: [
        `Total: ${lista.length} movimiento(s)`,
        `Ingresos: ${cuenta('INGRESO')} · Salidas: ${cuenta('SALIDA')} · Recojos: ${cuenta('RECOJO')}`
      ],
      idxTitulo: 2
    };
  }

  /** Etiquetas de las columnas que no son el título (para la vista previa en tarjetas). */
  columnasSecundarias(t: TablaReporte): { t: string; i: number }[] {
    return t.cols.map((c, i) => ({ t: c.t, i })).filter(c => c.i !== t.idxTitulo);
  }

  // =====================================================================
  //  FORMATOS DE FECHA
  // =====================================================================

  private isoLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private fmtIso(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  private fmtCorta(d: Date): string {
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private fmtHora(d: Date): string {
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  private fmtFechaHora(d: Date): string {
    return `${this.fmtCorta(d)} ${this.fmtHora(d)}`;
  }

  // =====================================================================
  //  PDF
  // =====================================================================

  private encabezado(doc: jsPDF, titulo: string, subtitulo?: string): number {
    const M = 14;
    let y = M + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('ELECTRAMETAL NORPERÚ S.A.C.', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Emitido: ${this.fmtFechaHora(new Date())}`, 210 - M, y, { align: 'right' });
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(titulo, M, y);
    y += 3;
    doc.setDrawColor(0, 168, 89);
    doc.setLineWidth(0.6);
    doc.line(M, y, 210 - M, y);
    y += 6;
    if (subtitulo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitulo, M, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }
    return y;
  }

  /** Dibuja una tabla con encabezado verde claro que se repite en cada página. */
  private dibujarTabla(doc: jsPDF, y: number, cols: { t: string; w: number }[], filas: string[][], alertas?: boolean[]): number {
    const M = 14;
    const W = 182;

    const cabecera = () => {
      doc.setFillColor(230, 247, 239);
      doc.rect(M, y - 4.5, W, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      let x = M + 2;
      cols.forEach(c => { doc.text(c.t, x, y); x += c.w; });
      y += 6;
    };
    cabecera();

    filas.forEach((fila, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const celdas = fila.map((v, i) => doc.splitTextToSize(String(v ?? ''), cols[i].w - 3) as string[]);
      const lineas = Math.max(...celdas.map(c => c.length), 1);
      const alto = lineas * 4 + 2;

      if (y + alto > 280) {
        doc.addPage();
        y = 20;
        cabecera();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
      }

      if (alertas && alertas[idx]) doc.setTextColor(185, 28, 28);
      let x = M + 2;
      celdas.forEach((c, i) => { doc.text(c, x, y); x += cols[i].w; });
      doc.setTextColor(0, 0, 0);

      y += alto;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(M, y - 3, M + W, y - 3);
    });

    return y;
  }

  private numerarPaginas(doc: jsPDF) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${i} de ${n}`, 105, 290, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);
  }

  private pdfTabla(t: TablaReporte): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = this.encabezado(doc, t.titulo, t.subtitulo);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    t.resumen.forEach(linea => {
      doc.text(`• ${linea}`, 14, y);
      y += 5;
    });
    y += 4;

    if (t.filas.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('No hay registros con estos filtros.', 14, y);
    } else {
      this.dibujarTabla(doc, y, t.cols, t.filas, t.alertas);
    }

    this.numerarPaginas(doc);
    return doc;
  }

  private pdfCilindro(c: any, movs: Mov[], sit: Situacion): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = this.encabezado(doc, 'Reporte de cilindro');

    const fila = (etiqueta: string, valor: string) => {
      const lineas: string[] = doc.splitTextToSize(valor || '-', 182 - 46);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`${etiqueta}:`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(lineas, 60, y);
      y += lineas.length * 5 + 1;
    };

    // Situación actual
    const dias = sit.mov ? Math.floor((Date.now() - sit.mov.fecha.getTime()) / 86400000) : 0;
    const situacion =
      sit.estado === 'SIN' || !sit.mov ? 'Sin movimientos registrados'
        : sit.estado === 'FUERA'
          ? `FUERA de planta · lo tiene ${(sit.mov.cliente || 'un cliente sin nombre').toUpperCase()} desde el ${this.fmtCorta(sit.mov.fecha)} (${dias} día(s))`
          : `DENTRO de planta · ${sit.mov.almacen || 'almacén sin especificar'} desde el ${this.fmtCorta(sit.mov.fecha)}`;

    fila('N° de serie', String(c.numero_serie || '-'));
    fila('Situación actual', situacion);
    y += 3;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Características', 14, y);
    y += 6;
    fila('Tipo de gas', String(c.tipo_gas || '-').toUpperCase());
    fila('Propietario', String(c.clientes?.nombre_razon_social || 'SIN CLIENTE').toUpperCase());
    fila('Documento', `${c.clientes?.tipo_documento || 'DOC'}: ${c.clientes?.num_documento || '-'}`);
    fila('Marca', c.marca || '-');
    fila('Año de fabricación', c.anio_fabricacion || '-');
    fila('Capacidad', this.capacidadDe(c));
    fila('Unidad de medida', c.unidad_medida || '-');
    fila('Peso', c.peso ? `${c.peso} kg` : '-');
    fila('Diámetro', c.ancho_diametro ? `${c.ancho_diametro} cm` : '-');
    fila('Altura', c.largo_altura ? `${c.largo_altura} cm` : '-');
    fila('Color', c.color || '-');
    fila('Prueba hidrostática (PH)', c.ph || '-');
    fila('Procedencia', c.procedencia || '-');
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`Historial de movimientos (${movs.length})`, 14, y);
    y += 6;

    if (movs.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text('Este cilindro todavía no tiene ingresos, salidas ni recojos.', 14, y);
    } else {
      // Cronológico (del primero al último)
      const cron = [...movs].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
      this.dibujarTabla(
        doc, y,
        [{ t: 'Fecha y hora', w: 36 }, { t: 'Movimiento', w: 46 }, { t: 'Detalle', w: 100 }],
        cron.map(m => [this.fmtFechaHora(m.fecha), this.tituloMov(m), this.descripcionMov(m)])
      );
    }

    this.numerarPaginas(doc);
    return doc;
  }

  // ---- Acciones de los botones ----

  private nombreArchivo(base: string): string {
    return base.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private abrirParaImprimir(doc: jsPDF) {
    doc.autoPrint();
    window.open(String(doc.output('bloburl')), '_blank');
  }

  descargarCilindroPdf() {
    if (!this.sel) return;
    this.pdfCilindro(this.sel, this.selMovs, this.selSit).save(`reporte_${this.nombreArchivo(this.sel.numero_serie)}.pdf`);
  }

  imprimirCilindro() {
    if (!this.sel) return;
    this.abrirParaImprimir(this.pdfCilindro(this.sel, this.selMovs, this.selSit));
  }

  descargarPdf() {
    if (!this.tabla) return;
    this.pdfTabla(this.tabla).save(`reporte_${this.tabla.id}_${this.isoLocal(new Date())}.pdf`);
  }

  imprimirReporte() {
    if (!this.tabla) return;
    this.abrirParaImprimir(this.pdfTabla(this.tabla));
  }

  /** Excel: se baja como CSV con ";" y acentos correctos, y Excel lo abre directo. */
  descargarExcel() {
    const t = this.tabla;
    if (!t) return;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [
      t.cols.map(c => esc(c.t)).join(';'),
      ...t.filas.map(f => f.map(esc).join(';'))
    ];
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${t.id}_${this.isoLocal(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}