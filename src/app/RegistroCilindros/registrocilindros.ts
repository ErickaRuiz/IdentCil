import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
  IonHeader
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
  optionsOutline
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
    IonModal
  ]
})
export class RegistroCilindrosPage implements OnInit {

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
      chevronForwardOutline
    });
  }

  async ngOnInit() { }

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
      this.cilindro.id = data.id;
      this.cilindro.numeroSerie = data.numero_serie || data.numeroSerie || '';
      this.cilindro.clienteId = data.cliente_id || data.clienteId || null;
      this.cilindro.tipoGas = data.tipo_gas || data.tipoGas || '';
      this.cilindro.marca = data.marca || '';
      this.cilindro.anioFabricacion = data.anio_fabricacion || data.anioFabricacion || null;
      // En registrocilindros.ts -> cargarCilindroParaEdicion()
      this.cilindro.unidadMedida = data.unidad_medida || data.unidadMedida || data.m3 || ''; this.cilindro.peso = data.peso || null;
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

      this.cdRef.detectChanges();
    }
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

  seleccionarCliente(cliente: any, modal: any) {
    this.cilindro.clienteId = cliente.id;
    this.clienteSeleccionadoNombre = cliente.nombre_razon_social.toUpperCase();
    modal.dismiss();
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

    let phFinal = this.cilindro.ph ? this.cilindro.ph.trim().toUpperCase() : '';
    if (!phFinal) {
      const gases5Anios = ['DIÓXIDO DE CARBONO', 'MEZCLA'];
      const esDe5Anios = gases5Anios.includes(this.cilindro.tipoGas.toUpperCase());
      phFinal = esDe5Anios ? 'CADA 5 AÑOS PH' : 'CADA 10 AÑOS PH';
    }

    const payload = {
      numero_serie: this.cilindro.numeroSerie.trim().toUpperCase(),
      cliente_id: this.cilindro.clienteId,
      tipo_gas: this.cilindro.tipoGas,
      marca: this.cilindro.marca ? this.cilindro.marca.trim().toUpperCase() : null,
      anio_fabricacion: this.cilindro.anioFabricacion ? this.cilindro.anioFabricacion.trim() : null,
      unidad_medida: this.cilindro.unidadMedida ? this.cilindro.unidadMedida.trim() : null, peso: this.cilindro.peso ? Number(this.cilindro.peso) : null,
      ancho_diametro: this.cilindro.anchoDiametro ? Number(this.cilindro.anchoDiametro) : null,
      largo_altura: this.cilindro.largoAltura ? Number(this.cilindro.largoAltura) : null,
      litros: this.cilindro.tipoGas !== 'ACETILENO' && this.cilindro.litros ? Number(this.cilindro.litros) : null,
      contenido: this.cilindro.tipoGas === 'ACETILENO' && this.cilindro.contenido ? Number(this.cilindro.contenido) : null,
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