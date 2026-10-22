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
  timeOutline
} from 'ionicons/icons';
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
    addIcons({
      logOutOutline,
      arrowDownCircleOutline,
      exitOutline,
      arrowUpCircleOutline,
      businessOutline,
      peopleOutline,
      documentTextOutline,
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
      timeOutline
    });
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

  navegarA(ruta: string) {
    this.router.navigate([ruta]);
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
    this.resultado = { cilindro, situacion: 'CONSULTANDO', almacenNombre: null, destino: null, fecha: null };
    this.cdr.detectChanges();

    try {
      const serie = normalizarSerie(cilindro.numero_serie);

      const [estado, nombres] = await Promise.all([
        obtenerEstado(this.supabaseService.supabase, serie),
        this.obtenerNombresAlmacenes()
      ]);

      // Si el usuario ya buscó otro cilindro, no se pisa el resultado
      if (!this.resultado || this.resultado.cilindro !== cilindro) return;

      const fecha = this.leerFecha(estado);

      if (estaDentro(estado)) {
        this.resultado = {
          cilindro,
          situacion: 'DENTRO',
          almacenNombre: estado.almacenId ? (nombres[estado.almacenId] || 'ALMACÉN SIN NOMBRE') : null,
          destino: null,
          fecha
        };
      } else if (haSalido(estado)) {
        this.resultado = {
          cilindro,
          situacion: 'FUERA',
          almacenNombre: null,
          destino: estado.destino || null,
          fecha
        };
      } else {
        this.resultado = { cilindro, situacion: 'SIN_MOVIMIENTOS', almacenNombre: null, destino: null, fecha: null };
      }
    } catch (err) {
      console.error('Error al consultar la ubicación:', err);
      if (this.resultado && this.resultado.cilindro === cilindro) {
        this.resultado = { cilindro, situacion: 'SIN_MOVIMIENTOS', almacenNombre: null, destino: null, fecha: null };
      }
    } finally {
      this.cdr.detectChanges();
    }
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