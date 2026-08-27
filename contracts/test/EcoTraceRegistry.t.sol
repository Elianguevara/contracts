// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EcoTraceRegistry} from "../src/EcoTraceRegistry.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract EcoTraceRegistryTest is Test {
    EcoTraceRegistry public registry;

    address public admin = address(0xAD01);
    address public relayer = address(0xDE70);
    address public certificador = address(0xCE87);
    address public enteEstatal = address(0xE57A);
    address public unauthorizedUser = address(0xBEEF);

    bytes32 public relayerRole;
    bytes32 public certificadorRole;
    bytes32 public enteEstatalRole;

    string constant SAMPLE_REQUEST_ID = "SOL-2026-0001";
    bytes32 constant SAMPLE_HASH = keccak256(abi.encodePacked("sample_manifest_payload"));
    string constant SAMPLE_EVENT = "MANIFIESTO_GENERADO";

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

    function setUp() public {
        vm.prank(admin);
        registry = new EcoTraceRegistry(admin, relayer);

        relayerRole = registry.RELAYER_ROLE();
        certificadorRole = registry.CERTIFICADOR_ROLE();
        enteEstatalRole = registry.ENTE_ESTATAL_ROLE();

        vm.startPrank(admin);
        registry.grantRole(certificadorRole, certificador);
        registry.grantRole(enteEstatalRole, enteEstatal);
        vm.stopPrank();
    }

    // --- Constructor & Initial Roles ---

    function test_InitialRoles() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(relayerRole, relayer));
        assertTrue(registry.hasRole(certificadorRole, certificador));
        assertTrue(registry.hasRole(enteEstatalRole, enteEstatal));
        assertFalse(registry.hasRole(relayerRole, unauthorizedUser));
    }

    function test_ConstructorFallbackToSenderWhenAdminZero() public {
        address deployer = address(0x9999);
        vm.prank(deployer);
        EcoTraceRegistry tempRegistry = new EcoTraceRegistry(address(0), address(0));
        assertTrue(tempRegistry.hasRole(tempRegistry.DEFAULT_ADMIN_ROLE(), deployer));
    }

    // --- registerDocument ---

    function test_RegisterDocument_Success() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit DocumentRegistered(relayer, SAMPLE_REQUEST_ID, SAMPLE_HASH, SAMPLE_EVENT, block.timestamp);

        vm.prank(relayer);
        registry.registerDocument(SAMPLE_REQUEST_ID, SAMPLE_HASH, SAMPLE_EVENT);

        assertTrue(registry.registered(SAMPLE_HASH));
    }

    function test_RegisterDocument_Revert_Unauthorized() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                unauthorizedUser,
                relayerRole
            )
        );
        vm.prank(unauthorizedUser);
        registry.registerDocument(SAMPLE_REQUEST_ID, SAMPLE_HASH, SAMPLE_EVENT);
    }

    function test_RegisterDocument_Revert_EmptyRequestId() public {
        vm.expectRevert(EcoTraceRegistry.EmptyRequestId.selector);
        vm.prank(relayer);
        registry.registerDocument("", SAMPLE_HASH, SAMPLE_EVENT);
    }

    function test_RegisterDocument_Revert_ZeroHash() public {
        vm.expectRevert(EcoTraceRegistry.ZeroHash.selector);
        vm.prank(relayer);
        registry.registerDocument(SAMPLE_REQUEST_ID, bytes32(0), SAMPLE_EVENT);
    }

    function test_RegisterDocument_Revert_AlreadyRegistered() public {
        vm.prank(relayer);
        registry.registerDocument(SAMPLE_REQUEST_ID, SAMPLE_HASH, SAMPLE_EVENT);

        vm.expectRevert(abi.encodeWithSelector(EcoTraceRegistry.AlreadyRegistered.selector, SAMPLE_HASH));
        vm.prank(relayer);
        registry.registerDocument("SOL-2026-0002", SAMPLE_HASH, "FINALIZADA");
    }

    // --- attestCertificate ---

    function test_AttestCertificate_Success() public {
        bytes32 certHash = keccak256(abi.encodePacked("certificate_data"));

        vm.expectEmit(true, true, false, true, address(registry));
        emit CertificateAttested(certificador, SAMPLE_REQUEST_ID, certHash, block.timestamp);

        vm.prank(certificador);
        registry.attestCertificate(SAMPLE_REQUEST_ID, certHash);

        assertTrue(registry.registered(certHash));
    }

    function test_AttestCertificate_Revert_Unauthorized() public {
        bytes32 certHash = keccak256(abi.encodePacked("certificate_data"));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                unauthorizedUser,
                certificadorRole
            )
        );
        vm.prank(unauthorizedUser);
        registry.attestCertificate(SAMPLE_REQUEST_ID, certHash);
    }

    function test_AttestCertificate_Revert_EmptyRequestId() public {
        bytes32 certHash = keccak256(abi.encodePacked("certificate_data"));

        vm.expectRevert(EcoTraceRegistry.EmptyRequestId.selector);
        vm.prank(certificador);
        registry.attestCertificate("", certHash);
    }

    function test_AttestCertificate_Revert_ZeroHash() public {
        vm.expectRevert(EcoTraceRegistry.ZeroHash.selector);
        vm.prank(certificador);
        registry.attestCertificate(SAMPLE_REQUEST_ID, bytes32(0));
    }

    function test_AttestCertificate_Revert_AlreadyRegistered() public {
        bytes32 certHash = keccak256(abi.encodePacked("certificate_data"));

        vm.prank(certificador);
        registry.attestCertificate(SAMPLE_REQUEST_ID, certHash);

        vm.expectRevert(abi.encodeWithSelector(EcoTraceRegistry.AlreadyRegistered.selector, certHash));
        vm.prank(certificador);
        registry.attestCertificate("SOL-2026-0003", certHash);
    }

    // --- approveAsState ---

    function test_ApproveAsState_Success() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit StateApproval(enteEstatal, SAMPLE_REQUEST_ID, block.timestamp);

        vm.prank(enteEstatal);
        registry.approveAsState(SAMPLE_REQUEST_ID);
    }

    function test_ApproveAsState_Revert_Unauthorized() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                unauthorizedUser,
                enteEstatalRole
            )
        );
        vm.prank(unauthorizedUser);
        registry.approveAsState(SAMPLE_REQUEST_ID);
    }

    function test_ApproveAsState_Revert_EmptyRequestId() public {
        vm.expectRevert(EcoTraceRegistry.EmptyRequestId.selector);
        vm.prank(enteEstatal);
        registry.approveAsState("");
    }
}
