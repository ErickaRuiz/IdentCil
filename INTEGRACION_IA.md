# Identificación de cilindros por foto

Integración de la app IdentCil con el microservicio de IA (`npl_ai`), que lee
el número de serie troquelado en el collarín de un cilindro a partir de una
fotografía.

## Qué cambia para el operario

En **Ingreso**, **Salida** y **Recojo**, junto a la búsqueda y al escáner, hay
tres formas de identificar un cilindro:

| Botón | Qué hace |
| --- | --- |
| 🔍 verde | Buscar el número escrito a mano |
| QR azul | Escanear el código QR (antes tenía el icono de cámara) |
| 📷 turquesa | **Nuevo:** fotografiar el troquelado |

Al usar la foto:

1. La app comprueba que el servicio de IA responde.
2. La primera vez explica cómo encuadrar la foto.
3. Se abre la cámara (o la galería).
4. Un modal muestra la foto, el número que leyó la IA, las alternativas del
   inventario y, si conviene revisar, por qué.
5. El operario **confirma, corrige o repite la foto**.

A partir de ahí todo sigue igual que al escribir el número o escanear el QR:
la app comprueba el estado del cilindro y su ficha en Supabase.

**La IA nunca registra nada sola.** La calibración con fotos reales concluyó
que ningún umbral de confianza permite aceptar una lectura sin revisarla, así
que el servicio pide siempre confirmación.

## Cómo tomar la foto

Es lo que más influye en el resultado, medido sobre fotos reales:

| Encuadre | Acierto |
| --- | --- |
| Cerca del troquelado | **60%** |
| De frente, lejos o en penumbra | 13-20% |

El número grabado debe ocupar buena parte de la foto. Sin flash de frente: el
reflejo borra el relieve. Con poca luz, iluminar desde un lado.

## Ponerlo en marcha

1. Arrancar el microservicio (en `npl_ai/`):

   ```bash
   make run
   ```

2. Arrancar la app:

   ```bash
   npm install
   npm start          # http://localhost:4200
   ```

La dirección del servicio está en `src/environments/environment.ts`
(`aiServiceUrl`, por defecto `http://localhost:8000`).

**Para probar desde un móvil real** en la misma red Wi-Fi, cambie `localhost`
por la IP del equipo que ejecuta el servicio, por ejemplo
`http://192.168.1.50:8000`. Desde el móvil, "localhost" es el propio móvil.

En producción el servicio debe servirse por **HTTPS**: Android e iOS bloquean
por defecto las llamadas HTTP en claro.

### Servicio desplegado en AWS

El microservicio está publicado en AWS ECS Express Mode y
`src/environments/environment.prod.ts` ya apunta a él:

```
https://ai-52f21abaa0674bb88aa7544cd71eadec.ecs.us-east-1.on.aws
```

Una compilación de producción (`ng build`, o la que use Capacitor para
generar el APK) lo usa automáticamente. Si el servicio se borra y se vuelve a
crear, AWS le asigna otra URL y hay que actualizarla en ese archivo. Cómo se
despliega y cuánto cuesta: `npl_ai/docs/DESPLIEGUE_AWS.md`.

## Trazabilidad

Cada cilindro de un ingreso, una salida o el reingreso de un recojo guarda
cómo se identificó, dentro de las columnas JSONB que ya existían (no hace
falta migrar la base de datos):

```json
{
  "numero_serie": "19S206055",
  "metodo_identificacion": "foto",
  "ia": {
    "request_id": "app-e6a40d7b56f945a9",
    "model_version": "detector:onnx:detector.onnx|ocr:rapid:onnxruntime|parser:1.0.0",
    "serie_propuesta": "19S206055",
    "confianza": 0.676,
    "corregido": false
  }
}
```

- `metodo_identificacion`: `foto`, `qr`, `lista` o `manual`.
- `corregido`: si el operario cambió el número que propuso la IA.
- `request_id`: enlaza el movimiento con el registro de auditoría del
  microservicio, que guarda las detecciones, la lectura y, si hubo que
  revisar, la propia foto.

Con estos datos se puede medir en operación real cuántas identificaciones se
hacen por foto y cuántas lecturas de la IA hubo que corregir.

## Inventario: dar de alta los cilindros del dataset

El servicio de IA lee la tabla `cilindros` de Supabase cada 60 segundos, así
que **un cilindro dado de alta en la app se reconoce en las fotos sin
reiniciar nada**.

Pero hoy la tabla sólo tiene 3 cilindros, y ninguno está entre los 99
fotografiados del dataset. Consecuencia: cuando la IA reconoce un cilindro del
dataset, la app avisa de que "no está registrado en el inventario" y no deja
darle salida.

Hay un script que los da de alta con el mismo formato que el formulario de
registro. Por defecto sólo simula:

```bash
cd ../npl_ai
SUPABASE_KEY=<clave> python training/seed_supabase.py --url <url-supabase>
```

Simulado contra la base de datos real: registraría **98 cilindros**. Omite
`K5738166` a propósito, porque figura en dos cilindros distintos del dataset y
decidir cuál es el correcto le corresponde a una persona.

Para registrar de verdad hace falta indicar el propietario, como exige el
formulario:

```bash
SUPABASE_KEY=<clave> python training/seed_supabase.py --url <url> --apply --cliente-id <id>
```

Con las políticas RLS aplicadas (ver Seguridad), la clave pública ya no puede
insertar. En ese caso use la clave `service_role` del proyecto, sólo en la
variable de entorno de ese comando: es secreta y nunca debe ir al código.

## Seguridad

**Problema:** todas las tablas de Supabase se podían leer sin iniciar sesión,
incluida `clientes`, con nombre o razón social, DNI/RUC, teléfono, correo y
dirección. La clave con la que se accede va dentro de la app (así funciona
Supabase: la clave anon es pública), de modo que cualquiera que descargue la
app puede leer esos datos. En Supabase, lo que protege los datos son las
políticas **RLS** (Row Level Security), no el secreto de la clave.

**En la app (hecho):** todas las pantallas, salvo el login y el registro,
exigen haber iniciado sesión (`src/app/guards/sesion.guard.ts`). Antes se
podía abrir, por ejemplo, `/ingreso` directamente sin entrar.

**En Supabase (pendiente de aplicar):** el script
[`supabase/politicas_rls.sql`](supabase/politicas_rls.sql) activa RLS en las
seis tablas y deja:

| Quién | Acceso |
| --- | --- |
| Usuario con sesión | Leer y escribir en todas las tablas (lo mismo que hoy) |
| Sin sesión | Sólo leer `cilindros`, que no tiene datos personales, para que el servicio de IA siga sincronizando el inventario |

Se aplica en Supabase > SQL Editor, desde la cuenta del proyecto: la app sólo
tiene la clave pública, que no puede cambiar la seguridad.

Queda un hueco que no se resuelve con código: cualquiera puede crearse una
cuenta en la pantalla de registro y, con ella, tener acceso completo. Para
cerrarlo, en Supabase > Authentication: exigir la confirmación del correo y,
cuando el equipo tenga sus cuentas, desactivar el alta de usuarios nuevos.

## Problemas previos corregidos

Al integrar aparecieron estos problemas, que ya existían en la app:

| Problema | Solución |
| --- | --- |
| `environment.prod.ts` no tenía la configuración de Supabase: una compilación de producción arrancaba sin base de datos | Añadida |
| La compilación de producción (`ng build`) fallaba: cinco hojas de estilo superaban el límite de 4 kB por componente | Límite subido a 8 kB, el valor por defecto de Angular |
| `package-lock.json` desincronizado de `package.json` (conflicto de `vite`): `npm ci` fallaba | Regenerado |
| `ng test` no funcionaba: usaba el builder `@angular/build:unit-test`, que sólo existe desde Angular 20 | Vitest con el builder de Analog, compatible con Angular 19 |
| `supabase.spec.ts` importaba `Supabase`, pero el servicio se llama `SupabaseService` | Corregido; la prueba de `HomePage` además ya no llama a la base de datos real |
| Con el móvil en modo oscuro, textos oscuros sobre tarjetas oscuras (cabecera de Ingreso, desplegables) | Tema claro fijo: la app se diseñó sólo en claro (ver `src/global.scss`) |
| Pantallas accesibles sin iniciar sesión | Guard de sesión |
| `ng lint`: dos `ngOnInit` vacíos y un `OnInit` sin declarar | Corregido |

## Pruebas

```bash
npm test
```

Ejecuta una vez las 21 pruebas; `npm run test:watch` las repite al guardar.
Incluye las de componentes (`*.spec.ts`, con TestBed) y las del cliente del
servicio de IA (`*.unit.test.ts`).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `src/app/services/detector-cilindros.ts` | Cliente HTTP del servicio de IA y captura de la foto |
| `src/app/services/identificacion-foto.ts` | Flujo completo, compartido por las tres pantallas |
| `src/app/components/confirmar-serie/` | Modal de confirmación |
| `src/app/guards/sesion.guard.ts` | Exige sesión iniciada |
| `supabase/politicas_rls.sql` | Políticas de acceso para Supabase |
| `vitest.config.mts`, `src/test-setup.ts` | Configuración de las pruebas |

Dependencias nuevas: `@capacitor/camera@6.1.3` y `@capacitor/android@6.2.2`
(compatibles con Capacitor 6).

## APK de pruebas (Android)

El proyecto Android está en `android/`, con el identificador
`com.identcil.app`, el permiso de cámara del escáner de QR y la configuración
que pide `@capacitor-mlkit/barcode-scanning`.

**Requisitos:** Android Studio (incluye el SDK) y **JDK 17**. Capacitor 6 usa
Gradle 8.2.1, que no arranca con JDK 21. En Android Studio: *Settings → Build,
Execution, Deployment → Build Tools → Gradle → Gradle JDK* → una versión 17 (la
opción *Download JDK…* la instala).

**Compilar:**

```bash
npm install
npx ng build            # producción: apunta al servicio de AWS
npx cap sync android    # copia la web compilada al proyecto Android
npx cap open android    # abre Android Studio
```

En Android Studio: *Build → Build App Bundle(s) / APK(s) → Build APK(s)*. El
archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

Desde la terminal, con JDK 17 instalado:

```bash
cd android && JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew assembleDebug
```

**Instalar en el teléfono:** copie el APK al teléfono y ábralo; Android pedirá
permitir "instalar apps de origen desconocido" para esa aplicación. Con el
teléfono conectado por USB y la depuración activada, también vale
`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

Tras cada cambio en la app hay que repetir `npx ng build` y `npx cap sync
android` antes de volver a compilar el APK.

**En el teléfono:**

- Hace falta conexión a internet: la foto se analiza en AWS y los datos están
  en Supabase.
- La primera vez que se use el QR, Android puede tener que descargar el
  escáner de Google: la app avisa y basta con reintentarlo en unos segundos.
- Un APK de depuración sirve para pruebas internas. Para la Play Store haría
  falta uno firmado con una clave propia.
