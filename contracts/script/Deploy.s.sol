// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {EcoTraceRegistry} from "../src/EcoTraceRegistry.sol";

contract DeployEcoTraceRegistry is Script {
    function run() external returns (EcoTraceRegistry registry) {
        // Obtenemos clave privada del deployer o usamos fallback para Anvil
        uint256 defaultPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // Anvil Account #0
        uint256 deployerPrivateKey = vm.envOr("RELAYER_PRIVATE_KEY", defaultPrivateKey);

        if (deployerPrivateKey == 0) {
            deployerPrivateKey = defaultPrivateKey;
        }

        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address relayer = vm.envOr("RELAYER_ADDRESS", deployer);
        address certificador = vm.envOr("CERTIFICADOR_ADDRESS", address(0));
        address enteEstatal = vm.envOr("ENTE_ESTATAL_ADDRESS", address(0));

        console.log("=== Desplegando EcoTraceRegistry ===");
        console.log("Deployer Address:", deployer);
        console.log("Admin Address:", admin);
        console.log("Relayer Address:", relayer);

        vm.startBroadcast(deployerPrivateKey);

        registry = new EcoTraceRegistry(admin, relayer);

        if (certificador != address(0) && admin == deployer) {
            registry.grantRole(registry.CERTIFICADOR_ROLE(), certificador);
            console.log("Certificador Role concedido a:", certificador);
        }

        if (enteEstatal != address(0) && admin == deployer) {
            registry.grantRole(registry.ENTE_ESTATAL_ROLE(), enteEstatal);
            console.log("Ente Estatal Role concedido a:", enteEstatal);
        }

        vm.stopBroadcast();

        console.log("EcoTraceRegistry desplegado exitosamente en:", address(registry));
        console.log("====================================");
    }
}
