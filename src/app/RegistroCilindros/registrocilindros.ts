import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
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
  listOutline
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
    IonContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonSearchbar,
    IonModal
  ]
})
export class RegistroCilindrosPage implements OnInit {

  // Modelo del formulario
  cilindro = {
    numeroSerie: '',
    clienteId: '' as any,
    tipoGas: ''
  };

  filtroCliente: string = '';
  clienteSeleccionadoNombre: string = '';

  // Lista original de clientes
  listaClientes: any[] = [
    { id: 1, nombre_razon_social: 'ELECTRAMETAL NORPERU SAC', tipo_documento: 'RUC', num_documento: '20536193805' },
    { id: 2, nombre_razon_social: 'ERICKA YADIRA RUIZ POLO', tipo_documento: 'DNI', num_documento: '74054821' }
  ];

  // Copia filtrada para el buscador
  clientesFiltrados: any[] = [];

  constructor(private supabaseService: SupabaseService,private cdRef: ChangeDetectorRef ) {
    addIcons({
      barcodeOutline,
      businessOutline,
      flaskOutline,
      saveOutline,
      arrowBackOutline,
      chevronDownOutline,
      searchOutline,
      chevronForwardOutline,
      listOutline
    });
  }

  async ngOnInit() {
    // Cargar clientes reales desde Supabase
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
    this.cilindro.tipoGas = ''; // Limpia el gas al cambiar de cliente
    modal.dismiss();
  }

  async guardarCilindro() {
    if (!this.cilindro.numeroSerie.trim() || !this.cilindro.clienteId || !this.cilindro.tipoGas) {
      alert('Por favor complete todos los campos');
      return;
    }

    const { error } = await this.supabaseService.supabase
      .from('cilindros')
      .insert([
        {
          numero_serie: this.cilindro.numeroSerie.trim().toUpperCase(),
          cliente_id: this.cilindro.clienteId,
          tipo_gas: this.cilindro.tipoGas
        }
      ]);

    if (error) {
      console.error('Error al guardar:', error.message);
      alert('Error al registrar el cilindro: ' + error.message);
    } else {
      alert('¡Cilindro registrado exitosamente!');
      this.limpiarFormulario(); // <-- Aquí se vacían todos los campos
    }
  }

limpiarFormulario() {
  this.cilindro.numeroSerie = '';
  this.cilindro.clienteId = '';
  this.cilindro.tipoGas = '';

  this.clienteSeleccionadoNombre = '';
  this.filtroCliente = '';

  this.clientesFiltrados = [...this.listaClientes];

  // Fuerza a Angular a refrescar la vista en pantalla inmediatamente
  this.cdRef.detectChanges();
}
}