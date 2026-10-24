import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ToastController,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonIcon,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  swapHorizontalOutline,
  scanOutline,
  searchOutline,
  closeCircle,
  trashOutline,
  cubeOutline,
  checkmarkCircle,
  ellipseOutline,
  storefrontOutline,
  documentTextOutline,
  addCircleOutline,
  alertCircle
} from 'ionicons/icons';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { MENSAJE_ESCANER_DESCARGANDO, prepararEscanerQR } from '../services/escaner-qr';
import { SupabaseService } from '../services/supabase';
import { obtenerEstado, estaDentro, normalizarSerie } from '../services/cilindro-estado';

// ======================= Tipos =======================
interface CilindroLista {
  numero_serie: string;
  tipo_gas: string | null;
  marca: string | null;
}

interface CilindroSeleccionado extends CilindroLista {
  almacenId: number | null;   // almacén donde está ahora
  almacenNombre: string;
}

interface DatosReporte {
  id: number | string | null;
  fecha: Date;
  destino: string;
  usuario: string | null;
  observaciones: string | null;
  cilindros: { numero_serie: string; tipo_gas: string | null; marca: string | null; origen: string }[];
}

// Ruta del logo de la empresa (src/assets/logo.png). Cámbiala si usas otra.
const LOGO_PATH = 'assets/logo.png';

@Component({
  selector: 'app-transf-almacenes',
  templateUrl: './transf_almacenes.html',
  styleUrls: ['./transf_almacenes.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonSpinner
  ]
})
export class TransfAlmacenesPage {
  almacenes: { id: number; nombre: string }[] = [];
  destinoId: number | null = null;

  // Lista de cilindros registrados (con búsqueda)
  busqueda: string = '';
  resultados: CilindroLista[] = [];
  buscando = false;
  private temporizador: any;

  // Cilindros elegidos para transferir
  seleccionados: CilindroSeleccionado[] = [];
  validando = new Set<string>();

  observaciones: string = '';
  guardando = false;
  generandoPdf = false;

  // Última transferencia registrada (para descargar su reporte)
  ultima: DatosReporte | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({
      swapHorizontalOutline, scanOutline, searchOutline, closeCircle, trashOutline,
      cubeOutline, checkmarkCircle, ellipseOutline, storefrontOutline,
      documentTextOutline, addCircleOutline, alertCircle
    });
  }

  async ionViewWillEnter() {
    await this.cargarAlmacenes();
    this.buscar();
  }

  // =====================================================
  //                     ALMACENES
  // =====================================================
  async cargarAlmacenes() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('almacenes')
        .select('id, nombre')
        .order('nombre', { ascending: true });
      if (error) throw error;
      this.almacenes = data || [];
    } catch (err: any) {
      this.mostrarToast('No se pudieron cargar los almacenes: ' + (err.message || err), 'danger');
    } finally {
      this.cdr.detectChanges();
    }
  }

  nombreAlmacen(id: number | null): string {
    const a = this.almacenes.find(x => x.id === Number(id));
    return a ? a.nombre : '';
  }

  // =====================================================
  //            LISTA DE CILINDROS REGISTRADOS
  // =====================================================
  alEscribir() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.buscar(), 350);
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.buscar();
  }

  async buscar() {
    this.buscando = true;
    this.cdr.detectChanges();
    try {
      const termino = (this.busqueda || '').trim();
      let consulta = this.supabaseService.supabase
        .from('cilindros')
        .select('numero_serie, tipo_gas, marca')
        .order('numero_serie', { ascending: true })
        .limit(40);

      if (termino) {
        const escapado = termino.replace(/[\\%_]/g, m => '\\' + m);
        consulta = consulta.ilike('numero_serie', `%${escapado}%`);
      }

      const { data, error } = await consulta;
      if (error) throw error;
      this.resultados = data || [];
    } catch (err: any) {
      this.mostrarToast('Error al buscar cilindros: ' + (err.message || err), 'danger');
    } finally {
      this.buscando = false;
      this.cdr.detectChanges();
    }
  }

  // =====================================================
  //                 ELEGIR CILINDROS
  // =====================================================
  estaElegido(serie: string): boolean {
    return this.indiceElegido(serie) >= 0;
  }

  private indiceElegido(serie: string): number {
    const clave = normalizarSerie(serie);
    return this.seleccionados.findIndex(c => normalizarSerie(c.numero_serie) === clave);
  }

  async alternar(c: CilindroLista) {
    const i = this.indiceElegido(c.numero_serie);
    if (i >= 0) {
      this.seleccionados.splice(i, 1);
      return;
    }
    const error = await this.agregar(c);
    if (error) this.mostrarToast(error, 'warning');
  }

  quitar(i: number) {
    this.seleccionados.splice(i, 1);
  }

  // Comprueba dónde está el cilindro y lo agrega. Devuelve un mensaje si no se pudo.
  private async agregar(c: CilindroLista): Promise<string | null> {
    if (this.validando.has(c.numero_serie)) return null;
    this.validando.add(c.numero_serie);
    this.cdr.detectChanges();

    try {
      const estado: any = await obtenerEstado(this.supabaseService.supabase, normalizarSerie(c.numero_serie));
      if (!estaDentro(estado)) {
        return `El cilindro ${c.numero_serie} no está dentro de planta.`;
      }

      // Si ya fue transferido antes, el almacén actual es el de la última transferencia
      const transf = await this.almacenPorTransferencia(c.numero_serie, estado);
      const almacenId = transf ?? (estado.almacenId ? Number(estado.almacenId) : null);

      this.seleccionados.unshift({
        ...c,
        almacenId,
        almacenNombre: this.nombreAlmacen(almacenId) || 'SIN ALMACÉN'
      });
      return null;
    } catch (err: any) {
      return `Error al consultar ${c.numero_serie}: ${err.message || err}`;
    } finally {
      this.validando.delete(c.numero_serie);
      this.cdr.detectChanges();
    }
  }

  // Almacén de destino de la última transferencia del cilindro, si es posterior a su último ingreso
  private async almacenPorTransferencia(numeroSerie: string, estado: any): Promise<number | null> {
    try {
      const filtro = JSON.stringify([{ numero_serie: numeroSerie }]);
      const { data, error } = await this.supabaseService.supabase
        .from('transferencias_almacenes')
        .select('almacen_destino_id, created_at')
        .contains('cilindros_transferidos', filtro)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return null;

      const fecha = new Date(data[0].created_at);
      const crudo = estado?.fecha ?? estado?.fechaMovimiento ?? estado?.fecha_movimiento ??
        estado?.fechaSalida ?? estado?.created_at ?? null;
      if (crudo) {
        const solo = String(crudo).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const base = solo ? new Date(Number(solo[1]), Number(solo[2]) - 1, Number(solo[3])) : new Date(crudo);
        if (!isNaN(base.getTime()) && fecha < base) return null; // volvió a ingresar después
      }
      return Number(data[0].almacen_destino_id);
    } catch {
      return null;
    }
  }

  // Cilindros que ya están en el almacén de destino elegido (no se pueden transferir ahí)
  get yaEnDestino(): CilindroSeleccionado[] {
    if (!this.destinoId) return [];
    return this.seleccionados.filter(c => c.almacenId === Number(this.destinoId));
  }

  // =====================================================
  //            ESCÁNER (continuo: varios seguidos)
  // =====================================================
  async abrirEscaner() {
    try {
      const status = await BarcodeScanner.requestPermissions();
      if (!status.camera) {
        this.mostrarToast('Permiso de cámara denegado.', 'warning');
        return;
      }
      if (!(await prepararEscanerQR())) {
        this.mostrarToast(MENSAJE_ESCANER_DESCARGANDO, 'warning');
        return;
      }

      let agregados = 0;
      while (true) {
        const { barcodes } = await BarcodeScanner.scan();
        const codigo = barcodes.length > 0 ? (barcodes[0].rawValue || '').trim() : '';
        if (!codigo) break; // cámara cerrada: se termina

        const cil = await this.buscarExacto(codigo);
        if (!cil) {
          this.mostrarToast(`No existe ningún cilindro con la serie "${codigo}".`, 'warning');
          continue;
        }
        if (this.estaElegido(cil.numero_serie)) {
          this.mostrarToast(`El cilindro ${cil.numero_serie} ya está elegido.`, 'warning');
          continue;
        }
        const error = await this.agregar(cil);
        if (error) this.mostrarToast(error, 'warning');
        else agregados++;
      }
      if (agregados > 0) this.mostrarToast(`${agregados} cilindro(s) agregado(s).`, 'success');
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (!/cancel/i.test(msg)) this.mostrarToast('Error al escanear: ' + msg, 'danger');
    } finally {
      this.cdr.detectChanges();
    }
  }

  private async buscarExacto(serie: string): Promise<CilindroLista | null> {
    const escapado = serie.replace(/[\\%_]/g, m => '\\' + m);
    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select('numero_serie, tipo_gas, marca')
      .ilike('numero_serie', escapado)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  }

  // =====================================================
  //                    CONFIRMAR
  // =====================================================
  get puedeConfirmar(): boolean {
    return !!this.destinoId && this.seleccionados.length > 0 &&
      this.yaEnDestino.length === 0 && !this.guardando;
  }

  async confirmar() {
    if (!this.puedeConfirmar) return;

    this.guardando = true;
    this.cdr.detectChanges();

    const email = localStorage.getItem('emailUsuario') || null;
    const nombre = localStorage.getItem('nombreUsuario') || null;
    const lista = [...this.seleccionados];

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('transferencias_almacenes')
        .insert({
          almacen_destino_id: Number(this.destinoId),
          cilindros_transferidos: lista.map(c => ({
            numero_serie: c.numero_serie,
            almacen_origen_id: c.almacenId
          })),
          cantidad: lista.length,
          observaciones: this.observaciones.trim() || null,
          usuario_email: email
        })
        .select('id, created_at')
        .single();
      if (error) throw error;

      this.ultima = {
        id: data?.id ?? null,
        fecha: data?.created_at ? new Date(data.created_at) : new Date(),
        destino: this.nombreAlmacen(this.destinoId),
        usuario: nombre ? (email ? `${nombre} (${email})` : nombre) : email,
        observaciones: this.observaciones.trim() || null,
        cilindros: lista.map(c => ({
          numero_serie: c.numero_serie,
          tipo_gas: c.tipo_gas,
          marca: c.marca,
          origen: c.almacenNombre
        }))
      };

      this.mostrarToast(`${lista.length} cilindro(s) enviado(s) a ${this.ultima.destino}.`, 'success');
      this.seleccionados = [];
      this.observaciones = '';
      this.destinoId = null;
    } catch (err: any) {
      this.mostrarToast('No se pudo registrar la transferencia: ' + (err.message || err), 'danger');
    } finally {
      this.guardando = false;
      this.cdr.detectChanges();
    }
  }

  nuevaTransferencia() {
    this.ultima = null;
  }

  // =====================================================
  //                   REPORTE PDF
  // =====================================================
  async descargarReporte() {
    if (!this.ultima || this.generandoPdf) return;
    this.generandoPdf = true;
    this.cdr.detectChanges();
    try {
      const doc = await this.generarPdf(this.ultima);
      const num = this.ultima.id !== null ? String(this.ultima.id).padStart(6, '0') : 'nueva';
      const nombre = `Transferencia_${num}.pdf`;

      doc.save(nombre);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (!/cancel/i.test(msg)) this.mostrarToast('No se pudo generar el reporte: ' + msg, 'danger');
    } finally {
      this.generandoPdf = false;
      this.cdr.detectChanges();
    }
  }

  private async cargarLogo(): Promise<{ data: string; w: number; h: number } | null> {
    try {
      const resp = await fetch(LOGO_PATH);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) return null;

      const data: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej();
        r.readAsDataURL(blob);
      });
      const dim: { w: number; h: number } = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => rej();
        img.src = data;
      });
      return { data, ...dim };
    } catch {
      return null;
    }
  }

  private async generarPdf(datos: DatosReporte): Promise<any> {
    // Se carga bajo demanda para no hacer pesada la app al abrir
    const { jsPDF } = await import('jspdf');

    const VERDE: [number, number, number] = [23, 124, 77];
    const VERDE_CLARO: [number, number, number] = [232, 245, 238];
    const MORADO: [number, number, number] = [124, 58, 237];
    const GRIS: [number, number, number] = [95, 108, 115];
    const OSCURO: [number, number, number] = [44, 62, 80];

    const fmtFecha = (d: Date) =>
      d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtHora = (d: Date) =>
      d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true });

    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const margen = 14;

    // ---------- Cabecera con logo ----------
    doc.setFillColor(...VERDE);
    doc.rect(0, 0, ancho, 34, 'F');

    const logo = await this.cargarLogo();
    let xTexto = margen;
    if (logo) {
      const maxH = 22, maxW = 46;
      const esc = Math.min(maxW / logo.w, maxH / logo.h);
      const w = logo.w * esc, h = logo.h * esc;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margen, 5.5, w + 4, h + 4, 2, 2, 'F');
      doc.addImage(logo.data, 'PNG', margen + 2, 7.5, w, h);
      xTexto = margen + w + 10;
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('ELECTRAMETAL', xTexto, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('NORPERÚ S.A.C.', xTexto, 22);

    doc.setFontSize(9);
    doc.text(fmtFecha(datos.fecha), ancho - margen, 14, { align: 'right' });
    doc.text(fmtHora(datos.fecha), ancho - margen, 19.5, { align: 'right' });

    // ---------- Título ----------
    doc.setTextColor(...OSCURO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('REPORTE DE TRANSFERENCIA ENTRE ALMACENES', margen, 46);
    doc.setDrawColor(...MORADO);
    doc.setLineWidth(0.8);
    doc.line(margen, 49, margen + 30, 49);

    // ---------- Datos generales ----------
    doc.setFontSize(9.5);
    const filas: [string, string][] = [
      ['N.º de transferencia', datos.id !== null ? String(datos.id).padStart(6, '0') : '-'],
      ['Fecha', fmtFecha(datos.fecha)],
      ['Hora', fmtHora(datos.fecha)],
      ['Registrado por', datos.usuario || '-']
    ];
    let y = 57;
    filas.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GRIS);
      doc.text(k + ':', margen, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...OSCURO);
      doc.text(v, margen + 42, y);
      y += 6;
    });

    // ---------- Origen -> Destino ----------
    y += 3;
    const origenes = Array.from(new Set(datos.cilindros.map(c => c.origen)));
    const textoOrigen = origenes.length === 1 ? origenes[0] : `VARIOS ALMACENES (${origenes.length})`;

    const cajaW = (ancho - margen * 2 - 16) / 2;
    const cajaH = 20;
    const dibujaCaja = (x: number, titulo: string, nombre: string) => {
      doc.setFillColor(...VERDE_CLARO);
      doc.roundedRect(x, y, cajaW, cajaH, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(titulo, x + 5, y + 7);
      doc.setFontSize(12);
      doc.setTextColor(...OSCURO);
      doc.text(doc.splitTextToSize(nombre || '-', cajaW - 10)[0], x + 5, y + 14.5);
    };
    dibujaCaja(margen, origenes.length === 1 ? 'ALMACÉN DE ORIGEN' : 'ORIGEN', textoOrigen);
    dibujaCaja(ancho - margen - cajaW, 'ALMACÉN DE DESTINO', datos.destino);

    const cx = ancho / 2, cy = y + cajaH / 2;
    doc.setDrawColor(...MORADO);
    doc.setFillColor(...MORADO);
    doc.setLineWidth(1);
    doc.line(cx - 5, cy, cx + 3, cy);
    doc.triangle(cx + 5, cy, cx + 1, cy - 2.5, cx + 1, cy + 2.5, 'F');

    y += cajaH + 9;

    // ---------- Tabla de cilindros ----------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...OSCURO);
    doc.text(`Cilindros transferidos (${datos.cilindros.length})`, margen, y);

    // Tabla dibujada a mano (se repite el encabezado si pasa a otra página)
    const cols = [
      { t: 'N.º', x: margen + 2, w: 12 },
      { t: 'N.º de serie', x: margen + 16, w: 45 },
      { t: 'Tipo de gas', x: margen + 62, w: 40 },
      { t: 'Marca', x: margen + 104, w: 32 },
      { t: 'Salió de', x: margen + 138, w: 42 }
    ];
    const anchoTabla = ancho - margen * 2;
    const filaH = 7;
    const dibujaEncabezado = (yy: number) => {
      doc.setFillColor(...VERDE);
      doc.rect(margen, yy, anchoTabla, filaH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      cols.forEach(c => doc.text(c.t, c.x, yy + 4.8));
    };

    let yt = y + 3;
    dibujaEncabezado(yt);
    yt += filaH;
    datos.cilindros.forEach((c, i) => {
      if (yt + filaH > alto - 22) {
        doc.addPage();
        yt = 20;
        dibujaEncabezado(yt);
        yt += filaH;
      }
      if (i % 2 === 0) {
        doc.setFillColor(247, 250, 248);
        doc.rect(margen, yt, anchoTabla, filaH, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...OSCURO);
      const fila = [String(i + 1), c.numero_serie, c.tipo_gas || 'NO ESPECIFICADO', c.marca || '-', c.origen];
      fila.forEach((txt, k) => doc.text(String(doc.splitTextToSize(txt, cols[k].w)[0]), cols[k].x, yt + 4.8));
      yt += filaH;
    });

    y = yt + 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...MORADO);
    doc.text(`Total de cilindros: ${datos.cilindros.length}`, ancho - margen, y, { align: 'right' });
    y += 8;

    if (datos.observaciones) {
      if (y > alto - 70) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.setTextColor(...GRIS);
      doc.text('Observaciones:', margen, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...OSCURO);
      const lineas = doc.splitTextToSize(datos.observaciones, ancho - margen * 2);
      doc.text(lineas, margen, y + 5);
      y += 5 + lineas.length * 4.5 + 4;
    }

    // ---------- Firmas ----------
    if (y > alto - 60) { doc.addPage(); y = 20; }
    const yFirma = Math.max(y + 22, alto - 48);
    doc.setDrawColor(...GRIS);
    doc.setLineWidth(0.3);
    const fW = 60;
    doc.line(margen + 8, yFirma, margen + 8 + fW, yFirma);
    doc.line(ancho - margen - 8 - fW, yFirma, ancho - margen - 8, yFirma);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS);
    doc.text('Entregado por', margen + 8 + fW / 2, yFirma + 5, { align: 'center' });
    doc.text('Recibido por', ancho - margen - 8 - fW / 2, yFirma + 5, { align: 'center' });

    // ---------- Pie de página ----------
    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setDrawColor(...VERDE);
      doc.setLineWidth(0.5);
      doc.line(margen, alto - 14, ancho - margen, alto - 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text('ELECTRAMETAL NORPERÚ S.A.C.', margen, alto - 9);
      doc.text(`Página ${p} de ${paginas}`, ancho - margen, alto - 9, { align: 'right' });
    }

    return doc;
  }

  async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastController.create({ message: mensaje, duration: 3200, color, position: 'bottom' });
    await toast.present();
  }
}