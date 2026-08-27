# EcoTrace — Ruta de Implementación y Estado del Proyecto

Este documento constituye la **hoja de ruta oficial de desarrollo y migración a arquitectura Web3 híbrida** para EcoTrace. Define con precisión qué componentes se encuentran implementados y probados actualmente, y establece el plan paso a paso, priorizado y detallado para las siguientes fases de desarrollo.

---

## 📊 1. Resumen Ejecutivo y Estado Actual

EcoTrace cuenta con un **MVP Web2 operativo, robusto y probado** (Happy Path validado con emuladores locales). La arquitectura objetivo **no reemplaza** lo existente; es una **extensión arquitectónica híbrida** que incorpora una capa de inmutabilidad y atestación on-chain sobre el backend de Firebase existente.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        ESTADO ACTUAL (PROBADO)                         │
│  SvelteKit 5 (Runes) + Tailwind v4 + SSR                               │
│  Firebase Auth (Cookies HttpOnly) + Firestore (Transacciones ACID)    │
│  Cloud Functions v2 (Generación de PDF oficial + Hash SHA-256)         │
│  Firebase Storage (Almacenamiento de Manifiestos y Certificados)       │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Extensión Web3 Híbrida
┌────────────────────────────────────────────────────────────────────────┐
│                        FUTURO / ROADMAP WEB3                           │
│  1. Smart Contract: EcoTraceRegistry.sol (Foundry / Solidity 0.8.24)   │
│  2. Hashing Canónico: Estandarización determinista de payloads         │
│  3. Relayer Automatizado: Cloud Function ancla hashes en L2 (Capa 1)   │
│  4. UI de Verificación: Componentes en SvelteKit con Viem              │
│  5. Atestación Institucional: Firma EIP-712 para entes/auditores (Capa 2)│
└────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ 2. Lo Implementado Hasta Ahora (Base Operativa)

| Componente                  | Tecnología                         | Estado         | Descripción                                                                                                                               |
| :-------------------------- | :--------------------------------- | :------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework Web**           | SvelteKit 2 + Svelte 5 (Runes)     | ✅ Productivo  | Arquitectura SSR con adaptador `@sveltejs/adapter-node`, manejo de sesión en servidor y páginas reactivas.                                |
| **Estilos**                 | Tailwind CSS v4                    | ✅ Configurado | Configuración nativa con `@tailwindcss/vite`.                                                                                             |
| **Autenticación**           | Firebase Auth + Admin SDK          | ✅ Probado     | Login por correo electrónico o usuario y contraseña, emisión de cookies `httpOnly` seguras (`__session`) y guardas de servidor.           |
| **Base de Datos**           | Cloud Firestore                    | ✅ Probado     | Transacciones ACID para cambios de estado, reglas de seguridad granulares e índices compuestos configurados.                              |
| **Gestión de Roles**        | Firestore / Contexto de Sesión     | ✅ Probado     | Roles: `ADMIN`, `GENERADOR`, `OPERADOR`, `ALMACENADOR_TRANSITORIO`, `TRANSPORTISTA`.                                                      |
| **Circuito de Solicitudes** | SvelteKit Form Actions + Services  | ✅ Probado     | Máquina de estados: `INICIADA` → `APROBADA` → `MANIFIESTO_GENERADO` → `FINALIZADA` (y `RECHAZADA`).                                       |
| **Cloud Functions**         | Firebase Functions v2 (`nodejs22`) | ✅ Probado     | Triggers Firestore para generación de PDFs oficiales al pasar a `MANIFIESTO_GENERADO` y `emitirCertificadoPdf`.                           |
| **Generación de PDFs**      | `pdf-lib` + `crypto`               | ✅ Probado     | Generación de manifiestos (Original, Duplicado, Triplicado) y Certificados de Tratamiento con hash SHA-256 incrustado.                    |
| **Almacenamiento**          | Firebase Storage                   | ✅ Probado     | Guardado de PDFs oficiales con metadatos de integridad.                                                                                   |
| **Entorno Local**           | Firebase Emulators + Scripts       | ✅ Probado     | Suite de emuladores (Auth: 9099, Firestore: 8080, Storage: 9199, Functions: 5001, UI: 4000) y script de seed `create-emulator-users.mjs`. |

---

## 🎯 3. Decisiones Arquitectónicas Fundamentales

1. **Mantener SvelteKit + Svelte 5:** No migrar a React. SvelteKit ofrece SSR nativo crítico para las guardas de sesión. Para Web3 se utiliza **Viem** directamente (Viem es agnóstico al framework y no depende de React/Wagmi).
2. **Los usuarios finales no usan Wallet:** Generadores, transportistas y operadores continúan utilizando el sistema de forma convencional. El anclaje de hashes es 100% automático mediante un **Relayer** en Cloud Functions (Capa 1).
3. **Privacidad de Datos (Off-Chain vs On-Chain):**
   - **Off-Chain (Firestore/Storage):** Datos personales, razones sociales, CUITs, patentes, ubicaciones geográficas y PDFs completos.
   - **On-Chain (Blockchain):** Únicamente hashes criptográficos (`bytes32`), identificador de solicitud (`requestId`), tipo de evento y timestamp.
4. **Capas de Evidencia:**
   - **Capa 1 (Rutina):** Anclaje automático por el Relayer de EcoTrace. Prueba integridad, existencia y timestamp.
   - **Capa 2 (Institucional - Opcional):** Firma criptográfica EIP-712 emitida por certificadoras externas o entes de control ambiental desde una wallet institucional.

---

## 🗺️ 4. Roadmap de Implementación Paso a Paso

### 📍 FASE 0: Preparación del Entorno Web3 y Tooling

> **Objetivo:** Disponer de las herramientas de compilación, testing de contratos y dependencias base.

- [x] **0.1 Instalar Foundry localmente:**
  ```powershell
  # Instalación de Foundry (forge, anvil, cast)
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
  ```
- [x] **0.2 Inicializar subproyecto `contracts/`:**
  - Crear directorio `contracts/` e inicializar con `forge init contracts --no-commit`.
  - Instalar OpenZeppelin Contracts v5:
    ```bash
    cd contracts
    forge install OpenZeppelin/openzeppelin-contracts --no-commit
    ```
- [x] **0.3 Configurar `contracts/foundry.toml`:**
  - Configurar `solc = "0.8.24"`, optimizador habilitado (200 runs), fuzzing (1000 runs) e invariant runs.
- [x] **0.4 Actualizar `.env.example` y `.env`:**
  - Variables de RPC (`WEB3_RPC_URL`, `PUBLIC_WEB3_RPC_URL`), dirección del contrato (`PUBLIC_CONTRACT_ADDRESS`), clave privada del Relayer (`RELAYER_PRIVATE_KEY`) y chain ID.

---

### 📍 FASE 1: Smart Contract `EcoTraceRegistry.sol` y Tests en Foundry

> **Objetivo:** Crear el contrato inteligente inmutable con control de acceso y suite de pruebas completa.

- [x] **1.1 Implementar `contracts/src/EcoTraceRegistry.sol`:**
  - Herencia de `AccessControl` de OpenZeppelin.
  - Roles: `DEFAULT_ADMIN_ROLE`, `RELAYER_ROLE`, `CERTIFICADOR_ROLE`, `ENTE_ESTATAL_ROLE`.
  - Mapping `mapping(bytes32 => bool) public registered;` para prevenir registros duplicados.
  - Eventos:
    - `event DocumentRegistered(address indexed relayer, string indexed requestId, bytes32 documentHash, string eventType, uint256 timestamp);`
    - `event CertificateAttested(address indexed certificador, string indexed requestId, bytes32 documentHash, uint256 timestamp);`
    - `event StateApproval(address indexed entidad, string indexed requestId, uint256 timestamp);`
  - Funciones: `registerDocument`, `attestCertificate`, `approveAsState`.
  - Errores personalizados (`AlreadyRegistered`, `EmptyRequestId`, `ZeroHash`, `NotAuthorized`).
- [x] **1.2 Crear Suite de Tests en Foundry (`contracts/test/`):**
  - `EcoTraceRegistry.t.sol` (Unit tests: registro exitoso, control de acceso, prevención de duplicados).
  - `EcoTraceRegistry.fuzz.t.sol` (Fuzz testing con entradas pseudoaleatorias).
  - `EcoTraceRegistry.invariant.t.sol` (Invariantes: un hash registrado nunca vuelve a falso).
- [x] **1.3 Script de Despliegue (`contracts/script/Deploy.s.sol`):**
  - Script para despliegue en Anvil local y testnet Sepolia.
- [x] **1.4 Criterio de Aprobación Fase 1:**
  - `forge build` compila sin errores.
  - `forge test` pasa al 100% (unit + fuzz + invariants).

---

### 📍 FASE 2: Hashing Canónico Determinista

> **Objetivo:** Garantizar que los hashes generados en backend y frontend sean 100% reproducibles e idénticos sin importar el orden de las claves JSON.

- [x] **2.1 Implementar módulo de hashing en `functions/src/web3/hashing.ts`:**
  - Serialización canónica determinista (ordenamiento alfabético recursivo de claves).
  - Función `canonicalHash(payload)` usando `keccak256`.
  - Payload libre de datos personales o PII (solo IDs, estados, tipos de residuo, pesos y hashes de documentos).
- [x] **2.2 Crear tests unitarios con Vitest:**
  - Validar que dos objetos con distinto orden de propiedades generen el mismo hash exacto.
  - Validar que la alteración de cualquier campo altere el hash resultante.
- [x] **2.3 Criterio de Aprobación Fase 2:**
  - Tests de hashing pasando con 100% de cobertura.

---

### 📍 FASE 3: Capa 1 — Relayer en Cloud Functions y Extensión Firestore

> **Objetivo:** Automatizar el anclaje on-chain en los eventos clave del ciclo de vida de residuos.

- [x] **3.1 Instalar dependencias en `functions/`:**
  - `ethers` (o `viem`) para interactuar con la blockchain desde Node.js.
- [x] **3.2 Implementar cliente Web3 en backend (`functions/src/web3/`):**
  - `config.ts`: Carga de variables de entorno y configuración de RPC.
  - `registry-client.ts`: Instanciación del contrato y envío de transacciones con `ethers.Wallet`.
  - `relayer.ts`: Lógica de anclaje con manejo de idempotencia y reintentos.
- [x] **3.3 Triggers de Firestore para Anclaje Automático:**
  - Al pasar a `MANIFIESTO_GENERADO`: genera hash canónico, llama a `registerDocument` y persiste `txHash`, `blockNumber` y `network` en el documento de la solicitud.
  - Al crear un certificado (`solicitudes/{id}/certificados/{cid}`): ancla el certificado y guarda la evidencia en Firestore.
- [x] **3.4 Extender tipos de Firestore (`src/lib/types/firestore.ts`):**
  - Agregar interfaces `BlockchainAnchor` (`txHash`, `blockNumber`, `documentHash`, `timestamp`, `status`, `network`).
- [x] **3.5 Criterio de Aprobación Fase 3:**
  - Al crear un manifiesto en el emulador, se ejecuta la Cloud Function, se envía la tx a Anvil/Sepolia y Firestore se actualiza con el `txHash`.

---

### 📍 FASE 4: Monitoreo, Gestión de Nonces y Resiliencia del Relayer

> **Objetivo:** Prevenir colisiones de transacciones y alertar sobre saldo bajo en la wallet de servicio.

- [x] **4.1 Gestión de Nonces:**
  - Implementar manejo secuencial de nonces para evitar colisiones ante transacciones simultáneas.
- [x] **4.2 Monitoreo de Saldo de Gas (`functions/src/web3/monitoring.ts`):**
  - Tarea programada o chequeo previo de balance: loggear advertencia si el balance de la wallet del relayer cae por debajo del umbral mínimo (ej. 0.05 ETH).
- [x] **4.3 Manejo de Errores y Estados en Firestore:**
  - Si la transacción falla (RPC caído o gas insuficiente), registrar estado `FAILED` con mensaje de error para reintento automático.

---

### 📍 FASE 5: UI de Evidencia y Verificación Pública (Frontend)

> **Objetivo:** Permitir a los usuarios visualizar la prueba criptográfica de sus documentos y verificarla en el explorador.

- [x] **5.1 Instalar `viem` en el proyecto raíz:**
  ```powershell
  pnpm add viem
  ```
- [x] **5.2 Configurar cliente público (`src/lib/web3/client.ts`):**
  - `createPublicClient` configurado con la red activa (Anvil / Sepolia / Arbitrum).
- [x] **5.3 Crear Componentes UI en Svelte 5:**
  - `src/lib/components/web3/BlockchainProof.svelte`:
    - Badge de estado: `Pendiente de anclaje` 🟡 / `Confirmado en Blockchain` 🟢 / `Fallido` 🔴.
    - Muestra de Hash SHA-256 del PDF y Hash Canónico Keccak-256.
    - Enlace directo al explorador de bloques (Etherscan / Arbiscan).
  - `src/lib/components/web3/PublicVerification.svelte`:
    - Permite a un auditor subir un PDF o ingresar un ID para cotejar el hash con el contrato inteligente.
- [x] **5.4 Incorporar `BlockchainProof` en las vistas existentes:**
  - Dashboard de Generador, Operador y Almacenador en el detalle de la solicitud.
- [x] **5.5 Criterio de Aprobación Fase 5:**
  - La UI muestra el badge y el link al explorador correctamente una vez confirmada la tx.

---

### 📍 FASE 6: Despliegue en Testnet (Sepolia) y Verificación

> **Objetivo:** Ejecutar la solución en un entorno de red pública de pruebas.

- [x] **6.1 Fondear Wallet de Relayer en Sepolia (Faucets).** Wallet `0x1F3c...0004`, ~1.24 ETH.
- [x] **6.2 Desplegar `EcoTraceRegistry.sol` en Sepolia mediante Foundry:**
  ```bash
  forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify -vvvv
  ```
  Desplegado y verificado en
  [`0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113`](https://sepolia.etherscan.io/address/0xa3aac5eaef74f27927afd4d6792b5c33cc602113).
- [x] **6.3 Otorgar rol `RELAYER_ROLE` a la wallet del backend.** También `CERTIFICADOR_ROLE`
      (necesario porque el relayer firma `attestCertificate()` con la misma wallet — ver nota en
      README § Roles on-chain).
- [ ] **6.4 Configurar variables de producción/staging con los contratos verificados.** Local
      (`.env`, `functions/.env.local`, `functions/.env.<project-id>`) ✅ listo. Producción real
      (Secret Manager + `firebase deploy --only functions`) bloqueado: el proyecto Firebase está en
      plan Spark y Secret Manager / Cloud Functions v2 requieren plan Blaze.
- [x] **6.5 Prueba End-to-End en Sepolia.** Manifiesto y certificado anclados con transacciones
      reales confirmadas (vía emulador de Firestore/Functions apuntando al contrato desplegado). Ver
      `GUIA-LEVANTAR-Y-PROBAR.md`.

---

### 📍 FASE 7: Capa 2 — Atestación Institucional (EIP-712 / Wallets Externas)

> **Objetivo:** Permitir a certificadoras y entes estatales firmar atestaciones con wallets institucionales.

- [ ] **7.1 Definir dominio y tipos EIP-712 en `src/lib/types/web3.ts`:**
  - Estructura del mensaje de atestación (`requestId`, `documentHash`, `rol`, `observaciones`, `timestamp`).
- [ ] **7.2 Implementar `AttestationPanel.svelte`:**
  - Botón "Conectar Wallet Institucional" (MetaMask/Rabby usando `createWalletClient` de Viem).
  - Firma del mensaje tipado con `walletClient.signTypedData`.
- [ ] **7.3 Endpoint de Validación (`src/routes/api/attestation/+server.ts`):**
  - Validación backend de la firma EIP-712 (`verifyTypedData`).
  - Validación de que la dirección pública firmante posea el rol correspondiente (`CERTIFICADOR_ROLE` o `ENTE_ESTATAL_ROLE`).
  - Registro on-chain de la atestación institucional.
- [ ] **7.4 Criterio de Aprobación Fase 7:**
  - Certificadora firma con su wallet y el evento `CertificateAttested` queda inmutablemente ligado al certificado.

---

### 📍 FASE 8: Calidad, CI/CD y Testing Automatizado

> **Objetivo:** Blindar el código con integración continua y pruebas end-to-end.

- [ ] **8.1 Configurar ESLint y Prettier unificados.**
- [ ] **8.2 Configurar GitHub Actions (`.github/workflows/ci.yml`):**
  - Paso 1: `pnpm run check` (Chequeo de tipos SvelteKit).
  - Paso 2: `pnpm run lint` (Formato y linter).
  - Paso 3: `cd contracts && forge test` (Suite de contratos en Foundry).
  - Paso 4: `pnpm test` (Pruebas unitarias de hashing y servicios).
- [ ] **8.3 Tests E2E con Playwright:**
  - Flujo completo de login, creación de solicitud, avance de estado y verificación de UI.

---

### 📍 FASE 9: Despliegue en L2 Productiva y Runbook Operativo

> **Objetivo:** Puesta en producción con costos de gas despreciables y manual de operaciones.

- [ ] **9.1 Selección de L2:** Despliegue en **Arbitrum One** o **Polygon PoS** (Costo estimado: < US$ 0.01 por transacción).
- [ ] **9.2 Configuración de Secret Manager:** Claves privadas del relayer administradas en Google Secret Manager (nunca en archivos planos).
- [ ] **9.3 Redacción de Runbook (`docs/runbook-web3.md`):**
  - Procedimiento de recarga de gas de la wallet relayer.
  - Procedimiento de rotación de claves.
  - Plan de contingencia ante fallas de RPC.

---

## 📌 5. Matriz de Cambios por Componente

| Archivo / Componente                              | Acción        | Prioridad | Riesgo | Descripción                                                           |
| :------------------------------------------------ | :------------ | :-------: | :----: | :-------------------------------------------------------------------- |
| `contracts/` (completo)                           | **NUEVO**     |  **P0**   |  Bajo  | Smart contract `EcoTraceRegistry.sol`, tests y scripts en Foundry.    |
| `functions/src/web3/hashing.ts`                   | **NUEVO**     |  **P0**   |  Bajo  | Algoritmo determinista de hashing canónico.                           |
| `functions/src/web3/relayer.ts`                   | **NUEVO**     |  **P0**   | Medio  | Relayer automático de transacciones hacia la blockchain.              |
| `functions/src/web3/registry-client.ts`           | **NUEVO**     |  **P0**   |  Bajo  | Cliente de conexión y llamada al contrato inteligente.                |
| `src/lib/types/firestore.ts`                      | **MODIFICAR** |  **P0**   |  Bajo  | Extender interfaces con metadatos de blockchain (`BlockchainAnchor`). |
| `src/lib/types/web3.ts`                           | **NUEVO**     |  **P0**   |  Bajo  | Tipos Web3, redes y definiciones EIP-712.                             |
| `.env.example`                                    | **MODIFICAR** |  **P0**   |  Bajo  | Incorporar variables de RPC, Contract Address y claves.               |
| `src/lib/web3/client.ts`                          | **NUEVO**     |  **P1**   |  Bajo  | Cliente público Viem para lectura en frontend.                        |
| `src/lib/components/web3/BlockchainProof.svelte`  | **NUEVO**     |  **P1**   |  Bajo  | Componente visual de evidencia y verificación de transacciones.       |
| `src/routes/dashboard/auditoria/`                 | **NUEVO**     |  **P1**   |  Bajo  | Vista pública / auditable de trazabilidad por `requestId`.            |
| `.github/workflows/ci.yml`                        | **NUEVO**     |  **P1**   |  Bajo  | Pipeline de CI/CD para validar TypeScript y Foundry.                  |
| `functions/src/web3/attestations.ts`              | **NUEVO**     |  **P2**   | Medio  | Lógica de procesamiento de firmas institucionales.                    |
| `src/lib/components/web3/AttestationPanel.svelte` | **NUEVO**     |  **P2**   | Medio  | Modal/Panel de conexión con MetaMask/Rabby para firma EIP-712.        |
| `src/routes/api/attestation/+server.ts`           | **NUEVO**     |  **P2**   | Medio  | API endpoint para validar firmas EIP-712 y registrarlas.              |
| `src/routes/(auth)/*`, `dashboard/*`              | **MANTENER**  |     —     |   —    | La lógica de autenticación y operativa actual se conserva intacta.    |
| `functions/src/index.ts` (PDFs)                   | **MANTENER**  |     —     |   —    | La generación de PDFs con `pdf-lib` se mantiene exactamente igual.    |
| `firestore.rules`, `storage.rules`                | **MANTENER**  |     —     |   —    | Reglas de seguridad actuales se mantienen y validan.                  |

---

## 🏆 6. Resumen de Prioridades (Roadmap Sintético)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ P0 — IMPRESCINDIBLE (Core Web3 Inmutable)                                │
│ • Contrato EcoTraceRegistry.sol + Tests en Foundry                       │
│ • Algoritmo de Hash Canónico Determinista (hashing.ts)                   │
│ • Relayer Capa 1 en Cloud Functions (Anclaje automático de rutina)       │
│ • Persistencia de txHash y metadatos en Firestore                       │
│ • Variables de entorno documentadas                                      │
├──────────────────────────────────────────────────────────────────────────┤
│ P1 — IMPORTANTE (Visibilidad y Calidad)                                  │
│ • Componente UI BlockchainProof.svelte con link a explorador             │
│ • Vista de auditoría /dashboard/auditoria/[requestId]                    │
│ • Pipeline de CI/CD en GitHub Actions (Forge + Svelte Check)             │
│ • Monitoreo de balance y alertas del Relayer                             │
├──────────────────────────────────────────────────────────────────────────┤
│ P2 — MEJORA (Capa 2 Institucional)                                       │
│ • Firma EIP-712 con wallets externas (MetaMask / Rabby)                  │
│ • AttestationPanel.svelte y endpoint /api/attestation                    │
│ • Gestión de roles institucionales on-chain                              │
├──────────────────────────────────────────────────────────────────────────┤
│ P3 — POST-MVP / ESCALABILIDAD FUTURA                                     │
│ • Merkle batching diario para miles de manifiestos simultáneos           │
│ • Indexador The Graph / Subgraph para consultas analíticas complejas     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🏁 7. Criterios de Éxito para Dar por Completada la Migración

1. **Compilación y Tests de Contratos:** `forge test` pasa al 100% con pruebas unitarias, fuzzing e invariantes.
2. **Flujo de Rutina Transparente (Capa 1):** Un usuario generador crea una solicitud y el operador genera el manifiesto; sin necesidad de wallet, la Cloud Function ancla el hash canónico en la blockchain y la UI muestra el hash de la transacción confirmado.
3. **Verificabilidad Criptográfica:** El PDF generado y el estado de la solicitud pueden verificarse matemáticamente contra el contrato inteligente mediante su hash SHA-256 / Keccak-256.
4. **Cero Regresiones Web2:** El sistema de login, permisos, Firestore y Storage sigue funcionando con la misma fluidez y rendimiento que en el MVP actual.
