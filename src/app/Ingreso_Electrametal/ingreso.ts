import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavController, ToastController, AlertController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
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
  checkmarkDoneOutline, checkmarkOutline, cameraOutline, flaskOutline, addCircleOutline, closeCircleOutline, chevronForwardOutline, timeOutline } from 'ionicons/icons';
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

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private cdRef: ChangeDetectorRef,
    private alertController: AlertController,
    private router: Router

  ) {
    addIcons({arrowBackOutline,timeOutline,searchOutline,chevronForwardOutline,cameraOutline,checkmarkDoneOutline,addCircleOutline,trashOutline,closeCircleOutline,flaskOutline,qrCodeOutline,checkmarkOutline});
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
    if (!this.serieActual) return;

    const { data, error } = await this.supabaseService.supabase
      .from('cilindros')
      .select('*')
      .eq('numero_serie', this.serieActual.trim())
      .single();

    if (data) {
      this.cilindroEncontrado = data;

      // Agrega directamente al arreglo que evalúa guardarIngreso()
      this.listaCilindros.push({
        numeroSerie: data.numero_serie,
        tipoGas: data.tipo_gas,
        capacidad: `${data.litros || data.contenido || ''} ${data.unidad_medida || ''}`.trim()
      });

      this.serieActual = ''; // Limpia el buscador
      this.cdRef.detectChanges();
    } else {
      this.mostrarAlerta('No encontrado', 'El cilindro ingresado no existe.');
    }
  }

  agregarCilindroALista() {
    if (!this.cilindroEncontrado) return;

    this.listaCilindros.push({
      numeroSerie: this.cilindroEncontrado.numero_serie,
      tipoGas: this.cilindroEncontrado.tipo_gas,
      capacidad: `${this.cilindroEncontrado.litros || this.cilindroEncontrado.contenido || ''} ${this.cilindroEncontrado.unidad_medida || ''}`.trim()
    });

    this.cilindroEncontrado = null; // Cierra la tarjeta
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
    console.log('=== INICIO GUARDAR INGRESO ===');
    console.log('Propiedad:', this.propiedad);
    console.log('Entidad ID:', this.entidadSeleccionadaId);
    console.log('Almacén ID:', this.almacenId);
    console.log('Cilindros:', this.listaCilindros);

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
      // 4. Mapear payload de cilindros para la columna JSONB
      const cilindrosPayload = this.listaCilindros.map(item => ({
        numero_serie: item.numeroSerie || item.numero_serie || '',
        tipo_gas: item.tipoGas || item.tipo_gas || '',
        capacidad: item.capacidad || item.litros || item.contenido || ''
      }));

      // 5. Obtener ID del usuario autenticado (si aplica)
      const userRes = await this.supabaseService.supabase.auth.getUser();
      const usuarioId = userRes?.data?.user?.id || null;

      // 6. Estructurar objeto final
      const datosIngreso = {
        propiedad: this.propiedad,
        cliente_id: this.propiedad !== 'ELECTRAMETAL' ? this.entidadSeleccionadaId : null,
        estado: this.estado,
        almacen_id: this.almacenId,
        observacion: this.observacion ? this.observacion.trim() : null,
        cilindros_ingresados: cilindrosPayload,
        usuario_id: usuarioId
      };

      console.log('Enviando datos a Supabase:', datosIngreso);

      // 7. Insertar en Supabase
      const { data, error } = await this.supabaseService.supabase
        .from('ingreso_cilindros')
        .insert([datosIngreso])
        .select();

      if (error) {
        throw error;
      }

      console.log('Respuesta Supabase exitosa:', data);

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