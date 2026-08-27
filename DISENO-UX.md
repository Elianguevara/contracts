# Diseño UX/UI — EcoTrace

> **Log vivo de decisiones y estado de implementación.** Leer esto primero al empezar cualquier
> sesión de diseño — evita repetir decisiones ya tomadas y dice exactamente dónde retomar.

---

## Filosofía (por qué estas decisiones, no otras)

EcoTrace es una **herramienta de cumplimiento regulatorio**, no un dApp cripto-nativo. La decisión
de diseño central es **no** re-temar toda la interfaz en estética "Web3" genérica (gradientes
violeta-a-azul, todo oscuro, neón). En cambio:

- **Verde institucional (`brand`)** sigue siendo el color de lo operativo cotidiano — formularios,
  navegación, botones primarios. Es la identidad "eco" que ya tenía la app.
- **Índigo (`chain`)** queda reservado **exclusivamente** para todo lo que efectivamente toca el
  contrato inteligente: la tarjeta de evidencia blockchain, el botón de verificación pública, el
  chip de red en el header. Esta separación es la señal que le dice al usuario "esto lo dice
  EcoTrace" vs. "esto lo puede auditar cualquiera en Sepolia".
- **Superficie oscura tipo "libro mayor" (`ink`)** solo en `BlockchainProof.svelte` — un contraste
  deliberado frente al resto de la app (blanca/clara) para que la prueba criptográfica se perciba
  como una capa distinta, no como una tarjeta más.
- **IBM Plex Sans + IBM Plex Mono** en vez de Inter/Space Grotesk (evita el look "AI genérico").
  Plex tiene carácter técnico/industrial apropiado para un sistema de trazabilidad, y el mono es
  la misma familia que usa el resto de la app para hashes/direcciones — coherencia visual entre
  texto normal y datos on-chain.

Propuesta visual original (paleta, tipografía, componentes en contexto):
`https://claude.ai/code/artifact/0718741d-bc50-42c8-a215-6b9223a8c1b4` — **este artifact es
efímero/de referencia**; la fuente de verdad real son los tokens en `src/app.css` y este archivo.

---

## Sistema de tokens (fuente de verdad: `src/app.css` → bloque `@theme`)

| Token                                        | Valor              | Uso                                          |
| -------------------------------------------- | ------------------ | -------------------------------------------- |
| `--color-brand-{50,100,500,600,700}`         | verde emerald      | Marca, acciones primarias cotidianas         |
| `--color-chain-{50,100,300,400,500,600,700}` | índigo/violeta     | Todo lo que toca el contrato inteligente     |
| `--color-ink-{700,800,900,950}`              | navy casi negro    | Superficie de `BlockchainProof` (única)      |
| `--color-status-pending` / `-pending-bg`     | ámbar              | Anclaje en curso                             |
| `--color-status-confirmed` / `-confirmed-bg` | emerald            | Anclaje confirmado                           |
| `--color-status-failed` / `-failed-bg`       | rojo               | Anclaje fallido                              |
| `--color-paper` / `-paper-alt`               | gris azulado claro | Fondo de página (reemplaza `slate-50` liso)  |
| `--font-sans`                                | IBM Plex Sans      | Body + display (mismo family, distinto peso) |
| `--font-mono`                                | IBM Plex Mono      | Hashes, direcciones, chain IDs               |

Tailwind v4 genera las utilidades automáticamente desde estos tokens (`bg-chain-600`,
`text-status-failed`, `font-mono`, etc.) — no hace falta tocar ninguna config aparte de
`src/app.css`. Las fuentes se cargan vía Google Fonts en `src/app.html` (`<link>` en el `<head>`,
no `@import` en CSS, para evitar el parpadeo de fuente).

---

## Componentes primitivos nuevos (`src/lib/components/ui/`)

| Componente       | Reemplaza                                                    | Notas                                                                                                                    |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `Spinner.svelte` | — (no existía)                                               | `variant: 'light' \| 'dark'` según fondo                                                                                 |
| `Button.svelte`  | botones hechos a mano con texto que cambia + `opacity-50`    | `variant: primary \| chain \| secondary \| danger \| ghost`, prop `loading` muestra `Spinner` y deshabilita, `fullWidth` |
| `Alert.svelte`   | `<div>` de color repetidos en login/verificación/formularios | `variant: success \| error \| warning \| info`, ícono + texto vía `children` snippet                                     |

Convención: `variant="chain"` en `Button` es específicamente para acciones que llaman al contrato
(ej. "Verificar en blockchain"); todo lo demás usa `primary`/`secondary`/`danger`/`ghost`.

---

## Estado de implementación

### ✅ Hecho (sesión 1 — 2026-08-25)

- `src/app.css` — tokens `chain-*`, `ink-*`, `status-*`, `paper*`, `font-sans`/`font-mono`.
- `src/app.html` — `<link>` de Google Fonts (IBM Plex Sans + Mono), `body` usa `bg-paper font-sans`.
- `src/lib/components/ui/Spinner.svelte` (nuevo)
- `src/lib/components/ui/Button.svelte` (nuevo)
- `src/lib/components/ui/Alert.svelte` (nuevo)
- `src/lib/components/web3/BlockchainProof.svelte` — rediseño completo: tarjeta oscura `ink-*`,
  chip de estado con anillo de pulso (`animate-ping`) en pendiente, skeleton (`animate-pulse`)
  para campos aún no disponibles, botón de copiar hash/txHash con feedback `✓`.
- `src/lib/components/web3/PublicVerification.svelte` — usa `Button`/`Alert`, dropzone con
  drag-and-drop real (antes solo input file), acento `chain` en el borde focus y el botón.
- `src/lib/web3/client.ts` — exporta `chain` (antes solo interno) para que la UI pueda mostrar el
  nombre de la red activa.
- `src/routes/dashboard/+layout.svelte` — header ahora `sticky`, chip de red (`{chain.name}`) junto
  al logo.
- `src/routes/(auth)/login/+page.svelte` — migrado a `Button`/`Alert`, fondo usa `paper`, link a
  `/verificar`.
- `src/routes/verificar/+page.svelte` (nuevo) — **hallazgo de esta sesión:** `PublicVerification.svelte`
  no estaba montado en ninguna ruta (componente huérfano, inalcanzable). Se creó esta página
  pública (sin guard de auth — la carpeta no tiene `+layout.server.ts`) para que la verificación
  sea realmente usable por terceros.
- Verificado: `pnpm run check` → **0 errores**. Dev server (`pnpm run dev`, HMR) sigue arriba y
  responde 200 en `/login` tras los cambios.
- **No verificado visualmente en navegador esta sesión** (sin herramientas de browser
  disponibles) — falta que alguien confirme en `http://localhost:5173` que se ve como el mockup.

### ✅ Hecho (sesión 2 — 2026-08-25, "formularios y tablas")

- `src/lib/components/ui/FileUpload.svelte` — reescrito como dropzone (drag-and-drop real, ícono,
  estado "archivo cargado" en verde), mismo lenguaje visual que `PublicVerification`.
- `src/lib/components/ui/DataTable.svelte` — header usa `bg-paper-alt` (token) en vez de
  `slate-50` liso.
- `src/lib/components/solicitudes/SolicitudesTable.svelte` — filtros con borde real, columnas
  "Vehículo"/"Creada" ocultas en mobile/tablet (`hidden md:table-cell` / `lg:table-cell`) para que
  la tabla no quede apretada en pantallas chicas.
- `src/lib/components/solicitudes/OperadorInbox.svelte` — `Aprobar`/`Rechazar`/`Cancelar`/
  `Confirmar rechazo` migrados a `Button` (ahora `Aprobar` muestra spinner real mientras
  procesa — antes el texto no cambiaba durante el submit).
- `src/lib/components/solicitudes/SolicitudForm.svelte` — error migrado a `Alert`, botón "Quitar"
  residuo y el submit migrados a `Button` con `loading`.
- `src/routes/dashboard/operador/solicitudes/[id]/+page.svelte` — **la página donde se emite el
  certificado**: mensajes de éxito/error migrados a `Alert`, `Aprobar`/`Rechazar`/confirmar rechazo
  migrados a `Button` con estado de carga real.
- `src/routes/dashboard/generador/solicitudes/[id]/manifiesto/+page.svelte` — **la página donde se
  emite el manifiesto**: mismo tratamiento (`Alert` + `Button` con loading en "Generar manifiesto").
- **Bug de bordes encontrado y corregido en todos los archivos de arriba (+ login):** casi todos los
  `<input>`/`<select>`/`<textarea>` de la app usaban `border-slate-300` (el _color_) sin la utilidad
  `border` (el _ancho_). El preflight de Tailwind resetea `border-width: 0` globalmente, así que
  estos campos no tenían borde visible en absoluto — solo `shadow-sm` los delineaba. Se agregó
  `border` + estado de foco (`focus:border-brand-500 focus:ring-brand-500`, o `red-500` en los
  campos de rechazo) en cada uno.
- **Decisión tomada:** `src/lib/utils/badges.ts` / `EstadoBadge.svelte` se dejan con su paleta
  actual (azul/ámbar/rojo/verde de Tailwind directo), **sin migrar** a los tokens `status-*`. Son
  estados de _workflow de la solicitud_ (`INICIADA`/`APROBADA`/`RECHAZADA`/`MANIFIESTO_GENERADO`/
  `FINALIZADA` — 5 valores), semánticamente distintos de los 3 estados de _anclaje blockchain_
  (`pending`/`confirmed`/`failed`) que sí usan `status-*`. Mezclarlos sería forzar una analogía que
  no existe.
- `src/lib/components/ui/Modal.svelte` — revisado, **sin cambios**: no usa ningún color de marca
  (solo `slate`/blanco), así que no había nada que migrar a los tokens nuevos.
- Verificado: `pnpm run check` → 0 errores, `prettier --check` limpio en `src/` y en todos los
  `.md` del repo (se corrigió además un markdown roto preexistente en
  `GUIA-LEVANTAR-Y-PROBAR.md` con backticks anidados mal escapados).

### ⏳ Pendiente (próxima sesión de diseño)

- Páginas de dashboard restantes sin tocar: `almacenador/+page.svelte`, `operador/+page.svelte`
  (ambas son solo composición de `SolicitudesTable`/`OperadorInbox`, ya heredan los cambios de
  esos componentes — revisar igual si se agrega contenido propio),
  `generador/solicitudes/nueva/+page.svelte` (wrapper de `SolicitudForm`, ídem).
- Dark mode: **no abordado**. Hoy `app.css` fija `color-scheme: light` a propósito (la app nunca
  tuvo modo oscuro). Si se pide en el futuro, definir tokens dark ahí mismo.
- No se verificó visualmente en navegador en ninguna de las dos sesiones (sin herramientas de
  browser disponibles) — sigue pendiente que alguien confirme en `http://localhost:5173`.

### Cómo retomar

1. Leer la sección "Filosofía" arriba antes de tomar cualquier decisión de color/tipografía nueva.
2. Los tokens ya existen en `app.css` — reusarlos, no inventar valores nuevos ad-hoc en un
   componente.
3. `Button`/`Alert`/`Spinner` ya existen en `src/lib/components/ui/` — importarlos, no repetir el
   patrón de `<button disabled={...}>texto ? 'cargando' : 'normal'</button>` a mano.
4. Actualizar la sección "Estado de implementación" de este archivo al terminar cada tanda de
   cambios (mover ítems de "Pendiente" a "Hecho", agregar una entrada nueva en el historial abajo
   con la fecha).

---

## Historial de iteraciones

### Sesión 1 — 2026-08-25

Primera propuesta visual (artifact) + implementación de la base de diseño: tokens, fuentes,
`Button`/`Alert`/`Spinner`, rediseño de `BlockchainProof` y `PublicVerification`, chip de red en
el header del dashboard, login migrado. Ver detalle completo arriba en "✅ Hecho".

### Sesión 2 — 2026-08-25 ("seguí con el resto: formularios y tablas")

Aplicados los primitivos de la sesión 1 a `SolicitudForm`, `SolicitudesTable`, `OperadorInbox`,
`DataTable`, `FileUpload`, y a las dos páginas de emisión (manifiesto y certificado). Encontrado y
corregido un bug transversal de bordes faltantes en inputs. Decisión tomada sobre `EstadoBadge`
(no migrar). Ver detalle completo arriba en "✅ Hecho (sesión 2)".
