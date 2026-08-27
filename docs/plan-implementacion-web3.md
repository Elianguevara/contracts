# Plan de implementacion Web3 para EcoTrace

## 1. Objetivo

Implementar en EcoTrace una capa de trazabilidad verificable en dos niveles:

- **Capa 1 - Anclaje de rutina:** registrar hashes de documentos/eventos operativos en una blockchain publica mediante una wallet de servicio controlada por EcoTrace.
- **Capa 2 - Atestacion institucional:** permitir que certificadoras y entes estatales atestiguen eventos criticos con wallets institucionales y roles on-chain.

La implementacion debe mantener a Firestore como fuente de verdad operativa y usar blockchain solo como evidencia publica de integridad, timestamp y atestacion.

## 2. Alcance funcional

### Incluido

- Contrato `EcoTraceRegistry` compatible EVM.
- Eventos on-chain para documentos, certificados y aprobaciones estatales.
- Tests de contrato con Foundry.
- Deploy en testnet EVM y posterior migracion a L2 productiva.
- Cloud Function relayer para Capa 1.
- Hash canonico de solicitudes, manifiestos, reportes y certificados.
- Persistencia en Firestore de metadatos on-chain.
- UI de verificacion dentro de EcoTrace.
- Flujo de firma EIP-712 para Capa 2.
- Verificacion backend de firmas institucionales.
- Documentacion operativa para despliegue, monitoreo y auditoria.

### Fuera del MVP inicial

- Merkle batching diario.
- OpenTimestamps como reemplazo de Capa 1.
- Subgraph/The Graph o indexacion publica avanzada.
- Integracion definitiva con certificador licenciado bajo Ley 25.506.
- Custodia institucional productiva con Fireblocks/Turnkey, salvo que legal/compliance lo habilite temprano.

## 3. Decisiones base

- Firestore sigue siendo la fuente de verdad del negocio.
- On-chain se guardan hashes y eventos, nunca datos personales, comerciales o ambientales completos.
- Los usuarios operativos no usan wallet.
- EcoTrace paga gas del anclaje rutinario mediante relayer.
- Certificadoras y entes estatales firman solo eventos de bajo volumen y alto valor probatorio.
- La firma de wallet no se presentara como firma digital legal bajo Ley 25.506 salvo integracion con certificador licenciado.

## 4. Modelo de evidencia

| Capa   | Evento                | Quien firma                 | Que prueba                                                  | Que no prueba                                      |
| ------ | --------------------- | --------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Capa 1 | `DocumentRegistered`  | Wallet de servicio EcoTrace | Existencia, integridad y timestamp del documento            | Autor institucional externo o firma digital formal |
| Capa 2 | `CertificateAttested` | Certificadora               | Que una organizacion certificadora atestiguo un certificado | Firma digital legal por si sola                    |
| Capa 2 | `StateApproval`       | Ente estatal                | Que una entidad estatal aprobo/atestiguo un evento          | Veracidad material de todo el proceso              |

## 5. Arquitectura objetivo

```text
Firestore / Storage
    |
    | Cloud Functions
    v
Hash canonico del documento/evento
    |
    +------------------------------+
    |                              |
    v                              v
Capa 1 Relayer EcoTrace       Capa 2 Firma institucional
Secret Manager + cola         Wallet/custodia + EIP-712
    |                              |
    v                              v
EcoTraceRegistry en L2 EVM
    |
    v
Evento on-chain + txHash + blockNumber
    |
    v
Metadatos persistidos en Firestore + UI de auditoria
```

## 6. Cambios propuestos en el repositorio

```text
contracts/
  foundry.toml
  src/EcoTraceRegistry.sol
  script/DeployEcoTraceRegistry.s.sol
  test/EcoTraceRegistry.t.sol

functions/src/
  index.ts
  web3/
    config.ts
    hashing.ts
    registry-client.ts
    relayer.ts
    attestations.ts
    monitoring.ts

src/lib/types/
  firestore.ts
  web3.ts

src/lib/server/
  blockchain.service.ts
  attestations.service.ts

src/lib/components/web3/
  BlockchainProof.svelte
  AttestationPanel.svelte
  PublicVerification.svelte

src/routes/dashboard/
  operador/solicitudes/[id]/+page.svelte
  generador/solicitudes/[id]/manifiesto/+page.svelte
  auditoria/[requestId]/+page.server.ts
  auditoria/[requestId]/+page.svelte

docs/
  plan-implementacion-web3.md
  adr-001-web3.md
  runbook-web3.md
```

## 7. Variables de entorno y secretos

### Variables publicas

```env
PUBLIC_WEB3_ENABLED="false"
PUBLIC_WEB3_CHAIN_ID="11155111"
PUBLIC_WEB3_CHAIN_NAME="sepolia"
PUBLIC_WEB3_EXPLORER_TX_URL="https://sepolia.etherscan.io/tx/"
PUBLIC_WEB3_CONTRACT_ADDRESS="0x..."
```

### Variables privadas

```env
WEB3_RPC_URL="https://..."
WEB3_CONFIRMATIONS="1"
WEB3_RELAYER_MIN_BALANCE_WEI="10000000000000000"
WEB3_ATTESTATION_DOMAIN_NAME="EcoTrace"
WEB3_ATTESTATION_DOMAIN_VERSION="1"
ETHERSCAN_API_KEY="..."
```

### Secret Manager

- `WEB3_RELAYER_PRIVATE_KEY`
- `WEB3_RPC_URL_PRIMARY`
- `WEB3_RPC_URL_FALLBACK`
- Credenciales futuras del proveedor de custodia institucional.

## 8. Modelo Firestore extendido

### En `solicitudes/{id}`

```ts
blockchain?: {
  routineAnchors?: BlockchainAnchor[];
  latestAnchor?: BlockchainAnchor;
};
```

### En `solicitudes/{id}/certificados/{cid}`

```ts
blockchain?: {
  documentHash: string;
  attestation?: InstitutionalAttestation;
};
```

### Tipos sugeridos

```ts
export interface BlockchainAnchor {
	layer: 'ROUTINE_ANCHOR';
	eventType:
		| 'SOLICITUD_CREATED'
		| 'STATE_CHANGED'
		| 'MANIFIESTO_GENERATED'
		| 'REPORTE_CREATED'
		| 'CERTIFICADO_CREATED';
	requestId: string;
	documentPath: string;
	documentHash: string;
	hashAlgorithm: 'KECCAK256_CANONICAL_JSON' | 'SHA256_PDF';
	chainId: number;
	network: string;
	contractAddress: string;
	txHash: string;
	blockNumber: number;
	anchoredAt: string;
	relayerAddress: string;
	status: 'PENDING' | 'CONFIRMED' | 'FAILED';
	error?: string;
}

export interface InstitutionalAttestation {
	layer: 'INSTITUTIONAL_ATTESTATION';
	role: 'CERTIFICADOR_ROLE' | 'ENTE_ESTATAL_ROLE';
	requestId: string;
	documentHash: string;
	signerAddress: string;
	signature: string;
	signedAt: string;
	txHash?: string;
	blockNumber?: number;
	status: 'SIGNED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
}
```

## 9. Fases de implementacion

## Fase 0 - Preparacion y decisiones pendientes

**Objetivo:** cerrar el marco tecnico/legal minimo para no construir sobre supuestos fragiles.

Tareas:

- Confirmar alcance legal: prueba tecnica de integridad vs firma digital formal Ley 25.506.
- Elegir testnet inicial: Sepolia para desarrollo o testnet de la L2 elegida.
- Elegir red productiva candidata: Polygon PoS, Arbitrum u Optimism.
- Elegir proveedor RPC primario y fallback.
- Definir si Capa 2 usa transaccion directa de la institucion o firma EIP-712 + relayer.
- Definir politica de custodia institucional temporal para testnet.

Entregables:

- ADR actualizado y aceptado.
- Red objetivo definida.
- Variables `.env.example` documentadas.

Criterios de aceptacion:

- El equipo entiende que wallet != firma digital legal formal.
- Capa 1 queda desbloqueada aunque legal siga evaluando Capa 2.

## Fase 1 - Contrato inteligente y tests

**Objetivo:** tener el contrato base probado y desplegable.

Tareas:

- Crear carpeta `contracts/` con Foundry.
- Implementar `EcoTraceRegistry.sol`.
- Incluir eventos:
  - `DocumentRegistered(address indexed relayer, string requestId, bytes32 documentHash, uint256 timestamp)`
  - `CertificateAttested(address indexed certificador, string requestId, bytes32 documentHash, uint256 timestamp)`
  - `StateApproval(address indexed entidad, string requestId, uint256 timestamp)`
- Extender `OpenZeppelin AccessControl`.
- Definir roles:
  - `DEFAULT_ADMIN_ROLE`
  - `CERTIFICADOR_ROLE`
  - `ENTE_ESTATAL_ROLE`
- Evaluar `RELAYER_ROLE` para restringir `registerDocument`.
- Agregar validaciones de inputs vacios y hashes cero.
- Escribir tests de emision de eventos.
- Escribir tests de acceso no autorizado.
- Escribir script de deploy.
- Verificar contrato en explorer.

Entregables:

- Contrato compilando.
- Suite de tests Foundry.
- Direccion de contrato en testnet.
- ABI versionada para Functions/frontend.

Criterios de aceptacion:

- `forge test` pasa.
- Un usuario sin rol no puede atestar certificados ni aprobaciones estatales.
- El contrato emite eventos con `requestId`, `documentHash`, `msg.sender` y timestamp.

## Fase 2 - Hash canonico y modelo de datos

**Objetivo:** garantizar que el mismo documento/evento produzca siempre el mismo hash.

Tareas:

- Definir payload canonico para cada evento:
  - solicitud creada
  - cambio de estado
  - manifiesto generado
  - reporte de recepcion creado
  - certificado creado
- Implementar serializacion estable de JSON.
- Usar `keccak256` para payloads canonicos on-chain.
- Mantener `sha256` para PDFs oficiales ya generados.
- Agregar tipos `BlockchainAnchor` e `InstitutionalAttestation`.
- Agregar helpers de validacion de hashes.
- Documentar que no se hashean campos volatiles innecesarios.

Entregables:

- `functions/src/web3/hashing.ts`.
- `src/lib/types/web3.ts`.
- Tests unitarios de hash deterministico.

Criterios de aceptacion:

- Dos objetos equivalentes con orden distinto de claves producen el mismo hash.
- Cambiar un campo relevante cambia el hash.
- No se exponen datos sensibles on-chain.

## Fase 3 - Relayer de Capa 1 end-to-end

**Objetivo:** anclar automaticamente eventos rutinarios sin friccion para usuarios.

Tareas:

- Agregar dependencia `ethers` en `functions/`.
- Crear cliente `registry-client.ts` para el contrato.
- Cargar RPC y private key desde Secret Manager/config segura.
- Implementar relayer con `ethers.Wallet` y provider.
- Implementar manejo de confirmaciones.
- Persistir `txHash`, `blockNumber`, `chainId`, `contractAddress`, `documentHash` y `relayerAddress` en Firestore.
- Agregar estados `PENDING`, `CONFIRMED`, `FAILED`.
- Implementar reintentos con backoff.
- Serializar envios con Cloud Tasks de concurrencia 1 o `NonceManager`.
- Evitar anclajes duplicados por idempotency key.

Triggers iniciales:

- `onDocumentCreated('solicitudes/{id}')`.
- `onDocumentUpdated('solicitudes/{id}')` para cambios de estado relevantes.
- `onDocumentCreated('solicitudes/{id}/reportes_recepcion/{rid}')`.
- `onDocumentCreated('solicitudes/{id}/certificados/{cid}')`.

Entregables:

- Cloud Functions de anclaje.
- Metadatos blockchain visibles en Firestore.
- Tx reales en testnet.

Criterios de aceptacion:

- Crear una solicitud genera un anchor confirmado.
- Emitir manifiesto genera un anchor confirmado.
- Crear certificado genera un anchor confirmado.
- Si falla RPC, queda registrado `FAILED` con error y se puede reintentar.

## Fase 4 - Monitoreo, seguridad y operaciones del relayer

**Objetivo:** evitar fallas silenciosas y proteger la wallet de servicio.

Tareas:

- Mover private key a Secret Manager.
- Limitar acceso del secreto solo a la service account de Functions.
- Crear job de balance bajo.
- Definir umbral de alerta configurable.
- Configurar logs estructurados para tx enviadas/fallidas.
- Definir fallback RPC.
- Crear runbook de recarga de fondos.
- Documentar rotacion de wallet.
- Agregar dashboard minimo en Firebase/Cloud Logging.

Entregables:

- Alertas de balance.
- Runbook operativo.
- Checklist de seguridad.

Criterios de aceptacion:

- Si el balance cae bajo el umbral, se genera alerta.
- La clave privada no aparece en `.env`, logs ni repositorio.
- Existe procedimiento documentado para reintentar anclajes fallidos.

## Fase 5 - UI de evidencia y auditoria

**Objetivo:** mostrar pruebas blockchain sin obligar al usuario a entender Web3.

Tareas:

- Crear componente `BlockchainProof.svelte`.
- Mostrar estado del anchor: pendiente, confirmado, fallido.
- Mostrar `documentHash`, red, contrato, `txHash`, `blockNumber`.
- Agregar link al explorer.
- Agregar seccion en manifiesto, detalle de solicitud y certificado.
- Crear ruta publica o semipublica `/dashboard/auditoria/[requestId]`.
- Permitir copiar hash y txHash.
- Mostrar texto legal claro: prueba de integridad tecnica, no firma digital formal.

Entregables:

- UI integrada en pantallas existentes.
- Vista de auditoria por solicitud.

Criterios de aceptacion:

- Un usuario puede abrir el explorer desde EcoTrace.
- Un auditor puede ver el hash y compararlo con el documento.
- La UI no expone datos sensibles en links publicos.

## Fase 6 - Capa 2 con firma EIP-712 en testnet

**Objetivo:** permitir atestacion institucional verificable por rol usando wallets de prueba.

Tareas:

- Definir dominio EIP-712:
  - `name: EcoTrace`
  - `version: 1`
  - `chainId`
  - `verifyingContract`
- Definir tipo `CertificateAttestation`.
- Crear UI `AttestationPanel.svelte` para certificadora/ente estatal.
- Conectar wallet institucional de prueba.
- Firmar payload tipado.
- Enviar firma al backend.
- Verificar firma con `ethers.verifyTypedData`.
- Validar que la wallet este registrada para el rol/organizacion.
- Persistir firma en Firestore.
- Enviar transaccion `attestCertificate` o `approveAsState`.
- Persistir tx y bloque.

Entregables:

- Flujo de firma institucional en testnet.
- Verificacion backend.
- Eventos on-chain de Capa 2.

Criterios de aceptacion:

- Una wallet sin rol no puede atestar on-chain.
- Una firma alterada es rechazada por backend.
- La atestacion queda asociada al certificado o aprobacion estatal.

## Fase 7 - Gestion de roles institucionales

**Objetivo:** administrar direcciones autorizadas sin depender de una clave unica peligrosa.

Tareas:

- Definir admin del contrato como multisig en produccion.
- Para testnet, usar wallet admin temporal.
- Crear procedimiento de alta/baja de certificadora.
- Crear procedimiento de alta/baja de ente estatal.
- Registrar en Firestore la relacion organizacion-wallet-rol.
- Implementar validaciones de consistencia entre Firestore y contrato.
- Documentar revocacion por compromiso de clave.

Entregables:

- Runbook de roles.
- Registro institucional en Firestore.
- Scripts de grant/revoke.

Criterios de aceptacion:

- Se puede otorgar y revocar rol en testnet.
- La app no acepta firmas de direcciones no registradas.
- Las decisiones administrativas quedan auditadas.

## Fase 8 - Revision legal y firma digital formal

**Objetivo:** resolver si se requiere integracion con certificador licenciado.

Tareas:

- Reunir a legal + desarrollo con los documentos ADR y Capas.
- Decidir una de dos politicas:
  - Prueba tecnica suficiente.
  - Firma digital formal requerida.
- Si se requiere firma formal, definir proveedor y flujo.
- Asegurar que el archivo firmado digitalmente sea el que se hashea/ancla.
- Ajustar textos legales de UI y documentacion.

Entregables:

- Decision legal documentada.
- Ajuste de alcance de Capa 2.
- Backlog de integracion con certificador, si aplica.

Criterios de aceptacion:

- No hay ambiguedad comercial/legal sobre que prueba EcoTrace.
- La UI y contratos/terminos no prometen firma digital si no existe.

## Fase 9 - Produccion en L2

**Objetivo:** migrar desde testnet a una red de bajo costo apta para produccion.

Tareas:

- Elegir L2 definitiva.
- Crear wallet relayer productiva.
- Configurar Secret Manager productivo.
- Desplegar contrato productivo.
- Verificar contrato en explorer.
- Configurar roles reales.
- Configurar monitoreo y alertas productivas.
- Ejecutar prueba controlada end-to-end.
- Activar feature flag `PUBLIC_WEB3_ENABLED`.

Entregables:

- Contrato productivo.
- Relayer productivo.
- UI con links al explorer productivo.

Criterios de aceptacion:

- Flujo completo confirmado en L2.
- Rollback documentado.
- Alertas activas antes de abrir a usuarios reales.

## Fase 10 - Optimizaciones post-MVP

**Objetivo:** reducir costos, mejorar consulta publica y robustecer verificacion.

Tareas opcionales:

- Merkle batching diario.
- Guardado de `merkleRoot` on-chain y `merkleProof` por documento.
- Evaluar OpenTimestamps para Capa 1.
- Indexacion con The Graph o Tenderly.
- API publica de verificacion por `requestId`.
- Pagina publica de auditoria sin login para evidencia no sensible.
- Pruebas automatizadas contra fork/testnet.

## 10. Backlog tecnico priorizado

### P0 - Necesario para MVP Web3

- Contrato con eventos y roles.
- Hash canonico.
- Relayer Capa 1.
- Persistencia de metadata on-chain.
- UI basica de evidencia.
- Monitoreo de balance.

### P1 - Necesario para Capa 2 usable

- Firma EIP-712.
- Verificacion backend.
- Registro de wallets institucionales.
- Grant/revoke de roles.
- UI de atestacion.

### P2 - Produccion/compliance

- Multisig admin.
- Custodia institucional.
- Integracion con certificador licenciado si legal lo exige.
- Runbooks de seguridad.

### P3 - Escala/auditoria avanzada

- Merkle batching.
- OpenTimestamps.
- Indexacion publica.
- Verificador externo standalone.

## 11. Riesgos y mitigaciones

| Riesgo                                    | Impacto                               | Mitigacion                                    |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------- |
| Colision de nonce del relayer             | Transacciones fallidas o reemplazadas | Cloud Tasks con concurrencia 1 o NonceManager |
| Wallet sin fondos                         | Anclajes dejan de confirmarse         | Alerta de balance bajo y runbook de recarga   |
| RPC caido                                 | Fallos temporales                     | Provider fallback y backoff                   |
| Clave relayer expuesta                    | Compromiso de anclaje                 | Secret Manager, IAM minimo, rotacion          |
| Wallet institucional mal custodiada       | Riesgo probatorio                     | Fireblocks/Turnkey o multisig segun rol       |
| Firma wallet confundida con firma digital | Riesgo legal/comercial                | Texto legal y decision formal documentada     |
| Datos sensibles on-chain                  | Riesgo de privacidad                  | Solo hashes y eventos minimos                 |
| Costos por volumen                        | Costo operativo creciente             | L2 y Merkle batching post-MVP                 |

## 12. Criterios de listo generales

- `pnpm run check` pasa.
- Tests de contrato pasan.
- Tests de hash deterministico pasan.
- No hay secretos en repo ni `.env.example` con valores reales.
- Cada tx confirmada se guarda en Firestore con explorer link.
- Los errores de anclaje quedan visibles para operacion.
- La UI distingue entre prueba tecnica y firma digital formal.

## 13. Orden recomendado de ejecucion

1. Fase 0: cerrar decisiones tecnicas minimas y no bloquear Capa 1 por definiciones legales de Capa 2.
2. Fase 1: contrato y tests.
3. Fase 2: hash canonico y tipos Firestore.
4. Fase 3: relayer Capa 1 en testnet.
5. Fase 4: monitoreo y seguridad del relayer.
6. Fase 5: UI de evidencia.
7. Fase 6: firma EIP-712 de Capa 2 con wallets de prueba.
8. Fase 7: administracion de roles institucionales.
9. Fase 8: decision legal y eventual firma digital formal.
10. Fase 9: despliegue productivo en L2.
11. Fase 10: optimizaciones post-MVP.

## 14. Primer sprint sugerido

Duracion sugerida: 1 semana.

Objetivo: dejar Capa 1 demostrable en testnet.

Tareas:

- Crear `contracts/` con Foundry.
- Implementar `EcoTraceRegistry` minimo.
- Escribir tests de `registerDocument`.
- Desplegar en testnet.
- Implementar `hashing.ts` con payload canonico para `solicitudes`.
- Implementar una Cloud Function que ancle `solicitudes/{id}` creadas.
- Guardar `txHash` y `documentHash` en Firestore.
- Mostrar un link al explorer en una pantalla interna o log operativo.

Demo esperada:

1. Crear una solicitud en EcoTrace.
2. La Cloud Function calcula el hash.
3. El relayer envia `registerDocument`.
4. Firestore queda actualizado con `txHash`.
5. Se abre el explorer y se verifica el evento.

## 15. Preguntas abiertas

- Que red L2 se usara en produccion: Polygon PoS, Arbitrum u Optimism?
- Capa 2 enviara transacciones desde la wallet institucional o firmara EIP-712 para que EcoTrace relaye la transaccion?
- Legal requiere firma digital formal bajo Ley 25.506 o alcanza prueba tecnica verificable?
- Que proveedor de custodia institucional se evaluara primero?
- Se permitira una vista publica de auditoria sin login? Si si, que campos se exponen?
- Que eventos exactos deben anclarse en Capa 1 para el MVP?
