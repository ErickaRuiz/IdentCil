import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavController, ToastController, AlertController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import { normalizarSerie, obtenerEstado, cargarEstados, estaDentro, haSalido, EstadoCilindro } from '../services/cilindro-estado';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
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
  IonFooter,
  IonSpinner, IonModal
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  searchOutline,
  qrCodeOutline,
  trashOutline,
  checkmarkDoneOutline, checkmarkOutline, cameraOutline, flaskOutline, addCircleOutline, closeCircleOutline, chevronForwardOutline, timeOutline
} from 'ionicons/icons';
import { IonList, IonSearchbar } from "@ionic/angular";

@Component({
  selector: 'app-ingreso',
  templateUrl: './ingreso.html',
  styleUrls: ['./ingreso.scss'],
  standalone: true,
  imports: [IonSearchbar, IonList,
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
export class IngresoPage implements OnInit {

  razonSocial: string = 'ELECTRAMETAL NORPERU SAC';
  rucProveedor: string = '20536193805';
  propiedad: string = 'ELECTRAMETAL';
  estado: string = 'VACIO';

  serieActual: string = '';
  listaCilindros: any[] = [];
  cargando: boolean = false;

  // Variables de Almacén
  almacenId: number | null = null;
  observacion: string = '';
  listaAlmacenes: any[] = [];

  // Variables de Entidades
  entidadSeleccionadaId: number | null = null;
  listaEntidades: any[] = [];
  todasLasEntidades: any[] = [];

  tipoGasSeleccionado: string = '';
  marcaSeleccionada: string = '';
  capacidadSeleccionada: string = '';
  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private cdRef: ChangeDetectorRef,
    private alertController: AlertController,
    private router: Router

  ) {
    addIcons({ arrowBackOutline, timeOutline, searchOutline, chevronForwardOutline, cameraOutline, checkmarkDoneOutline, addCircleOutline, trashOutline, closeCircleOutline, flaskOutline, qrCodeOutline, checkmarkOutline });
  }


  async mostrarAlerta(titulo: string, mensaje: string) {
    const alert = await this.alertController.create({
      header: titulo,
      message: mensaje,
      buttons: ['OK']
    });

    await alert.present();
  }
  async ngOnInit() {
    await Promise.all([
      this.cargarAlmacenes(),
      this.cargarEntidades()
    ]);
  }

  regresar() {
    this.navCtrl.back();
  }

  async cargarAlmacenes() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('almacenes')
        .select('id, nombre') // Trae la clave primaria y el nombre del almacén
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al obtener almacenes:', error);
      } else {
        this.listaAlmacenes = data || [];

        // Opcional: Seleccionar el primer almacén por defecto
        if (this.listaAlmacenes.length > 0) {
          this.almacenId = this.listaAlmacenes[0].id;
        }
      }
    } catch (err) {
      console.error('Error al conectar con la tabla almacenes:', err);
    }
  }

  // Llámalo dentro del ciclo de vida de la página
  ionViewWillEnter() {
    this.cargarAlmacenes();
  }

  async cargarEntidades() {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('clientes')
        .select('*');

      if (error) throw error;

      this.todasLasEntidades = data || [];

      if (this.propiedad) {
        this.onPropiedadChange();
      }
    } catch (err: any) {
      console.error('Error al cargar entidades:', err);
    }
  }

  async onPropiedadChange() {
    this.entidadSeleccionadaId = null;
    this.listaEntidades = [];
    this.entidadesFiltradas = [];

    if (this.propiedad === 'ELECTRAMETAL') return;

    const { data, error } = await this.supabaseService.supabase
      .from('clientes')
      .select('*');

    if (error) {
      console.error('Error al cargar entidades:', error);
      return;
    }

    if (data) {
      if (this.propiedad === 'Proveedor') {
        // Solo Empresas / RUC (11 dígitos)
        this.listaEntidades = data.filter(e =>
          e.tipo_documento === 'Empresa (RUC)' ||
          e.tipo_documento === 'RUC' ||
          e.ruc ||
          (e.num_documento && String(e.num_documento).length === 11) ||
          (e.numero_documento && String(e.numero_documento).length === 11)
        );
      } else if (this.propiedad === 'Cliente') {
        // SOLO DNI (8 dígitos o registros etiquetados como DNI)
        this.listaEntidades = data.filter(e => {
          const doc = String(e.dni || e.num_documento || e.numero_documento || '').trim();
          const esTipoDni = e.tipo_documento === 'Persona Natural (DNI)' || e.tipo_documento === 'DNI';

          // Excluye explícitamente los RUC (longitud 11)
          return (esTipoDni || doc.length === 8) && doc.length !== 11 && !e.ruc;
        });
      }

      this.entidadesFiltradas = [...this.listaEntidades];
      this.cdRef.detectChanges();
    }
  }


  buscarEntidadPorDoc(doc: string) {
    const entidadEncontrada = this.todasLasEntidades.find((ent: any) => {
      const numeroDoc = String(
        ent.numero_documento || ent.num_doc || ent.ruc || ent.dni || ent.ruc_dni || ''
      ).trim();
      return numeroDoc === doc.trim();
    });

    if (entidadEncontrada) {
      this.entidadSeleccionadaId = entidadEncontrada.id;
    } else {
      this.entidadSeleccionadaId = null;
    }
  }

  filtrarPorDigitos(event: any) {
    const valor = event.detail.value || '';
    if (this.propiedad === 'Proveedor' && valor.length === 11) {
      this.buscarEntidadPorDoc(valor);
    } else if (this.propiedad === 'Cliente' && valor.length === 8) {
      this.buscarEntidadPorDoc(valor);
    }
  }

  obtenerUnidadMedida(tipoGas: string): string {
    if (!tipoGas) return '';
    const gas = tipoGas.toUpperCase();

    if (gas.includes('ACETILENO') || gas.includes('DIÓXIDO') || gas.includes('DIOXIDO') || gas.includes('CO2')) {
      return 'Kg';
    }
    return 'm³';
  }

  // Variable para almacenar el cilindro encontrado y mostrarlo en pantalla
  cilindroEncontrado: any = null;

  async buscarCilindroPorSerie() {
    const serieLimpia = normalizarSerie(this.serieActual);
    if (!serieLimpia) return;

    // 1. No repetir la serie dentro de la lista que se está armando ahora
    const existeEnLista = this.listaCilindros.some(c => c.numeroSerie === serieLimpia);
    if (existeEnLista) {
      await this.mostrarAlerta(
        'Serie repetida en la lista',
        `El número de serie ${serieLimpia} ya fue agregado a la lista actual.`
      );
      this.serieActual = '';
      return;
    }

    // 2. Estado ACTUAL del cilindro = su ÚLTIMO movimiento en los historiales
    //    (ingresos, salidas y recojos). Un cilindro repite el ciclo ingreso ->
    //    salida -> recojo muchas veces, así que haber ingresado antes NO
    //    bloquea: solo se bloquea si YA está dentro de planta (duplicado).
    let estado: EstadoCilindro;
    try {
      estado = await obtenerEstado(this.supabaseService.supabase, serieLimpia);
    } catch (err: any) {
      console.error('Error al verificar el estado del cilindro:', err);
      await this.mostrarAlerta(
        'No se pudo verificar',
        `No se pudo confirmar el estado del cilindro ${serieLimpia}.\n\nDetalle: ${err?.message || err}`
      );
      this.serieActual = '';
      return;
    }

    if (estaDentro(estado)) {
      const almacenActual = this.listaAlmacenes.find(a => a.id === estado.almacenId)?.nombre;
      await this.mostrarAlerta(
        'Cilindro ya ingresado',
        `El cilindro ${serieLimpia} ya está DENTRO de planta${almacenActual ? ` (Almacén: ${almacenActual})` : ''}. ` +
        `Para volver a ingresarlo primero debe salir (Salida) y regresar (Recojo).`
      );
      this.serieActual = '';
      return;
    }

    if (haSalido(estado)) {
      this.mostrarToast(
        `Este cilindro figuraba fuera (${estado.destino || 'con un cliente'}). Se registrará su regreso.`,
        'medium'
      );
    }

    // 3. Datos reales del cilindro desde el inventario (si existe)
    const { data: cilindro } = await this.supabaseService.supabase
      .from('cilindros')
      .select('*')
      .eq('numero_serie', serieLimpia)
      .maybeSingle();

    if (!cilindro && !haSalido(estado)) {
      this.mostrarToast(
        'Esta serie no está registrada en el inventario: se ingresará, pero no podrá salir hasta registrarla.',
        'warning'
      );
    }

    this.cilindroEncontrado = cilindro
      ? {
          numero_serie: serieLimpia,
          tipo_gas: cilindro.tipo_gas || 'SIN REGISTRAR',
          marca: cilindro.marca || 'N/A',
          litros: cilindro.litros || cilindro.contenido || 'N/A',
          unidad_medida: cilindro.unidad_medida || '',
          registrado: true
        }
      : {
          numero_serie: serieLimpia,
          tipo_gas: 'OXÍGENO',
          marca: 'N/A',
          litros: 'N/A',
          unidad_medida: 'L',
          registrado: false
        };

    this.cdRef.detectChanges();
  }

  agregarCilindroALista() {
    if (!this.cilindroEncontrado) return;

    const serie = this.cilindroEncontrado.numero_serie;

    // Chequeo de seguridad preventivo
    const yaExiste = this.listaCilindros.some(item => item.numeroSerie === serie);
    if (yaExiste) {
      this.mostrarAlerta('Atención', 'Este cilindro ya está en la lista.');
      return;
    }

    this.listaCilindros.push({
      numeroSerie: serie,
      tipoGas: this.cilindroEncontrado.tipo_gas,
      capacidad: `${this.cilindroEncontrado.litros || ''} ${this.cilindroEncontrado.unidad_medida || ''}`.trim(),
      registrado: !!this.cilindroEncontrado.registrado
    });

    this.cilindroEncontrado = null;
    this.serieActual = '';
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

  async guardarIngreso() {
    // Evita que un doble toque guarde dos veces el mismo ingreso
    if (this.cargando) return;

    // 1. Validar lista de cilindros
    if (!this.listaCilindros || this.listaCilindros.length === 0) {
      await this.mostrarAlerta('Atención', 'Debe agregar al menos un cilindro a la lista antes de guardar.');
      return;
    }

    // 2. Validar selección de Almacén
    if (!this.almacenId) {
      await this.mostrarAlerta('Atención', 'Por favor seleccione un almacén destino.');
      return;
    }

    // 3. Validar selección de Cliente/Empresa si no es ELECTRAMETAL
    if (this.propiedad !== 'ELECTRAMETAL' && !this.entidadSeleccionadaId) {
      const tipo = this.propiedad === 'Proveedor' ? 'una Empresa (RUC)' : 'un Cliente (DNI)';
      await this.mostrarAlerta('Atención', `Por favor seleccione ${tipo}.`);
      return;
    }

    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      const series = this.listaCilindros
        .map(item => normalizarSerie(item.numeroSerie || item.numero_serie))
        .filter(s => s !== '');

      // 4. Verificación final anti-duplicados: ninguno debe estar ya DENTRO
      //    (por ejemplo, si otro dispositivo lo ingresó mientras se armaba la lista).
      const estados = await cargarEstados(this.supabaseService.supabase);
      const yaDentro = series.filter(s => estaDentro(estados.get(s)));

      if (yaDentro.length > 0) {
        this.cargando = false;
        this.cdRef.detectChanges();
        await this.mostrarAlerta(
          'Cilindros ya ingresados',
          `Estos cilindros ya figuran DENTRO de planta: ${yaDentro.join(', ')}. ` +
          `Quítalos de la lista (basurero) e inténtalo otra vez.`
        );
        return;
      }

      // 5. Mapear payload de cilindros para la columna JSONB
      const cilindrosPayload = this.listaCilindros.map(item => ({
        numero_serie: item.numeroSerie || item.numero_serie || '',
        tipo_gas: item.tipoGas || item.tipo_gas || '',
        capacidad: item.capacidad || item.litros || item.contenido || ''
      }));

      // 6. Usuario autenticado
      const userRes = await this.supabaseService.supabase.auth.getUser();
      const usuarioId = userRes?.data?.user?.id || null;

      const datosIngreso = {
        propiedad: this.propiedad,
        cliente_id: this.propiedad !== 'ELECTRAMETAL' ? this.entidadSeleccionadaId : null,
        estado: this.estado,
        almacen_id: Number(this.almacenId),
        observacion: this.observacion ? this.observacion.trim() : null,
        cilindros_ingresados: cilindrosPayload,
        usuario_id: usuarioId
      };

      // 7. Registrar el movimiento de ingreso. Con este registro el cilindro
      //    pasa a estar DENTRO: el estado se calcula desde el historial, no
      //    hace falta actualizar la tabla `cilindros`.
      const { error } = await this.supabaseService.supabase
        .from('ingreso_cilindros')
        .insert([datosIngreso]);

      if (error) throw error;

      await this.mostrarAlerta('¡Éxito!', 'El ingreso de cilindros se ha registrado correctamente.');
      this.limpiarFormulario();

    } catch (err: any) {
      console.error('Error al guardar en Supabase:', err);
      const mensajeError = err.message || err.error_description || 'Ocurrió un error inesperado al guardar.';
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

  private searchTimeout: any;

  // Detecta cambios en el input en tiempo real
  onInputCodigo(event: any) {
    const valor = event.detail.value || '';

    // Limpia el temporizador previo si sigue escribiendo
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Espera 400ms después de que termine de escribir para ejecutar la búsqueda en Supabase
    if (valor.trim().length >= 3) { // Puedes ajustar la longitud mínima según tus códigos
      this.searchTimeout = setTimeout(() => {
        this.buscarCilindroPorSerie();
      }, 400);
    }
  }


  // Variables para el modal y filtro
  modalAbierto: boolean = false;
  entidadesFiltradas: any[] = [];

  // Abre el modal e inicializa la lista filtrada
  abrirModalBuscador() {
    this.entidadesFiltradas = [...this.listaEntidades];
    this.modalAbierto = true;
  }

  // Cierra el modal
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
  // Guarda la entidad seleccionada y cierra el modal
  seleccionarEntidadModal(entidad: any) {
    this.entidadSeleccionadaId = entidad.id;
    this.modalAbierto = false;
  }

  // Muestra el nombre formateado en el input principal
  obtenerNombreEntidadSeleccionada(): string {
    if (!this.entidadSeleccionadaId) return '';
    const seleccionada = this.listaEntidades.find(e => e.id === this.entidadSeleccionadaId);
    if (!seleccionada) return '';

    const nombre = seleccionada.razon_social || seleccionada.nombre_razon_social || seleccionada.nombres || seleccionada.nombre || '';
    const doc = seleccionada.ruc || seleccionada.dni || seleccionada.num_documento || seleccionada.numero_documento || '';

    return doc ? `${nombre.toUpperCase()} (${doc})` : nombre.toUpperCase();
  }


  irAHistorialIngresos() {
    // Reemplaza 'historial-ingresos' por la ruta registrada en app.routes.ts
    this.router.navigate(['/historial-ingresos']);
  }
}