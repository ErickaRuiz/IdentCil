import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavController, ToastController, AlertController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { normalizarSerie, obtenerEstado, cargarEstados, haSalido, EstadoCilindro } from '../services/cilindro-estado';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonSpinner,
  IonModal,
  IonList,
  IonSearchbar
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  searchOutline,
  qrCodeOutline,
  trashOutline,
  checkmarkDoneOutline,
  checkmarkOutline,
  cameraOutline,
  flaskOutline,
  addCircleOutline,
  closeCircleOutline,
  chevronForwardOutline,
  timeOutline,
  exitOutline, locationSharp,
  businessOutline,
  personOutline, calendarOutline, personAddOutline, arrowForwardOutline, storefrontOutline, saveOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-salida',
  templateUrl: './salida.html',
  styleUrls: ['./salida.scss'],
  standalone: true,
  imports: [
    IonSearchbar, IonList,
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonCardContent,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonSpinner,
    IonModal
  ]
})
export class SalidaPage implements OnInit {

  razonSocial: string = 'ELECTRAMETAL NORPERU SAC';
  rucProveedor: string = '20536193805';
  estado: string = 'LLENO';

  serieActual: string = '';
  listaCilindros: any[] = [];
  cargando: boolean = false;

  // Almacén de ORIGEN: ya NO se elige manualmente, se detecta al buscar el cilindro
  almacenId: number | null = null;
  observacion: string = '';
  listaAlmacenes: any[] = [];
  // Mapa id -> nombre de almacén, para resolver el origen sin depender de joins
  mapaAlmacenes: { [id: number]: string } = {};

  // Datos de origen detectados automáticamente al buscar el cilindro
  origenActualNombre: string = '';
  origenActualEntidadNombre: string = '';
  origenActualEntidadId: number | null = null;
  origenActualFecha: string | null = null;

  // Cliente/Empresa destino
  entidadSeleccionadaId: number | null = null;
  listaEntidades: any[] = [];

  // Almacén al que se transfiere el cilindro (opcional, para movimientos entre almacenes)
  almacenDestinoId: number | null = null;

  // Selección temporal para asignarle un almacén "al vuelo" a un cilindro
  // que no tiene ninguno registrado (ni en cilindros ni en ingreso_cilindros)
  almacenAsignacionId: number | null = null;

  cilindroEncontrado: any = null;

  // Modal buscador de cliente/empresa
  modalAbierto: boolean = false;
  entidadesFiltradas: any[] = [];
  fechaSalidaActual: Date = new Date();

  private searchTimeout: any;

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private cdRef: ChangeDetectorRef,
    private alertController: AlertController,
    private router: Router
  ) {
    addIcons({ arrowBackOutline, timeOutline, searchOutline, cameraOutline, chevronForwardOutline, exitOutline, businessOutline, personOutline, calendarOutline, saveOutline, personAddOutline, addCircleOutline, trashOutline, arrowForwardOutline, storefrontOutline, locationSharp, checkmarkDoneOutline, closeCircleOutline, flaskOutline, qrCodeOutline, checkmarkOutline });
  }

  async ngOnInit() {
    this.fechaSalidaActual = new Date();
    await Promise.all([
      this.cargarAlmacenes(),
      this.cargarEntidades()
    ]);
  }

  ionViewWillEnter() {
    this.cargarAlmacenes();
  }

  regresar() {
    this.navCtrl.back();
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
      duration: 2500,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }

  async cargarAlmacenes() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('almacenes')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al obtener almacenes:', error);
      } else {
        this.listaAlmacenes = data || [];
        this.mapaAlmacenes = {};
        this.listaAlmacenes.forEach((alm: any) => {
          this.mapaAlmacenes[alm.id] = alm.nombre;
        });
      }
    } catch (err) {
      console.error('Error al conectar con la tabla almacenes:', err);
    }
  }

  async cargarEntidades() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('clientes')
        .select('*');

      if (error) throw error;

      this.listaEntidades = data || [];
      this.entidadesFiltradas = [...this.listaEntidades];
    } catch (err) {
      console.error('Error al cargar entidades:', err);
    }
  }

  // --- Modal buscador de cliente/empresa destino ---
  abrirModalBuscador() {
    this.entidadesFiltradas = [...this.listaEntidades];
    this.modalAbierto = true;
  }

  cerrarModalBuscador() {
    this.modalAbierto = false;
  }

  filtrarEntidades(event: any) {
    const termino = (event?.target?.value || '').toLowerCase().trim();

    if (!termino) {
      this.entidadesFiltradas = [...this.listaEntidades];
      return;
    }

    this.entidadesFiltradas = this.listaEntidades.filter(ent => {
      const nombre = String(ent.razon_social || ent.nombre_razon_social || ent.nombres || ent.nombre || '').toLowerCase();
      const doc = String(ent.ruc || ent.dni || ent.num_documento || ent.numero_documento || '').toLowerCase();
      return nombre.includes(termino) || doc.includes(termino);
    });
  }

  seleccionarEntidadModal(entidad: any) {
    // Si ya se buscó un cilindro y esta persona/empresa es quien lo tiene
    // actualmente (por id, o por nombre si no hay id de cliente asociado),
    // no tiene sentido "entregárselo" de nuevo a sí misma.
    if (this.cilindroEncontrado) {
      const nombreCandidato = entidad.razon_social || entidad.nombre_razon_social || entidad.nombres || entidad.nombre || '';
      if (this.esMismoPoseedorActual(entidad.id ?? null, nombreCandidato)) {
        this.modalAbierto = false;
        const nombreEntidad = this.origenActualEntidadNombre || 'Esta persona/empresa';
        this.mostrarAlerta(
          'Ya lo tiene',
          `${nombreEntidad} ya tiene el cilindro ${this.cilindroEncontrado.numero_serie}. Selecciona otro destinatario.`
        );
        return;
      }
    }

    this.entidadSeleccionadaId = entidad.id;
    this.modalAbierto = false;
  }

  obtenerNombreEntidadSeleccionada(): string {
    if (!this.entidadSeleccionadaId) return '';
    const seleccionada = this.listaEntidades.find(e => e.id === this.entidadSeleccionadaId);
    if (!seleccionada) return '';

    const nombre = seleccionada.razon_social || seleccionada.nombre_razon_social || seleccionada.nombres || seleccionada.nombre || '';
    const doc = seleccionada.ruc || seleccionada.dni || seleccionada.num_documento || seleccionada.numero_documento || '';

    return doc ? `${nombre.toUpperCase()} (${doc})` : nombre.toUpperCase();
  }

  /**
   * Normaliza un texto para comparar nombres sin que tildes, mayúsculas o
   * espacios de más generen falsos negativos.
   */
  private normalizarTexto(texto: string | null | undefined): string {
    return (texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  /**
   * Determina si el destinatario candidato (id y/o nombre) es la MISMA
   * persona/empresa que ya tiene el cilindro ahora mismo.
   *
   * Compara primero por ID (más confiable). Si no hay ID de origen (por
   * ejemplo, el cilindro está "en planta" y el poseedor mostrado es el
   * nombre de la propia empresa, sin un cliente_id asociado), compara por
   * nombre normalizado como respaldo.
   */
  private esMismoPoseedorActual(candidatoId: number | null, candidatoNombre: string): boolean {
    if (!this.origenActualEntidadNombre && !this.origenActualEntidadId) return false;

    if (candidatoId && this.origenActualEntidadId) {
      return candidatoId === this.origenActualEntidadId;
    }

    const nombreOrigen = this.normalizarTexto(this.origenActualEntidadNombre);
    const nombreCandidato = this.normalizarTexto(candidatoNombre);
    return !!nombreOrigen && !!nombreCandidato && nombreOrigen === nombreCandidato;
  }

  // Se dispara al elegir el Almacén Destino. Si coincide con el almacén de
  // origen ya registrado para el cilindro encontrado, no tiene sentido
  // "transferirlo" al mismo lugar donde ya está: se avisa y se limpia la
  // selección para forzar a elegir un almacén distinto.
  async onAlmacenDestinoChange() {
    if (this.almacenDestinoId && this.almacenId && this.almacenDestinoId === this.almacenId) {
      const nombreAlmacen = this.mapaAlmacenes[this.almacenId] || 'ese almacén';
      await this.mostrarAlerta(
        'Mismo almacén',
        `El cilindro ya está registrado en ${nombreAlmacen}. Selecciona un almacén de destino distinto.`
      );
      this.almacenDestinoId = null;
      this.cdRef.detectChanges();
    }
  }

  /**
   * Nombre legible del almacén al que se transfiere el cilindro.
   * Devuelve '' si no se eligió ninguno (salida normal, sin transferencia).
   */
  obtenerNombreAlmacenDestino(): string {
    if (!this.almacenDestinoId) return '';
    return this.mapaAlmacenes[this.almacenDestinoId] || `Almacén #${this.almacenDestinoId}`;
  }

  /**
   * Devuelve la clase de color según el tipo de gas, sin depender de que el
   * texto venga EXACTAMENTE igual (tildes, mayúsculas o espacios de más
   * suelen romper una comparación === directa contra el valor de la BD).
   */
  obtenerClaseBadgeGas(tipoGas: string | null | undefined): string {
    if (!tipoGas) return '';

    // Quita tildes (NFD separa la letra de su acento y lo eliminamos),
    // pasa a mayúsculas y recorta espacios sobrantes.
    const valor = tipoGas
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

    if (valor.includes('OXIGENO')) return 'badge-oxigeno';
    if (valor.includes('ACETILENO')) return 'badge-acetileno';
    if (valor.includes('ARGON')) return 'badge-argon';
    if (valor.includes('NITROGENO')) return 'badge-nitrogeno';
    if (valor.includes('DIOXIDO') || valor === 'CO2') return 'badge-co2';
    if (valor.includes('MEZCLA')) return 'badge-mezcla';

    return '';
  }

  // --- Búsqueda / escaneo de cilindros ---
  onInputCodigo(event: any) {
    const valor = event.detail.value || '';

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (valor.trim().length >= 3) {
      this.searchTimeout = setTimeout(() => {
        this.buscarCilindroPorSerie();
      }, 400);
    }
  }

  async buscarCilindroPorSerie() {
    if (!this.serieActual) return;

    const serieLimpia = this.serieActual.trim();
    if (!serieLimpia) return;

    // 1. Evitar agregar dos veces el mismo cilindro a la lista actual de salida
    const yaEstaEnLista = this.listaCilindros.some(c => c.numeroSerie === serieLimpia);
    if (yaEstaEnLista) {
      await this.mostrarAlerta('Atención', 'Este número de serie ya está agregado en la lista.');
      return;
    }

    // 2. El cilindro debe existir en el inventario
    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select('*')
      .eq('numero_serie', serieLimpia)
      .maybeSingle();

    if (error) {
      console.error('Error al buscar el cilindro:', error);
      await this.mostrarAlerta('No se pudo buscar', `Ocurrió un error al consultar el cilindro: ${error.message}`);
      return;
    }

    if (!data) {
      this.cilindroEncontrado = null;
      this.origenActualNombre = '';
      this.origenActualEntidadNombre = '';
      this.origenActualEntidadId = null;
      this.origenActualFecha = null;
      await this.mostrarAlerta('No encontrado', 'El cilindro ingresado no existe.');
      return;
    }

    // 3. Estado ACTUAL = último movimiento en los historiales. Un cilindro sale,
    //    se recoge, vuelve a ingresar y vuelve a salir muchas veces: solo se
    //    bloquea si YA salió y todavía no se recogió (salida duplicada).
    let estado: EstadoCilindro;
    try {
      estado = await obtenerEstado(this.supabaseService.supabase, serieLimpia);
    } catch (err: any) {
      console.error('Error al verificar el estado del cilindro:', err);
      await this.mostrarAlerta('No se pudo verificar', `No se pudo confirmar el estado del cilindro: ${err?.message || err}`);
      return;
    }

    if (haSalido(estado)) {
      this.cilindroEncontrado = null;
      await this.mostrarAlerta(
        'Ya salió',
        `El cilindro ${serieLimpia} ya salió y figura en poder de ${this.describirDestino(estado)}. ` +
        `Para volver a sacarlo primero debe registrarse su Recojo.`
      );
      return;
    }

    this.cilindroEncontrado = data;
    this.fechaSalidaActual = new Date();
    this.resolverOrigenCilindro(data, estado);
    this.cdRef.detectChanges();
  }

  /**
   * Aplica los datos de origen ya resueltos (venga de donde venga) a las
   * propiedades que pinta el HTML.
   */
  private aplicarOrigenResuelto(almacenId: number | null, fecha: string | null, clienteId: number | null) {
    this.almacenId = almacenId;
    this.origenActualNombre = almacenId && this.mapaAlmacenes[almacenId]
      ? this.mapaAlmacenes[almacenId]
      : (almacenId ? `Almacén #${almacenId}` : 'No especificado');
    this.origenActualFecha = fecha;
    this.origenActualEntidadId = clienteId ?? null;

    if (clienteId) {
      const ent = this.listaEntidades.find(e => e.id === clienteId);
      this.origenActualEntidadNombre = ent
        ? (ent.razon_social || ent.nombre_razon_social || ent.nombres || ent.nombre || '').toUpperCase()
        : '';
    } else {
      this.origenActualEntidadNombre = '';
    }
  }

  /**
   * Origen del cilindro: viene de su último movimiento (ingreso o recojo), que
   * indica en qué almacén quedó y desde cuándo. Está en planta, así que lo
   * tiene la propia empresa.
   */
  private resolverOrigenCilindro(cilindro: any, estado: EstadoCilindro) {
    const almacenId = estado.almacenId ?? cilindro?.almacen_actual_id ?? cilindro?.almacen_id ?? null;
    this.aplicarOrigenResuelto(almacenId, estado.fecha, null);
    this.origenActualEntidadNombre = this.razonSocial;
  }

  /** Texto legible de a dónde fue un cilindro que salió (para los avisos). */
  private describirDestino(estado: EstadoCilindro): string {
    const ent = this.listaEntidades.find(e => e.id === estado.clienteId);
    const cliente = ent
      ? (ent.razon_social || ent.nombre_razon_social || ent.nombres || ent.nombre || '').toUpperCase()
      : '';
    const almacenDestino = estado.almacenDestinoId
      ? `Almacén: ${this.mapaAlmacenes[estado.almacenDestinoId] || estado.almacenDestinoId}`
      : '';
    return cliente || estado.destino || almacenDestino || estado.observacion || 'un cliente / otro destino';
  }

  agregarCilindroALista() {
    if (!this.cilindroEncontrado) return;

    // Si el destinatario ya seleccionado es quien actualmente tiene el
    // cilindro (por id, o por nombre si no hay id de cliente asociado —
    // por ejemplo, el cilindro está "en planta" bajo el nombre de tu propia
    // empresa), no se permite agregarlo: no tiene sentido entregárselo a
    // quien ya lo tiene.
    if (this.entidadSeleccionadaId) {
      const seleccionada = this.listaEntidades.find(e => e.id === this.entidadSeleccionadaId);
      const nombreCandidato = seleccionada
        ? (seleccionada.razon_social || seleccionada.nombre_razon_social || seleccionada.nombres || seleccionada.nombre || '')
        : '';
      if (this.esMismoPoseedorActual(this.entidadSeleccionadaId, nombreCandidato)) {
        const nombreEntidad = this.origenActualEntidadNombre || 'ese destinatario';
        this.mostrarAlerta(
          'Ya lo tiene',
          `El cilindro ${this.cilindroEncontrado.numero_serie} ya está en poder de ${nombreEntidad}. Selecciona un destinatario distinto antes de agregarlo.`
        );
        return;
      }
    }

    // Si el destino elegido es el mismo almacén donde este cilindro ya está
    // registrado (origen), no se permite agregarlo: no tiene sentido
    // "transferirlo" al mismo lugar donde ya está.
    if (this.almacenDestinoId && this.almacenId && this.almacenDestinoId === this.almacenId) {
      const nombreAlmacen = this.mapaAlmacenes[this.almacenId] || 'ese almacén';
      this.mostrarAlerta(
        'Mismo almacén',
        `El cilindro ${this.cilindroEncontrado.numero_serie} ya está en ${nombreAlmacen}. Selecciona un almacén de destino distinto antes de agregarlo.`
      );
      return;
    }

    this.listaCilindros.push({
      numeroSerie: this.cilindroEncontrado.numero_serie,
      tipoGas: this.cilindroEncontrado.tipo_gas,
      capacidad: `${this.cilindroEncontrado.litros || this.cilindroEncontrado.contenido || ''} ${this.cilindroEncontrado.unidad_medida || ''}`.trim(),
      estado: this.estado,
      // Se guarda el origen ya resuelto por cilindro, por si en una misma
      // salida se agregan cilindros que venían de almacenes distintos.
      origenAlmacenId: this.almacenId,
      origenNombre: this.origenActualNombre,
      // Destino al que va este cilindro, congelado en el momento de agregarlo
      destinoAlmacenId: this.almacenDestinoId,
      destinoAlmacenNombre: this.obtenerNombreAlmacenDestino(),
      destinoEntidadNombre: this.obtenerNombreEntidadSeleccionada(),
      fechaSalida: new Date()
    });

    this.cilindroEncontrado = null;
    this.serieActual = '';
    this.origenActualNombre = '';
    this.origenActualEntidadNombre = '';
    this.origenActualEntidadId = null;
    this.origenActualFecha = null;
    this.cdRef.detectChanges();
  }

  async abrirEscanerML() {
    try {
      const status = await BarcodeScanner.requestPermissions();
      if (!status.camera) {
        this.mostrarToast('Permiso de cámara denegado.', 'warning');
        return;
      }

      const { barcodes } = await BarcodeScanner.scan();

      if (barcodes.length > 0) {
        const codigoLeido = barcodes[0].rawValue;
        if (codigoLeido) {
          this.serieActual = codigoLeido;
          await this.buscarCilindroPorSerie();
        }
      }
    } catch (err: any) {
      this.mostrarToast('Error al escanear: ' + (err.message || err), 'danger');
    }
  }

  eliminarSerie(index: number) {
    this.listaCilindros.splice(index, 1);
    this.cdRef.detectChanges();
  }

  /**
   * Texto legible de A DÓNDE va la salida, para guardarlo en el cilindro y
   * mostrarlo luego en Recojo ("Lo tiene: ..."):
   *  - cliente/empresa (y almacén si además se transfiere), o
   *  - "Almacén: X" si es una transferencia sin cliente, o
   *  - lo que se escribió en Observación (el lugar al que irá).
   */
  private textoDestino(): string {
    const ent = this.listaEntidades.find(e => e.id === this.entidadSeleccionadaId);
    const cliente = ent
      ? (ent.razon_social || ent.nombre_razon_social || ent.nombres || ent.nombre || '').toUpperCase()
      : '';
    const almacen = this.obtenerNombreAlmacenDestino();

    if (cliente && almacen) return `${cliente} (Almacén: ${almacen})`;
    if (cliente) return cliente;
    if (almacen) return `Almacén: ${almacen}`;
    return (this.observacion || '').trim();
  }

  // --- Guardar salida ---
  async guardarSalida() {
    // Evita que un doble clic o un toque repetido mientras ya se está
    // guardando dispare dos inserciones de la misma salida.
    if (this.cargando) return;

    if (!this.listaCilindros || this.listaCilindros.length === 0) {
      await this.mostrarAlerta('Atención', 'Debe agregar al menos un cilindro a la lista antes de guardar.');
      return;
    }

    // Debe indicarse A DÓNDE va: un cliente/empresa, otro almacén, o el lugar
    // escrito en Observación (cualquiera de los tres basta).
    const observacionLimpia = (this.observacion || '').trim();
    if (!this.entidadSeleccionadaId && !this.almacenDestinoId && !observacionLimpia) {
      await this.mostrarAlerta(
        'Falta el destino',
        'Indica a dónde va el cilindro: elige un cliente / empresa, elige un almacén destino, o escribe en Observación el lugar al que irá.'
      );
      return;
    }

    // Verificación final anti-duplicados: ninguno de los cilindros de la lista
    // debe figurar ya como salido (por ejemplo, si se despachó desde otro dispositivo).
    let estados: Map<string, EstadoCilindro>;
    try {
      estados = await cargarEstados(this.supabaseService.supabase);
    } catch (err: any) {
      await this.mostrarAlerta('No se pudo verificar', `No se pudo confirmar el estado de los cilindros: ${err?.message || err}`);
      return;
    }

    const yaFuera = this.listaCilindros
      .map(i => String(i.numeroSerie || '').trim())
      .filter(serie => serie !== '' && haSalido(estados.get(normalizarSerie(serie))));

    if (yaFuera.length > 0) {
      await this.mostrarAlerta(
        'Cilindros ya despachados',
        `Estos cilindros ya salieron y aún no se recogen: ${yaFuera.join(', ')}. ` +
        `Quítalos de la lista (botón de basurero) e inténtalo otra vez.`
      );
      return;
    }

    const origenesUnicos = new Set(
      this.listaCilindros.map(i => i.origenAlmacenId).filter(id => id !== null && id !== undefined)
    );
    if (origenesUnicos.size === 0) {
      await this.mostrarAlerta(
        'Atención',
        'No se pudo determinar el almacén de origen de uno o más cilindros. Se guardará igual, pero te recomendamos asignarles un almacén (botón "Asignar almacén" en su ficha) para que el próximo historial salga completo.'
      );
    } else if (origenesUnicos.size > 1) {
      await this.mostrarAlerta(
        'Atención',
        'Los cilindros agregados provienen de almacenes distintos. Se registrará el origen de cada uno, pero verifica que sea correcto antes de guardar.'
      );
    }

    const almacenOrigenPrincipal = this.listaCilindros[0]?.origenAlmacenId ?? null;
    const destinoTexto = this.textoDestino();

    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      const cilindrosPayload = this.listaCilindros.map(item => ({
        numero_serie: item.numeroSerie || item.numero_serie || '',
        tipo_gas: item.tipoGas || item.tipo_gas || '',
        capacidad: item.capacidad || item.litros || item.contenido || '',
        origen_almacen_id: item.origenAlmacenId ?? null,
        origen_nombre: item.origenNombre || '',
        destino: destinoTexto
      }));

      const userRes = await this.supabaseService.supabase.auth.getUser();
      const usuarioId = userRes?.data?.user?.id || null;

      const datosSalida = {
        cliente_id: this.entidadSeleccionadaId || null,
        estado: this.estado,
        almacen_id: almacenOrigenPrincipal,
        almacen_destino_id: this.almacenDestinoId,
        observacion: observacionLimpia || null,
        cilindros_egresados: cilindrosPayload,
        usuario_id: usuarioId
      };

      // Registrar el movimiento de salida. Con este registro el cilindro pasa a
      // estar FUERA (y aparece en Recojo): el estado se calcula desde el
      // historial, no hace falta actualizar la tabla `cilindros`.
      const { error } = await this.supabaseService.supabase
        .from('salida_cilindros')
        .insert([datosSalida]);

      if (error) throw error;

      await this.mostrarAlerta('¡Éxito!', 'La salida de cilindros se ha registrado correctamente.');
      this.limpiarFormulario();

    } catch (err: any) {
      console.error('Error al guardar en Supabase:', err);
      let mensajeError = err.message || err.error_description || 'Ocurrió un error inesperado al guardar.';
      if (!this.entidadSeleccionadaId && /cliente_id/i.test(String(mensajeError)) && /null/i.test(String(mensajeError))) {
        mensajeError += '\n\nLa tabla salida_cilindros exige cliente. Para permitir salidas sin cliente ejecuta en Supabase: ALTER TABLE salida_cilindros ALTER COLUMN cliente_id DROP NOT NULL;';
      }
      await this.mostrarAlerta('Error de Guardado', `No se pudo registrar en la base de datos:\n${mensajeError}`);
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  limpiarFormulario() {
    this.listaCilindros = [];
    this.observacion = '';
    this.cilindroEncontrado = null;
    this.serieActual = '';
    this.entidadSeleccionadaId = null;
    this.almacenId = null;
    this.almacenDestinoId = null;
    this.origenActualNombre = '';
    this.origenActualEntidadNombre = '';
    this.origenActualEntidadId = null;
    this.origenActualFecha = null;
  }

  irAHistorialSalidas() {
    this.router.navigate(['/historial-salidas']);
  }

  /**
   * Arreglo rápido para cilindros sin almacén registrado: indica desde qué
   * almacén sale ESTE cilindro. Se guarda en el registro de la salida (como
   * almacén de origen), no en la tabla `cilindros`.
   */
  async asignarAlmacenOrigen() {
    if (!this.cilindroEncontrado || !this.almacenAsignacionId) return;

    this.aplicarOrigenResuelto(this.almacenAsignacionId, null, null);
    this.origenActualEntidadNombre = this.razonSocial;
    this.almacenAsignacionId = null;
    this.mostrarToast('Almacén de origen asignado a este cilindro.', 'success');
    this.cdRef.detectChanges();
  }
}