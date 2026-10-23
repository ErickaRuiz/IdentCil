import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { MENSAJE_ESCANER_DESCARGANDO, prepararEscanerQR } from '../services/escaner-qr';
import { IdentificacionFotoService } from '../services/identificacion-foto';
import { TrazaIA } from '../services/detector-cilindros';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonButtons,
  IonBackButton,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonSpinner,
  IonIcon,
  IonCard,
  IonCardContent,
  IonModal,
  IonSearchbar,
  IonList,
  AlertController,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { jsPDF } from 'jspdf';
import {
  downloadOutline,
  searchOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  businessOutline,
  personOutline,
  timeOutline,
  checkmarkDoneOutline,
  cubeOutline,
  listOutline,
  chevronForwardOutline,
  calendarOutline,
  cameraOutline
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase';
import { normalizarSerie, obtenerEstado, cargarEstados, haSalido, EstadoCilindro } from '../services/cilindro-estado';

@Component({
  selector: 'app-recojo',
  templateUrl: './recojo.html',
  styleUrls: ['./recojo.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonButtons,
    IonBackButton,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonSpinner,
    IonIcon,
    IonCard,
    IonCardContent,
    IonModal,
    IonSearchbar,
    IonList
  ]
})
export class RecojoComponent {

  // Datos de la empresa (misma que en Salida / Ingreso)
  razonSocial: string = 'ELECTRAMETAL NORPERU SAC';
  rucProveedor: string = '20536193805';

  cargando: boolean = false;
  buscando: boolean = false;

  // Almacenes disponibles para elegir a cuál regresa el cilindro
  listaAlmacenes: any[] = [];
  almacenDestinoId: number | null = null;

  // Cilindro que se está recogiendo (resultado de la búsqueda por serie).
  // Solo se puede guardar si esto está lleno y el cilindro figura como
  // salido (su último movimiento es una salida): ver hayCilindroValido().
  cilindroEncontrado: any = null;

  // A quién / a dónde salió el cilindro en su última salida (cliente, almacén
  // o lugar indicado). Es solo para mostrarlo en pantalla.
  origenEntidadNombre: string = '';

  // --- Picker: cilindros que salieron y aún no se recogen. Se arma con el
  // último movimiento de cada serie en los historiales (ingresos, salidas y
  // recojos), así que aparecen acá todos los que de verdad salieron.
  modalListaAbierto: boolean = false;
  cargandoLista: boolean = false;
  cilindrosEnSalida: any[] = [];
  cilindrosEnSalidaFiltrados: any[] = [];
  terminoBusquedaLista: string = '';

  // Cómo se identificó el cilindro (foto, QR, lista o a mano) y, si fue por
  // foto, la traza de la IA. Se guarda en el reingreso que deja el recojo.
  metodoIdentificacion: 'manual' | 'qr' | 'foto' | 'lista' = 'manual';
  trazaIAActual: TrazaIA | null = null;

  recojo = {
    codigo_qr: '',
    cliente: '',
    estado: 'Vacío',
    motivo: 'Recarga',
    observaciones: ''
  };

  constructor(
    private supabase: SupabaseService,
    private toastController: ToastController,
    private alertController: AlertController,
    private router: Router,
    private cdRef: ChangeDetectorRef,
    private identificacionFoto: IdentificacionFotoService
  ) {
    addIcons({
      downloadOutline,
      searchOutline,
      alertCircleOutline,
      checkmarkCircleOutline,
      businessOutline,
      personOutline,
      timeOutline,
      checkmarkDoneOutline,
      cubeOutline,
      listOutline,
      chevronForwardOutline,
      calendarOutline,
      cameraOutline
    });
  }

  ionViewWillEnter() {
    this.cargarAlmacenes();
  }

  async cargarAlmacenes() {
    try {
      const { data, error } = await this.supabase.supabase
        .from('almacenes')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al obtener almacenes:', error);
        return;
      }

      this.listaAlmacenes = data || [];
    } catch (err) {
      console.error('Error inesperado al cargar almacenes:', err);
    }
  }

  /**
   * Devuelve la clase de color según el tipo de gas, sin depender de que el
   * texto venga EXACTAMENTE igual (tildes, mayúsculas o espacios de más
   * suelen romper una comparación === directa contra el valor de la BD).
   * Misma paleta que Salida: oxígeno verde, acetileno rojo, etc.
   */
  obtenerClaseBadgeGas(tipoGas: string | null | undefined): string {
    if (!tipoGas) return '';

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

  obtenerNombreAlmacenDestino(): string {
    if (!this.almacenDestinoId) return '';
    const alm = this.listaAlmacenes.find((a: any) => a.id === this.almacenDestinoId);
    return alm ? alm.nombre : '';
  }

  /** Almacén desde el que salió el cilindro (antes de llegar al cliente / destino). */
  obtenerNombreAlmacenOrigen(): string {
    const idOrigen = this.cilindroEncontrado?._est?.almacenId;
    if (!idOrigen) return '';
    const alm = this.listaAlmacenes.find((a: any) => a.id === idOrigen);
    return alm ? alm.nombre : '';
  }

  /** Arma la ficha que se muestra: datos del inventario + su último movimiento. */
  private armarFicha(inventario: any, est: EstadoCilindro): any {
    const inv = inventario || {};
    return {
      ...inv,
      numero_serie: inv.numero_serie || est.serie,
      fecha_ultima_salida: est.fecha,
      estado_fisico: est.estadoRegistro,
      _est: est
    };
  }

  // --- Picker de cilindros en salida (con clientes) ---

  async abrirModalListaCilindros() {
    this.modalListaAbierto = true;
    this.terminoBusquedaLista = '';
    await this.cargarCilindrosEnSalida();
  }

  cerrarModalListaCilindros() {
    this.modalListaAbierto = false;
  }

  /**
   * Trae TODOS los cilindros que salieron y aún no se recogen: aquellos cuyo
   * último movimiento en los historiales es una salida (a un cliente, a otro
   * almacén o a un lugar indicado en observación).
   */
  async cargarCilindrosEnSalida() {
    this.cargandoLista = true;
    this.cdRef.detectChanges();

    try {
      const estados = await cargarEstados(this.supabase.supabase);
      const fuera: EstadoCilindro[] = Array.from(estados.values())
        .filter(e => haSalido(e))
        .sort((a, b) => b.ms - a.ms);

      // Datos del inventario (gas, marca, capacidad) en UNA consulta
      const inventario = new Map<string, any>();
      if (fuera.length > 0) {
        const { data, error } = await this.supabase.supabase
          .from('cilindros')
          .select('*')
          .in('numero_serie', fuera.map(e => e.serie));
        if (error) {
          console.warn('No se pudieron leer los datos del inventario:', error);
        } else {
          (data || []).forEach((c: any) => inventario.set(normalizarSerie(c.numero_serie), c));
        }
      }

      this.cilindrosEnSalida = fuera.map(e => this.armarFicha(inventario.get(e.serie), e));
      await this.adjuntarNombresClientes(this.cilindrosEnSalida);
    } catch (err) {
      console.error('Error al cargar los cilindros que salieron:', err);
      this.cilindrosEnSalida = [];
      this.mostrarToast('No se pudo cargar la lista de cilindros que salieron.', 'danger');
    } finally {
      this.filtrarListaCilindros();
      this.cargandoLista = false;
      this.cdRef.detectChanges();
    }
  }

  /** Texto de a dónde fue el cilindro cuando no hay un cliente con nombre. */
  private textoDestinoSinCliente(est: EstadoCilindro): string {
    const almacenDestino = est.almacenDestinoId
      ? `Almacén: ${this.listaAlmacenes.find((a: any) => a.id === est.almacenDestinoId)?.nombre || est.almacenDestinoId}`
      : '';
    return est.destino || almacenDestino || est.observacion || '';
  }

  /**
   * Trae en UNA sola consulta los nombres de los clientes que aparecen en la
   * lista y los agrega a cada fila como `_clienteNombre`. Si la salida no fue
   * a un cliente, se usa el destino guardado (almacén u observación).
   */
  private async adjuntarNombresClientes(cilindros: any[]) {
    const ids = Array.from(
      new Set(cilindros.map((c: any) => c._est?.clienteId).filter((id: any) => !!id))
    );

    const mapa: { [id: number]: string } = {};
    if (ids.length > 0) {
      try {
        const { data, error } = await this.supabase.supabase
          .from('clientes')
          .select('id, nombre_razon_social')
          .in('id', ids);

        if (error || !data) {
          console.warn('No se pudieron resolver los nombres de clientes de la lista:', error);
        } else {
          data.forEach((c: any) => { mapa[c.id] = c.nombre_razon_social; });
        }
      } catch (err) {
        console.warn('Error inesperado al resolver nombres de clientes:', err);
      }
    }

    cilindros.forEach((c: any) => {
      const est: EstadoCilindro = c._est;
      c._clienteNombre = (est.clienteId && mapa[est.clienteId]) || this.textoDestinoSinCliente(est);
    });
  }

  filtrarListaCilindros(event?: any) {
    if (event) {
      this.terminoBusquedaLista = (event?.detail?.value || '').toString();
    }

    const termino = this.terminoBusquedaLista.toLowerCase().trim();

    if (!termino) {
      this.cilindrosEnSalidaFiltrados = [...this.cilindrosEnSalida];
      return;
    }

    this.cilindrosEnSalidaFiltrados = this.cilindrosEnSalida.filter((c: any) => {
      const serie = String(c.numero_serie || '').toLowerCase();
      const cliente = String(c._clienteNombre || '').toLowerCase();
      const gas = String(c.tipo_gas || '').toLowerCase();
      return serie.includes(termino) || cliente.includes(termino) || gas.includes(termino);
    });
  }

  /**
   * Se elige un cilindro directamente desde la lista (ya sabemos que salió
   * porque así se armó la lista), sin necesidad de volver a buscarlo por serie.
   */
  seleccionarCilindroDeLista(cil: any) {
    this.recojo.codigo_qr = cil.numero_serie;
    this.metodoIdentificacion = 'lista';
    this.trazaIAActual = null;
    this.cilindroEncontrado = cil;
    this.origenEntidadNombre = cil._clienteNombre || 'Cliente no especificado';
    this.recojo.cliente = this.origenEntidadNombre;
    this.modalListaAbierto = false;
    this.cdRef.detectChanges();
  }

  /**
   * El botón "Registrar Recojo" solo se habilita si ya se buscó el cilindro,
   * sigue siendo la misma serie que hay escrita en el campo, su último
   * movimiento es una salida (salió), y ya se eligió a qué almacén regresa.
   */
  hayCilindroValido(): boolean {
    return !!this.cilindroEncontrado &&
      normalizarSerie(this.cilindroEncontrado.numero_serie) === normalizarSerie(this.recojo.codigo_qr) &&
      haSalido(this.cilindroEncontrado._est) &&
      !!this.almacenDestinoId;
  }

  async mostrarAlerta(titulo: string, mensaje: string) {
    const alert = await this.alertController.create({ header: titulo, message: mensaje, buttons: ['OK'] });
    await alert.present();
  }

  /**
   * Resuelve a quién / a dónde fue el cilindro en su última salida. Se hace en
   * una consulta APARTE para que, si falla (RLS distinto en `clientes`, id
   * inexistente), la búsqueda del cilindro en sí no se vea afectada.
   */
  private async resolverNombreCliente(est: EstadoCilindro): Promise<string> {
    if (est.clienteId) {
      try {
        const { data, error } = await this.supabase.supabase
          .from('clientes')
          .select('id, nombre_razon_social')
          .eq('id', est.clienteId)
          .maybeSingle();

        if (!error && data?.nombre_razon_social) {
          return data.nombre_razon_social;
        }
      } catch (err) {
        console.warn('No se pudo resolver el nombre del cliente por id:', err);
      }
    }

    return this.textoDestinoSinCliente(est) || 'Cliente no especificado';
  }

  /**
   * Busca el cilindro por su serie/código QR y, si lo encuentra, autocompleta
   * "cliente" con a quién / a dónde salió. Solo se puede recoger un cilindro
   * que SALIÓ (su último movimiento es una salida): si figura dentro de
   * planta, es un recojo duplicado y se bloquea.
   */
  async buscarCilindro() {
    const serie = this.recojo.codigo_qr.trim();
    if (!serie) return;

    this.buscando = true;
    this.cilindroEncontrado = null;
    this.origenEntidadNombre = '';
    this.cdRef.detectChanges();

    try {
      // 1) Buscar el cilindro en el inventario SOLO (sin JOIN)
      const { data, error } = await this.supabase.supabase
        .from('cilindros')
        .select('*')
        .eq('numero_serie', serie)
        .maybeSingle();

      if (error) {
        console.error('Error al buscar el cilindro:', error);
        this.mostrarToast('Error al buscar el cilindro: ' + error.message, 'danger');
        return;
      }

      if (!data) {
        await this.mostrarAlerta('No encontrado', 'No se encontró ningún cilindro con esa serie.');
        return;
      }

      // 2) Estado actual = último movimiento en los historiales
      const estado = await obtenerEstado(this.supabase.supabase, data.numero_serie);

      if (!haSalido(estado)) {
        this.recojo.cliente = '';
        await this.mostrarAlerta(
          'No se puede recoger',
          `El cilindro ${data.numero_serie} figura EN ALMACÉN (último movimiento: ${estado.movimiento || 'ninguno, nunca ha tenido salida'}), no ha salido. ` +
          `Primero debe registrarse su Salida.`
        );
        return;
      }

      // Solo llega hasta acá si su último movimiento fue una salida
      this.cilindroEncontrado = this.armarFicha(data, estado);

      // 3) Resolver el nombre del cliente por separado (best-effort)
      this.origenEntidadNombre = await this.resolverNombreCliente(estado);
      this.recojo.cliente = this.origenEntidadNombre;

    } catch (err: any) {
      console.error('Error al buscar el cilindro:', err);
      this.mostrarToast('Error al buscar el cilindro: ' + (err?.message || ''), 'danger');
    } finally {
      this.buscando = false;
      this.cdRef.detectChanges();
    }
  }

  /**
   * Escanea el código/serie con la cámara (reconocimiento por Machine
   * Learning), igual que en Ingreso y Salida, y dispara la misma búsqueda
   * que si se hubiera escrito y presionado buscar.
   */
  async abrirEscanerML() {
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
          this.recojo.codigo_qr = codigoLeido;
          this.metodoIdentificacion = 'qr';
          this.trazaIAActual = null;
          await this.buscarCilindro();
        }
      }
    } catch (err: any) {
      this.mostrarToast('Error al escanear: ' + (err.message || err), 'danger');
    }
  }

  /**
   * Identifica el cilindro con una foto del troquelado. La IA propone el
   * número y el operario lo confirma antes de seguir; a partir de ahí el
   * flujo es el mismo que al escribirlo o escanear el QR.
   */
  async identificarPorFoto() {
    const resultado = await this.identificacionFoto.identificar();
    if (!resultado) return;

    this.recojo.codigo_qr = resultado.serie;
    this.metodoIdentificacion = 'foto';
    this.trazaIAActual = resultado.traza;
    await this.buscarCilindro();
  }

  /** Escribir a mano anula el origen de una foto, QR o lista previos. */
  alEscribirCodigo() {
    this.metodoIdentificacion = 'manual';
    this.trazaIAActual = null;
  }

  async guardarRecojo() {
    if (this.cargando) return;

    if (!this.recojo.codigo_qr.trim() || !this.recojo.cliente.trim()) {
      this.mostrarToast('Por favor completa los campos obligatorios (*)', 'warning');
      return;
    }

    if (!this.almacenDestinoId) {
      this.mostrarToast('Selecciona a qué almacén regresa el cilindro.', 'warning');
      return;
    }

    // BLOQUEO: no se guarda si no se validó el cilindro (buscándolo o eligiéndolo
    // de la lista), o si la serie se editó después de buscar.
    if (!this.hayCilindroValido()) {
      await this.mostrarAlerta(
        'Cilindro no verificado',
        'Debes buscar el cilindro (botón de buscar, o eligiéndolo de la lista de cilindros que salieron) antes de registrar el recojo, y debe figurar como salido.'
      );
      return;
    }

    this.cargando = true;
    this.cdRef.detectChanges();

    const serie = this.recojo.codigo_qr.trim();
    const fechaRecojo = new Date();

    try {
      // Foto de los datos para el comprobante (antes de limpiar el formulario)
      const comprobante = await this.armarComprobante(fechaRecojo);

      // RE-VERIFICACIÓN: alguien más pudo haberlo recogido desde otro celular
      // mientras tenías este formulario abierto (evita recojos duplicados).
      const estadoActual = await obtenerEstado(this.supabase.supabase, serie);
      if (!haSalido(estadoActual)) {
        this.cargando = false;
        this.cdRef.detectChanges();
        await this.mostrarAlerta(
          'Ya no se puede recoger',
          'Este cilindro ya fue recogido (o ya no figura como salido) mientras completabas el formulario. Vuelve a buscarlo.'
        );
        this.resetFormulario();
        return;
      }

      // 1) Registro del recojo. Con este registro el cilindro vuelve a estar
      // DENTRO: el estado se calcula desde el historial, no hace falta
      // actualizar la tabla `cilindros`.
      const { error } = await this.supabase.supabase
        .from('recojos')
        .insert([
          {
            codigo_qr: serie,
            cliente: this.recojo.cliente,
            estado: this.recojo.estado,
            motivo: this.recojo.motivo,
            observaciones: this.recojo.observaciones,
            almacen_destino_id: this.almacenDestinoId,
            fecha_recojo: fechaRecojo.toISOString()
          }
        ]);

      if (error) throw error;

      // 2) El cilindro vuelve a ingresar al almacén: se deja un registro en el
      // Historial de Ingresos (fecha y almacén reales de este regreso). Es un
      // paso secundario: si falla, el recojo igual queda bien guardado.
      await this.registrarReingreso(serie);

      const nombreAlmacen = this.obtenerNombreAlmacenDestino();
      this.mostrarToast(`Recojo registrado. Cilindro de vuelta en ${nombreAlmacen}, a nombre de ${this.razonSocial}.`, 'success');

      this.resetFormulario();
      await this.ofrecerComprobante(comprobante);

    } catch (error: any) {
      console.error('Error al guardar el recojo:', error);
      this.mostrarToast('Error al guardar: ' + (error.message || 'Intente de nuevo'), 'danger');
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  /**
   * Registra en `ingreso_cilindros` el regreso del cilindro al almacén, para
   * que vuelva a aparecer en el Historial de Ingresos con la fecha y el
   * almacén de ESTE regreso (y no con los de su primer ingreso).
   */
  private async registrarReingreso(serie: string) {
    try {
      const cil = this.cilindroEncontrado || {};
      const userRes = await this.supabase.supabase.auth.getUser();
      const usuarioId = userRes?.data?.user?.id || null;

      const detalle = [
        `Recojo de ${this.recojo.cliente}`,
        `Estado: ${this.recojo.estado}`,
        `Motivo: ${this.recojo.motivo}`,
        this.recojo.observaciones ? this.recojo.observaciones.trim() : ''
      ].filter(t => t !== '').join(' | ');

      const { error } = await this.supabase.supabase
        .from('ingreso_cilindros')
        .insert([{
          propiedad: 'ELECTRAMETAL',
          cliente_id: null,
          estado: this.recojo.estado === 'Vacío' ? 'VACIO' : 'DEVOLUCION',
          almacen_id: this.almacenDestinoId,
          observacion: detalle,
          cilindros_ingresados: [{
            numero_serie: normalizarSerie(serie),
            tipo_gas: cil.tipo_gas || '',
            capacidad: `${cil.litros || cil.contenido || ''} ${cil.unidad_medida || ''}`.trim(),
            // Trazabilidad de la identificación. Va aquí, en el JSONB del
            // reingreso, y no en la tabla `recojos`: esa tabla tiene columnas
            // fijas y un campo desconocido haría fallar el guardado.
            metodo_identificacion: this.metodoIdentificacion,
            ...(this.trazaIAActual ? { ia: this.trazaIAActual } : {})
          }],
          usuario_id: usuarioId
        }]);

      if (error) {
        console.error('El recojo se guardó, pero no se pudo registrar el reingreso en el historial:', error);
        this.mostrarToast('Recojo guardado, pero no se pudo anotar el reingreso en el Historial de Ingresos.', 'warning');
      }
    } catch (err) {
      console.error('Error inesperado al registrar el reingreso:', err);
    }
  }

  // ===== COMPROBANTE DE DEVOLUCIÓN EN PDF =====

  /**
   * Reúne todo lo que lleva el comprobante: datos del recojo, del cliente que
   * devuelve (con su dirección, si se puede leer) y todas las características
   * del cilindro. Se arma ANTES de limpiar el formulario.
   */
  private async armarComprobante(fechaRecojo: Date): Promise<any> {
    const cil = this.cilindroEncontrado || {};
    const est: EstadoCilindro | undefined = cil._est;

    let cliente: any = { nombre: this.recojo.cliente, documento: '', direccion: '' };
    if (est?.clienteId) {
      try {
        const { data } = await this.supabase.supabase
          .from('clientes')
          .select('nombre_razon_social, tipo_documento, num_documento, direccion')
          .eq('id', est.clienteId)
          .maybeSingle();
        if (data) {
          cliente = {
            nombre: data.nombre_razon_social || this.recojo.cliente,
            documento: `${data.tipo_documento || 'DOC'}: ${data.num_documento || '-'}`,
            direccion: data.direccion || ''
          };
        }
      } catch (err) {
        console.warn('No se pudieron leer los datos del cliente para el comprobante:', err);
      }
    }

    return {
      fechaRecojo,
      fechaSalida: cil.fecha_ultima_salida ? new Date(cil.fecha_ultima_salida) : null,
      almacenOrigen: this.obtenerNombreAlmacenOrigen(),
      almacenDestino: this.obtenerNombreAlmacenDestino(),
      cliente,
      estado: this.recojo.estado,
      motivo: this.recojo.motivo,
      observaciones: (this.recojo.observaciones || '').trim(),
      cilindro: { ...cil, _est: undefined }
    };
  }

  /** Tras guardar el recojo: ofrece bajar el comprobante antes de volver al inicio. */
  private async ofrecerComprobante(comprobante: any) {
    const alert = await this.alertController.create({
      header: 'Recojo registrado',
      message: `El cilindro ${comprobante?.cilindro?.numero_serie || ''} regresó a ${comprobante?.almacenDestino || 'el almacén'}. ¿Deseas el comprobante de devolución en PDF?`,
      backdropDismiss: false,
      buttons: [
        {
          text: 'Descargar comprobante PDF',
          handler: () => {
            this.descargarComprobante(comprobante);
            return false; // deja el aviso abierto para poder cerrarlo después
          }
        },
        {
          text: 'Cerrar',
          role: 'cancel',
          handler: () => {
            this.router.navigate(['/home']);
          }
        }
      ]
    });
    await alert.present();
  }

  private fmtFecha(d: Date | null): string {
    return d && !isNaN(d.getTime())
      ? d.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : 'No registrada';
  }

  private fmtHora(d: Date | null): string {
    return d && !isNaN(d.getTime())
      ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })
      : '';
  }

  descargarComprobante(c: any) {
    if (!c) return;
    const cil = c.cilindro || {};
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

    const p = (n: number) => String(n).padStart(2, '0');
    const f: Date = c.fechaRecojo;
    const numero = `RC-${f.getFullYear()}${p(f.getMonth() + 1)}${p(f.getDate())}-${p(f.getHours())}${p(f.getMinutes())}${p(f.getSeconds())}`;

    // --- Encabezado ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(this.razonSocial, M, y + 5);
    doc.setFontSize(10);
    doc.text(`N° ${numero}`, ANCHO - M, y + 5, { align: 'right' });
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`RUC: ${this.rucProveedor}`, M, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('COMPROBANTE DE DEVOLUCIÓN DE CILINDRO', M, y);
    y += 3;
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.6);
    doc.line(M, y, ANCHO - M, y);
    y += 8;

    const seccion = (titulo: string) => {
      asegurarEspacio(14);
      doc.setFillColor(204, 251, 241);
      doc.rect(M, y - 4.5, ANCHO - M * 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(titulo, M + 2, y);
      y += 7;
    };

    const fila = (etiqueta: string, valor: string) => {
      const lineas: string[] = doc.splitTextToSize(valor || '-', ANCHO - M * 2 - 48);
      asegurarEspacio(lineas.length * 5 + 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`${etiqueta}:`, M + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.text(lineas, M + 50, y);
      y += lineas.length * 5 + 1;
    };

    // --- Datos del recojo ---
    seccion('DATOS DEL RECOJO');
    fila('Fecha de recojo', this.fmtFecha(c.fechaRecojo));
    fila('Hora de recojo', this.fmtHora(c.fechaRecojo));
    fila('Motivo', c.motivo);
    fila('Estado al recoger', c.estado);
    fila('Regresó al almacén', c.almacenDestino || '-');
    fila('Recibido a nombre de', this.razonSocial);
    y += 3;

    // --- Cliente que devuelve ---
    seccion('CLIENTE QUE DEVUELVE');
    fila('Cliente / Empresa', String(c.cliente?.nombre || '-').toUpperCase());
    if (c.cliente?.documento) fila('Documento', c.cliente.documento);
    fila('Dirección / Ubicación', c.cliente?.direccion || 'No registrada');
    y += 3;

    // --- Recorrido del cilindro ---
    seccion('RECORRIDO DEL CILINDRO');
    fila('Salió el', c.fechaSalida ? `${this.fmtFecha(c.fechaSalida)} · ${this.fmtHora(c.fechaSalida)}` : 'No registrada');
    fila('Salió del almacén', c.almacenOrigen || 'No especificado');
    fila('Devuelto el', `${this.fmtFecha(c.fechaRecojo)} · ${this.fmtHora(c.fechaRecojo)}`);
    if (c.fechaSalida && !isNaN(c.fechaSalida.getTime())) {
      const dias = Math.max(0, Math.floor((c.fechaRecojo.getTime() - c.fechaSalida.getTime()) / 86400000));
      fila('Tiempo fuera', `${dias} día(s)`);
    }
    y += 3;

    // --- Características del cilindro ---
    seccion('CARACTERÍSTICAS DEL CILINDRO');
    const capacidad = [
      cil.litros ? `${cil.litros} L` : '',
      cil.contenido ? `${cil.contenido} ${cil.tipo_gas === 'ACETILENO' ? 'kg' : (cil.unidad_medida || '')}`.trim() : ''
    ].filter(t => t).join(' · ') || '-';

    fila('N° de serie', String(cil.numero_serie || '-'));
    fila('Tipo de gas', String(cil.tipo_gas || '-').toUpperCase());
    fila('Marca', cil.marca || '-');
    fila('Año de fabricación', cil.anio_fabricacion || '-');
    fila('Capacidad', capacidad);
    fila('Unidad de medida', cil.unidad_medida || '-');
    fila('Peso', cil.peso ? `${cil.peso} kg` : '-');
    fila('Diámetro', cil.ancho_diametro ? `${cil.ancho_diametro} cm` : '-');
    fila('Altura', cil.largo_altura ? `${cil.largo_altura} cm` : '-');
    fila('Color', cil.color || '-');
    fila('Prueba hidrostática (PH)', cil.ph || '-');
    fila('Procedencia', cil.procedencia || '-');

    // --- Observaciones ---
    if (c.observaciones) {
      y += 3;
      seccion('OBSERVACIONES');
      fila('Detalle', c.observaciones);
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
    doc.text('ENTREGADO POR (CLIENTE)', M + 42, y, { align: 'center' });
    doc.text('RECIBIDO POR', ANCHO - M - 42, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Nombre, DNI y firma', M + 42, y, { align: 'center' });
    doc.text(this.razonSocial, ANCHO - M - 42, y, { align: 'center' });

    const nombre = String(cil.numero_serie || 'cilindro').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`comprobante_devolucion_${nombre}.pdf`);
  }

  resetFormulario() {
    this.recojo = {
      codigo_qr: '',
      cliente: '',
      estado: 'Vacío',
      motivo: 'Recarga',
      observaciones: ''
    };
    this.cilindroEncontrado = null;
    this.origenEntidadNombre = '';
    this.almacenDestinoId = null;
    this.metodoIdentificacion = 'manual';
    this.trazaIAActual = null;
  }

  async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 3000,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }
}