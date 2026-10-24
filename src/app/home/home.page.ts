import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonIcon,
  IonButton,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  documentTextOutline,
  logOutOutline,
  businessOutline,
  peopleOutline,
  exitOutline,
  barcodeOutline,
  searchOutline,
  scanOutline,
  closeCircle,
  checkmarkCircle,
  alertCircle,
  helpCircle,
  locationOutline,
  flaskOutline,
  chevronForwardOutline,
  cubeOutline,
  timeOutline, storefrontOutline, swapHorizontalOutline } from 'ionicons/icons';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { MENSAJE_ESCANER_DESCARGANDO, prepararEscanerQR } from '../services/escaner-qr';
import { SupabaseService } from '../services/supabase';
import { obtenerEstado, estaDentro, haSalido, normalizarSerie, EstadoCilindro } from '../services/cilindro-estado';
import { IonModal, IonTitle } from "@ionic/angular";

interface ResultadoCilindro {
  cilindro: any;
  // DENTRO: está en un almacén | FUERA: salió de planta | SIN_MOVIMIENTOS: sin ingreso/salida | CONSULTANDO: cargando
  situacion: 'DENTRO' | 'FUERA' | 'SIN_MOVIMIENTOS' | 'CONSULTANDO';
  almacenNombre: string | null;
  destino: string | null;   // con quién está cuando salió
  fecha: string | null;     // fecha del último movimiento (dd/mm/aaaa), si el estado la trae
  estadoCilindro: string | null; // estado con el que se registró el cilindro (ej. LLENO, VACÍO...)
  viaTransferencia?: boolean;    // true si el almacén actual viene de una transferencia entre almacenes
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonTitle, IonModal, 
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonCard,
    IonCardContent,
    IonIcon,
    IonButton,
    IonSpinner
  ]
})
export class HomePage implements OnInit {
  saludo: string = 'Bienvenido';
  nombre: string = 'Usuario';

  // ---------------- Buscador de cilindro ----------------
  serieBusqueda: string = '';
  buscando: boolean = false;
  noEncontrado: boolean = false;
  sugerencias: any[] = [];
  resultado: ResultadoCilindro | null = null;

  // Nombres de los almacenes (id -> nombre), se cargan una sola vez
  private almacenesNombre: { [id: number]: string } | null = null;

  private readonly COLUMNAS_CILINDRO = `
    numero_serie, tipo_gas, marca, anio_fabricacion, unidad_medida,
    peso, ancho_diametro, largo_altura, litros, contenido, color, ph,
    procedencia,
    clientes ( nombre_razon_social, tipo_documento, num_documento )
  `;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({logOutOutline,barcodeOutline,searchOutline,closeCircle,scanOutline,helpCircle,chevronForwardOutline,flaskOutline,checkmarkCircle,alertCircle,cubeOutline,businessOutline,arrowDownCircleOutline,exitOutline,arrowUpCircleOutline,storefrontOutline,peopleOutline,timeOutline,documentTextOutline,locationOutline,swapHorizontalOutline});
  }

  async ngOnInit() {
    await this.obtenerDatosUsuario();
  }

  ionViewWillEnter() {
    this.obtenerDatosUsuario();
  }

  async obtenerDatosUsuario() {
    // 1. Lectura inmediata local
    const localNombre = localStorage.getItem('nombreUsuario');
    const localSaludo = localStorage.getItem('saludoUsuario');

    if (localNombre) this.nombre = localNombre;
    if (localSaludo) this.saludo = localSaludo;

    // 2. Obtener usuario directo de Supabase
    try {
      const user = await this.supabaseService.getUser();

      if (user) {
        if (user.email) {
          localStorage.setItem('emailUsuario', user.email);
        }

        const metadata = user.user_metadata;
        if (metadata) {
          if (metadata['nombre']) {
            this.nombre = metadata['nombre'];
            localStorage.setItem('nombreUsuario', this.nombre);
          }

          if (metadata['saludo']) {
            this.saludo = metadata['saludo'];
          } else if (metadata['genero']) {
            this.saludo = metadata['genero'] === 'Femenino' ? 'Bienvenida' : 'Bienvenido';
          }
          localStorage.setItem('saludoUsuario', this.saludo);
        }
      }
    } catch (e) {
      console.error('Error al obtener usuario:', e);
    }
  }

  async navegarA(ruta: string) {
    try {
      const abrio = await this.router.navigate([ruta]);
      if (!abrio) this.mostrarToast('No se pudo abrir la pantalla (' + ruta + ').', 'warning');
    } catch (err: any) {
      // Ej.: la ruta no está registrada en app.routes.ts
      this.mostrarToast('No se pudo abrir ' + ruta + ': ' + (err?.message || err), 'danger');
    }
  }

  async cerrarSesion() {
    localStorage.clear();
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }

  // =====================================================
  //                BUSCADOR DE CILINDRO
  // =====================================================

  // Al tocar el campo se cargan los nombres de almacenes en segundo plano
  precargarUbicaciones() {
    this.obtenerNombresAlmacenes().catch(() => { });
  }

  limpiarBusqueda() {
    this.serieBusqueda = '';
    this.noEncontrado = false;
    this.sugerencias = [];
    this.resultado = null;
  }

  async buscarCilindro() {
    const termino = (this.serieBusqueda || '').trim();
    if (!termino) return;

    this.buscando = true;
    this.noEncontrado = false;
    this.sugerencias = [];
    this.resultado = null;
    this.cdr.detectChanges();

    this.precargarUbicaciones();

    try {
      const escapado = termino.replace(/[\\%_]/g, m => '\\' + m);

      // 1) Coincidencia exacta (sin distinguir mayúsculas)
      let { data, error } = await this.supabaseService.supabase
        .from('cilindros')
        .select(this.COLUMNAS_CILINDRO)
        .ilike('numero_serie', escapado)
        .limit(5);

      if (error) throw error;

      // 2) Si no hay exacta, coincidencias parciales
      if (!data || data.length === 0) {
        const parcial = await this.supabaseService.supabase
          .from('cilindros')
          .select(this.COLUMNAS_CILINDRO)
          .ilike('numero_serie', `%${escapado}%`)
          .order('numero_serie', { ascending: true })
          .limit(10);

        if (parcial.error) throw parcial.error;
        data = parcial.data;
      }

      if (!data || data.length === 0) {
        this.noEncontrado = true;
      } else if (data.length === 1) {
        await this.mostrarCilindro(data[0]);
      } else {
        this.sugerencias = data;
      }
    } catch (err) {
      console.error('Error al buscar el cilindro:', err);
      this.noEncontrado = true;
    } finally {
      this.buscando = false;
      this.cdr.detectChanges();
    }
  }

  async elegirSugerencia(cilindro: any) {
    this.sugerencias = [];
    this.serieBusqueda = cilindro.numero_serie;
    await this.mostrarCilindro(cilindro);
  }

  // Muestra los datos del cilindro de inmediato y completa la ubicación al terminar de consultarla.
  // Usa obtenerEstado (un solo cilindro), igual que la pantalla de Ingreso.
  private async mostrarCilindro(cilindro: any) {
    this.resultado = { cilindro, situacion: 'CONSULTANDO', almacenNombre: null, destino: null, fecha: null, estadoCilindro: null };
    this.cdr.detectChanges();

    try {
      const serie = normalizarSerie(cilindro.numero_serie);

      const [estado, nombres, estadoIngreso] = await Promise.all([
        obtenerEstado(this.supabaseService.supabase, serie),
        this.obtenerNombresAlmacenes(),
        this.obtenerEstadoIngreso(cilindro.numero_serie)
      ]);

      // Si el usuario ya buscó otro cilindro, no se pisa el resultado
      if (!this.resultado || this.resultado.cilindro !== cilindro) return;

      const fecha = this.leerFecha(estado);
      const estadoCilindro = estadoIngreso || this.leerEstadoCilindro(estado, cilindro);

      if (estaDentro(estado)) {
        // Si fue transferido a otro almacén después de ingresar, manda el almacén de destino
        const transf = await this.ubicacionPorTransferencia(cilindro.numero_serie, estado);
        if (!this.resultado || this.resultado.cilindro !== cilindro) return;

        const almacenId = transf ? transf.almacenId : estado.almacenId;
        this.resultado = {
          cilindro,
          situacion: 'DENTRO',
          almacenNombre: almacenId ? (nombres[almacenId] || 'ALMACÉN SIN NOMBRE') : null,
          destino: null,
          fecha: transf ? transf.fecha : fecha,
          estadoCilindro,
          viaTransferencia: !!transf
        };
      } else if (haSalido(estado)) {
        this.resultado = {
          cilindro,
          situacion: 'FUERA',
          almacenNombre: null,
          destino: estado.destino || null,
          fecha,
          estadoCilindro
        };
      } else {
        this.resultado = { cilindro, situacion: 'SIN_MOVIMIENTOS', almacenNombre: null, destino: null, fecha: null, estadoCilindro };
      }
    } catch (err) {
      console.error('Error al consultar la ubicación:', err);
      if (this.resultado && this.resultado.cilindro === cilindro) {
        this.resultado = { cilindro, situacion: 'SIN_MOVIMIENTOS', almacenNombre: null, destino: null, fecha: null, estadoCilindro: null };
      }
    } finally {
      this.cdr.detectChanges();
    }
  }

  // Busca en los ingresos el más reciente que contiene esta serie y devuelve el estado
  // con el que se ingresó (LLENO, VACÍO, P.H., etc.), tal como se eligió en la pantalla de Ingreso.
  private async obtenerEstadoIngreso(numeroSerie: string): Promise<string | null> {
    if (!numeroSerie) return null;

    // Se prueba con la serie tal cual y, si es distinta, con la serie normalizada
    const variantes = Array.from(new Set([numeroSerie, normalizarSerie(numeroSerie)])).filter(v => !!v);

    for (const serie of variantes) {
      const estado = await this.consultarEstadoIngreso(serie);
      if (estado) return estado;
    }
    return null;
  }

  private async consultarEstadoIngreso(serie: string): Promise<string | null> {
    try {
      // Para columnas JSONB el filtro debe enviarse como texto JSON
      const filtro = JSON.stringify([{ numero_serie: serie }]);

      let { data, error } = await this.supabaseService.supabase
        .from('ingreso_cilindros')
        .select('estado')
        .contains('cilindros_ingresados', filtro)
        .order('created_at', { ascending: false })
        .limit(1);

      // Si la tabla no tiene created_at, se reintenta sin ordenar
      if (error) {
        const reintento = await this.supabaseService.supabase
          .from('ingreso_cilindros')
          .select('estado')
          .contains('cilindros_ingresados', filtro)
          .limit(1);
        data = reintento.data;
        error = reintento.error;
      }

      if (error) {
        console.error('Error al consultar el estado de ingreso:', error.message);
        return null;
      }
      if (!data || data.length === 0) return null;

      return this.formatearEstadoIngreso(data[0].estado);
    } catch (err) {
      console.error('Error al consultar el estado de ingreso:', err);
      return null;
    }
  }

  // Convierte el valor guardado en un texto legible
  private formatearEstadoIngreso(valor: any): string | null {
    const v = String(valor || '').trim().toUpperCase();
    if (!v) return null;

    const nombres: { [k: string]: string } = {
      'LLENO': 'LLENO',
      'VACIO': 'VACÍO',
      'P.H.': 'PRUEBA HIDROSTÁTICA (P.H.)',
      'CAMBIO_VALVULA': 'CAMBIO DE VÁLVULA',
      'DEVOLUCION': 'DEVOLUCIÓN'
    };
    return nombres[v] || v.replace(/_/g, ' ');
  }

  // Lee el estado con el que se registró el cilindro (acepta varios nombres de campo)
  private leerEstadoCilindro(estado: EstadoCilindro, cilindro: any): string | null {
    const e: any = estado || {};
    const crudo =
      e.estadoCilindro ?? e.estado_cilindro ?? e.estadoIngreso ?? e.estado_ingreso ??
      e.condicion ?? e.estadoLlenado ?? e.estado_llenado ?? e.contenidoEstado ??
      (typeof e.estado === 'string' ? e.estado : null) ??
      cilindro?.estado_cilindro ?? cilindro?.estado ?? null;

    const texto = crudo ? String(crudo).trim() : '';
    return texto ? texto.toUpperCase() : null;
  }

  // Color del estado: LLENO (verde), VACÍO (gris), cualquier otro (ámbar)
  obtenerClaseEstado(estado: string | null | undefined): string {
    if (!estado) return '';
    const v = estado.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (v.includes('LLENO')) return 'est-lleno';
    if (v.includes('VACIO')) return 'est-vacio';
    return 'est-otro';
  }

  // Lee la fecha del último movimiento si el estado la trae (acepta varios nombres de campo)
  private leerFecha(estado: EstadoCilindro): string | null {
    const e: any = estado;
    const crudo = e?.fecha ?? e?.fechaMovimiento ?? e?.fecha_movimiento ?? e?.fechaSalida ?? e?.created_at ?? null;
    if (!crudo) return null;

    let d: Date;
    const soloFecha = String(crudo).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (soloFecha) {
      // Se arma con año/mes/día locales para que no se corra un día por la zona horaria
      d = new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
    } else {
      d = new Date(crudo);
    }
    if (isNaN(d.getTime())) return null;

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  // Si el cilindro fue transferido a otro almacén DESPUÉS de su último ingreso, manda el almacén de destino
  private async ubicacionPorTransferencia(numeroSerie: string, estado: any): Promise<{ almacenId: number; fecha: string | null } | null> {
    try {
      const filtro = JSON.stringify([{ numero_serie: numeroSerie }]);
      const { data, error } = await this.supabaseService.supabase
        .from('transferencias_almacenes')
        .select('almacen_destino_id, created_at')
        .contains('cilindros_transferidos', filtro)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return null;

      const fechaTransf = new Date(data[0].created_at);
      if (isNaN(fechaTransf.getTime())) return null;

      // Si el estado trae la fecha de su último movimiento y es posterior, no se aplica la transferencia
      const crudo = estado?.fecha ?? estado?.fechaMovimiento ?? estado?.fecha_movimiento ?? estado?.fechaSalida ?? estado?.created_at ?? null;
      if (crudo) {
        const solo = String(crudo).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const base = solo ? new Date(Number(solo[1]), Number(solo[2]) - 1, Number(solo[3])) : new Date(crudo);
        if (!isNaN(base.getTime()) && fechaTransf < base) return null;
      }

      return {
        almacenId: Number(data[0].almacen_destino_id),
        fecha: this.leerFecha({ fecha: data[0].created_at } as any)
      };
    } catch {
      return null;
    }
  }

  private async obtenerNombresAlmacenes(): Promise<{ [id: number]: string }> {
    if (this.almacenesNombre) return this.almacenesNombre;

    const { data, error } = await this.supabaseService.supabase
      .from('almacenes')
      .select('id, nombre');

    if (error) throw error;

    const mapa: { [id: number]: string } = {};
    (data || []).forEach((a: any) => { mapa[a.id] = a.nombre; });
    this.almacenesNombre = mapa;
    return mapa;
  }

  // Color según el gas (las mezclas van primero para no confundirlas con ARGÓN)
  obtenerClaseGas(tipoGas: string | null | undefined): string {
    if (!tipoGas) return '';

    const valor = tipoGas
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

    if (valor.includes('STARGOLD') || valor.includes('STARGOR') || valor.includes('MEZCLA')) return 'gas-mezcla';
    if (valor.includes('OXIGENO')) return 'gas-oxigeno';
    if (valor.includes('ACETILENO')) return 'gas-acetileno';
    if (valor.includes('ARGON')) return 'gas-argon';
    if (valor.includes('NITROGENO')) return 'gas-nitrogeno';
    if (valor.includes('DIOXIDO') || valor.includes('CO2')) return 'gas-co2';

    return '';
  }

  // =====================================================
  //     ESCÁNER (el mismo que usa la pantalla de Ingreso)
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

      const { barcodes } = await BarcodeScanner.scan();

      if (barcodes.length > 0) {
        const codigoLeido = barcodes[0].rawValue;
        if (codigoLeido) {
          this.serieBusqueda = codigoLeido.trim();
          this.cdr.detectChanges();
          await this.buscarCilindro();
        }
      }
    } catch (err: any) {
      this.mostrarToast('Error al escanear: ' + (err.message || err), 'danger');
    }
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