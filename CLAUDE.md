# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EcoTrace: hazardous-waste manifest management with cryptographic on-chain traceability.
Frontend/backend is Spanish-language domain (routes, fields, Firestore docs) — match that
convention when adding UI text or comments in `src/`.

Three independently-versioned subprojects in one repo, each with its own package manager and
toolchain:

- **root** — SvelteKit 2 / Svelte 5 frontend + Firebase Admin server code. pnpm.
- **`functions/`** — Firebase Cloud Functions (PDF generation + Web3 relayer). npm (has its own
  `package-lock.json`/`pnpm-lock.yaml` — always `cd functions` before installing/running).
- **`contracts/`** — Foundry/Solidity smart contract. Not part of the JS workspace at all.

## Commands

```bash
# Root (frontend)
pnpm install
pnpm run dev              # Vite dev server
pnpm run build             # adapter-node build -> build/
pnpm run check              # svelte-kit sync + svelte-check (typecheck)
pnpm run format / lint      # prettier write / check
pnpm run emulators          # Firebase emulator suite (Auth 9099, Firestore 8080, Storage 9199, Functions 5001)

# functions/ (Cloud Functions — separate install!)
cd functions && npm install
npm run build                # tsc -> functions/lib
npm run serve                 # build + firebase emulators:start --only functions
npm test                       # vitest run (all)
npx vitest run <path>           # single test file
npx vitest run -t "<name>"       # single test by name

# contracts/ (Foundry) — first checkout on a machine needs the submodule:
git submodule update --init --recursive   # populates lib/openzeppelin-contracts (which nests forge-std)
cd contracts
forge build
forge test -vvv                                  # unit + fuzz (1000 runs) + invariant (256 runs)
forge test --match-test testName -vvv              # single test
forge test --match-contract ContractName -vvv        # single test contract
anvil                                                  # local chain
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Aggregate (from root)
pnpm run test:contracts   # forge test
pnpm run test:functions   # cd functions && npm test
pnpm run test:all          # contracts + functions + svelte-check
pnpm run build:all          # frontend + functions + contracts builds
```

Seed emulator test users (data does NOT persist across emulator restarts — reseed every time):

```bash
node scripts/create-emulator-users.mjs
```

Roles/creds it creates: `admin@ecotrace.test`, `generador@ecotrace.test`,
`operador@ecotrace.test`, `almacenador@ecotrace.test`, `transportista@ecotrace.test`
(passwords `<Rol>123!`).

### Windows-specific gotchas

- `cd functions && npm run build` can fail with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`
  (pnpm trying to revalidate `node_modules` without a TTY). Workaround: `cd functions && npx tsc`.
- Cold-start emulator boot can hit `Cannot determine backend specification. Timeout after 10000`
  (Windows Defender scanning `node_modules`, especially `ethers`/`pdf-lib`) — just rerun
  `pnpm run emulators`, second run is fast.
- If ports are stuck after a crashed emulator run (`8080`/`9099`/`9199`/`5001`/`4000`/`4400`/`4500`/`9150`),
  kill the owning processes before restarting (`Get-NetTCPConnection -LocalPort <p> | ... Stop-Process`).

## Environment

Three separate `.env` files, each with its own `.example`, none committed:

- `.env` (root) — Firebase Web SDK config + `VITE_PUBLIC_*` Web3 vars (safe to expose, read-only client).
- `functions/.env.local` — **emulator only**; production secrets live in Google Cloud Secret
  Manager (`RELAYER_PRIVATE_KEY`, `WEB3_RPC_URL`), never in a file. `functions/src/web3/config.ts`
  (`resolveSecret`) reads Secret Manager first, falls back to this file only when
  `FUNCTIONS_EMULATOR === 'true'`, and as a last resort in emulator mode falls back to the
  well-known Anvil default test account so local dev works with zero config.
- `contracts/.env` — only needed to (re)deploy the contract with Foundry.

## Architecture

### Request flow / auth

`src/hooks.server.ts` resolves the Firebase session cookie into `event.locals.user`
(`SessionUser`, from `src/lib/types/firestore.ts`) on every request. Route-level access control
is layered:

1. `src/lib/auth/guards.server.ts` — `requireAuth` / `requireRole`, called from
   `+layout.server.ts` / `+page.server.ts` / form actions. `ADMIN` always passes role checks.
2. `firestore.rules` — mirrors the same role/ownership checks server-side at the database layer
   (defense in depth; never trust the client alone).
3. `src/lib/server/*.service.ts` — business logic re-validates actor role + document state inside
   Firestore transactions before every write (see below).

### Domain state machine

`SolicitudTraslado` (waste transfer request) moves through:

```
INICIADA ──► APROBADA ──► MANIFIESTO_GENERADO ──► FINALIZADA
   └───────► RECHAZADA (requires observación técnica)
```

All transitions are implemented as `getAdminDb().runTransaction(...)` blocks in
`src/lib/server/solicitudes.service.ts` (reads before writes, role/ownership check, state
precondition check, then the write). `generarManifiesto` also generates per-bulk dispatch codes
(`src/lib/utils/despacho-code.ts`). `finalizarSolicitud` conditionally writes a
`reportes_recepcion` subdoc (on disconformity) and always writes a `certificados` subdoc via
`src/lib/server/certificados.service.ts`, in the same transaction.

### PDF generation + blockchain anchoring pipeline (Cloud Functions, `functions/src/index.ts`)

This is a chained-Firestore-trigger pipeline, not a single function — each stage watches for the
field the previous stage writes, so understanding it requires reading the trigger conditions
together:

1. Server action updates `solicitudes/{id}.estado` (e.g. to `MANIFIESTO_GENERADO`).
2. `generarManifiestoPdf` (`onDocumentUpdated`) fires on the state change, builds the PDF with
   `pdf-lib`, uploads to Storage, writes back `manifiesto.pdfUrl` + `manifiesto.hashDocumento`
   (SHA-256).
3. `anclarManifiesto` (`onDocumentUpdated`, same collection) fires on that same write, but exits
   early until `manifiesto.hashDocumento` is present — i.e. it waits out step 2 via re-triggering,
   not via a direct call. It then computes the canonical Keccak-256 hash
   (`functions/src/web3/hashing.ts`) and calls `anchorManifiesto()` → `registerDocument()` on
   `EcoTraceRegistry.sol`. Idempotency is via `blockchainAnchor.status` (`pending`/`confirmed`
   skip re-anchoring). `anchorManifiesto` never throws — failures are written to Firestore as
   `blockchainAnchor.status = 'failed'` instead.
4. The certificado path (`emitirCertificadoPdf` → `anclarCertificado` →
   `attestCertificate()`) mirrors the same two-stage pattern on the `certificados` subcollection.
5. `verificarSaldoRelayer` (`onSchedule`, every 6h) checks relayer wallet balance and logs at
   INFO/WARN/ERROR.

The Storage emulator can't sign URLs (no real service account), so `persistPdf()` in
`functions/src/index.ts` branches on `FUNCTIONS_EMULATOR === 'true'` to use a Firebase
download-token URL instead of `getSignedUrl()`.

### On-chain layer

- `contracts/src/EcoTraceRegistry.sol` — OpenZeppelin AccessControl with three roles:
  `RELAYER_ROLE` (`registerDocument`), `CERTIFICADOR_ROLE` (`attestCertificate`),
  `ENTE_ESTATAL_ROLE` (`approveAsState`). **The backend relayer wallet needs both `RELAYER_ROLE`
  and `CERTIFICADOR_ROLE`** — it signs both call types with the same `RELAYER_PRIVATE_KEY`. Missing
  `CERTIFICADOR_ROLE` surfaces as `AccessControlUnauthorizedAccount` when anchoring certificates.
  When deploying with `script/Deploy.s.sol`, set `CERTIFICADOR_ADDRESS` in `contracts/.env` to the
  relayer's own address — it defaults to `address(0)` (role granted to no one) if unset.
- Only `bytes32` hashes + `requestId` + timestamp go on-chain — no PII ever. End users don't hold
  wallets; anchoring is fully automatic via the relayer.
- `functions/src/web3/registry-client.ts` (Ethers v6, retry) and `nonce-manager.ts` (Firestore
  distributed lock, for multi-instance nonce safety) back the relayer.
- `src/lib/web3/client.ts` (Viem, read-only) is used by `BlockchainProof.svelte` (status badge)
  and `PublicVerification.svelte` (public hash lookup, no login required) on the frontend.
- Deployed contract (Sepolia): `0xa3Aac5EAEF74f27927afD4d6792B5C33cC602113`.

### Frontend realtime data

Dashboard routes are role-partitioned under `src/routes/dashboard/{generador,operador,almacenador}/`
(`ADMIN` and `TRANSPORTISTA` both land on `/dashboard/operador` — see `DASHBOARD_HOME` in
`src/lib/auth/roles.ts`). Within a dashboard page, Svelte 5 rune-based stores
(`src/lib/stores/*.svelte.ts`, e.g. `crearSolicitudesStore`) subscribe directly to Firestore via
`onSnapshot` (client SDK, `src/lib/firebase/client.ts`), filtered by actor field
(`generadorId`/`operadorId`/`transportistaId`/`almacenadorId`). This is independent of the SSR
data loaded in `+page.server.ts` — it's how, e.g., an operador's bandeja updates live without a
page reload when a generador submits a new solicitud.

### Key reference files

- Data models: `src/lib/types/firestore.ts`
- Security rules: `firestore.rules`, `storage.rules`
- Session/guards: `src/hooks.server.ts`, `src/lib/auth/guards.server.ts`
- State transitions: `src/lib/server/solicitudes.service.ts`
- Role → route mapping: `src/lib/auth/roles.ts`
- Cloud Functions entry point: `functions/src/index.ts`
- Web3 config/secret resolution: `functions/src/web3/config.ts`
- Web3 phase-by-phase status (what's built vs. still pending, e.g. EIP-712 institutional
  attestation, L2 migration): `ROADMAP-IMPLEMENTACION-WEB3.md`
- Full Windows setup/troubleshooting walkthrough beyond the gotchas above: `GUIA-LEVANTAR-Y-PROBAR.md`
