import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonCard, 
  IonCardHeader, 
  IonCardTitle, 
  IonCardContent, 
  IonButtons, 
  IonBackButton,
  IonList,
  IonItem,
  IonIcon,
  IonLabel
} from '@ionic/angular';

@Component({
  selector: 'app-reportes',
  templateUrl: './reportes.html',
  styleUrls: ['./reportes.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonCard, 
    IonCardHeader, 
    IonCardTitle, 
    IonCardContent, 
    IonButtons, 
    IonBackButton,
    IonList,
    IonItem,
    IonIcon,
    IonLabel
  ]
})
export class ReportesPage {
  constructor() {}
}