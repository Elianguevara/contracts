// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EcoTraceRegistry} from "../src/EcoTraceRegistry.sol";

contract EcoTraceRegistryHandler is Test {
    EcoTraceRegistry public registry;

    address public relayer;
    address public certificador;

    bytes32[] public recordedHashes;
    uint256 public totalRegistrations;

    constructor(
        EcoTraceRegistry _registry,
        address _relayer,
        address _certificador
    ) {
        registry = _registry;
        relayer = _relayer;
        certificador = _certificador;
    }

    function registerDocument(
        uint256 requestIdSeed,
        bytes32 documentHash,
        uint8 eventTypeSeed
    ) external {
        if (documentHash == bytes32(0)) return;
        if (registry.registered(documentHash)) return;

        string memory requestId = string(abi.encodePacked("REQ-", vm.toString(requestIdSeed)));
        string memory eventType = eventTypeSeed % 2 == 0 ? "MANIFIESTO_GENERADO" : "FINALIZADA";

        vm.prank(relayer);
        registry.registerDocument(requestId, documentHash, eventType);

        recordedHashes.push(documentHash);
        totalRegistrations++;
    }

    function attestCertificate(
        uint256 requestIdSeed,
        bytes32 documentHash
    ) external {
        if (documentHash == bytes32(0)) return;
        if (registry.registered(documentHash)) return;

        string memory requestId = string(abi.encodePacked("REQ-", vm.toString(requestIdSeed)));

        vm.prank(certificador);
        registry.attestCertificate(requestId, documentHash);

        recordedHashes.push(documentHash);
        totalRegistrations++;
    }

    function getRecordedHashesLength() external view returns (uint256) {
        return recordedHashes.length;
    }
}

contract EcoTraceRegistryInvariantTest is Test {
    EcoTraceRegistry public registry;
    EcoTraceRegistryHandler public handler;

    address public admin = address(0xAD01);
    address public relayer = address(0xDE70);
    address public certificador = address(0xCE87);

    function setUp() public {
        vm.prank(admin);
        registry = new EcoTraceRegistry(admin, relayer);

        bytes32 certRole = registry.CERTIFICADOR_ROLE();
        vm.prank(admin);
        registry.grantRole(certRole, certificador);

        handler = new EcoTraceRegistryHandler(registry, relayer, certificador);

        targetContract(address(handler));
    }

    /// @notice Invariante 1: Todo hash registrado nunca vuelve a un estado falso (inmutabilidad estricta).
    function invariant_RegisteredHashNeverBecomesFalse() public view {
        uint256 length = handler.getRecordedHashesLength();
        for (uint256 i = 0; i < length; i++) {
            bytes32 recordedHash = handler.recordedHashes(i);
            assertTrue(registry.registered(recordedHash), "Invariante violada: Hash registrado marcado como falso");
        }
    }

    /// @notice Invariante 2: El hash cero (bytes32(0)) nunca debe quedar registrado.
    function invariant_ZeroHashNeverRegistered() public view {
        assertFalse(registry.registered(bytes32(0)), "Invariante violada: bytes32(0) no debe estar registrado");
    }

    /// @notice Invariante 3: La cantidad de hashes registrados en el contrato es exactamente igual al total registrado.
    function invariant_RegistrationCountConsistency() public view {
        assertEq(
            handler.getRecordedHashesLength(),
            handler.totalRegistrations(),
            "Invariante violada: Descalce en conteo de registros"
        );
    }
}
