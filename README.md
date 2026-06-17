# Delta Apuesta Mundial 2026

Sistema web estatico para registrar apuestas amistosas del Mundial 2026.

## Funciones

- Usuarios por defecto: Rene, Cesar y Rolando.
- Agregar nuevos usuarios escribiendo su nombre.
- Borrar el usuario activo desde el panel superior.
- Consultar partidos del dia con hora de Bolivia.
- Menu de dias para cambiar fecha y verificar partidos por dia, con dos semanas futuras visibles.
- Fuente principal: API-Football / API-Sports.
- Fuente de respaldo: TheSportsDB API gratuita.
- La cartelera apostable se toma de API-Football o TheSportsDB; si no hay respuesta, no se inventan partidos.
- Marcar como no disponibles los partidos que ya empezaron o terminaron.
- Apostar por local, empate o visitante.
- Montos rapidos: 5, 10, 15, 20, 30, 50 y 100 Bs.
- Monto editable.
- Boleto de apuesta en ventana emergente al hacer clic en `Apostar`.
- Palanca de apuestas en vivo protegida con contraseña de administrador.
- Total global de apuestas hechas.
- Pozo acumulado de todos los usuarios.
- Boton grande de resultados en vivo.
- Pagos proyectados segun el marcador actual.
- Marcador manual de respaldo cuando la API no entrega goles en vivo.
- Historial por usuario y total global.
- Ventana de liquidacion cuando un partido termina.
- Reparto del pozo acumulado entre quienes acertaron.
- Si el partido termina empatado, nadie cobra y el pozo se acumula para el siguiente partido.
- Historial final de ganadores, perdedores y pagos.
- Marcador final guardado dentro del historial de cada partido liquidado.
- Persistencia compartida solo con Firebase Firestore.

## Liquidacion de apuestas

Cuando un partido termina, la app intenta tomar el marcador desde la API. Si hay marcador final,
calcula automaticamente quien gano y abre la ventana de liquidacion.

Si la API no entrega marcador, la ventana permite elegir manualmente el resultado:

- Gano el local.
- Empate.
- Gano el visitante.

El pozo total se reparte solo entre los ganadores, proporcionalmente al monto que apostaron.
Quienes pierden reciben `Bs 0`.

Si el resultado final es empate, nadie cobra en ese partido. Todo el pozo queda guardado como
acumulado y se suma al siguiente partido. Cuando el siguiente partido tenga un ganador, ese
acumulado entra al reparto junto con las apuestas nuevas.

Ejemplo: si el pozo es `Bs 100` y dos usuarios ganaron apostando `Bs 20` y `Bs 30`, se reparten
el pozo segun esos aportes ganadores.

Ejemplo de empate: si un partido termina empatado con `Bs 80` en el pozo, esos `Bs 80` pasan al
siguiente partido. Si en el siguiente partido se apuestan `Bs 40`, el pozo a repartir sera `Bs 120`.

## Resultados en vivo

El boton `Resultados` abre una ventana con los partidos que se estan disputando en ese momento.
Muestra el marcador grande y calcula cuanto le corresponderia a cada apostador si el partido
terminara con ese marcador.

Si el marcador en vivo va empatado, la ventana muestra que el pozo se acumularia para el siguiente
partido.

La API gratuita puede fallar o no traer marcador en tiempo real. Por eso la ventana `Resultados`
tiene campos para cargar el marcador manualmente. Ese marcador se guarda en Firebase y se usa para
calcular pagos proyectados y liquidar el partido si la API no trae resultado final.

## API-Football para marcadores

La app intenta usar primero `/api/football`, una funcion serverless de Vercel que consulta
API-Football / API-Sports por el dia completo en zona `America/La_Paz`. Combina la consulta por liga
con una consulta general del dia filtrada por Mundial para evitar que falten partidos si el proveedor
devuelve una liga incompleta. Si no esta configurada o no devuelve partidos, cae automaticamente a
TheSportsDB. Si ninguna API devuelve partidos para esa fecha, la cartelera queda vacia.

Para activarla:

1. Crea una cuenta en [API-Football / API-Sports](https://www.api-football.com/).
2. Copia tu API key.
3. En Vercel entra a tu proyecto.
4. Ve a `Settings` > `Environment Variables`.
5. Agrega:

```text
APISPORTS_KEY=tu_api_key
APISPORTS_LEAGUE_ID=1
APISPORTS_LEAGUE_IDS=1
APISPORTS_SEASON=2026
APISPORTS_TIMEZONE=America/La_Paz
```

6. Guarda y redeploya el proyecto.

`APISPORTS_LEAGUE_ID=1` corresponde a FIFA World Cup en API-Football. Tambien puedes usar
`APISPORTS_LEAGUE_IDS=1,otro_id` si el proveedor separa algun calendario. La zona horaria
`America/La_Paz` ayuda a que los partidos de "hoy" salgan con fecha boliviana. La app muestra la hora
usando el `timestamp` real de API-Football cuando esta disponible.

Para probar localmente puedes crear un archivo `.env` con las mismas variables o ejecutar PowerShell:

```powershell
$env:APISPORTS_KEY="tu_api_key"
npm.cmd run dev
```

## Apuestas en vivo

Por defecto, cuando un partido ya empezo no se puede apostar. La palanca `Apuestas en vivo`
permite habilitar apuestas durante el partido.

Contraseña de administrador:

```text
admin123
```

La habilitacion dura solo en la sesion actual del navegador. Al recargar o cerrar la pagina,
se debe activar otra vez.

La app actualiza los partidos cada minuto. Tambien puedes usar `Actualizar marcador` dentro de la
ventana de resultados. Si no hay ningun partido en juego, la ventana muestra:

```text
No se esta disputando un partido por el momento.
```

## Ejecutar localmente

Usa el servidor estatico incluido. No requiere instalar dependencias.

```bash
npm run dev
```

Si PowerShell bloquea `npm.ps1`, usa:

```powershell
npm.cmd run dev
```

Tambien puedes ejecutar directamente:

```powershell
node scripts/dev-server.mjs
```

Luego abre:

```bash
http://127.0.0.1:5173
```

En Windows tambien puedes abrir `iniciar.bat`.

## Desplegar en Vercel

1. Sube estos archivos a GitHub.
2. En Vercel crea un nuevo proyecto desde ese repositorio.
3. Deja el framework como `Other` o `Static`.
4. No se necesita comando de build.

## Base de datos compartida con Firebase

La app usa Firebase Firestore como unica base de datos. Si Firebase no esta configurado o las reglas
no permiten escritura, la app no guarda datos locales: usuarios, apuestas, liquidaciones, pozo e
historial deben salir de Firestore.

Pasos:

1. Entra a [Firebase Console](https://console.firebase.google.com/).
2. Crea un proyecto.
3. Agrega una app web con el icono `</>`.
4. Copia la configuracion que Firebase te da.
5. Pegala en `firebase-config.js`.

Debe quedar parecido a esto:

```js
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

Luego activa Firestore:

1. En Firebase, entra a `Firestore Database`.
2. Crea la base de datos.
3. Usa una region cercana.
4. En `Rules`, para una version simple de grupo cerrado, puedes usar:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/delta-apuesta-main/{collection}/{docId} {
      allow read, write: if true;
    }
  }
}
```

Estas reglas permiten que cualquiera con el enlace pueda leer y escribir datos. Sirven para una
apuesta familiar o de amigos, pero si el sitio sera publico conviene agregar autenticacion.

Despues de editar `firebase-config.js`, sube los cambios:

```powershell
git add .
git commit -m "Conectar Firebase"
git push
```

Vercel redeployara automaticamente.

## API

La app puede usar:

```text
/api/football
```

que internamente llama a API-Football, y como respaldo usa:

```text
https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=YYYY-MM-DD&s=Soccer
```

Despues filtra eventos relacionados con `World Cup` o `FIFA World Cup`.
