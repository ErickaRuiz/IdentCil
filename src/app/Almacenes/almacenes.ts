import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular';

import { SupabaseService } from '../services/supabase';
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
  IonInput,
  IonSpinner,
  IonModal
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, addCircleOutline, trashOutline, listOutline, businessOutline, locationOutline, archiveOutline, createOutline } from 'ionicons/icons';

@Component({
  selector: 'app-almacenes',
  templateUrl: './almacenes.html',
  styleUrls: ['./almacenes.scss'],
  standalone: true,
  imports: [
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
    IonInput,
    IonSpinner,
    IonModal
  ]
})
export class AlmacenesPage implements OnInit {

  nuevoAlmacen = {
    nombre: '',
    ubicacion: ''
  };

  listaAlmacenes: any[] = [];
  cargando: boolean = false;
  cargandoLista: boolean = false;
  modalAbierto: boolean = false;
  almacenEditandoId: number | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({ arrowBackOutline, addCircleOutline, listOutline, businessOutline, locationOutline, createOutline, trashOutline, archiveOutline });
  }

  ngOnInit() {}

  regresar() {
    this.navCtrl.back();
  }

  async abrirModalAlmacenes() {
    this.modalAbierto = true;
    await this.obtenerAlmacenes();
  }

  async obtenerAlmacenes() {
    this.cargandoLista = true;
    const { data, error } = await this.supabaseService.supabase
      .from('almacenes')
      .select('*')
      .order('created_at', { ascending: false });

    this.cargandoLista = false;

    if (error) {
      console.error('Error al cargar almacenes:', error.message);
      return;
    }

    if (data) {
      this.listaAlmacenes = data;
      this.cdRef.detectChanges();
    }
  }

  prepararEdicion(almacen: any) {
    this.almacenEditandoId = almacen.id;
    this.nuevoAlmacen = {
      nombre: almacen.nombre,
      ubicacion: almacen.ubicacion || ''
    };
    this.modalAbierto = false;
  }

  cancelarEdicion() {
    this.almacenEditandoId = null;
    this.nuevoAlmacen = { nombre: '', ubicacion: '' };
  }

  async guardarAlmacen() {
    if (!this.nuevoAlmacen.nombre.trim()) {
      alert('Ingrese el nombre del almacén.');
      return;
    }

    this.cargando = true;

    if (this.almacenEditandoId) {
      const { error } = await this.supabaseService.supabase
        .from('almacenes')
        .update({
          nombre: this.nuevoAlmacen.nombre.trim().toUpperCase(),
          ubicacion: this.nuevoAlmacen.ubicacion.trim()
        })
        .eq('id', this.almacenEditandoId);

      this.cargando = false;

      if (error) {
        alert('Error al actualizar almacén: ' + error.message);
      } else {
        alert('¡Almacén actualizado con éxito!');
        this.cancelarEdicion();
      }
    } else {
      const { error } = await this.supabaseService.supabase
        .from('almacenes')
        .insert([{
          nombre: this.nuevoAlmacen.nombre.trim().toUpperCase(),
          ubicacion: this.nuevoAlmacen.ubicacion.trim()
        }]);

      this.cargando = false;

      if (error) {
        alert('Error al guardar almacén: ' + error.message);
      } else {
        alert('¡Almacén registrado con éxito!');
        this.nuevoAlmacen = { nombre: '', ubicacion: '' };
      }
    }
  }

  async eliminarAlmacen(id: number) {
    if (!confirm('¿Desea eliminar este almacén?')) return;

    const { error } = await this.supabaseService.supabase
      .from('almacenes')
      .delete()
      .eq('id', id);

    if (error) {
      alert('No se puede eliminar el almacén si tiene registros asociados.');
    } else {
      this.obtenerAlmacenes();
    }
  }
}