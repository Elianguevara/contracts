# EcoTrace

Sistema integral de gestión y manifiestos de residuos peligrosos con trazabilidad
criptográfica on-chain. Trazabilidad de residuos desde el generador hasta la
disposición/tratamiento final, con manifiesto electrónico, códigos de despacho
por bulto, certificados como declaración jurada y **anclaje inmutable de hashes
en blockchain**.

Construido con **SvelteKit 2 + Svelte 5 (Runes)**, **Firebase** (Auth, Firestore,
Storage, Functions), **Tailwind CSS v4**, **Viem** (verificación on-chain) y
**EcoTraceRegistry.sol** (Foundry / Solidity 0.8.24 / OpenZeppelin v5).

---

## Estado de Avance Web3

> Referencia: [`ROADMAP-IMPLEMENTACION-WEB3.md`](ROADMAP-IMPLEMENTACION-WEB3.md)

### Resumen por fase

| Fase  | Descripción                                                  |    Estado    |     Avance      |
| :---: | ------------------------------------------------------------ | :----------: | :-------------: |
| **0** | Preparación del entorno Web3 y tooling                       | ✅ Completo  |       4/4       |
| **1** | Smart contract `EcoTraceRegistry.sol` + tests Foundry        | ✅ Completo  |       4/4       |
| **2** | Hashing canónico determinista (Keccak-256)                   | ✅ Completo  |       3/3       |
| **3** | Capa 1 — Relayer en Cloud Functions + extensión Firestore    | ✅ Completo  |       5/5       |
| **4** | Monitoreo, gestión de nonces y resiliencia del relayer       | ✅ Completo  |       3/3       |
| **5** | UI de evidencia y verificación pública (frontend)            | ✅ Completo  |       5/5       |
| **6** | Despliegue en testnet (Sepolia) y verificación               |  ⚠️ Parcial  |       4/5       |
| **7** | Capa 2 — Atestación institucional EIP-712 / wallets externas | ❌ Pendiente |       0/4       |
| **8** | Calidad, CI/CD y testing automatizado                        |  ⚠️ Parcial  |       1/3       |
| **9** | Despliegue en L2 productiva y runbook operativo              | ❌ Pendiente |       0/3       |
|       | **TOTAL**                                                    |              | **29/39 — 74%** |

> Fase 6: contrato desplegado, verificado y probado end-to-end (manifiesto + certificado
> anclados con transacciones reales). Falta el ítem 6.4 en producción — desplegar las Cloud
> Functions con los secrets en Secret Manager requiere pasar el proyecto Firebase a plan Blaze
> (ver "Pendiente crítico" abajo).

### Grado de avance por prioridad

|           Prioridad            | Descripción                                            |   Estado    |
| :----------------------------: | ------------------------------------------------------ | :---------: |
| **P0** — Core Web3 (Fases 0-5) | Contrato + relayer + hashing + UI                      | ✅ **100%** |
| **P1** — Visibilidad y calidad | CI/CD activo; falta `/dashboard/auditoria/` y ESLint   |   ⚠️ 60%    |
| **P2** — Capa 2 institucional  | EIP-712, `AttestationPanel.svelte`, `/api/attestation` |    ❌ 0%    |
| **P3** — Escalabilidad futura  | L2 producción, Merkle batching, The Graph              |    ❌ 0%    |

### Lo que está operativo ahora

- `contracts/src/EcoTraceRegistry.sol` — contrato compilado, `forge build` ✅
- `forge test` — 15 unit tests + 8 fuzz tests (1 000 runs) + 3 invariantes (256 runs) ✅
- `functions/src/web3/hashing.ts` — `canonicalHash()` Keccak-256 con cobertura 100% ✅
- `functions/src/web3/registry-client.ts` — cliente Ethers v6 con retry y distributed lock ✅
- `functions/src/web3/relayer.ts` — anclaje automático de manifiestos y certificados ✅
- `functions/src/web3/monitoring.ts` — chequeo de saldo del relayer (INFO/WARN/ERROR) ✅
- `functions/src/web3/nonce-manager.ts` — mutex Firestore para sincronización multi-instancia ✅
- `src/lib/web3/client.ts` — Viem `publicClient` multi-chain (Anvil / Sepolia / Arbitrum Sepolia) ✅
- `src/lib/components/web3/BlockchainProof.svelte` — badge pending/confirmed/failed + link explorador ✅
- `src/lib/components/web3/PublicVerification.svelte` — verificación pública de hashes on-chain ✅
- `.github/workflows/ci.yml` — pipeline CI (frontend check + functions build/test + contracts) ✅
- **Contrato desplegado y verificado en Sepolia:**
  [`0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113`](https://sepolia.etherscan.io/address/0xa3aac5eaef74f27927afd4d6792b5c33cc602113)
  (código verificado, "Exact Match") — probado end-to-end: manifiestos y certificados anclados
  con transacciones reales confirmadas.

### Pendiente crítico (próximo paso)

El contrato ya está desplegado, verificado y probado (ver arriba). Lo que falta es llevar el
**backend** a producción:

```bash
# 1. Pasar el proyecto Firebase de Spark a Blaze (pay-as-you-go) — requerido por
#    Secret Manager y por las Cloud Functions v2 en general.
#    https://console.firebase.google.com/project/<project-id>/usage/details

# 2. Subir los secretos del relayer
firebase functions:secrets:set RELAYER_PRIVATE_KEY
firebase functions:secrets:set WEB3_RPC_URL

# 3. Configurar las variables no sensibles de producción (functions/.env.<project-id>)
CONTRACT_ADDRESS="0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113"
CHAIN_ID="11155111"

# 4. Deployar
firebase deploy --only functions
```

Guía completa, paso a paso y ya verificada en Windows (incluye troubleshooting de emuladores):
[`GUIA-LEVANTAR-Y-PROBAR.md`](GUIA-LEVANTAR-Y-PROBAR.md).

---

## Arquitectura Web3 (Capa 1 — operativa)

```text
Usuario (SvelteKit SSR)
        │
        ▼
Firebase Auth + Firestore         ← datos completos, PII off-chain
        │
        │  Firestore trigger (onDocumentUpdated → MANIFIESTO_GENERADO)
        ▼
Cloud Function v2 — Relayer
   ├── canonicalHash(payload)     ← keccak256 de campos no-PII
   ├── registryClient.registerDocument(requestId, hash, eventType)
   │       └── Ethers v6 → RPC → EcoTraceRegistry.sol
   └── Firestore ← { status, txHash, blockNumber, documentHash }
        │
        ▼
Frontend (Viem read-only)
   ├── BlockchainProof.svelte     ← muestra estado y link al explorador
   └── PublicVerification.svelte  ← auditor verifica hash on-chain
```

**Decisiones arquitectónicas fijas:**

- Usuarios finales **no usan wallet** — el anclaje es 100% automático por el relayer.
- On-chain: solo `bytes32` de hash, `requestId` y timestamp. **Cero PII en blockchain.**
- SvelteKit se mantiene (no React). Viem es agnóstico al framework.

---

## Roles

| Rol                       | Capacidades                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GENERADOR`               | Crea solicitudes de traslado (residuos con códigos Y, peso, estado, embalaje), asigna transportista/vehículo, plan de contingencia y hoja de ruta, y emite el manifiesto.      |
| `OPERADOR`                | Planta de tratamiento/disposición. Aprueba o rechaza solicitudes, registra el pesaje real, genera reporte de recepción ante disconformidad y emite el certificado final (R/D). |
| `ALMACENADOR_TRANSITORIO` | Depositario intermedio. Puede recibir y también generar solicitudes.                                                                                                           |
| `ADMIN`                   | Acceso transversal (auditoría).                                                                                                                                                |

**Roles on-chain (EcoTraceRegistry.sol):**

| Rol                 | Función                                                     |
| ------------------- | ----------------------------------------------------------- |
| `RELAYER_ROLE`      | Wallet del backend — ancla manifiestos (`registerDocument`) |
| `CERTIFICADOR_ROLE` | Atestigua certificados (`attestCertificate`)                |
| `ENTE_ESTATAL_ROLE` | Emite aprobaciones estatales (`approveAsState`)             |

> ⚠️ El backend (`functions/src/web3/relayer.ts`) firma **ambas** `registerDocument()` y
> `attestCertificate()` con la misma wallet (`RELAYER_PRIVATE_KEY`). Esa wallet necesita **los
> dos roles on-chain** (`RELAYER_ROLE` + `CERTIFICADOR_ROLE`), no solo `RELAYER_ROLE` — si falta
> `CERTIFICADOR_ROLE`, el anclaje de certificados revierte con `AccessControlUnauthorizedAccount`.
> Al desplegar con `Deploy.s.sol`, seteá `CERTIFICADOR_ADDRESS` en `contracts/.env` igual a la
> dirección del relayer. La atestación institucional con una wallet _distinta_ (Fase 7) todavía
> no está implementada.

## Máquina de estados

```text
INICIADA ──► APROBADA ──► MANIFIESTO_GENERADO ──► FINALIZADA
   └───────► RECHAZADA (requiere observación técnica)
                               │
                               ▼ (automático — Cloud Function)
                        Relayer ancla hash en blockchain
                        Firestore ← blockchainAnchor.status = 'confirmed'
```

Las transiciones se validan tanto en las **Firestore Security Rules** como en las
**acciones del servidor** (transacciones con el Admin SDK).

---

## Stack

### Web2 (operativo)

- SvelteKit 2 + `@sveltejs/adapter-node` (runtime Node para SSR + cookies de sesión)
- Svelte 5 con Runes (`$state`, `$derived`, `$effect`, `$props`) y snippets
- Vite 6 + `@tailwindcss/vite` (Tailwind v4, config en `src/app.css`)
- Firebase Web SDK v11 (cliente) + `firebase-admin` v13 (servidor)
- Firebase Functions v2 + `pdf-lib` (PDF de manifiesto y certificado con hash SHA-256)
- TypeScript en modo estricto

### Web3 (operativo)

- Solidity 0.8.24 + OpenZeppelin AccessControl v5.7.0
- Foundry (forge, anvil, cast) — compilación, testing y deployment
- Ethers v6 — cliente blockchain en Cloud Functions (relayer)
- Viem v2 — cliente público read-only en frontend (verificación)
- `js-sha3` — Keccak-256 en Node.js para hashing canónico
- Google Cloud Secret Manager — gestión de `RELAYER_PRIVATE_KEY` en producción

---

## Requisitos previos

- **Node 24** (ver `.nvmrc`)
- **pnpm 9** (declarado en `packageManager`)
- **Foundry** — `forge`, `anvil`, `cast`
- Firebase CLI (`npm i -g firebase-tools`) para emuladores y despliegue

Con [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

---

## Puesta en marcha

> Guía detallada, paso a paso y con troubleshooting (emuladores de Firebase + backend Web3 en
> Sepolia): [`GUIA-LEVANTAR-Y-PROBAR.md`](GUIA-LEVANTAR-Y-PROBAR.md). Lo de abajo es el resumen
> rápido para Anvil local.

```bash
# 1. Instalar dependencias
pnpm install
cd functions && npm install && cd ..

# 2. Configurar variables de entorno
cp .env.example .env
cp contracts/.env.example contracts/.env
#    Editá .env con las credenciales reales (ver tabla abajo)

# 3. Verificar tipos y levantar servidor de desarrollo
pnpm run check
pnpm run dev

# 4. Levantar Anvil (blockchain local) en otra terminal
anvil

# 5. Deployar contrato en Anvil
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

---

## Variables de entorno (`.env`)

### Firebase

| Variable                                             | Ámbito   | Descripción                                                  |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `PUBLIC_FIREBASE_API_KEY` … `PUBLIC_FIREBASE_APP_ID` | Cliente  | Config del Web SDK (Project Settings → tus apps).            |
| `FIREBASE_PROJECT_ID`                                | Servidor | ID del proyecto para el Admin SDK.                           |
| `FIREBASE_CLIENT_EMAIL`                              | Servidor | Email de la cuenta de servicio.                              |
| `FIREBASE_PRIVATE_KEY`                               | Servidor | Clave privada de la cuenta de servicio (con `\n` escapados). |
| `SESSION_COOKIE_NAME`                                | Servidor | Nombre de la cookie httpOnly (`__session`).                  |
| `SESSION_COOKIE_DAYS`                                | Servidor | Vigencia de la cookie de sesión.                             |

### Web3 (frontend)

| Variable                       | Ámbito  | Descripción                                                              |
| ------------------------------ | ------- | ------------------------------------------------------------------------ |
| `VITE_PUBLIC_RPC_URL`          | Cliente | RPC URL pública (ej: `http://127.0.0.1:8545` para Anvil).                |
| `VITE_PUBLIC_CONTRACT_ADDRESS` | Cliente | Dirección del contrato `EcoTraceRegistry` desplegado.                    |
| `VITE_PUBLIC_CHAIN_ID`         | Cliente | Chain ID (`31337` Anvil, `11155111` Sepolia, `421614` Arbitrum Sepolia). |

### Web3 (Cloud Functions / relayer)

| Variable                  | Ámbito    | Descripción                                                                |
| ------------------------- | --------- | -------------------------------------------------------------------------- |
| `WEB3_RPC_URL`            | Functions | RPC URL del nodo Ethereum (Anvil, Alchemy, Infura).                        |
| `RELAYER_PRIVATE_KEY`     | Functions | Clave privada de la wallet del relayer (**Secret Manager en producción**). |
| `CONTRACT_ADDRESS`        | Functions | Dirección del contrato `EcoTraceRegistry` desplegado.                      |
| `CHAIN_ID`                | Functions | Chain ID de la red objetivo.                                               |
| `RELAYER_MIN_BALANCE_ETH` | Functions | Umbral mínimo de balance en ETH (ej: `0.05`).                              |

> **Producción:** `RELAYER_PRIVATE_KEY` y `WEB3_RPC_URL` se gestionan en **Google Cloud Secret Manager**, nunca en archivos planos.

---

## Scripts

### Frontend y proyecto raíz

| Script               | Acción                                                    |
| -------------------- | --------------------------------------------------------- |
| `pnpm run dev`       | Servidor de desarrollo (Vite).                            |
| `pnpm run build`     | Build de producción (`adapter-node`, salida en `build/`). |
| `pnpm run preview`   | Previsualiza el build de producción.                      |
| `pnpm run start`     | Ejecuta el servidor de producción (`node build`).         |
| `pnpm run check`     | `svelte-check` (chequeo de tipos).                        |
| `pnpm run format`    | Prettier.                                                 |
| `pnpm run lint`      | Prettier en modo verificación.                            |
| `pnpm run emulators` | Suite de emuladores de Firebase.                          |

### Contratos (Foundry)

| Script                                                                                         | Acción                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm run test:contracts`                                                                      | `forge test -vvv` — unit + fuzz + invariant. |
| `cd contracts && forge build`                                                                  | Compilar contratos.                          |
| `cd contracts && forge test -vvv`                                                              | Ejecutar suite completa de tests.            |
| `cd contracts && anvil`                                                                        | Nodo local de desarrollo.                    |
| `cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` | Deployar en Anvil.                           |

### Functions

| Script                          | Acción                               |
| ------------------------------- | ------------------------------------ |
| `pnpm run test:functions`       | Vitest — tests unitarios de hashing. |
| `cd functions && npm run build` | Compilar TypeScript.                 |
| `cd functions && npm run serve` | Emulador local de Functions.         |

### CI/CD

| Script               | Acción                                             |
| -------------------- | -------------------------------------------------- |
| `pnpm run test:all`  | Ejecuta contracts + functions + svelte-check.      |
| `pnpm run build:all` | Build completo (frontend + functions + contracts). |

---

## Emuladores de Firebase

```bash
pnpm run emulators
```

Puertos: Auth `9099`, Firestore `8080`, Storage `9199`, Functions `5001`, UI incluida.
Los índices compuestos están en `firestore.indexes.json` y las reglas en
`firestore.rules` / `storage.rules`.

---

## Flujo transaccional completo

1. **Generador** crea la solicitud (`INICIADA`) y sube a Storage los PDF de plan de
   contingencia y hoja de ruta.
2. **Operador** aprueba o rechaza desde su bandeja en tiempo real (`onSnapshot`).
   El rechazo exige una observación técnica.
3. **Generador** emite el manifiesto: bloquea la edición, pasa a
   `MANIFIESTO_GENERADO` y genera un **código de despacho único por bulto**.
4. **Cloud Function** genera el PDF oficial (manifiesto original/duplicado/triplicado)
   con hash SHA-256. Inmediatamente dispara el **Relayer** que:
   - Genera el hash canónico Keccak-256 del payload (campos no-PII).
   - Llama a `registerDocument()` en `EcoTraceRegistry.sol`.
   - Persiste `txHash`, `blockNumber`, `documentHash` y `status: 'confirmed'`
     en `solicitud.blockchainAnchor`.
5. **Operador** registra el pesaje real; si hay disconformidad crea un **reporte de
   recepción**, finaliza con el código R/D y emite el **certificado**.
6. **Cloud Function** genera el PDF del certificado y el Relayer ancla su hash
   con `attestCertificate()`.
7. El badge **BlockchainProof** en el frontend muestra el estado (pendiente / confirmado /
   fallido) con link directo al explorador de bloques.

---

## Estructura del proyecto

```text
EcoTrace/
├── contracts/                    # Foundry — Smart contracts
│   ├── src/EcoTraceRegistry.sol  # Contrato principal (AccessControl + 3 roles)
│   ├── test/                     # Unit + fuzz + invariant tests
│   ├── script/Deploy.s.sol       # Script de deployment multi-red
│   ├── lib/openzeppelin-contracts/ # OZ v5.7.0 (git submodule)
│   └── foundry.toml
│
├── functions/src/web3/           # Capa Web3 del backend
│   ├── config.ts                 # Configuración + Secret Manager
│   ├── hashing.ts                # canonicalHash() Keccak-256
│   ├── registry-client.ts        # Cliente Ethers v6 + retry + nonce
│   ├── relayer.ts                # anchorManifiesto / anchorCertificado
│   ├── monitoring.ts             # checkRelayerBalance (INFO/WARN/ERROR)
│   └── nonce-manager.ts          # Distributed lock Firestore
│
├── src/
│   ├── lib/
│   │   ├── web3/client.ts        # Viem publicClient multi-chain
│   │   ├── components/web3/
│   │   │   ├── BlockchainProof.svelte      # Badge estado + link explorador
│   │   │   └── PublicVerification.svelte   # Verificación pública de hashes
│   │   ├── types/firestore.ts    # Tipos incluyendo BlockchainAnchor
│   │   └── ...                   # Auth, stores, services, utils
│   └── routes/                   # SvelteKit SSR pages + API
│
├── .github/workflows/ci.yml      # CI: frontend check + functions test + forge test
├── ROADMAP-IMPLEMENTACION-WEB3.md
└── docs/
    ├── mvp-architecture.md
    ├── plan-implementacion-web3.md
    └── web3-integration.md
```

Referencias clave:

- Modelos de datos: [src/lib/types/firestore.ts](src/lib/types/firestore.ts)
- Reglas de seguridad: [firestore.rules](firestore.rules) · [storage.rules](storage.rules)
- Guardas de sesión: [src/hooks.server.ts](src/hooks.server.ts) · [src/lib/auth/guards.server.ts](src/lib/auth/guards.server.ts)
- Transiciones de estado: [src/lib/server/solicitudes.service.ts](src/lib/server/solicitudes.service.ts)
- Cloud Functions (PDF + relayer): [functions/src/index.ts](functions/src/index.ts)
- Roadmap Web3: [ROADMAP-IMPLEMENTACION-WEB3.md](ROADMAP-IMPLEMENTACION-WEB3.md)
