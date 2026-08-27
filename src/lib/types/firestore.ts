export type RolUsuario = 'GENERADOR' | 'OPERADOR' | 'ALMACENADOR_TRANSITORIO' | 'TRANSPORTISTA' | 'ADMIN';

export type EstadoSolicitud =
  | 'INICIADA'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'MANIFIESTO_GENERADO'
  | 'FINALIZADA';

export type UnidadPeso = 'kg' | 'tn';
export type EstadoResiduo = 'SOLIDO' | 'LIQUIDO' | 'SEMISOLIDO' | 'GASEOSO';

/** Códigos de operación final: R = recuperación/valorización, D = eliminación/disposición. */
export type TipoOperacionFinal = 'R' | 'D';

export type TipoCertificado = 'TRATAMIENTO' | 'DESTRUCCION' | 'DISPOSICION_FINAL';

/**
 * Usuario "liviano" resuelto en el servidor (hooks.server.ts) desde la cookie de sesión.
 * Se expone a las rutas vía `event.locals.user` y `PageData.user`.
 */
export interface SessionUser {
  uid: string;
  email: string;
  rol: RolUsuario;
  razonSocial: string;
  habilitado: boolean;
}

export interface Usuario {
  uid: string;
  razonSocial: string;
  cuit: string;
  nroRegistro: string;
  rol: RolUsuario;
  domicilioReal: string;
  habilitado: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResiduoSolicitud {
  codigoY: string;
  descripcion: string;
  peso: number;
  unidad: UnidadPeso;
  estado: EstadoResiduo;
  embalaje: string;
  cantidadBultos: number;
  /** Códigos de despacho unívocos generados por bulto al emitir el manifiesto. */
  codigosDespacho?: string[];
}

/** Datos del manifiesto emitido por el generador (bloquea la edición de la solicitud). */
export interface ManifiestoInfo {
  numero: string;
  codigosDespacho: string[];
  generadoEn: string;
  /** URL del PDF oficial (Storage), escrita por la Cloud Function `generarManifiestoPdf`. */
  pdfUrl?: string;
  /** Hash SHA-256 del PDF final — integridad de archivo, no es lo que se ancla on-chain. */
  hashDocumento?: string;
  /** Hash Keccak-256 canónico impreso en el PDF y anclado on-chain (= blockchainAnchor.documentHash). */
  hashVerificacion?: string;
}

/** Datos de recepción/pesaje registrados por el operador al cierre. */
export interface RecepcionInfo {
  pesoRecibidoTotal: number;
  unidad: UnidadPeso;
  conforme: boolean;
  reporteId?: string;
  operacionFinal: string;
  tipoOperacion: TipoOperacionFinal;
  registradoEn: string;
}

export interface VehiculoAsignado {
  patente: string;
  tipo: string;
  chofer: string;
  licencia: string;
}

export interface SolicitudTraslado {
  id: string;
  estado: EstadoSolicitud;
  generadorId: string;
  transportistaId: string;
  operadorId: string;
  almacenadorId?: string;
  residuos: ResiduoSolicitud[];
  vehiculo: VehiculoAsignado;
  planContingenciaUrl: string;
  hojaRutaUrl: string;
  observacionRechazo?: string;
  manifiesto?: ManifiestoInfo;
  recepcion?: RecepcionInfo;
  certificadoId?: string;
  fechaCreacion: string;
  fechaAprobacion?: string;
  fechaManifiesto?: string;
  fechaFinalizacion?: string;
  blockchainAnchor?: BlockchainAnchor;
}

export interface ReporteRecepcion {
  id: string;
  solicitudId: string;
  operadorId: string;
  pesoDeclarado: number;
  pesoRecibido: number;
  unidad: UnidadPeso;
  patenteDeclarada: string;
  patenteRecibida: string;
  observaciones: string;
  createdAt: string;
}

export interface CertificadoTratamiento {
  id: string;
  solicitudId: string;
  operadorId: string;
  codigoOperacion: string;
  tipoCertificado: TipoCertificado;
  resumenProceso: string;
  numeroCertificado: string;
  /** Hash SHA-256 del PDF final — integridad de archivo, no es lo que se ancla on-chain. */
  hashDocumento?: string;
  /** Hash Keccak-256 canónico impreso en el PDF y anclado on-chain (= blockchainAnchor.documentHash). */
  hashVerificacion?: string;
  firmadoPor?: string;
  pdfUrl: string;
  createdAt: string;
  blockchainAnchor?: BlockchainAnchor;
}

/**
 * Metadatos del anclaje criptográfico en blockchain.
 * Se escribe en el documento Firestore una vez que la transacción es enviada o confirmada.
 */
export interface BlockchainAnchor {
  /** Hash keccak256 canónico del payload no-PII que fue anclado. */
  documentHash: string;
  /** Red o chainId donde fue anclado (ej: "80001", "137"). */
  network: string;
  /** Timestamp de cuando se inició el anclaje (ms desde epoch). */
  timestamp: number;
  /** Estado del anclaje. */
  status: 'pending' | 'confirmed' | 'failed';
  /** Hash de la transacción (disponible cuando status === 'confirmed'). */
  txHash?: string;
  /** Número de bloque en el que fue incluida la tx (disponible cuando status === 'confirmed'). */
  blockNumber?: number;
  /** Mensaje de error capturado cuando status === 'failed'. */
  errorMessage?: string;
  /** Timestamp del último intento fallido (ms desde epoch). */
  lastAttemptAt?: number;
}

export const ESTADOS_SOLICITUD_PERMITIDOS: EstadoSolicitud[] = [
  'INICIADA',
  'APROBADA',
  'RECHAZADA',
  'MANIFIESTO_GENERADO',
  'FINALIZADA'
];
