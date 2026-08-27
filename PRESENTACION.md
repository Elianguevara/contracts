# EcoTrace

### Sistema de Gestión y Manifiestos de Residuos Peligrosos con Trazabilidad Criptográfica On-Chain

---

## 1. Presentación general

**EcoTrace** es una plataforma web (SvelteKit + Firebase) que digitaliza el circuito completo de
traslado de residuos peligrosos — desde que el **Generador** crea la solicitud hasta que el
**Operador** de la planta de tratamiento emite el **certificado de disposición final** — y ancla
criptográficamente cada documento crítico (manifiesto y certificado) en la blockchain pública
**Ethereum Sepolia**, mediante el contrato inteligente **`EcoTraceRegistry.sol`**.

El resultado es un expediente digital donde cada manifiesto y cada certificado tiene, además de su
PDF y su registro en base de datos, una **huella criptográfica inmutable y verificable
públicamente** — sin depender de que el usuario final posea una wallet o pague gas.

**Contrato desplegado y verificado:**
[`0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113`](https://sepolia.etherscan.io/address/0xa3aac5eaef74f27927afd4d6792b5c33cc602113)
— Ethereum Sepolia Testnet.

---

## 2. Justificación — ¿qué problema resuelve?

La gestión de residuos peligrosos es una cadena de custodia regulada: un manifiesto o un
certificado de tratamiento mal emitido, alterado o extraviado puede ocultar una disposición
irregular (vertido ilegal, incineración no autorizada, "reciclaje" fantasma) con consecuencias
ambientales y legales serias. En el circuito de papel/PDF tradicional, la única fuente de verdad
es un archivo o una base de datos que la propia empresa u operador controla — es decir, **el
mismo actor que podría tener incentivos para alterar el registro es quien lo custodia.**

EcoTrace resuelve esto separando dos capas:

- **Capa de datos (Firestore):** toda la información operativa — residuos, pesos, códigos de
  despacho, partes involucradas — permanece off-chain, privada y consultable solo por los actores
  autorizados. Ningún dato personal ni operativo sensible sale de Firebase.
- **Capa de prueba (Ethereum Sepolia):** por cada manifiesto y cada certificado, un **hash
  Keccak-256 canónico** de su contenido queda anclado en un contrato inteligente inmutable. Ese
  hash no se puede alterar, borrar ni "reescribir" retroactivamente — y **cualquier persona**,
  auditor, ente regulador o tercero, puede verificar públicamente que un documento específico fue
  efectivamente registrado, cuándo, y por quién, sin necesitar acceso a la base de datos interna de
  EcoTrace.

En síntesis: el propósito no es "poner blockchain" de forma decorativa, sino usarla como **testigo
neutral e independiente** que ninguna de las partes del circuito (generador, transportista,
operador) controla por sí sola.

---

## 3. Arquitectura técnica del contrato

### 3.1 `EcoTraceRegistry.sol`

Contrato Solidity 0.8.24, construido sobre **OpenZeppelin `AccessControl` v5.7.0** (control de
acceso basado en roles, biblioteca auditada — se evita reinventar lógica de permisos crítica).

**Diseño deliberadamente minimalista:** el contrato no almacena PII, no maneja fondos, no tiene
funciones `payable` — es un registro de hashes con permisos, nada más. Esto reduce la superficie
de ataque a prácticamente cero (sin lógica de transferencia de valor no hay reentrancy, sin
fondos custodiados no hay riesgo de robo).

```solidity
mapping(bytes32 => bool) public registered;   // hash → ¿ya fue anclado?
```

**Roles (`AccessControl`):**

| Rol                  | Quién lo tiene                               | Función que habilita                                    |
| -------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `DEFAULT_ADMIN_ROLE` | Wallet administradora del deploy             | Otorgar/revocar cualquier rol                           |
| `RELAYER_ROLE`       | Wallet del backend (Cloud Functions)         | `registerDocument()` — ancla manifiestos                |
| `CERTIFICADOR_ROLE`  | Wallet del backend (misma, en el MVP actual) | `attestCertificate()` — ancla certificados              |
| `ENTE_ESTATAL_ROLE`  | Reservado para un ente de control estatal    | `approveAsState()` — homologación oficial (fase futura) |

**Funciones principales:**

- **`registerDocument(string requestId, bytes32 documentHash, string eventType)`** — solo
  `RELAYER_ROLE`. Ancla el hash de un manifiesto, revierte si ya estaba registrado
  (`AlreadyRegistered`) o si el hash/requestId son inválidos. Emite `DocumentRegistered`.
- **`attestCertificate(string requestId, bytes32 documentHash)`** — solo `CERTIFICADOR_ROLE`.
  Mismo patrón para certificados de tratamiento/disposición. Emite `CertificateAttested`.
- **`approveAsState(string requestId)`** — solo `ENTE_ESTATAL_ROLE`. Aprobación/homologación
  estatal (evento puro, no registra hash). Preparado para una fase futura de atestación
  institucional con wallets externas.
- **`registered(bytes32) → bool`** — lectura pública, sin restricción de rol. Es la función que
  usa la verificación pública desde el frontend.

Todas las funciones de escritura validan `requestId` no vacío, `documentHash` distinto de cero, y
que el hash no haya sido registrado previamente (`custom errors` en vez de `require` con strings,
más barato en gas).

### 3.2 Por qué Foundry

- **`forge test`** — 26 tests: 15 unitarios, 8 de fuzzing (1000 corridas cada uno, sobre inputs
  arbitrarios de `requestId`/`hash`/caller) y 3 invariantes (256 corridas × 32 llamadas, verifican
  que `registered` nunca pase de `true` a `false` y que el hash cero nunca quede registrado). Todo
  el contrato tiene cobertura de tests antes de tocar una red real.
- **`forge script` + `--broadcast --verify`** — el despliegue y la verificación del código fuente
  en Etherscan se hacen en un solo comando, reproducible y auditable
  (`contracts/script/Deploy.s.sol`).
- **`cast`** — utilizado para diagnósticos rápidos (derivar direcciones desde una clave privada,
  consultar balances, invocar funciones de lectura/escritura sin escribir un script ad-hoc).

### 3.3 Por qué Sepolia

Sepolia es la testnet pública de Ethereum recomendada actualmente (post-Merge, con soporte activo
de clientes y faucets). Permite validar el circuito completo —incluyendo tiempos de confirmación
reales, verificación en un explorador público real (Etherscan) y gas real (aunque de testnet)—
antes de considerar un despliegue en mainnet o en una L2 de producción (Fase 9 del roadmap).

### 3.4 Flujo de anclaje (arquitectura de capa 1)

```text
Firestore (solicitud pasa a MANIFIESTO_GENERADO)
        │  onDocumentUpdated (Cloud Function)
        ▼
Relayer (functions/src/web3/relayer.ts)
   ├── canonicalHash(payload)                 → keccak256 determinístico, campos no-PII
   ├── RegistryClient.registerDocument(...)   → Ethers v6, nonce serializado (lock distribuido
   │                                              en Firestore + cola en proceso)
   └── Firestore ← { status: 'confirmed', txHash, blockNumber }
        │
        ▼
Frontend (Viem, solo lectura)
   ├── BlockchainProof.svelte      → estado pendiente/confirmado/fallido + link a Etherscan
   └── PublicVerification.svelte   → cualquiera puede subir el PDF o pegar el hash y verificar
                                       registered(hash) contra el contrato real
```

El usuario final **nunca firma una transacción ni necesita una wallet** — el anclaje es 100%
automático, disparado por el propio backend (patrón _relayer_). Esto es una decisión de producto
deliberada: los actores del circuito (generador, transportista, operador) son empresas que operan
un sistema de gestión ambiental, no usuarios cripto-nativos.

---

## 4. Guía rápida de interacción

### 4.1 Verificar un documento (cualquier usuario, sin wallet, sin login)

1. Entrá a **`/verificar`** (link también visible desde la pantalla de login).
2. Subí el PDF original (arrastrándolo o seleccionándolo) o pegá su hash Keccak-256.
3. La app consulta `registered(hash)` directamente contra el contrato en Sepolia y te dice si está
   anclado.

### 4.2 Leer el contrato directamente (Etherscan)

1. Abrí [el contrato en Sepolia Etherscan](https://sepolia.etherscan.io/address/0xa3aac5eaef74f27927afd4d6792b5c33cc602113#code)
   — el código está verificado (✅ "Exact Match"), así que podés leer el Solidity completo.
2. Pestaña **Read Contract** → función `registered` → pegá un hash `bytes32` → `Query`.
3. Pestaña **Events** o **Transactions** → ver cada `DocumentRegistered` / `CertificateAttested`
   emitido, con su bloque y timestamp.

### 4.3 Interactuar con `cast` (Foundry)

```bash
# Verificar si un hash está registrado
cast call 0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113 \
  "registered(bytes32)(bool)" 0x<hash> \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com

# Consultar los roles de una dirección
cast call 0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113 \
  "hasRole(bytes32,address)(bool)" $(cast keccak "RELAYER_ROLE") 0x<address> \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

### 4.4 Desplegar / redesplegar (equipo de desarrollo)

Ver [`GUIA-LEVANTAR-Y-PROBAR.md`](GUIA-LEVANTAR-Y-PROBAR.md) para el procedimiento completo
(entorno local con emuladores de Firebase + anclaje real en Sepolia) y la sección
["Roles on-chain"](README.md#roles) del README para el detalle de permisos necesarios antes de
desplegar una nueva instancia del contrato.

---

## 5. Justificación de las decisiones de diseño

Cada decisión de esta sección fue tomada explícitamente en contra de una alternativa más "de
moda" u obvia. Se documentan las dos opciones y por qué se descartó la que no está.

### 5.1 SvelteKit 2 + Svelte 5 (Runes), no React

- **Sesión resuelta 100% en el servidor, sin capa extra.** `src/hooks.server.ts` decodifica la
  cookie de sesión httpOnly en cada request y deja el usuario en `event.locals.user` **antes** de
  renderizar; los guards de rol (`src/lib/auth/guards.server.ts`) corren en `+layout.server.ts` /
  `+page.server.ts`, con acceso directo a `firebase-admin` en el mismo runtime que sirve el HTML.
  En React este mismo resultado exige un framework adicional con soporte de Server Components
  (Next.js) o una capa de BFF separada — en SvelteKit es el modelo por defecto, no una capa que
  haya que agregar.
- **Reactividad sin Virtual DOM.** Svelte 5 compila `$state`/`$derived`/`$effect` a actualizaciones
  quirúrgicas de DOM en build time. Los stores con `onSnapshot` de Firestore en tiempo real
  (`src/lib/stores/solicitudes.svelte.ts`) actualizan tablas y bandejas (`OperadorInbox.svelte`,
  `SolicitudesTable.svelte`) sin el costo de reconciliar un árbol virtual en cada snapshot — en un
  dashboard operativo con actualizaciones frecuentes, es una diferencia de rendimiento real, no
  cosmética.
- **Menos superficie de dependencias en el cliente.** No hace falta Redux/Zustand/React Query para
  replicar lo que los stores basados en runes ya resuelven de forma nativa. Para un sistema que
  maneja datos operativos y PII de empresas reguladas, menos dependencias de terceros en el bundle
  del cliente es una decisión de seguridad, no solo de tamaño.

### 5.2 Firebase (Firestore + Auth + Storage + Functions), no un backend propio autoalojado

- **La máquina de estados vive en transacciones ACID reales.** Cada transición de
  `SolicitudTraslado` (`src/lib/server/solicitudes.service.ts`) corre dentro de
  `getAdminDb().runTransaction(...)`: relee el documento, valida actor y precondición de estado, y
  escribe atómicamente. Montar esa misma garantía sobre un backend propio (Postgres + locks
  explícitos, por ejemplo) es totalmente viable pero no aporta nada que Firestore no dé ya de
  fábrica para el tamaño actual del sistema.
- **Defensa en profundidad sin duplicar lógica.** `firestore.rules` repite las mismas
  validaciones de rol/estado que el servidor, a nivel de base de datos — si un bug o un acceso
  directo a la API de Firestore evita el servidor, las reglas igual bloquean la escritura inválida.
- **Pipeline orientado a eventos sin cola de mensajes separada.** `onDocumentUpdated` /
  `onDocumentCreated` / `onDocumentWritten` (`functions/src/index.ts`) encadenan generación de PDF
  → anclaje on-chain como reacciones a escrituras de Firestore, sin necesitar un broker de eventos
  adicional (SQS, Pub/Sub explícito, etc.) — el propio Firestore es el bus de eventos.
- **Costo de velocidad de desarrollo para un MVP regulatorio**, donde validar el circuito completo
  con usuarios reales importa más, en esta etapa, que la portabilidad de infraestructura. Es una
  decisión reversible: Firestore Security Rules y el modelo de datos no atan el dominio a un
  proveedor de forma irreversible.

### 5.3 `EcoTraceRegistry.sol` como registro de hashes con roles, no un token

Esta es la decisión de diseño con más peso legal del proyecto, y fue deliberada, no una omisión:

- **Minimalismo como reducción de superficie de ataque y de superficie regulatoria.** El contrato
  no maneja fondos, no tiene funciones `payable`, no emite ni transfiere ningún activo fungible.
  Sin lógica de transferencia de valor no hay reentrancy que explotar; sin un token que otorgue
  derechos económicos, no hay que argumentar frente a un regulador si esa emisión constituye o no
  un valor negociable.
- **Evita, por diseño, entrar en el terreno de "security token".** Introducir un token de utilidad
  (ETT o cualquier otro) es una decisión de producto y legal separada, que requeriría un análisis
  específico bajo el marco argentino (CNV, Ley de Mercado de Capitales) antes de escribir una sola
  línea de Solidity — **no implementarlo todavía es la postura conservadora correcta** mientras ese
  análisis no exista, no una limitación técnica.
- **`AccessControl` de OpenZeppelin en vez de una lógica de permisos propia.** Es la biblioteca de
  control de acceso más auditada del ecosistema Solidity — reinventar esa lógica para ahorrar un
  import no reduce riesgo, lo aumenta.

### 5.4 Relayer automático (patrón sin wallet para el usuario final)

Los actores del circuito (generador, transportista, operador) son empresas que operan un sistema
de gestión ambiental, no usuarios cripto-nativos. Exigirles una wallet y gas para cada manifiesto
introduciría fricción y un vector de soporte (claves perdidas, saldo insuficiente) sin beneficio
real para ellos — la garantía de inmutabilidad que les interesa (a ellos y al regulador) es que el
hash quede anclado, no quién lo firma. El costo de esta decisión se paga en otro lado: el backend
concentra la responsabilidad de custodiar `RELAYER_PRIVATE_KEY` (por eso vive en Google Secret
Manager en producción, nunca en un archivo plano) y de gestionar nonces de forma segura entre
instancias concurrentes (`functions/src/web3/nonce-manager.ts`, lock distribuido en Firestore).

### 5.5 Sistema visual: separación `brand` / `chain` / `ink` como señal de confianza, no solo estética

El detalle completo de tokens y su historial de implementación vive en
[`DISENO-UX.md`](DISENO-UX.md) — se resume acá solo el argumento de diseño. La paleta verde
(`brand`) para lo operativo cotidiano y la paleta índigo (`chain`), reservada exclusivamente a lo
que efectivamente toca el contrato inteligente (`BlockchainProof.svelte`, `PublicVerification.svelte`,
el chip de red en el header), no es una preferencia visual: es una señal consistente que le permite
al usuario distinguir de un vistazo "esto lo dice EcoTrace" de "esto lo puede auditar cualquiera en
Sepolia". La superficie oscura `ink`, exclusiva de `BlockchainProof`, refuerza esa misma distinción
como un contraste deliberado frente al resto de la app.

---

## 6. Mejoras futuras

Ordenadas por lo que ya está en el roadmap del proyecto vs. lo que surge de esta revisión de
arquitectura y UX. Ninguna de estas está implementada hoy — se listan explícitamente como pendiente
para no confundir intención con estado actual.

### 6.1 Ya priorizadas en el roadmap (ver `ROADMAP-IMPLEMENTACION-WEB3.md`)

- **Backend a producción**: pasar el proyecto Firebase a plan Blaze y mover
  `RELAYER_PRIVATE_KEY`/`WEB3_RPC_URL` a Google Cloud Secret Manager en el entorno real (hoy
  operativo solo vía `functions/.env.local` en emulador).
- **Atestación institucional (Fase 7)**: habilitar `ENTE_ESTATAL_ROLE` con wallets externas y
  firma EIP-712, para que un ente estatal pueda homologar sin depender del relayer del backend.
- **CI/CD**: falta ESLint en el pipeline (`.github/workflows/ci.yml` hoy solo corre
  `svelte-check` + `prettier --check`, no un linter de reglas de código).
- **Migración a L2 de producción (Fase 9)**: Sepolia es apropiada para validar el circuito, no para
  operar en producción — evaluar Arbitrum u otra L2 antes de un despliegue real, junto con
  estrategias de batching (Merkle) si el volumen de manifiestos lo justifica.

### 6.2 Detectadas en esta revisión (no estaban en ningún documento previo)

- **`/dashboard/auditoria` (o `/dashboard/ente-estatal`)**: hoy `ADMIN` cae por defecto en
  `/dashboard/operador` (`src/lib/auth/roles.ts`) — no existe una vista de solo lectura pensada
  para un regulador externo. Ver recomendaciones de diseño concretas en
  [`docs/auditoria-cumplimiento-arquitectura.md`](docs/auditoria-cumplimiento-arquitectura.md#recomendaciones--dashboard-esg-para-reguladores).
- **`/dashboard/transportista`**: el rol existe en el modelo de datos pero no tiene pantalla
  propia — también cae en `/dashboard/operador`. Antes de optimizar "uso rápido en campo" hace
  falta construir la vista.
- **Códigos de despacho como QR, no solo texto**: `generarCodigoDespacho()` ya produce el valor;
  falta la capa de presentación (renderizado QR) para que sea escaneable en campo.
- **PWA antes que app nativa**: dado que el resto del stack ya es web, evaluar Service Worker +
  manifest instalable para el caso de uso de campo (acceso rápido, cámara para QR vía
  `getUserMedia`) antes de asumir el costo de una app nativa separada. Reservar Kotlin/Jetpack
  Compose para si se necesita lectura de QR offline-first robusta que una PWA no pueda garantizar
  — hoy esa necesidad no está validada.

### 6.3 A evaluar con cautela (impacto legal, no solo técnico)

- **Token de utilidad (ETT) y "smart compliance" con oráculos regulatorios**: son ideas de producto
  legítimas, pero cada una requiere trabajo previo que no es de ingeniería: un token exige análisis
  bajo el marco de valores negociables argentino antes de decidir su diseño técnico; un oráculo que
  bloquee wallets según habilitaciones ambientales requiere primero resolver **de qué fuente
  oficial se leen esos datos, con qué autoridad legal, y quién responde si la fuente está mal
  actualizada** — un oráculo mal fundamentado introduce un punto único de fallo con consecuencias
  legales, no solo técnicas. Recomendación: tratar ambos como decisiones de producto/legal
  separadas del roadmap técnico, no como tareas de desarrollo a estimar directamente.

---

## 7. Estado actual

| Componente                                                                | Estado                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| Contrato `EcoTraceRegistry.sol`                                           | ✅ Desplegado y verificado en Sepolia               |
| Tests (unit + fuzz + invariant)                                           | ✅ 26/26                                            |
| Relayer (Cloud Functions)                                                 | ✅ Ancla manifiestos y certificados automáticamente |
| Verificación pública (frontend)                                           | ✅ Operativa contra el contrato real                |
| Backend en producción (Secret Manager + Cloud Functions deploy)           | ⚠️ Pendiente — requiere plan Firebase Blaze         |
| Atestación institucional (`ENTE_ESTATAL_ROLE`, wallets externas, EIP-712) | ❌ Fase futura                                      |

Para el detalle completo por fase, ver [`ROADMAP-IMPLEMENTACION-WEB3.md`](ROADMAP-IMPLEMENTACION-WEB3.md).
