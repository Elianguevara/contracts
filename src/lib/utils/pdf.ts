import type { SolicitudTraslado } from '$lib/types/firestore';

/**
 * Vista de impresión del lado del cliente (SOLO borrador / preview).
 * El documento con validez legal (declaración jurada) se genera en la Cloud Function
 * `generarManifiestoPdf`, que aplica folio, sello temporal, hash SHA-256 (integridad del
 * archivo) y el hash Keccak-256 impreso y anclado en blockchain (`hashVerificacion`).
 */
export function abrirVistaImpresionManifiesto(s: SolicitudTraslado): void {
	if (typeof window === 'undefined') return;

	const filas = s.residuos
		.map(
			(r, i) => `
			<tr>
				<td>${i + 1}</td>
				<td>${r.codigoY}</td>
				<td>${escapeHtml(r.descripcion)}</td>
				<td>${r.peso} ${r.unidad}</td>
				<td>${r.estado}</td>
				<td>${escapeHtml(r.embalaje)} (${r.cantidadBultos})</td>
				<td>${(r.codigosDespacho ?? []).join('<br/>')}</td>
			</tr>`
		)
		.join('');

	const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
		<title>Manifiesto ${s.manifiesto?.numero ?? '(borrador)'}</title>
		<style>
			body{font-family:system-ui,Arial,sans-serif;margin:32px;color:#0f172a}
			h1{font-size:18px;margin:0 0 4px} .sub{color:#475569;font-size:12px}
			table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
			th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}
			th{background:#f1f5f9}
			.jur{margin-top:24px;font-size:11px;color:#475569;border-top:1px dashed #94a3b8;padding-top:8px}
		</style></head><body>
		<h1>Manifiesto de transporte de residuos peligrosos</h1>
		<div class="sub">N.º ${s.manifiesto?.numero ?? 'BORRADOR — sin validez legal'} · Estado: ${s.estado}</div>
		<table><thead><tr>
			<th>#</th><th>Cód. Y</th><th>Descripción</th><th>Peso</th><th>Estado</th><th>Embalaje (bultos)</th><th>Códigos de despacho</th>
		</tr></thead><tbody>${filas}</tbody></table>
		<div class="jur">Vista preliminar. El documento oficial (original y triplicado) con carácter de
		declaración jurada se emite desde el sistema con folio, firma electrónica y hash de integridad.</div>
		<script>window.onload=()=>window.print()</script>
		</body></html>`;

	const win = window.open('', '_blank', 'width=900,height=700');
	if (win) {
		win.document.write(html);
		win.document.close();
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
