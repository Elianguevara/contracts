// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EcoTraceRegistry} from "../src/EcoTraceRegistry.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract EcoTraceRegistryFuzzTest is Test {
    EcoTraceRegistry public registry;

    address public admin = address(0xAD01);
    address public relayer = address(0xDE70);
    address public certificador = address(0xCE87);
    address public enteEstatal = address(0xE57A);

    bytes32 public relayerRole;
    bytes32 public certificadorRole;
    bytes32 public enteEstatalRole;

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

    // --- Fuzz Testing: registerDocument ---

    function testFuzz_RegisterDocument_ValidInputs(
        string calldata requestId,
        bytes32 documentHash,
        string calldata eventType
    ) public {
        vm.assume(bytes(requestId).length > 0);
        vm.assume(documentHash != bytes32(0));

        vm.prank(relayer);
        registry.registerDocument(requestId, documentHash, eventType);

        assertTrue(registry.registered(documentHash));
    }

    function testFuzz_RegisterDocument_DuplicateReverts(
        string calldata requestId1,
        string calldata requestId2,
        bytes32 documentHash,
        string calldata eventType1,
        string calldata eventType2
    ) public {
        vm.assume(bytes(requestId1).length > 0);
        vm.assume(bytes(requestId2).length > 0);
        vm.assume(documentHash != bytes32(0));

        vm.prank(relayer);
        registry.registerDocument(requestId1, documentHash, eventType1);

        vm.expectRevert(abi.encodeWithSelector(EcoTraceRegistry.AlreadyRegistered.selector, documentHash));
        vm.prank(relayer);
        registry.registerDocument(requestId2, documentHash, eventType2);
    }

    function testFuzz_RegisterDocument_UnauthorizedCaller(
        address caller,
        string calldata requestId,
        bytes32 documentHash,
        string calldata eventType
    ) public {
        vm.assume(caller != relayer);
        vm.assume(bytes(requestId).length > 0);
        vm.assume(documentHash != bytes32(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                caller,
                relayerRole
            )
        );
        vm.prank(caller);
        registry.registerDocument(requestId, documentHash, eventType);
    }

    // --- Fuzz Testing: attestCertificate ---

    function testFuzz_AttestCertificate_ValidInputs(
        string calldata requestId,
        bytes32 documentHash
    ) public {
        vm.assume(bytes(requestId).length > 0);
        vm.assume(documentHash != bytes32(0));

        vm.prank(certificador);
        registry.attestCertificate(requestId, documentHash);

        assertTrue(registry.registered(documentHash));
    }

    function testFuzz_AttestCertificate_DuplicateReverts(
        string calldata requestId1,
        string calldata requestId2,
        bytes32 documentHash
    ) public {
        vm.assume(bytes(requestId1).length > 0);
        vm.assume(bytes(requestId2).length > 0);
        vm.assume(documentHash != bytes32(0));

        vm.prank(certificador);
        registry.attestCertificate(requestId1, documentHash);

        vm.expectRevert(abi.encodeWithSelector(EcoTraceRegistry.AlreadyRegistered.selector, documentHash));
        vm.prank(certificador);
        registry.attestCertificate(requestId2, documentHash);
    }

    function testFuzz_AttestCertificate_UnauthorizedCaller(
        address caller,
        string calldata requestId,
        bytes32 documentHash
    ) public {
        vm.assume(caller != certificador);
        vm.assume(bytes(requestId).length > 0);
        vm.assume(documentHash != bytes32(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                caller,
                certificadorRole
            )
        );
        vm.prank(caller);
        registry.attestCertificate(requestId, documentHash);
    }

    // --- Fuzz Testing: approveAsState ---

    function testFuzz_ApproveAsState_ValidInputs(
        string calldata requestId
    ) public {
        vm.assume(bytes(requestId).length > 0);

        vm.prank(enteEstatal);
        registry.approveAsState(requestId);
    }

    function testFuzz_ApproveAsState_UnauthorizedCaller(
        address caller,
        string calldata requestId
    ) public {
        vm.assume(caller != enteEstatal);
        vm.assume(bytes(requestId).length > 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                caller,
                enteEstatalRole
            )
        );
        vm.prank(caller);
        registry.approveAsState(requestId);
    }
}
