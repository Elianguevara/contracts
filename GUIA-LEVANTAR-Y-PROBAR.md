# Guía Paso a Paso: Levantar y Probar EcoTrace Localmente

Esta guía detalla el procedimiento exacto para **instalar, levantar y probar íntegramente** el
proyecto en tu entorno local (frontend + Firebase emulators + backend Web3 anclando en
Sepolia), verificado de punta a punta en Windows.

---

## 📋 Requisitos Previos

1. **Node.js**: Versión 22 o 24 (`node -v`).
2. **pnpm**: Versión 9 (`pnpm -v`).
   - Si no tenés pnpm activo:
     ```powershell
     corepack enable
     corepack prepare pnpm@9.15.0 --activate
     ```
3. **Java Runtime Environment (JRE/JDK)**: Versión 11 o superior (`java -version`).
   - _Requerido por Firebase Tools para correr los emuladores locales de Firestore y Auth._
4. **Firebase CLI**:
   ```powershell
   npm install -g firebase-tools
   firebase --version
   ```
5. **Foundry** (`forge`, `cast`) — solo si vas a (re)desplegar o interactuar directamente con el
   contrato:
   ```powershell
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

---

## ⚙️ Paso 1: Configurar Variables de Entorno

Hay **tres archivos `.env` distintos**, cada uno con su propio propósito. Los tres ya están
gitignoreados — nunca se commitean.

### 1.1 `.env` (raíz — frontend / SvelteKit)

```powershell
Copy-Item .env.example .env
```

Para desarrollo local con emuladores, dejá activados:

```env
PUBLIC_USE_STORAGE_EMULATOR="true"
PUBLIC_USE_FIREBASE_EMULATORS="true"
USE_FIREBASE_EMULATORS="true"
```

Y las variables Web3 del cliente (Viem, solo lectura — es seguro exponerlas en el bundle):

```env
VITE_PUBLIC_CHAIN_ID="11155111"
VITE_PUBLIC_RPC_URL=""   # vacío = usa el RPC público por default de viem/chains para Sepolia
VITE_PUBLIC_CONTRACT_ADDRESS="0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113"
```

### 1.2 `functions/.env.local` (backend — solo emulador)

Este archivo lo lee automáticamente `firebase emulators:start` y **nunca se usa en producción**
(ahí los secretos vienen de Google Cloud Secret Manager).

```powershell
Copy-Item functions/.env.local.example functions/.env.local
```

Tenés dos modos posibles:

**Modo A — sin anclaje real (más simple, no requiere wallet ni gas):**
Dejá los valores por defecto del `.example` (Anvil / dirección cero). El manifiesto, el hash y
el certificado se generan igual; el campo `blockchainAnchor.status` va a quedar en `"failed"`
porque no hay ningún nodo escuchando en `127.0.0.1:8545`. Sirve para probar el flujo de negocio
sin tocar nada de blockchain.

**Modo B — anclaje real contra el contrato ya desplegado en Sepolia (recomendado, el que usamos
para validar todo el flujo):**

```env
RELAYER_PRIVATE_KEY="<misma clave privada de contracts/.env — wallet con ETH de Sepolia>"
WEB3_RPC_URL="<mismo WEB3_RPC_URL de contracts/.env, ej. Alchemy>"
CONTRACT_ADDRESS="0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113"
CHAIN_ID="11155111"
RELAYER_MIN_BALANCE_ETH="0.05"
```

> ⚠️ En Modo B cada manifiesto/certificado que emitas genera una **transacción real en Sepolia**
> (paga gas de testnet, no cuesta dinero real, pero consume el balance de la wallet). La wallet
> usada acá necesita `CERTIFICADOR_ROLE` además de `RELAYER_ROLE` — ver nota en
> `contracts/.env.example`.

### 1.3 `contracts/.env` (solo si vas a (re)desplegar el contrato con Foundry)

```powershell
Copy-Item contracts/.env.example contracts/.env
```

Ver la sección "Despliegue en Sepolia" más abajo — no hace falta tocar esto si solo vas a probar
contra el contrato ya desplegado.

---

## 📦 Paso 2: Instalar Dependencias

```powershell
pnpm install
cd functions
pnpm install
pnpm approve-builds --all
cd ..
```

---

## 🔨 Paso 3: Compilar Cloud Functions y Verificar Tipos

```powershell
cd functions
pnpm run build
cd ..
```

> **Nota Windows/pnpm:** si `pnpm run build` (que internamente corre `tsc`) falla con
> `[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY]`, es porque pnpm quiso re-validar
> `node_modules` y no tiene una terminal interactiva. Compilá directo con:
>
> ```powershell
> cd functions
> npx tsc
> cd ..
> ```

Verificá que se haya generado la carpeta `functions/lib/`.

Chequeo de tipos del frontend:

```powershell
pnpm run check
```

_Debe responder con `0 errors`._

---

## 🚀 Paso 4: Levantar los Emuladores de Firebase

En una **Terminal 1**, en la raíz del proyecto:

```powershell
pnpm run emulators
```

Deberías ver:

```
+  functions: Loaded functions definitions from source: generarManifiestoPdf, emitirCertificadoPdf,
   anclarManifiesto, anclarCertificado, verificarSaldoRelayer.
✔  All emulators ready! It is now safe to connect your app.
```

- 🌐 **Emulator UI:** [http://localhost:4000](http://localhost:4000)
- 🔐 **Auth:** `localhost:9099` · 🗄️ **Firestore:** `localhost:8080` · 📦 **Storage:** `localhost:9199`
  · ⚡ **Functions:** `localhost:5001`

> ⚠️ Dejá esta terminal abierta y corriendo.

### Advertencias esperadas (no son errores)

- `Unable to access secret environment variables from Google Cloud Secret Manager (...) HTTP
Error: 403, Secret Manager API has not been used`: normal en el emulador si el proyecto está en
  plan Spark (gratuito) o nunca activaste Secret Manager. **No importa** — en modo emulador
  (`FUNCTIONS_EMULATOR=true`) el código cae automáticamente a los valores planos de
  `functions/.env.local`, así que `RELAYER_PRIVATE_KEY`/`WEB3_RPC_URL` igual se leen bien
  (ver `functions/src/web3/config.ts`, función `resolveSecret`).
- `function ignored because the pubsub emulator does not exist`: es la función
  `verificarSaldoRelayer` (cron cada 6 h), no aplica en local, no afecta el resto.

### Problemas comunes

- **`Cannot determine backend specification. Timeout after 10000`** al arrancar Functions: es un
  timeout de arranque en frío (Windows Defender escaneando `node_modules` la primera vez, sobre
  todo por `ethers`/`pdf-lib`). **Solución:** simplemente volvé a correr `pnpm run emulators`; la
  segunda vez el disco ya está en caché y carga en menos de 1 segundo.
- **Puerto ocupado al reiniciar** (`Port 8080/9099/... is not open`): quedó un proceso Java/Node
  colgado de una corrida anterior. Liberalos con:
  ```powershell
  $ports = 9099,8080,9199,4400,4000,4500,5001,9150
  foreach ($p in $ports) {
    Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  ```
  y volvé a correr `pnpm run emulators`.
- **Los PDFs no se generan / `manifiesto.hashDocumento` nunca aparece**: asegurate de tener
  compilado `functions/lib/` con los cambios más recientes (Paso 3). El emulador de Storage no
  soporta `file.getSignedUrl()` (necesita una service account real con `client_email`);
  `persistPdf()` en `functions/src/index.ts` ya tiene una rama específica para
  `FUNCTIONS_EMULATOR === 'true'` que usa un download-token en su lugar — si ves el error
  `Cannot sign data without` `client_email` en los logs, tu `functions/lib/` está desactualizado,
  recompilá.

---

## 👥 Paso 5: Crear Usuarios de Prueba en el Emulador

En una **Terminal 2** (los datos del emulador NO persisten entre reinicios — hay que re-seedear
cada vez que reiniciás `pnpm run emulators`):

```powershell
node scripts/create-emulator-users.mjs
```

| Rol               | Correo Electrónico            | Contraseña          |
| :---------------- | :---------------------------- | :------------------ |
| **ADMIN**         | `admin@ecotrace.test`         | `Admin123!`         |
| **GENERADOR**     | `generador@ecotrace.test`     | `Generador123!`     |
| **OPERADOR**      | `operador@ecotrace.test`      | `Operador123!`      |
| **ALMACENADOR**   | `almacenador@ecotrace.test`   | `Almacenador123!`   |
| **TRANSPORTISTA** | `transportista@ecotrace.test` | `Transportista123!` |

Verificá en [http://localhost:4000/auth](http://localhost:4000/auth) y
[http://localhost:4000/firestore](http://localhost:4000/firestore).

---

## 💻 Paso 6: Iniciar Servidor de Desarrollo SvelteKit

En la misma Terminal 2:

```powershell
pnpm run dev
```

👉 **[http://localhost:5173](http://localhost:5173)**

---

## 🧪 Paso 7: Protocolo de Prueba Integral (Paso a Paso)

### 1. Autenticación y redirección de roles

1. `http://localhost:5173/login` → `generador@ecotrace.test` / `Generador123!` → redirige a
   `/dashboard/generador`.
2. Cerrá sesión → `operador@ecotrace.test` / `Operador123!` → redirige a `/dashboard/operador`.

### 2. Circuito de manifiesto (Generador)

1. Como `generador@ecotrace.test`, creá una solicitud en
   `/dashboard/generador/solicitudes/nueva` (residuos, transporte, plan de contingencia, hoja de
   ruta).
2. Avanzá la solicitud hasta `MANIFIESTO_GENERADO`.
3. En la **Terminal 1** (emuladores) deberías ver, en este orden:
   ```
   Beginning execution of "us-central1-generarManifiestoPdf"
   {"severity":"INFO","message":"Manifiesto PDF generado", "hash": "..."}
   Beginning execution of "us-central1-anclarManifiesto"
   {"severity":"INFO","message":"[Relayer] Manifiesto anclado exitosamente", "txHash": "0x...", "blockNumber": ...}
   ```
4. En [http://localhost:4000/storage](http://localhost:4000/storage) verificá el PDF en
   `documentos/manifiestos/<id>.pdf`.
5. En [http://localhost:4000/firestore](http://localhost:4000/firestore), el documento de la
   solicitud debe tener `manifiesto.hashDocumento`, `manifiesto.pdfUrl` y
   `blockchainAnchor.status: "confirmed"` con un `txHash` real.
6. Si estás en **Modo B** (Sepolia), pegá ese `txHash` en
   `https://sepolia.etherscan.io/tx/<txHash>` para ver la transacción confirmada.

### 3. Emisión de certificado (Operador)

1. Iniciá sesión como `operador@ecotrace.test`.
2. Accedé a la solicitud y emití el certificado de tratamiento/disposición final.
3. En la Terminal 1 deberías ver el mismo patrón:
   ```
   Beginning execution of "us-central1-emitirCertificadoPdf"
   {"severity":"INFO","message":"Certificado PDF generado", "numero": "CERT-2026-...", "hash": "..."}
   Beginning execution of "us-central1-anclarCertificado"
   {"severity":"INFO","message":"[Relayer] Certificado anclado exitosamente", "txHash": "0x...", "blockNumber": ...}
   ```
4. En Firestore, `solicitudes/<id>/certificados/<certId>` debe tener `pdfUrl`, `hashDocumento` y
   `blockchainAnchor.status: "confirmed"`.

### 4. Verificación pública (cualquier usuario, sin login)

En la landing del frontend, el componente **PublicVerification** permite subir el PDF (o pegar el
hash Keccak-256) y confirmar contra el contrato real si está `registered`. Usa el mismo
`VITE_PUBLIC_CONTRACT_ADDRESS`/`VITE_PUBLIC_CHAIN_ID` del `.env` raíz.

---

## 🔗 Contrato desplegado (Sepolia)

- Dirección: `0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113`
- Etherscan (código verificado ✅): https://sepolia.etherscan.io/address/0xa3aac5eaef74f27927afd4d6792b5c33cc602113
- Roles: la wallet relayer tiene `DEFAULT_ADMIN_ROLE` + `RELAYER_ROLE` + `CERTIFICADOR_ROLE` (ver
  `contracts/script/Deploy.s.sol` y la nota en `contracts/.env.example` sobre por qué el backend
  necesita los tres).

### (Re)desplegar el contrato

Solo si necesitás un contrato nuevo (no hace falta para probar localmente):

```powershell
cd contracts
forge test                                                   # 26 tests: unit + fuzz + invariant
forge script script/Deploy.s.sol --rpc-url sepolia -vvvv     # dry-run / simulación
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify -vvvv   # deploy real
```

Después de un deploy nuevo, actualizá la dirección en los tres `.env` (raíz, `functions/.env.local`
y, si aplica, `functions/.env.<project-id>` para producción).

---

## 🛠️ Resumen de Comandos Rápidos

| Acción                   | Comando                                                 |
| :----------------------- | :------------------------------------------------------ |
| **Instalar todo**        | `pnpm install && cd functions && pnpm install && cd ..` |
| **Compilar Functions**   | `cd functions && npx tsc && cd ..`                      |
| **Chequear tipos**       | `pnpm run check`                                        |
| **Levantar Emuladores**  | `pnpm run emulators`                                    |
| **Cargar usuarios demo** | `node scripts/create-emulator-users.mjs`                |
| **Levantar Frontend**    | `pnpm run dev`                                          |
| **Tests del contrato**   | `cd contracts && forge test`                            |

---

## ❗ Solución de Problemas Comunes

- **`java: command not found`**: Instalá Java JDK (OpenJDK 17 o 21) y agregalo al `PATH`.
- **Puerto ocupado** (8080, 9099, 5173, etc.): ver el bloque de PowerShell en el Paso 4, o:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process
  ```
- **Los PDFs no se generan**: recompilá `functions/lib/` (`cd functions && npx tsc`). Si ves
  `Cannot sign data without` `client_email` en los logs, ver la nota del Paso 4 sobre `persistPdf()`.
- **`blockchainAnchor.status` queda en `"failed"`**: en Modo A (sin Sepolia) es esperado — no hay
  RPC real. En Modo B, revisá el `errorMessage` guardado en el documento; las causas típicas son
  balance insuficiente de la wallet relayer o que le falte `CERTIFICADOR_ROLE` (el certificado
  necesita ese rol específico, no `RELAYER_ROLE`).
- **`AccessControlUnauthorizedAccount` al anclar certificados**: la wallet del relayer no tiene
  `CERTIFICADOR_ROLE` en el contrato. Ver la sección de roles arriba — el deploy actual ya la
  tiene, pero si redesplegás con otra wallet acordate de setear `CERTIFICADOR_ADDRESS` en
  `contracts/.env` antes del deploy.
