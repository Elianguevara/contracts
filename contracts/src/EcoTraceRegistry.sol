// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EcoTraceRegistry
 * @dev Contrato de registro inmutable para anclaje de evidencias criptográficas
 * (manifiestos, certificados y aprobaciones estatales) en el sistema EcoTrace.
 */
contract EcoTraceRegistry is AccessControl {
    // --- Roles ---
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant CERTIFICADOR_ROLE = keccak256("CERTIFICADOR_ROLE");
    bytes32 public constant ENTE_ESTATAL_ROLE = keccak256("ENTE_ESTATAL_ROLE");

    // --- State Variables ---
    /// @notice Almacena si un hash canónico de documento ya ha sido registrado previamente.
    mapping(bytes32 => bool) public registered;

    // --- Custom Errors ---
    error AlreadyRegistered(bytes32 documentHash);
    error EmptyRequestId();
    error ZeroHash();
    error NotAuthorized();

    // --- Events ---
    event DocumentRegistered(
        address indexed relayer,
        string indexed requestId,
        bytes32 documentHash,
        string eventType,
        uint256 timestamp
    );

    event CertificateAttested(
        address indexed certificador,
        string indexed requestId,
        bytes32 documentHash,
        uint256 timestamp
    );

    event StateApproval(
        address indexed entidad,
        string indexed requestId,
        uint256 timestamp
    );

    /**
     * @notice Inicializa el contrato configurando los roles iniciales de administración y relayer.
     * @param admin Dirección que recibirá el rol DEFAULT_ADMIN_ROLE. Si es address(0), se asigna a msg.sender.
     * @param initialRelayer Dirección opcional para el rol RELAYER_ROLE.
     */
    constructor(address admin, address initialRelayer) {
        address defaultAdmin = admin == address(0) ? msg.sender : admin;
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);

        if (initialRelayer != address(0)) {
            _grantRole(RELAYER_ROLE, initialRelayer);
        }
    }

    /**
     * @notice Registra un documento (manifiesto u operación) en la blockchain.
     * @dev Solo puede ser ejecutado por cuentas con el rol RELAYER_ROLE.
     * @param requestId Identificador de la solicitud en Firestore.
     * @param documentHash Hash SHA-256 o Keccak256 del documento/payload canónico.
     * @param eventType Tipo de evento (ej: "MANIFIESTO_GENERADO", "FINALIZADA").
     */
    function registerDocument(
        string calldata requestId,
        bytes32 documentHash,
        string calldata eventType
    ) external onlyRole(RELAYER_ROLE) {
        if (bytes(requestId).length == 0) revert EmptyRequestId();
        if (documentHash == bytes32(0)) revert ZeroHash();
        if (registered[documentHash]) revert AlreadyRegistered(documentHash);

        registered[documentHash] = true;

        emit DocumentRegistered(
            msg.sender,
            requestId,
            documentHash,
            eventType,
            block.timestamp
        );
    }

    /**
     * @notice Atesta la validez de un certificado emitido por una entidad certificadora acreditada.
     * @dev Solo puede ser ejecutado por cuentas con el rol CERTIFICADOR_ROLE.
     * @param requestId Identificador de la solicitud asociada.
     * @param documentHash Hash criptográfico del certificado emitido.
     */
    function attestCertificate(
        string calldata requestId,
        bytes32 documentHash
    ) external onlyRole(CERTIFICADOR_ROLE) {
        if (bytes(requestId).length == 0) revert EmptyRequestId();
        if (documentHash == bytes32(0)) revert ZeroHash();
        if (registered[documentHash]) revert AlreadyRegistered(documentHash);

        registered[documentHash] = true;

        emit CertificateAttested(
            msg.sender,
            requestId,
            documentHash,
            block.timestamp
        );
    }

    /**
     * @notice Emite una aprobación oficial u homologación por parte de un ente de control estatal.
     * @dev Solo puede ser ejecutado por cuentas con el rol ENTE_ESTATAL_ROLE.
     * @param requestId Identificador de la solicitud homologada.
     */
    function approveAsState(
        string calldata requestId
    ) external onlyRole(ENTE_ESTATAL_ROLE) {
        if (bytes(requestId).length == 0) revert EmptyRequestId();

        emit StateApproval(msg.sender, requestId, block.timestamp);
    }
}
