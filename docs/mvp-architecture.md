# EcoTrace MVP - Arquitectura SvelteKit + Firebase

## 1) Estructura recomendada de carpetas (SvelteKit modular)

```text
src/
  app.html                     # Shell HTML (lang="es")
  app.css                      # Tailwind v4 (@import + @theme) + estilos de impresión
  app.d.ts                     # Tipos de App.Locals / App.PageData
  hooks.server.ts              # Verifica cookie de sesión y puebla event.locals.user
  lib/
    firebase/
      client.ts                # SDK cliente (Auth, Firestore, Storage) — PUBLIC_*
      admin.server.ts          # Admin SDK con init PEREZOSO (getAdminAuth/getAdminDb)
    auth/
      guards.server.ts         # requireAuth / requireRole
      roles.ts                 # Mapa rol -> home, etiquetas de rol
    stores/
      auth.svelte.ts           # Estado de sesión (Runes)
      solicitudes.svelte.ts    # Suscripción onSnapshot por actor (Runes)
    server/
      solicitudes.service.ts   # Transiciones de estado (transacciones Admin SDK)
      reportes.service.ts      # Constructor de reporte de recepción
      certificados.service.ts  # Constructor de certificado
      usuarios.service.ts      # Listado de usuarios por rol
    types/
      firestore.ts             # Modelos de datos (fuente de verdad)
    utils/
      despacho-code.ts         # Códigos de despacho / folios (manifiesto, certificado)
      validators.ts            # Catálogos Y/R/D, validaciones de residuo/CUIT
      badges.ts                # Configuración de badges de estado (Tailwind)
      pdf.ts                   # Vista de impresión del manifiesto (solo preview)
    components/
      solicitudes/
        SolicitudForm.svelte   # Alta de solicitud (upload a Storage + addDoc)
        SolicitudesTable.svelte# Tabla filtrable por estado + búsqueda
        EstadoBadge.svelte     # Badge de estado con color
        OperadorInbox.svelte   # Bandeja en tiempo real (aprobar/rechazar)
      ui/
        Modal.svelte           # Modal accesible (Runes: bindable + snippets)
        FileUpload.svelte      # Input de archivo (PDF)
        DataTable.svelte       # Tabla genérica (snippets head/children/empty)
  routes/
    +layout.svelte             # Importa app.css
    +page.server.ts            # Redirige a /dashboard o /login
    api/session/+server.ts     # POST crea cookie de sesión, DELETE la limpia
    (auth)/
      login/+page.server.ts    # Redirige si ya hay sesión
      login/+page.svelte       # Login cliente (Firebase Auth -> /api/session)
    dashboard/
      +layout.server.ts        # Guarda de sesión + redirección por rol
      +layout.svelte           # Shell de navegación por rol + logout
      generador/
        +page.server.ts
        +page.svelte           # Solicitudes propias en tiempo real
        solicitudes/nueva/+page.server.ts
        solicitudes/nueva/+page.svelte
        solicitudes/[id]/manifiesto/+page.server.ts
        solicitudes/[id]/manifiesto/+page.svelte
      operador/
        +page.server.ts
        +page.svelte           # Bandeja + tabla
        solicitudes/[id]/+page.server.ts
        solicitudes/[id]/+page.svelte
      almacenador/
        +page.server.ts
        +page.svelte           # Generadas + recibidas
static/
  favicon.svg
functions/
  src/index.ts                 # Cloud Functions v2: PDF de manifiesto y certificado
```

> Alias configurados en `svelte.config.js`: `$components` → `src/lib/components`,
> `$server` → `src/lib/server` (además de `$lib` por defecto).

## 2) Modelos Firestore (TypeScript)

Modelos base en:

- `src/lib/types/firestore.ts`

## 3) Esquema JSON sugerido

```json
{
	"usuarios/{uid}": {
		"uid": "authUid",
		"razonSocial": "Generador SA",
		"cuit": "30-12345678-9",
		"nroRegistro": "REG-AMB-001",
		"rol": "GENERADOR",
		"domicilioReal": "Av. Siempre Viva 123",
		"habilitado": true,
		"createdAt": "2026-07-02T00:00:00.000Z",
		"updatedAt": "2026-07-02T00:00:00.000Z"
	},
	"solicitudes/{id}": {
		"estado": "INICIADA",
		"generadorId": "uid-generador",
		"transportistaId": "uid-transportista",
		"operadorId": "uid-operador",
		"almacenadorId": "uid-almacenador-opcional",
		"residuos": [
			{
				"codigoY": "Y8",
				"descripcion": "Aceites minerales usados",
				"peso": 1200,
				"unidad": "kg",
				"estado": "LIQUIDO",
				"embalaje": "Tambor 200L",
				"cantidadBultos": 6
			}
		],
		"vehiculo": {
			"patente": "AA123BB",
			"tipo": "Camión cisterna",
			"chofer": "Juan Pérez",
			"licencia": "LIC-9988"
		},
		"planContingenciaUrl": "gs://bucket/plans/plan-001.pdf",
		"hojaRutaUrl": "gs://bucket/rutas/ruta-001.pdf",
		"fechaCreacion": "2026-07-02T00:00:00.000Z"
	},
	"solicitudes/{id}/reportes_recepcion/{reporteId}": {
		"solicitudId": "id",
		"operadorId": "uid-operador",
		"pesoDeclarado": 1200,
		"pesoRecibido": 1170,
		"unidad": "kg",
		"patenteDeclarada": "AA123BB",
		"patenteRecibida": "AA123BB",
		"observaciones": "Diferencia por evaporación",
		"createdAt": "2026-07-02T00:00:00.000Z"
	},
	"solicitudes/{id}/certificados/{certificadoId}": {
		"solicitudId": "id",
		"operadorId": "uid-operador",
		"codigoOperacion": "R8",
		"tipoCertificado": "TRATAMIENTO",
		"resumenProceso": "Neutralización y estabilización",
		"numeroCertificado": "CERT-2026-00001",
		"pdfUrl": "gs://bucket/certificados/CERT-2026-00001.pdf",
		"createdAt": "2026-07-02T00:00:00.000Z"
	}
}
```

## 4) Reglas de seguridad Firestore

Reglas implementadas en:

- `firestore.rules`

Cobertura principal:

- Aislamiento por actor (lectura solo para participantes de la solicitud o admin).
- Creación de solicitud limitada a `GENERADOR`/`ALMACENADOR_TRANSITORIO` en estado `INICIADA`.
- Transiciones de estado estrictas:
  - `INICIADA -> APROBADA|RECHAZADA`
  - `APROBADA -> MANIFIESTO_GENERADO`
  - `MANIFIESTO_GENERADO -> FINALIZADA`
- Rechazo exige observación técnica.
- `reportes_recepcion` y `certificados` solo los crea el `OPERADOR` dueño de la solicitud.

## 5) Guardas por rol (server hooks)

- `hooks.server.ts`: validar sesión Firebase Auth (cookie/token) y poblar `event.locals.user`.
- `routes/dashboard/+layout.server.ts`: redirección por rol.
- `lib/auth/guards.server.ts`: helpers `requireAuth` y `requireRole(['OPERADOR'])`.

## 6) Estado reactivo en cliente

- `stores/auth.svelte.ts`: usuario autenticado y rol (Svelte 5 Runes).
- `stores/solicitudes.svelte.ts`: suscripción `onSnapshot` filtrada por actor y estado.
- Badges de estado (Tailwind):
  - `INICIADA` gris
  - `APROBADA` azul
  - `RECHAZADA` rojo
  - `MANIFIESTO_GENERADO` ámbar
  - `FINALIZADA` verde

## 7) Flujo transaccional crítico

1. Generador crea solicitud (`INICIADA`) y sube PDFs de plan/hoja de ruta a Storage.
2. Operador aprueba/rechaza en bandeja en tiempo real.
3. Generador emite manifiesto bloqueando edición y generando código de despacho único por embalaje.
4. Operador registra pesaje real, crea reporte si hay disconformidad y finaliza con código R/D + certificado.

## 8) Generación de PDFs oficiales

Recomendación:

- Cliente: solo preview (sin validez legal).
- Cloud Functions (Node.js): generación oficial con plantillas HTML/PDF, hash SHA-256 del contenido, folio único, sello temporal y firma electrónica del operador.
- Persistir metadatos de declaración jurada (`numeroCertificado`, `hashDocumento`, `firmadoPor`, `signedAt`) junto al `pdfUrl`.
