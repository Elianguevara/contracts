# Auditoría de Cumplimiento y Arquitectura — EcoTrace

> Alcance: este documento audita el **sistema efectivamente implementado** en este repositorio
> (SvelteKit + Firebase + `EcoTraceRegistry.sol`). No incluye afirmaciones sobre un token "ETT",
> oráculos regulatorios, ni una aplicación móvil nativa (Kotlin/Jetpack Compose) porque **ninguno
> de esos componentes existe en el código hoy** — verificado por lectura directa de
> `contracts/src/EcoTraceRegistry.sol`, `package.json` (stack real: Svelte, no React) y búsqueda
> exhaustiva en el repo (0 resultados propios de "ETT", "ERC20", "React", "Kotlin", "Jetpack" fuera
> de dependencias de terceros). Si ese roadmap existe en otro documento o repositorio, este archivo
> no lo reemplaza — lo complementa dejando constancia de qué está construido y qué no.
>
> Documentos relacionados: [`../PRESENTACION.md`](../PRESENTACION.md) (pitch técnico del sistema
> actual), [`../DISENO-UX.md`](../DISENO-UX.md) (log vivo de decisiones visuales),
> [`../ROADMAP-IMPLEMENTACION-WEB3.md`](../ROADMAP-IMPLEMENTACION-WEB3.md) (estado por fase).

---

## Fase 1 — Auditoría de cumplimiento

| Requisito                                                   | Estado                     | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datos sensibles off-chain                                   | ✅ Implementado, con matiz | Toda la PII y datos operativos (residuos, pesos, partes, geolocalización si existiera) viven en Firestore, nunca en el contrato. **Matiz importante:** Firestore es una base **cloud gestionada por Google (GCP)**, no una "base local cifrada". El aislamiento de PII respecto de la blockchain es real y verificable en `EcoTraceRegistry.sol` (no tiene ningún campo `string`/`bytes` de contenido libre, solo `bytes32` de hash + `requestId` + timestamp), pero el argumento de "derecho al olvido" bajo Ley 25.326 se sostiene en la **arquitectura de dos capas** (ver Fase 2), no en que el dato esté cifrado en un disco local. |
| Solo hash va on-chain                                       | ✅ Implementado            | `functions/src/web3/hashing.ts` calcula un hash canónico **Keccak-256** (no SHA-256) sobre un subconjunto de campos no-PII del payload (`canonicalHash()`). SHA-256 sí se usa, pero para el hash de integridad del **PDF** almacenado en Storage (`persistPdf()` en `functions/src/index.ts`) — es una firma de integridad documental, distinta del hash que efectivamente se ancla en el contrato.                                                                                                                                                                                                                                      |
| Smart Compliance (oráculos + bloqueo automático de wallets) | ❌ No implementado         | No hay ningún oráculo ni consulta a registro oficial en el código. El único control de habilitación es `Usuario.habilitado` (booleano manual en Firestore, gestionado por un `ADMIN` vía `src/lib/server/usuarios.service.ts`), que bloquea el **acceso a la aplicación**, no una wallet on-chain. `EcoTraceRegistry.sol` no tiene lógica de expiración ni de revocación condicionada a fuentes externas.                                                                                                                                                                                                                                |
| Token ETT (utility token)                                   | ❌ No implementado         | No existe ningún contrato de token en el repositorio. `EcoTraceRegistry.sol` es un `AccessControl` de OpenZeppelin con tres roles (`RELAYER_ROLE`, `CERTIFICADOR_ROLE`, `ENTE_ESTATAL_ROLE`) y tres funciones de escritura (`registerDocument`, `attestCertificate`, `approveAsState`); no hereda `ERC20`, no tiene `mint`/`transfer`/`balanceOf`, no maneja fondos ni es `payable`.                                                                                                                                                                                                                                                     |
| Tokenización de capacidad (COC-RWA)                         | N/D                        | No aplica: no hay tokenización de ningún tipo hoy. Lo que existe es anclaje de hashes de eventos documentales (manifiesto, certificado), no una representación fungible/no-fungible de habilitaciones o seguros.                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Conclusión Fase 1:** el sistema implementado cumple el principio de **privacidad por diseño** en su forma más importante (separación estricta datos-sensibles/off-chain vs. prueba-criptográfica/on-chain) y el anclaje es efectivamente minimalista y sin PII. Los mecanismos de **compliance automatizado on-chain** y el **modelo de token** descritos en el brief legal son, a la fecha, **especificación pendiente de construcción**, no funcionalidad auditable.

---

## Fase 2 — Arquitectura: de manifiestos en papel a expediente verificable

### El problema que resuelve el sistema actual

En un circuito de papel/PDF tradicional, la fuente de verdad de un manifiesto o certificado es un
archivo que el propio generador o el propio operador controla — el mismo actor que podría tener
incentivo para alterar el registro es quien lo custodia. Tres ineficiencias concretas que el
sistema actual elimina:

1. **Estado inconsistente entre partes.** El estado de una solicitud (`INICIADA` → `APROBADA` →
   `MANIFIESTO_GENERADO` → `FINALIZADA`, o `RECHAZADA`) se valida en `src/lib/server/solicitudes.service.ts`
   dentro de transacciones de Firestore (`runTransaction`): cada transición relee el documento,
   verifica actor y precondición de estado, y escribe atómicamente. No hay ventana donde dos
   actores vean estados distintos de la misma solicitud, y las mismas reglas se repiten a nivel de
   base de datos en `firestore.rules` — defensa en profundidad, no solo validación de UI.
2. **Generación manual de documentación oficial.** El PDF del manifiesto (original/duplicado/
   triplicado) y del certificado se generan automáticamente por Cloud Functions
   (`generarManifiestoPdf`, `emitirCertificadoPdf` en `functions/src/index.ts`) apenas cambia el
   estado correspondiente, con hash SHA-256 embebido — elimina la generación manual de papel y la
   posibilidad de versiones divergentes del mismo documento.
3. **Imposibilidad de verificación independiente.** Cada manifiesto y certificado, además de su PDF
   y su registro en Firestore, ancla su hash canónico Keccak-256 en `EcoTraceRegistry.sol`
   (Sepolia) vía un relayer automático (`functions/src/web3/relayer.ts`) — **sin que el usuario
   final posea wallet ni pague gas**. Cualquier tercero (auditor, ente regulador) puede verificar
   públicamente que un documento fue registrado, cuándo y por quién, usando la página pública
   `/verificar` (`src/lib/components/web3/PublicVerification.svelte`), sin acceso a la base de
   datos interna.

### Justificación del stack — lo que hay, no lo que "suena bien"

El stack real de este proyecto es **SvelteKit 2 + Svelte 5 (Runes)** en el frontend, no React.
Esto no es una omisión menor a corregir en un pitch — es la decisión correcta para este producto y
vale defenderla en esos términos:

- **SSR con cookies de sesión server-side, sin capa de estado global redundante.** `src/hooks.server.ts`
  resuelve el usuario en cada request desde una cookie httpOnly y lo deja en `event.locals.user`;
  los guards de rol (`src/lib/auth/guards.server.ts`) corren en `+layout.server.ts`/`+page.server.ts`
  antes de que se renderice un solo byte de HTML. Con React esto exige una capa adicional (RSC,
  o un framework como Next.js) para lograr el mismo resultado; en SvelteKit es el modelo por
  defecto del framework.
- **Runes (`$state`, `$derived`, `$effect`) sin Virtual DOM.** Svelte 5 compila a actualizaciones
  de DOM quirúrgicas en build time, no reconcilia un árbol virtual en runtime. Para las tablas de
  solicitudes con datos en tiempo real (`onSnapshot` de Firestore en `src/lib/stores/solicitudes.svelte.ts`)
  esto significa menos overhead de re-render en dashboards con actualizaciones frecuentes — el
  argumento de "reactividad para dashboards" es real, pero corresponde a Svelte 5, no a React.
- **Bundle y superficie de ataque menores.** Un sistema de cumplimiento regulatorio con datos
  sensibles se beneficia de un runtime más chico y de menos dependencias de terceros en el cliente
  — coherente con el resto de las decisiones del proyecto (ver "Diseño deliberadamente minimalista"
  en `EcoTraceRegistry.sol`, `PRESENTACION.md`).

**Sobre la aplicación móvil (Kotlin/Jetpack Compose):** no existe ninguna app nativa en este
repositorio — no hay carpeta `android/`, no hay Kotlin, no hay lectura de QR nativa. Hoy el acceso
en campo es la misma aplicación web responsive (SvelteKit), y los códigos de despacho por bulto
(`src/lib/utils/despacho-code.ts`) se muestran como texto, no como QR escaneable. Si se decide
construir una app nativa de campo, Kotlin + Jetpack Compose es una elección técnicamente sólida
(rendimiento, componentes modulares, acceso confiable a cámara para QR), pero **hoy es una
recomendación de roadmap, no una descripción de lo implementado** — presentarla como ya construida
sería un dato falso frente a cualquier revisión técnica externa (due diligence, auditoría,
regulador).

---

## Fase 3 — UX/UI

### Punto de partida: hay un sistema de diseño real, no hay que empezar de cero

`DISENO-UX.md` documenta decisiones ya tomadas e implementadas (no una propuesta — un log de
trabajo hecho): paleta `brand` (verde, operación cotidiana) separada estrictamente de `chain`
(índigo, reservado a todo lo que toca el contrato), superficie oscura `ink` exclusiva de
`BlockchainProof.svelte` como señal deliberada de "esto es una capa distinta, auditable
externamente", tipografía IBM Plex Sans/Mono, y primitivos (`Button`, `Alert`, `Spinner`,
`DataTable`, `FileUpload`) ya aplicados a login, verificación pública, tablas y formularios de
solicitud. Cualquier recomendación nueva debe **reusar esos tokens**, no proponer una paleta
paralela.

### Gap concreto antes de hablar de estética: los dos flujos pedidos no tienen pantalla dedicada hoy

- **App de campo para transportistas:** el rol `TRANSPORTISTA` existe en el modelo de datos
  (`src/lib/types/firestore.ts`) pero **no tiene dashboard propio** — `src/lib/auth/roles.ts`
  (`DASHBOARD_HOME`) lo redirige a `/dashboard/operador`, que es la bandeja del operador de planta,
  no una pantalla pensada para uso en movimiento. Antes de "hacerla más ágil" hay que decidir si
  se construye `/dashboard/transportista` como vista propia.
- **Dashboard ESG para entes reguladores:** tampoco existe. `ADMIN` también cae en
  `/dashboard/operador` por defecto (mismo archivo), y no hay ninguna ruta bajo `/dashboard/` para
  el rol `ENTE_ESTATAL_ROLE` que ya existe on-chain. El propio `ROADMAP-IMPLEMENTACION-WEB3.md`
  marca `/dashboard/auditoria/` como pendiente dentro de la prioridad P1 ("Visibilidad y calidad").
  La única superficie hoy visible a un tercero externo es `/verificar` — que verifica un documento
  a la vez, no ofrece una vista agregada.

### Recomendaciones — app de campo (transportistas)

1. **Construir `/dashboard/transportista` como vista de una sola tarea a la vez**, no una tabla:
   "solicitud activa → código de despacho a mostrar/escanear → siguiente paso". Reusar `Button`
   (`variant="primary"`) con targets táctiles grandes (mínimo 44×44px) — hoy `Button.svelte` ya
   soporta `fullWidth`, que es exactamente el patrón correcto para uso a una mano en campo.
2. **Renderizar los códigos de despacho como QR**, no solo texto — ya se generan
   (`generarCodigoDespacho`), falta la capa de presentación. Mantener el `font-mono` (IBM Plex
   Mono) como fallback textual bajo el QR, coherente con cómo ya se muestran hashes en
   `BlockchainProof`.
3. **Estados de red explícitos**, replicando el patrón que ya existe para `blockchainAnchor.status`
   (`pending`/`confirmed`/`failed` con los tokens `status-*`): un transportista en una planta sin
   buena señal necesita saber si su acción se guardó o quedó pendiente de sincronizar, con el mismo
   lenguaje visual (chip + `animate-ping` en pendiente) que ya definieron para el anclaje on-chain.
4. **Evaluar PWA (installable, con Service Worker) antes que una app nativa** dado que el resto del
   stack ya es web: cubre "acceso rápido desde la pantalla de inicio" y lectura de cámara para QR
   (`getUserMedia`) sin duplicar stack ni introducir Kotlin. Reservar una app nativa Kotlin/Compose
   para si se necesita lectura de QR offline-first robusta que una PWA no pueda garantizar.

### Recomendaciones — dashboard ESG para reguladores

1. **Construir `/dashboard/auditoria` (o `/dashboard/ente-estatal`) como vista de solo lectura**,
   con guard `requireRole(user, ['ADMIN'])` extendido al nuevo rol cuando exista sesión para
   `ENTE_ESTATAL_ROLE` en la capa web2 (hoy ese rol solo existe on-chain).
2. **Usar `chain`/`ink` como paleta primaria de este dashboard, no `brand`**, invirtiendo la regla
   ya documentada: si `brand` es "lo operativo cotidiano" y `chain` es "lo que un tercero puede
   auditar en Sepolia", un dashboard pensado para un regulador externo debería sentirse visualmente
   más cerca de `BlockchainProof` (superficie `ink`, acentos `chain`) que de las pantallas de
   generador/operador — refuerza la percepción de neutralidad e inmutabilidad que pide el punto 2
   del brief legal.
3. **Priorizar tablas y series temporales sobrias sobre gráficos decorativos**: volumen de
   manifiestos por estado, tasa de anclaje confirmado/fallido, tiempo medio hasta confirmación
   on-chain. Cada fila debe linkear directamente a `/verificar?hash=...` o al explorador de bloques
   — el valor de este dashboard es la trazabilidad hacia la prueba pública, no un resumen que haya
   que confiar por sí solo.
4. **Exportable, no interactivo-únicamente**: un ente regulador necesita adjuntar evidencia a un
   expediente propio (CSV/PDF con hashes y `txHash` incluidos), no solo mirar una pantalla.

### Deuda de diseño ya identificada en `DISENO-UX.md` (no reabrir, solo continuar)

`almacenador/+page.svelte`, `operador/+page.svelte` y `generador/solicitudes/nueva/+page.svelte`
están marcadas como pendientes de revisión visual propia (heredan cambios de los componentes que
componen, pero no fueron auditadas página por página). Dark mode está explícitamente fuera de
alcance (`color-scheme: light` fijo). Ninguna sesión de diseño verificó los cambios en navegador
real todavía — sigue siendo el primer paso antes de sumar las pantallas nuevas de esta fase.
