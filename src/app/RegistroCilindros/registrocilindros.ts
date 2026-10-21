import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import {
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonSearchbar,
  IonModal,
  IonHeader,
  IonSpinner
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barcodeOutline,
  businessOutline,
  flaskOutline,
  saveOutline,
  arrowBackOutline,
  chevronDownOutline,
  searchOutline,
  chevronForwardOutline,
  listOutline,
  pricetagOutline,
  calendarOutline,
  cubeOutline,
  scaleOutline,
  resizeOutline,
  waterOutline,
  colorPaletteOutline,
  shieldCheckmarkOutline,
  earthOutline,
  optionsOutline,
  alertCircleOutline,
  alertCircle,
  createOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-registro-cilindros',
  templateUrl: './registrocilindros.html',
  styleUrls: ['./registrocilindros.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSearchbar,
    IonModal,
    IonSpinner
  ]
})
export class RegistroCilindrosPage {

  // Control de edición
  cilindroId: string | null = null;
  esEdicion: boolean = false;
  textoBotonGuardar: string = 'REGISTRAR CILINDRO';

  // Modelo del formulario
  cilindro: any = {
    id: null,
    numeroSerie: '',
    clienteId: null,
    tipoGas: '',
    marca: '',
    anioFabricacion: '',
    unidadMedida: '',
    peso: null,
    anchoDiametro: null,
    largoAltura: null,
    litros: null,
    contenido: null,
    color: '',
    ph: '',
    procedencia: ''
  };

  filtroCliente: string = '';
  clienteSeleccionadoNombre: string = '';
  modalClientesAbierto: boolean = false;

  // --- Verificación de número de serie duplicado ---
  // Se consulta apenas el operario escribe la serie: si ya existe en la
  // tabla `cilindros`, se muestra su info completa y se bloquea el guardado
  // (salvo que sea el MISMO registro que se está editando).
  verificandoSerie: boolean = false;
  serieDuplicada: boolean = false;
  cilindroExistente: any = null;
  private debounceSerieTimeout: any = null;

  // Lista original de clientes
  listaClientes: any[] = [];

  // Copia filtrada para el buscador
  clientesFiltrados: any[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    private navCtrl: NavController
  ) {
    addIcons({
      arrowBackOutline,
      flaskOutline,
      listOutline,
      barcodeOutline,
      businessOutline,
      chevronDownOutline,
      pricetagOutline,
      calendarOutline,
      optionsOutline,
      scaleOutline,
      resizeOutline,
      cubeOutline,
      waterOutline,
      colorPaletteOutline,
      shieldCheckmarkOutline,
      earthOutline,
      saveOutline,
      searchOutline,
      chevronForwardOutline,
      alertCircleOutline,
      alertCircle,
      createOutline
    });
  }


  // Carga ultra rápida ejecutando peticiones concurrentes
  async ionViewWillEnter() {
    const idParam = this.route.snapshot.paramMap.get('id');
    const idQuery = this.route.snapshot.queryParamMap.get('id');
    const id = idParam || idQuery;

    if (id) {
      this.cilindroId = id;
      this.esEdicion = true;
      this.textoBotonGuardar = 'ACTUALIZAR CILINDRO';

      // Ejecutar la carga de clientes y de cilindro al mismo tiempo para ganar velocidad
      const promesas = [
        this.cargarCilindroParaEdicion(id)
      ];

      if (this.listaClientes.length === 0) {
        promesas.push(this.cargarClientes());
      }

      await Promise.all(promesas);

      // Si el nombre del propietario no vino en la carga, se toma de la lista de clientes
      if (this.cilindro.clienteId && !this.clienteSeleccionadoNombre) {
        const c = this.listaClientes.find(x => String(x.id) === String(this.cilindro.clienteId));
        if (c) {
          this.clienteSeleccionadoNombre = c.nombre_razon_social.toUpperCase();
        }
        this.cdRef.detectChanges();
      }
    } else {
      this.limpiarFormulario();
      if (this.listaClientes.length === 0) {
        await this.cargarClientes();
      }
    }
  }

  async cargarClientes() {
    const { data, error } = await this.supabaseService.supabase
      .from('clientes')
      .select('id, nombre_razon_social, tipo_documento, num_documento');

    if (error) {
      console.error('Error al obtener clientes:', error.message);
    } else if (data) {
      this.listaClientes = data;
      this.clientesFiltrados = [...this.listaClientes];
    }
  }

  async cargarCilindroParaEdicion(id: string) {
    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select(`
        *,
        clientes (
          nombre_razon_social
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error al cargar datos del cilindro:', error.message);
      return;
    }

    if (data) {
      this.aplicarDatosCilindro(data);
      this.cdRef.detectChanges();
    }
  }

  /**
   * Vuelca los datos de un registro de `cilindros` (ya traído de Supabase,
   * con o sin el join a `clientes`) en el formulario. La usan tanto la
   * carga normal de edición como "Usar este registro" cuando se detecta
   * una serie duplicada.
   */
  private aplicarDatosCilindro(data: any) {
    this.cilindro.id = data.id;
    this.cilindro.numeroSerie = data.numero_serie || data.numeroSerie || '';
    this.cilindro.clienteId = data.cliente_id || data.clienteId || null;
    this.cilindro.tipoGas = data.tipo_gas || data.tipoGas || '';
    this.cilindro.marca = data.marca || '';
    this.cilindro.anioFabricacion = data.anio_fabricacion || data.anioFabricacion || null;
    this.cilindro.unidadMedida = data.unidad_medida || data.unidadMedida || data.m3 || '';
    this.cilindro.peso = data.peso || null;
    this.cilindro.anchoDiametro = data.ancho_diametro || data.anchoDiametro || null;
    this.cilindro.largoAltura = data.largo_altura || data.largoAltura || null;
    this.cilindro.litros = data.litros || null;
    this.cilindro.contenido = data.contenido || null;
    this.cilindro.color = data.color || '';
    this.cilindro.ph = data.ph || '';
    this.cilindro.procedencia = data.procedencia || '';

    if (data.clientes) {
      this.clienteSeleccionadoNombre = (data.clientes as any).nombre_razon_social.toUpperCase();
    }
  }

  /**
   * Se dispara con cada tecla del campo "Número de Serie". Espera un
   * momento sin que el operario siga escribiendo (debounce) antes de
   * consultar Supabase, para no disparar una consulta por cada letra.
   */
  onSerieInput(event: any) {
    if (this.debounceSerieTimeout) {
      clearTimeout(this.debounceSerieTimeout);
    }

    this.debounceSerieTimeout = setTimeout(() => {
      this.verificarSerieDuplicada();
    }, 400);
  }

  /**
   * Escapa los comodines de ILIKE (% _ \) para que la serie se compare
   * literalmente, ignorando solo mayúsculas/minúsculas.
   */
  private escaparIlike(valor: string): string {
    return valor.replace(/[\\%_]/g, '\\$&');
  }

  /**
   * Busca si el número de serie ya existe en `cilindros`. Si existe y
   * pertenece a OTRO registro (no al que se está editando ahora mismo),
   * se muestra su información completa y se bloquea "Registrar Cilindro".
   */
  async verificarSerieDuplicada() {
    const serie = (this.cilindro.numeroSerie || '').trim();

    if (!serie) {
      this.serieDuplicada = false;
      this.cilindroExistente = null;
      this.verificandoSerie = false;
      this.cdRef.detectChanges();
      return;
    }

    this.verificandoSerie = true;
    this.cdRef.detectChanges();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('cilindros')
        .select(`
          *,
          clientes (
            nombre_razon_social,
            tipo_documento,
            num_documento
          )
        `)
        .ilike('numero_serie', this.escaparIlike(serie))
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error al verificar si la serie ya existe:', error);
        this.serieDuplicada = false;
        this.cilindroExistente = null;
        return;
      }

      const esOtroRegistro = !!data && (!this.esEdicion || data.id !== this.cilindroId);

      if (esOtroRegistro) {
        this.serieDuplicada = true;
        this.cilindroExistente = data;
      } else {
        this.serieDuplicada = false;
        this.cilindroExistente = null;
      }
    } catch (err) {
      console.error('Error inesperado al verificar la serie:', err);
      this.serieDuplicada = false;
      this.cilindroExistente = null;
    } finally {
      this.verificandoSerie = false;
      this.cdRef.detectChanges();
    }
  }

  /**
   * En vez de crear un duplicado, carga el registro ya existente en el
   * mismo formulario para editarlo (sin navegar, así no hay que volver a
   * consultarlo).
   */
  usarRegistroExistente() {
    if (!this.cilindroExistente) return;

    this.cilindroId = this.cilindroExistente.id;
    this.esEdicion = true;
    this.textoBotonGuardar = 'ACTUALIZAR CILINDRO';

    this.aplicarDatosCilindro(this.cilindroExistente);

    this.serieDuplicada = false;
    this.cilindroExistente = null;
    this.cdRef.detectChanges();
  }

  filtrarClientes(event: any) {
    const termino = (event.detail.value || '').toLowerCase().trim();
    this.filtroCliente = termino;

    if (!termino) {
      this.clientesFiltrados = [...this.listaClientes];
      return;
    }

    this.clientesFiltrados = this.listaClientes.filter(c => {
      const nombre = (c.nombre_razon_social || '').toLowerCase();
      const doc = c.num_documento ? String(c.num_documento).toLowerCase() : '';
      return nombre.includes(termino) || doc.includes(termino);
    });
  }

  abrirModalClientes() {
    // Siempre se abre con la lista completa, tanto al registrar como al editar
    this.filtroCliente = '';
    this.clientesFiltrados = [...this.listaClientes];
    this.modalClientesAbierto = true;
  }

  cerrarModalClientes() {
    this.modalClientesAbierto = false;
  }

  seleccionarCliente(cliente: any) {
    this.cilindro.clienteId = cliente.id;
    this.clienteSeleccionadoNombre = cliente.nombre_razon_social.toUpperCase();
    this.cerrarModalClientes();
    this.cdRef.detectChanges();
  }

  async guardarCilindro() {
    if (!this.cilindro.numeroSerie || !this.cilindro.numeroSerie.trim()) {
      alert('Por favor ingrese el número de serie.');
      return;
    }
    if (!this.cilindro.clienteId) {
      alert('Por favor seleccione un cliente/propietario.');
      return;
    }
    if (!this.cilindro.tipoGas) {
      alert('Por favor seleccione el tipo de gas.');
      return;
    }

    // Bloqueo inmediato con lo que ya se sabe en pantalla.
    if (this.serieDuplicada) {
      alert('Este número de serie ya está registrado. Revisa la información mostrada o usa "Editar este registro".');
      return;
    }

    // Re-chequeo por si el duplicado se creó justo ahora (otro dispositivo,
    // o el operario guardó antes de que terminara de escribir la serie).
    const serieAGuardar = this.cilindro.numeroSerie.trim();
    const { data: existente, error: errorVerificacion } = await this.supabaseService.supabase
      .from('cilindros')
      .select('id')
      .ilike('numero_serie', this.escaparIlike(serieAGuardar))
      .limit(1)
      .maybeSingle();

    if (errorVerificacion) {
      console.error('Error al re-verificar la serie antes de guardar:', errorVerificacion);
    } else if (existente && (!this.esEdicion || existente.id !== this.cilindroId)) {
      await this.verificarSerieDuplicada();
      alert('Este número de serie ya está registrado. Revisa la información mostrada.');
      return;
    }

    let phFinal = this.cilindro.ph ? this.cilindro.ph.trim().toUpperCase() : '';
    if (!phFinal) {
      const gases5Anios = ['DIÓXIDO DE CARBONO', 'MEZCLA'];
      const esDe5Anios = gases5Anios.includes(this.cilindro.tipoGas.toUpperCase());
      phFinal = esDe5Anios ? 'CADA 5 AÑOS PH' : 'CADA 10 AÑOS PH';
    }

    const payload = {
      numero_serie: this.cilindro.numeroSerie.trim(),
      cliente_id: this.cilindro.clienteId,
      tipo_gas: this.cilindro.tipoGas,
      marca: this.cilindro.marca ? this.cilindro.marca.trim().toUpperCase() : null,
      anio_fabricacion: this.cilindro.anioFabricacion ? this.cilindro.anioFabricacion.trim() : null,
      unidad_medida: this.cilindro.unidadMedida ? this.cilindro.unidadMedida.trim() : null, peso: this.cilindro.peso ? Number(this.cilindro.peso) : null,
      ancho_diametro: this.cilindro.anchoDiametro ? Number(this.cilindro.anchoDiametro) : null,
      largo_altura: this.cilindro.largoAltura ? Number(this.cilindro.largoAltura) : null,
      litros: this.cilindro.tipoGas !== 'ACETILENO' && this.cilindro.litros ? Number(this.cilindro.litros) : null,
      contenido: (this.cilindro.tipoGas === 'ACETILENO' || this.cilindro.unidadMedida) && this.cilindro.contenido
        ? Number(this.cilindro.contenido)
        : null,
      color: this.cilindro.color ? this.cilindro.color.trim().toUpperCase() : null,
      ph: phFinal,
      procedencia: this.cilindro.procedencia ? this.cilindro.procedencia.trim().toUpperCase() : null
    };

    try {
      if (this.esEdicion && this.cilindroId) {
        const { error } = await this.supabaseService.supabase
          .from('cilindros')
          .update(payload)
          .eq('id', this.cilindroId);

        if (error) throw error;
        alert('¡Cilindro actualizado exitosamente!');
        this.navCtrl.back();
      } else {
        const { error } = await this.supabaseService.supabase
          .from('cilindros')
          .insert([payload]);

        if (error) throw error;
        alert('¡Cilindro registrado exitosamente!');
        this.limpiarFormulario();
      }
    } catch (error: any) {
      console.error('Error al guardar en Supabase:', error);
      alert('Error al guardar el cilindro: ' + (error.message || error));
    }
  }

  limpiarFormulario() {
    this.cilindroId = null;
    this.esEdicion = false;
    this.textoBotonGuardar = 'REGISTRAR CILINDRO';
    this.cilindro = {
      id: null,
      numeroSerie: '',
      clienteId: null,
      tipoGas: '',
      marca: '',
      anioFabricacion: '',
      unidadMedida: '',
      peso: null,
      anchoDiametro: null,
      largoAltura: null,
      litros: null,
      contenido: null,
      color: '',
      ph: '',
      procedencia: ''
    };

    this.clienteSeleccionadoNombre = '';
    this.filtroCliente = '';
    this.clientesFiltrados = [...this.listaClientes];

    this.serieDuplicada = false;
    this.cilindroExistente = null;
    this.verificandoSerie = false;
  }

  formatearPH(event: any) {
    let val = event.detail.value.replace(/\D/g, '');
    if (val.length >= 2) {
      val = val.substring(0, 2) + '/' + val.substring(2, 6);
    }
    this.cilindro.ph = val;
  }

  alCambiarGasOAnio() {
    if (!this.cilindro.tipoGas || !this.cilindro.anioFabricacion) return;

    const partes = this.cilindro.anioFabricacion.split('/');
    const anioBase = parseInt(partes.length === 2 ? partes[1] : partes[0], 10);
    const mesBase = partes.length === 2 ? partes[0] : '01';

    if (isNaN(anioBase)) return;

    const gases5Anios = ['DIÓXIDO DE CARBONO', 'MEZCLA'];
    const esDe5Anios = gases5Anios.includes(this.cilindro.tipoGas.toUpperCase());

    const anioPH = anioBase + (esDe5Anios ? 5 : 10);
    this.cilindro.ph = `${mesBase}/${anioPH}`;
  }

  formatearAnioFabricacion(event: any) {
    let val = event.detail.value.replace(/\D/g, '');
    if (val.length >= 2) {
      val = val.substring(0, 2) + '/' + val.substring(2, 6);
    }
    this.cilindro.anioFabricacion = val;
  }

  regresar() {
    this.navCtrl.back();
  }
}