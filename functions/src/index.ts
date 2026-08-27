import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten
} from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { anchorManifiesto, anchorCertificado } from './web3/relayer';
import { checkRelayerBalance } from './web3/monitoring';
import { relayerPrivateKeySecret, web3RpcUrlSecret } from './web3/config';
import { canonicalHash } from './web3/hashing';
import type { ManifiestoPayload, CertificadoPayload } from './web3/hashing';

if (!getApps().length) initializeApp();
const db = getFirestore();
const bucketRef = () => getStorage().bucket();

// ---------------------------------------------------------------------------
// Tipos mínimos de los documentos que leemos.
// ---------------------------------------------------------------------------
interface Residuo {
	codigoY: string;
	descripcion: string;
	peso: number;
	unidad: string;
	estado: string;
	embalaje: string;
	cantidadBultos: number;
	codigosDespacho?: string[];
}

interface BlockchainAnchorSnap {
	status: 'pending' | 'confirmed' | 'failed';
	txHash?: string;
}

interface Solicitud {
	estado: string;
	generadorId: string;
	transportistaId: string;
	operadorId: string;
	residuos: Residuo[];
	vehiculo: { patente: string; tipo: string; chofer: string; licencia: string };
	manifiesto?: {
		numero: string;
		codigosDespacho: string[];
		generadoEn: string;
		pdfUrl?: string;
		/** SHA-256 del PDF final (integridad del archivo, no es lo que se ancla on-chain). */
		hashDocumento?: string;
		/** Keccak-256 canónico impreso en el PDF y anclado on-chain vía registerDocument(). */
		hashVerificacion?: string;
	};
	blockchainAnchor?: BlockchainAnchorSnap;
}

interface Certificado {
	solicitudId: string;
	operadorId: string;
	codigoOperacion: string;
	tipoCertificado: string;
	resumenProceso: string;
	numeroCertificado: string;
	pdfUrl?: string;
	/** SHA-256 del PDF final (integridad del archivo, no es lo que se ancla on-chain). */
	hashDocumento?: string;
	/** Keccak-256 canónico impreso en el PDF y anclado on-chain vía attestCertificate(). */
	hashVerificacion?: string;
	blockchainAnchor?: BlockchainAnchorSnap;
}

// ---------------------------------------------------------------------------
// Utilidades de layout con pdf-lib.
// ---------------------------------------------------------------------------
const A4: [number, number] = [595.28, 841.89];

function lineWriter(page: PDFPage, font: PDFFont, bold: PDFFont) {
	let y = A4[1] - 48;
	return {
		text(
			value: string,
			opts: { x?: number; size?: number; bold?: boolean; color?: [number, number, number] } = {}
		) {
			page.drawText(value, {
				x: opts.x ?? 48,
				y,
				size: opts.size ?? 10,
				font: opts.bold ? bold : font,
				color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.12, 0.16)
			});
		},
		move(dy: number) {
			y -= dy;
		},
		get y() {
			return y;
		}
	};
}

async function buildManifiestoPdf(
	id: string,
	s: Solicitud,
	copias: string[],
	hashVerificacion: string
): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const numero = s.manifiesto?.numero ?? '(sin folio)';

	for (const copia of copias) {
		const page = pdf.addPage(A4);
		const w = lineWriter(page, font, bold);

		w.text('MANIFIESTO DE TRANSPORTE DE RESIDUOS PELIGROSOS', { size: 13, bold: true });
		w.move(16);
		w.text(`Folio: ${numero}`, { size: 10, bold: true });
		w.text(copia, { x: 430, size: 11, bold: true, color: [0.6, 0.1, 0.1] });
		w.move(14);
		w.text(`Solicitud: ${id}`, { size: 9, color: [0.4, 0.45, 0.5] });
		w.move(16);
		w.text('Hash de verificación (Keccak-256) — anclado en blockchain:', {
			size: 7,
			bold: true,
			color: [0.4, 0.45, 0.5]
		});
		w.move(9);
		w.text(hashVerificacion, { size: 7, color: [0.25, 0.28, 0.32] });
		w.move(18);

		w.text('Vehículo', { bold: true });
		w.move(14);
		w.text(
			`Patente ${s.vehiculo.patente} · ${s.vehiculo.tipo} · Chofer ${s.vehiculo.chofer} · Lic. ${s.vehiculo.licencia}`,
			{ size: 9 }
		);
		w.move(22);

		w.text('Residuos', { bold: true });
		w.move(16);
		w.text('Cód.Y   Descripción                         Peso        Estado      Bultos', {
			size: 8,
			bold: true
		});
		w.move(12);
		for (const r of s.residuos ?? []) {
			const desc =
				r.descripcion.length > 34 ? r.descripcion.slice(0, 33) + '…' : r.descripcion.padEnd(34);
			w.text(
				`${r.codigoY.padEnd(6)}  ${desc}  ${String(r.peso).padStart(6)} ${r.unidad}  ${r.estado.padEnd(10)}  ${r.cantidadBultos}`,
				{ size: 8 }
			);
			w.move(11);
			const codigos = (r.codigosDespacho ?? []).join('  ');
			if (codigos) {
				w.text(`   Despacho: ${codigos}`, { size: 7, color: [0.4, 0.45, 0.5] });
				w.move(12);
			}
		}

		w.move(24);
		w.text('DECLARACIÓN JURADA', { bold: true, size: 9 });
		w.move(12);
		w.text(
			'Los firmantes declaran bajo juramento que los datos consignados son veraces y completos.',
			{ size: 8, color: [0.4, 0.45, 0.5] }
		);
		w.move(28);
		w.text(
			'_______________________          _______________________          _______________________',
			{
				size: 8
			}
		);
		w.move(12);
		w.text(
			'       Generador                          Transportista                          Operador',
			{
				size: 8,
				color: [0.4, 0.45, 0.5]
			}
		);
	}

	return pdf.save();
}

async function buildCertificadoPdf(
	c: Certificado,
	s: Solicitud,
	hashVerificacion: string
): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const page = pdf.addPage(A4);
	const w = lineWriter(page, font, bold);

	const titulo: Record<string, string> = {
		TRATAMIENTO: 'CERTIFICADO DE TRATAMIENTO',
		DESTRUCCION: 'CERTIFICADO DE DESTRUCCIÓN',
		DISPOSICION_FINAL: 'CERTIFICADO DE DISPOSICIÓN FINAL'
	};

	w.text(titulo[c.tipoCertificado] ?? 'CERTIFICADO', { size: 14, bold: true });
	w.move(18);
	w.text(`N.º ${c.numeroCertificado}`, { size: 10, bold: true });
	w.move(20);
	w.text(`Solicitud asociada: ${c.solicitudId}`, { size: 9 });
	w.move(14);
	w.text(`Manifiesto: ${s.manifiesto?.numero ?? '—'}`, { size: 9 });
	w.move(14);
	w.text(`Operación final ejecutada: ${c.codigoOperacion}`, { size: 10, bold: true });
	w.move(18);
	w.text('Hash de verificación (Keccak-256) — anclado en blockchain:', {
		size: 7,
		bold: true,
		color: [0.4, 0.45, 0.5]
	});
	w.move(9);
	w.text(hashVerificacion, { size: 7, color: [0.25, 0.28, 0.32] });
	w.move(18);
	w.text('Resumen del proceso', { bold: true });
	w.move(14);
	w.text(c.resumenProceso.slice(0, 90), { size: 9 });
	w.move(30);
	w.text('DECLARACIÓN JURADA', { bold: true, size: 9 });
	w.move(12);
	w.text(
		'El operador certifica bajo juramento haber ejecutado la operación indicada sobre la totalidad del residuo recibido.',
		{ size: 8, color: [0.4, 0.45, 0.5] }
	);
	w.move(40);
	w.text('_______________________', { size: 9 });
	w.move(12);
	w.text('Firma y sello del operador', { size: 8, color: [0.4, 0.45, 0.5] });

	return pdf.save();
}

async function persistPdf(path: string, bytes: Uint8Array): Promise<{ url: string; hash: string }> {
	const hash = createHash('sha256').update(bytes).digest('hex');
	const bucket = bucketRef();
	const file = bucket.file(path);

	// The Storage emulator has no real service account, so file.getSignedUrl()
	// always fails with "Cannot sign data without `client_email`" (signing needs
	// a private key, which only exists in production Cloud Functions via IAM).
	// Use a Firebase download-token URL instead when running under the emulator —
	// it works against both the emulator and real Storage, so it's emulator-only
	// by choice, not by necessity, to keep production behaviour unchanged.
	if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
		const downloadToken = crypto.randomUUID();
		await file.save(Buffer.from(bytes), {
			contentType: 'application/pdf',
			metadata: { metadata: { sha256: hash, firebaseStorageDownloadTokens: downloadToken } }
		});
		const host = process.env['STORAGE_EMULATOR_HOST'] ?? 'http://127.0.0.1:9199';
		const url = `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
		return { url, hash };
	}

	await file.save(Buffer.from(bytes), {
		contentType: 'application/pdf',
		metadata: { metadata: { sha256: hash } }
	});
	const [url] = await file.getSignedUrl({ action: 'read', expires: '2100-01-01' });
	return { url, hash };
}

// ---------------------------------------------------------------------------
// Triggers.
// ---------------------------------------------------------------------------

/**
 * Al pasar la solicitud a MANIFIESTO_GENERADO, genera el PDF oficial (3 copias:
 * ORIGINAL / DUPLICADO / TRIPLICADO), lo guarda en Storage y persiste url + hash.
 *
 * El hash Keccak-256 canónico (`hashVerificacion`) se calcula ANTES de generar el PDF, a partir
 * de los datos estructurados de la solicitud — no de los bytes del PDF, que todavía no existen.
 * Esto permite imprimirlo dentro del propio documento y, más adelante, anclar en la blockchain
 * exactamente ese mismo valor (`anclarManifiesto` lo lee de Firestore, nunca lo recalcula), así
 * lo que queda impreso en papel y lo que queda anclado on-chain son garantizado el mismo hash.
 */
export const generarManifiestoPdf = onDocumentUpdated('solicitudes/{id}', async (event) => {
	const before = event.data?.before.data() as Solicitud | undefined;
	const after = event.data?.after.data() as Solicitud | undefined;
	if (!after) return;

	// Solo cuando el estado CAMBIA a MANIFIESTO_GENERADO y aún no hay PDF (evita bucles).
	if (before?.estado === after.estado) return;
	if (after.estado !== 'MANIFIESTO_GENERADO') return;
	if (!after.manifiesto || after.manifiesto.pdfUrl) return;

	try {
		const solicitudId = event.params.id;
		const payload: ManifiestoPayload = {
			requestId: solicitudId,
			estado: after.estado,
			manifestoNumero: after.manifiesto.numero,
			residuos: (after.residuos ?? []).map((r) => ({
				codigoY: r.codigoY,
				estado: r.estado,
				peso: r.peso,
				unidad: r.unidad,
				cantidadBultos: r.cantidadBultos,
				codigosDespacho: r.codigosDespacho ?? []
			})),
			timestamp: Date.now()
		};
		const hashVerificacion = canonicalHash(payload);

		const bytes = await buildManifiestoPdf(
			solicitudId,
			after,
			['ORIGINAL', 'DUPLICADO', 'TRIPLICADO'],
			hashVerificacion
		);
		const { url, hash } = await persistPdf(`documentos/manifiestos/${solicitudId}.pdf`, bytes);
		await event.data!.after.ref.update({
			'manifiesto.pdfUrl': url,
			'manifiesto.hashDocumento': hash,
			'manifiesto.hashVerificacion': hashVerificacion
		});
		logger.info('Manifiesto PDF generado', { id: solicitudId, hash, hashVerificacion });
	} catch (err) {
		logger.error('Error generando manifiesto PDF', err);
	}
});

/**
 * Al crear un certificado, genera su PDF oficial con hash SHA-256 y persiste url + hash.
 * Mismo esquema que `generarManifiestoPdf`: el hash Keccak-256 se calcula antes de generar el
 * PDF, a partir de los datos del certificado, para poder imprimirlo dentro del documento.
 */
export const emitirCertificadoPdf = onDocumentCreated(
	'solicitudes/{id}/certificados/{cid}',
	async (event) => {
		const snap = event.data;
		if (!snap) return;
		const cert = snap.data() as Certificado;
		if (cert.pdfUrl) return;

		try {
			const solicitudId = event.params.id;
			const certId = event.params.cid;
			const solicitudSnap = await db.collection('solicitudes').doc(solicitudId).get();
			const solicitud = (solicitudSnap.data() as Solicitud) ?? ({} as Solicitud);

			const payload: CertificadoPayload = {
				requestId: certId,
				solicitudId,
				tipoCertificado: cert.tipoCertificado,
				codigoOperacion: cert.codigoOperacion,
				numeroCertificado: cert.numeroCertificado,
				timestamp: Date.now()
			};
			const hashVerificacion = canonicalHash(payload);

			const bytes = await buildCertificadoPdf(cert, solicitud, hashVerificacion);
			const { url, hash } = await persistPdf(
				`documentos/certificados/${cert.numeroCertificado}.pdf`,
				bytes
			);
			await snap.ref.update({ pdfUrl: url, hashDocumento: hash, hashVerificacion });
			logger.info('Certificado PDF generado', {
				numero: cert.numeroCertificado,
				hash,
				hashVerificacion
			});
		} catch (err) {
			logger.error('Error generando certificado PDF', err);
		}
	}
);

// ---------------------------------------------------------------------------
// Blockchain anchoring triggers (Fase 3 — Relayer).
// ---------------------------------------------------------------------------

/**
 * Anchors the manifiesto canonical hash on-chain once both conditions are met:
 *   1. solicitud.estado === 'MANIFIESTO_GENERADO'
 *   2. manifiesto.hashVerificacion is present (computed and printed on the PDF by
 *      `generarManifiestoPdf`)
 *
 * The trigger fires on every update to a solicitud document. It exits early
 * when not applicable, preventing unnecessary work. Idempotency is enforced
 * via the blockchainAnchor.status field ('pending' | 'confirmed' skip further
 * execution; only absent/failed anchors are retried).
 *
 * This trigger never recomputes the hash — it anchors `manifiesto.hashVerificacion` exactly as
 * written by the PDF trigger, so the value on-chain always matches what's printed on paper.
 *
 * Timeout is raised to 300 s to accommodate on-chain confirmation wait.
 */
export const anclarManifiesto = onDocumentUpdated(
	{
		document: 'solicitudes/{id}',
		timeoutSeconds: 300,
		secrets: [relayerPrivateKeySecret, web3RpcUrlSecret]
	},
	async (event) => {
		const after = event.data?.after.data() as Solicitud | undefined;
		if (!after) return;

		// Only process solicitudes in the correct state.
		if (after.estado !== 'MANIFIESTO_GENERADO') return;

		// The PDF trigger runs concurrently; skip until hashVerificacion is available.
		if (!after.manifiesto?.hashVerificacion) return;

		// Idempotency: skip if a previous invocation is already in progress or succeeded.
		const anchorStatus = after.blockchainAnchor?.status;
		if (anchorStatus === 'confirmed' || anchorStatus === 'pending') return;

		const solicitudId = event.params.id;
		const ref = event.data!.after.ref;

		// anchorManifiesto never throws — errors are written to Firestore internally.
		await anchorManifiesto(ref, solicitudId, after.manifiesto.hashVerificacion);
	}
);

/**
 * Anchors the certificado canonical hash on-chain via `attestCertificate`.
 *
 * Fires on every write to a certificado document. Skips until hashVerificacion
 * is set by the PDF generation trigger (`emitirCertificadoPdf`), then anchors
 * exactly once (idempotency via blockchainAnchor.status). Never recomputes the
 * hash — anchors `hashVerificacion` exactly as written by the PDF trigger, so
 * the value on-chain always matches what's printed on paper.
 */
export const anclarCertificado = onDocumentWritten(
	{
		document: 'solicitudes/{id}/certificados/{cid}',
		timeoutSeconds: 300,
		secrets: [relayerPrivateKeySecret, web3RpcUrlSecret]
	},
	async (event) => {
		const after = event.data?.after.data() as Certificado | undefined;
		if (!after) return;

		// Wait until the PDF trigger has written hashVerificacion.
		if (!after.hashVerificacion) return;

		// Idempotency.
		const anchorStatus = after.blockchainAnchor?.status;
		if (anchorStatus === 'confirmed' || anchorStatus === 'pending') return;

		const solicitudId = event.params.id;
		const certId = event.params.cid;
		const ref = event.data!.after.ref;

		// anchorCertificado never throws — errors are written to Firestore internally.
		await anchorCertificado(ref, solicitudId, certId, after.hashVerificacion);
	}
);

// ---------------------------------------------------------------------------
// Scheduled monitoring (Fase 4 — Resiliencia).
// ---------------------------------------------------------------------------

/**
 * Periodically checks the relayer wallet balance and logs at the appropriate
 * severity level (INFO / WARN / ERROR) depending on how the balance compares
 * to the configured minimum threshold (RELAYER_MIN_BALANCE_ETH env var).
 *
 * Schedule: every 6 hours. Adjust in firebase.json / environment as needed.
 * The function exits gracefully on any error so it never crashes the scheduler.
 */
export const verificarSaldoRelayer = onSchedule(
	{
		schedule: 'every 6 hours',
		timeoutSeconds: 60,
		secrets: [relayerPrivateKeySecret, web3RpcUrlSecret]
	},
	async () => {
		try {
			await checkRelayerBalance();
		} catch (err: unknown) {
			// Log but do not rethrow: a monitoring failure must never block the scheduler.
			logger.error('[verificarSaldoRelayer] Error al verificar el saldo del relayer', {
				err: err instanceof Error ? err.message : String(err)
			});
		}
	}
);
