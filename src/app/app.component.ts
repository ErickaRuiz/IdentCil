import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { 
  IonApp, 
  IonRouterOutlet, 
  IonMenu, 
  IonContent, 
  IonIcon, 
  IonMenuToggle,
  IonButton
} from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [
    RouterLink,
    IonApp, 
    IonRouterOutlet, 
    IonMenu, 
    IonContent, 
    IonIcon, 
    IonMenuToggle,
    IonButton,
  ],
})
export class AppComponent {
  constructor() {}
}