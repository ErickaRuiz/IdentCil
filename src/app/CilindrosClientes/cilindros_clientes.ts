import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import { cargarEstados, estaDentro, haSalido, normalizarSerie, EstadoCilindro } from '../services/cilindro-estado';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonModal,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  personOutline,
  cardOutline,
  cubeOutline,
  chevronForwardOutline,
  flaskOutline,
  closeOutline,
  peopleOutline,
  callOutline,
  mailOutline,
  locationOutline,
  businessOutline,
  timeOutline,
  archiveOutline,
  searchOutline,
  logoWhatsapp,
  swapHorizontalOutline
} from 'ionicons/icons';

/**
 * Un cliente con DNI (persona natural). "Propios" = cilindros cuya
 * PROPIEDAD (cilindros.cliente_id, definida al Registrar Cilindro) es este
 * cliente. "Prestados" = cilindros de CUALQUIER dueño que este cliente
 * tiene AHORA MISMO porque le hicieron una Salida y todavía no se recoge
 * (mismo cálculo que usa la pantalla de Recojo).
 */
interface ClienteConCilindros {
  id: number;
  nombre: string;
  numDocumento: string;
  telefono: string;
  email: string;
  direccion: string;
  cantidadPropios: number;
  cantidadPrestados: number;
}

@Component({
  selector: 'app-cilindros-clientes',
  templateUrl: './cilindros_clientes.html',
  styleUrls: ['./cilindros_clientes.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonModal,
    IonSpinner
  ]
})
export class CilindrosClientesPage implements OnInit {

  cargando: boolean = false;
  filtro: string = '';

  listaClientes: ClienteConCilindros[] = [];
  clientesFiltrados: ClienteConCilindros[] = [];

  // cliente_id -> cilindros que le pertenecen (propiedad)
  private propiosPorCliente: Map<number, any[]> = new Map();
  // cliente_id -> cilindros que tiene prestados ahora mismo (por una Salida sin recoger)
  private prestadosPorCliente: Map<number, any[]> = new Map();

  private mapaAlmacenes: { [id: number]: string } = {};

  // --- Modal de detalle: cilindros de UN cliente ---
  modalAbierto: boolean = false;
  clienteSeleccionado: ClienteConCilindros | null = null;
  cilindrosPropiosDelCliente: any[] = [];
  cilindrosPrestadosDelCliente: any[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({
      arrowBackOutline,
      personOutline,
      cardOutline,
      cubeOutline,
      chevronForwardOutline,
      flaskOutline,
      closeOutline,
      peopleOutline,
      callOutline,
      mailOutline,
      locationOutline,
      businessOutline,
      timeOutline,
      archiveOutline,
      searchOutline,
      logoWhatsapp,
      swapHorizontalOutline
    });
  }

  ngOnInit() {
    this.cargarClientesConCilindros();
  }

  ionViewWillEnter() {
    this.cargarClientesConCilindros();
  }

  regresar() {
    this.navCtrl.back();
  }

  /**
   * Trae los clientes con DNI, los cilindros que les pertenecen (propiedad)
   * y los que tienen prestados ahora mismo (una Salida hacia ellos que aún
   * no se recoge), calculado con el mismo historial que usa Recojo.
   */
  async cargarClientesConCilindros() {
    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      const [clientesRes, almacenesRes, estados] = await Promise.all([
        this.supabaseService.supabase
          .from('clientes')
          .select('id, nombre_razon_social, num_documento, telefono, email, direccion')
          .eq('tipo_documento', 'DNI')
          .order('nombre_razon_social', { ascending: true }),
        this.supabaseService.supabase
          .from('almacenes')
          .select('id, nombre'),
        cargarEstados(this.supabaseService.supabase).catch((err: any) => {
          console.error('Error al calcular el estado de los cilindros:', err);
          return new Map<string, EstadoCilindro>();
        })
      ]);

      if (clientesRes.error) {
        console.error('Error al cargar clientes DNI:', clientesRes.error);
        this.listaClientes = [];
        this.clientesFiltrados = [];
        return;
      }

      this.mapaAlmacenes = {};
      (almacenesRes.data || []).forEach((a: any) => { this.mapaAlmacenes[a.id] = a.nombre; });

      const clientesDni = clientesRes.data || [];
      const idsDni = new Set(clientesDni.map((c: any) => c.id));

      // --- 1) PROPIOS: cilindros cuyo cliente_id (propietario) es uno de estos clientes ---
      this.propiosPorCliente = new Map();
      if (idsDni.size > 0) {
        const { data: cilindros, error: errorCil } = await this.supabaseService.supabase
          .from('cilindros')
          .select('*')
          .in('cliente_id', Array.from(idsDni));

        if (errorCil) {
          console.error('Error al cargar los cilindros propios de los clientes:', errorCil);
        } else {
          (cilindros || []).forEach((c: any) => {
            const est = estados.get(normalizarSerie(c.numero_serie));
            const lista = this.propiosPorCliente.get(c.cliente_id) || [];
            lista.push(this.armarFila(c, est));
            this.propiosPorCliente.set(c.cliente_id, lista);
          });
        }
      }

      // --- 2) PRESTADOS: última Salida de cada serie que sigue vigente
      // (todavía no se recoge) y cuyo cliente destino es uno de estos DNI ---
      const seriesPrestadasPorCliente: Map<number, string[]> = new Map();
      estados.forEach((e: EstadoCilindro) => {
        if (haSalido(e) && e.clienteId && idsDni.has(e.clienteId)) {
          const lista = seriesPrestadasPorCliente.get(e.clienteId) || [];
          lista.push(e.serie);
          seriesPrestadasPorCliente.set(e.clienteId, lista);
        }
      });

      this.prestadosPorCliente = new Map();
      const todasLasSeriesPrestadas = Array.from(seriesPrestadasPorCliente.values()).flat();

      if (todasLasSeriesPrestadas.length > 0) {
        const { data: cilindrosPrestados, error: errorPrestados } = await this.supabaseService.supabase
          .from('cilindros')
          .select('*')
          .in('numero_serie', todasLasSeriesPrestadas);

        if (errorPrestados) {
          console.error('Error al cargar los cilindros prestados:', errorPrestados);
        } else {
          const porSerie = new Map<string, any>();
          (cilindrosPrestados || []).forEach((c: any) => porSerie.set(normalizarSerie(c.numero_serie), c));

          seriesPrestadasPorCliente.forEach((series, clienteId) => {
            const filas = series
              .map(serie => {
                const c = porSerie.get(serie);
                if (!c) return null;
                const est = estados.get(serie);
                return this.armarFila(c, est);
              })
              .filter(f => f !== null);
            this.prestadosPorCliente.set(clienteId, filas as any[]);
          });
        }
      }

      this.listaClientes = clientesDni.map((c: any) => ({
        id: c.id,
        nombre: (c.nombre_razon_social || 'SIN NOMBRE').toUpperCase(),
        numDocumento: c.num_documento || '-',
        telefono: c.telefono || '',
        email: c.email || '',
        direccion: c.direccion || '',
        cantidadPropios: (this.propiosPorCliente.get(c.id) || []).length,
        cantidadPrestados: (this.prestadosPorCliente.get(c.id) || []).length
      }));

      this.aplicarFiltro();
    } catch (err) {
      console.error('Error inesperado al cargar clientes y cilindros:', err);
      this.listaClientes = [];
      this.clientesFiltrados = [];
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  private armarFila(c: any, est: EstadoCilindro | undefined) {
    return {
      numeroSerie: c.numero_serie,
      tipoGas: c.tipo_gas || 'NO ESPECIFICADO',
      marca: c.marca,
      anioFabricacion: c.anio_fabricacion,
      unidadMedida: c.unidad_medida,
      peso: c.peso,
      anchoDiametro: c.ancho_diametro,
      largoAltura: c.largo_altura,
      litros: c.litros,
      contenido: c.contenido,
      color: c.color,
      ph: c.ph,
      procedencia: c.procedencia,
      estadoTexto: this.textoUbicacion(est),
      estadoClase: this.claseUbicacion(est),
      fechaMovimiento: est?.fecha || null
    };
  }

  /** Texto legible de dónde está el cilindro ahora mismo. */
  private textoUbicacion(est: EstadoCilindro | undefined): string {
    if (!est) return 'Sin movimientos registrados';

    if (estaDentro(est)) {
      const almacen = est.almacenId ? (this.mapaAlmacenes[est.almacenId] || `Almacén #${est.almacenId}`) : 'almacén';
      return `En almacén: ${almacen}`;
    }

    if (haSalido(est)) {
      return `Salió${est.destino ? ': ' + est.destino : ''}`;
    }

    return 'Sin movimientos registrados';
  }

  private claseUbicacion(est: EstadoCilindro | undefined): string {
    if (est && estaDentro(est)) return 'ubicacion-dentro';
    if (est && haSalido(est)) return 'ubicacion-fuera';
    return 'ubicacion-desconocida';
  }

  filtrarClientes(event: any) {
    this.filtro = (event?.detail?.value || '').toString();
    this.aplicarFiltro();
  }

  private aplicarFiltro() {
    const termino = this.filtro.toLowerCase().trim();

    if (!termino) {
      this.clientesFiltrados = [...this.listaClientes];
      return;
    }

    this.clientesFiltrados = this.listaClientes.filter(c =>
      c.nombre.toLowerCase().includes(termino) ||
      c.numDocumento.toLowerCase().includes(termino)
    );
  }

  /** Devuelve la clase de color según el tipo de gas (misma paleta de la app). */
  obtenerClaseGas(tipoGas: string | null | undefined): string {
    if (!tipoGas) return '';

    const valor = tipoGas
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

    if (valor.includes('OXIGENO')) return 'gas-oxigeno';
    if (valor.includes('ACETILENO')) return 'gas-acetileno';
    if (valor.includes('ARGON')) return 'gas-argon';
    if (valor.includes('NITROGENO')) return 'gas-nitrogeno';
    if (valor.includes('DIOXIDO') || valor === 'CO2') return 'gas-co2';
    if (valor.includes('MEZCLA')) return 'gas-mezcla';

    return '';
  }

  /**
   * Link directo al chat de WhatsApp del cliente. Asume números peruanos:
   * si quedan 9 dígitos (celular sin código de país) antepone el 51; si el
   * número ya trae código de país u otro largo, se usa tal cual.
   */
  enlaceWhatsapp(telefono: string | null | undefined): string {
    const soloDigitos = String(telefono || '').replace(/\D/g, '');
    if (!soloDigitos) return '';

    const numero = soloDigitos.length === 9 ? `51${soloDigitos}` : soloDigitos;
    return `https://wa.me/${numero}`;
  }

  verCilindrosDeCliente(cliente: ClienteConCilindros) {
    this.clienteSeleccionado = cliente;
    this.cilindrosPropiosDelCliente = this.propiosPorCliente.get(cliente.id) || [];
    this.cilindrosPrestadosDelCliente = this.prestadosPorCliente.get(cliente.id) || [];
    this.modalAbierto = true;
  }

  cerrarModal() {
    this.modalAbierto = false;
    this.clienteSeleccionado = null;
    this.cilindrosPropiosDelCliente = [];
    this.cilindrosPrestadosDelCliente = [];
  }
}