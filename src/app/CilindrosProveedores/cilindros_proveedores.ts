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
  businessOutline,
  cardOutline,
  cubeOutline,
  chevronForwardOutline,
  flaskOutline,
  closeOutline,
  peopleOutline,
  callOutline,
  mailOutline,
  locationOutline,
  timeOutline,
  archiveOutline,
  searchOutline,
  logoWhatsapp,
  swapHorizontalOutline
} from 'ionicons/icons';

/**
 * Una empresa con RUC. Todos los cilindros son de Electrametal, así que lo
 * que de verdad importa aquí es "PRESTADOS": qué cilindros tiene esta
 * empresa AHORA MISMO porque le hicieron una Salida y todavía no se recoge
 * (mismo cálculo que usa Recojo). "Propios" solo se llenaría si alguna vez
 * se registra un cilindro poniendo a esta empresa como propietaria.
 */
interface EmpresaConCilindros {
  id: number;
  nombre: string;
  ruc: string;
  telefono: string;
  email: string;
  direccion: string;
  cantidadPropios: number;
  cantidadPrestados: number;
}

@Component({
  selector: 'app-cilindros-proveedores',
  templateUrl: './cilindros_proveedores.html',
  styleUrls: ['./cilindros_proveedores.scss'],
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
export class CilindrosProveedoresPage implements OnInit {

  cargando: boolean = false;
  filtro: string = '';

  listaEmpresas: EmpresaConCilindros[] = [];
  empresasFiltradas: EmpresaConCilindros[] = [];

  private propiosPorEmpresa: Map<number, any[]> = new Map();
  private prestadosPorEmpresa: Map<number, any[]> = new Map();
  private mapaAlmacenes: { [id: number]: string } = {};

  modalAbierto: boolean = false;
  empresaSeleccionada: EmpresaConCilindros | null = null;
  cilindrosPropiosDeEmpresa: any[] = [];
  cilindrosPrestadosDeEmpresa: any[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({
      arrowBackOutline,
      businessOutline,
      cardOutline,
      cubeOutline,
      chevronForwardOutline,
      flaskOutline,
      closeOutline,
      peopleOutline,
      callOutline,
      mailOutline,
      locationOutline,
      timeOutline,
      archiveOutline,
      searchOutline,
      logoWhatsapp,
      swapHorizontalOutline
    });
  }

  ngOnInit() {
    this.cargarEmpresasConCilindros();
  }

  ionViewWillEnter() {
    this.cargarEmpresasConCilindros();
  }

  regresar() {
    this.navCtrl.back();
  }

  async cargarEmpresasConCilindros() {
    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      const [empresasRes, almacenesRes, estados] = await Promise.all([
        this.supabaseService.supabase
          .from('clientes')
          .select('id, nombre_razon_social, num_documento, telefono, email, direccion')
          .eq('tipo_documento', 'RUC')
          .order('nombre_razon_social', { ascending: true }),
        this.supabaseService.supabase
          .from('almacenes')
          .select('id, nombre'),
        cargarEstados(this.supabaseService.supabase).catch((err: any) => {
          console.error('Error al calcular el estado de los cilindros:', err);
          return new Map<string, EstadoCilindro>();
        })
      ]);

      if (empresasRes.error) {
        console.error('Error al cargar empresas RUC:', empresasRes.error);
        this.listaEmpresas = [];
        this.empresasFiltradas = [];
        return;
      }

      this.mapaAlmacenes = {};
      (almacenesRes.data || []).forEach((a: any) => { this.mapaAlmacenes[a.id] = a.nombre; });

      const empresasRuc = empresasRes.data || [];
      const idsRuc = new Set(empresasRuc.map((e: any) => e.id));

      // --- PROPIOS: cilindros cuyo cliente_id (propietario) es una de estas empresas ---
      this.propiosPorEmpresa = new Map();
      if (idsRuc.size > 0) {
        const { data: cilindros, error: errorCil } = await this.supabaseService.supabase
          .from('cilindros')
          .select('*')
          .in('cliente_id', Array.from(idsRuc));

        if (errorCil) {
          console.error('Error al cargar los cilindros propios de las empresas:', errorCil);
        } else {
          (cilindros || []).forEach((c: any) => {
            const est = estados.get(normalizarSerie(c.numero_serie));
            const lista = this.propiosPorEmpresa.get(c.cliente_id) || [];
            lista.push(this.armarFila(c, est));
            this.propiosPorEmpresa.set(c.cliente_id, lista);
          });
        }
      }

      // --- PRESTADOS: última Salida vigente (sin recoger) hacia una de estas empresas ---
      const seriesPrestadasPorEmpresa: Map<number, string[]> = new Map();
      estados.forEach((e: EstadoCilindro) => {
        if (haSalido(e) && e.clienteId && idsRuc.has(e.clienteId)) {
          const lista = seriesPrestadasPorEmpresa.get(e.clienteId) || [];
          lista.push(e.serie);
          seriesPrestadasPorEmpresa.set(e.clienteId, lista);
        }
      });

      this.prestadosPorEmpresa = new Map();
      const todasLasSeriesPrestadas = Array.from(seriesPrestadasPorEmpresa.values()).flat();

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

          seriesPrestadasPorEmpresa.forEach((series, empresaId) => {
            const filas = series
              .map(serie => {
                const c = porSerie.get(serie);
                if (!c) return null;
                const est = estados.get(serie);
                return this.armarFila(c, est);
              })
              .filter(f => f !== null);
            this.prestadosPorEmpresa.set(empresaId, filas as any[]);
          });
        }
      }

      this.listaEmpresas = empresasRuc.map((e: any) => ({
        id: e.id,
        nombre: (e.nombre_razon_social || 'SIN NOMBRE').toUpperCase(),
        ruc: e.num_documento || '-',
        telefono: e.telefono || '',
        email: e.email || '',
        direccion: e.direccion || '',
        cantidadPropios: (this.propiosPorEmpresa.get(e.id) || []).length,
        cantidadPrestados: (this.prestadosPorEmpresa.get(e.id) || []).length
      }));

      this.aplicarFiltro();
    } catch (err) {
      console.error('Error inesperado al cargar empresas y cilindros:', err);
      this.listaEmpresas = [];
      this.empresasFiltradas = [];
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

  filtrarEmpresas(event: any) {
    this.filtro = (event?.detail?.value || '').toString();
    this.aplicarFiltro();
  }

  private aplicarFiltro() {
    const termino = this.filtro.toLowerCase().trim();

    if (!termino) {
      this.empresasFiltradas = [...this.listaEmpresas];
      return;
    }

    this.empresasFiltradas = this.listaEmpresas.filter(e =>
      e.nombre.toLowerCase().includes(termino) ||
      e.ruc.toLowerCase().includes(termino)
    );
  }

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

  enlaceWhatsapp(telefono: string | null | undefined): string {
    const soloDigitos = String(telefono || '').replace(/\D/g, '');
    if (!soloDigitos) return '';

    const numero = soloDigitos.length === 9 ? `51${soloDigitos}` : soloDigitos;
    return `https://wa.me/${numero}`;
  }

  verCilindrosDeEmpresa(empresa: EmpresaConCilindros) {
    this.empresaSeleccionada = empresa;
    this.cilindrosPropiosDeEmpresa = this.propiosPorEmpresa.get(empresa.id) || [];
    this.cilindrosPrestadosDeEmpresa = this.prestadosPorEmpresa.get(empresa.id) || [];
    this.modalAbierto = true;
  }

  cerrarModal() {
    this.modalAbierto = false;
    this.empresaSeleccionada = null;
    this.cilindrosPropiosDeEmpresa = [];
    this.cilindrosPrestadosDeEmpresa = [];
  }
}