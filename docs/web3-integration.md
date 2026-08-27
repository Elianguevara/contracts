# Integración Web3 para EcoTrace

## Objetivo

Este documento describe cómo integrar EcoTrace con una capa Web3 usando Sepolia, Etherscan y contratos inteligentes para crear un MVP escalable. La idea es mantener la app actual en SvelteKit/Firebase y añadir una capa de verificación y trazabilidad on-chain sin romper el flujo principal.

## 1) Qué aporta Web3 a EcoTrace

- Trazabilidad pública de estados críticos de manifiestos y certificados.
- Firma de transacciones de actores vía wallets (MetaMask, Coinbase Wallet, etc.).
- Pruebas de existencia de documentos o eventos en la blockchain.
- Auditabilidad mediante Etherscan y bloques verificables.
- Potencial para tokenización de incentivos o compliance.

## 2) Arquitectura recomendada

```text
Browser (SvelteKit)
  ├─ Firebase Auth + Session API
  ├─ Firestore + Storage
  ├─ Web3 wallet (MetaMask / WalletConnect)
  └─ Ethers.js / Wagmi

Backend
  ├─ Firebase Functions (o servidor Node) para firmar metadatos
  ├─ Cloud Functions / API para llamadas a Etherscan y contratos
  └─ Firestore para estado local + referencias on-chain

Blockchain
  ├─ Sepolia testnet (desarrollo)
  ├─ Contratos inteligentes en Solidity
  └─ Etherscan para verificación y monitoreo
```

## 3) Modo de operación

1. El usuario inicia sesión en EcoTrace con Firebase Auth.
2. El usuario completa una solicitud, manifiesto o certificado.
3. El backend genera un `hash` del documento o el payload relevante.
4. El frontend pide al wallet del usuario que firme una transacción simple.
5. Se envía la transacción a Sepolia a través de Ethers.js.
6. El `transactionHash` y el bloque quedan guardados en Firestore.
7. El contrato emite un evento que queda indexado en Etherscan.

## 4) Casos de uso Web3 para EcoTrace

- Registro on-chain de la creación del manifiesto.
- Registro de la firma del operador sobre el certificado.
- Commit de un `hash` de los datos críticos para evitar alteraciones.
- Vincular el ID de solicitud de Firestore con un evento on-chain.
- Acceso público al historial de estados mediante Etherscan.

## 5) Sepolia y Etherscan

### Sepolia

- Sepolia es una testnet oficial de Ethereum.
- Usala para desarrollo y pruebas antes de migrar a Mainnet o redes L2.
- Necesitás una wallet con ETH de prueba.

### Etherscan

- Verifica tus contratos inteligentes para que el código sea público.
- Usa la API de Etherscan para consultar transacciones, eventos y estados.
- Para Sepolia, el explorer es https://sepolia.etherscan.io.

## 6) Recomendaciones de integración técnica

### 6.1. Usar Ethers.js en el cliente

- Instalar dependencias Web3 en el frontend:

```bash
pnpm add ethers
```

- Conectar al proveedor Web3 del browser:

```ts
import { ethers } from 'ethers';

if (!window.ethereum) {
	throw new Error('Instalá MetaMask u otra wallet compatible.');
}

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const address = await signer.getAddress();
console.log('Wallet conectada:', address);
```

- Verificar que el usuario esté en la red Sepolia:

```ts
const chainId = await signer.getChainId();
if (chainId !== 11155111) {
	throw new Error('Conectá Sepolia en tu wallet');
}
```

### 6.1.1. Ejemplo SvelteKit + MetaMask

```ts
<script lang="ts">
import { onMount } from 'svelte';
import { ethers } from 'ethers';

let walletAddress = '';
let error = '';

async function connectWallet() {
  try {
    if (!window.ethereum) {
      throw new Error('Por favor instalá MetaMask.');
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const chainId = await signer.getChainId();

    if (chainId !== 11155111) {
      throw new Error('Cambiá a la red Sepolia en tu wallet.');
    }

    walletAddress = await signer.getAddress();
    error = '';
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
}
</script>

<button on:click={connectWallet}>Conectar wallet</button>
{#if walletAddress}
  <p>Conectado: {walletAddress}</p>
{/if}
{#if error}
  <p class="text-red-600">{error}</p>
{/if}
```

### 6.2. Firma de datos off-chain

Para no onchain-izar todos los campos, guardá solo pruebas de existencia:

```ts
import { ethers } from 'ethers';

const messageHash = ethers.toUtf8Bytes(dataHash);
const signature = await signer.signMessage(messageHash);
```

- El backend puede validar la firma con el `address` del usuario.
- El hash se guarda en Firestore junto con `signature` y `transactionHash`.

### 6.2.1. Firma segura con EIP-712

Para mayor seguridad y evitar ataques de replay o firma de mensajes ambiguos, usá EIP-712:

```ts
import { ethers } from 'ethers';

const domain = {
	name: 'EcoTrace',
	version: '1',
	chainId: 11155111,
	verifyingContract: contractAddress
};

const types = {
	DocumentCommit: [
		{ name: 'requestId', type: 'string' },
		{ name: 'documentHash', type: 'bytes32' },
		{ name: 'timestamp', type: 'uint256' }
	]
};

const value = {
	requestId,
	documentHash,
	timestamp: Math.floor(Date.now() / 1000)
};

const signer = await provider.getSigner();
const signature = await signer._signTypedData(domain, types, value);
```

### 6.2.2. Validación de firma en el backend

Validá la firma en el servidor antes de confiar en los datos off-chain:

```ts
import { ethers } from 'ethers';

const hash = ethers.solidityPackedKeccak256(
	['string', 'bytes32', 'uint256'],
	[requestId, documentHash, timestamp]
);

const messageHash = ethers.hashMessage(ethers.arrayify(hash));
const recoveredAddress = ethers.recoverAddress(messageHash, signature);

if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
	throw new Error('Firma inválida');
}
```

Esta validación asegura que el `walletAddress` que firmó el documento es el mismo que se está usando en el flujo de negocio.

### 6.2.3. Qué guardar en Firestore para seguridad

Guarda en el documento Firestore los siguientes campos:

- `documentHash`: hash SHA-256 o keccak256 de los datos relevantes.
- `signature`: firma EIP-712 o firma simple con message.
- `walletAddress`: dirección que firmó.
- `signedAt`: fecha/hora de la firma.
- `txHash` (si hay transacción on-chain).
- `chainId`: red usada (11155111 para Sepolia).

### 6.2.4. Recomendaciones de seguridad

- Nunca confíes solo en los datos del cliente. Validá siempre la firma en el backend.
- Usá EIP-712 para que el usuario pueda ver exactamente qué está firmando.
- No firmes datos sensibles directamente; firmá solo el hash de los datos.
- Almacena el hash y la firma como prueba de integridad, no como fuente de verdad.

### 6.3. Contrato sencillo en Solidity

Un contrato básico podría almacenar eventos con:

- `requestId`
- `owner`
- `documentHash`
- `status`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EcoTraceRegistry {
    event DocumentRegistered(
        address indexed owner,
        string indexed requestId,
        bytes32 documentHash,
        uint256 timestamp
    );

    function registerDocument(string calldata requestId, bytes32 documentHash) external {
        emit DocumentRegistered(msg.sender, requestId, documentHash, block.timestamp);
    }
}
```

### 6.4. Guardar referencia on-chain en Firestore

En Firestore tenés un documento como:

```json
{
	"solicitudId": "abc123",
	"status": "MANIFIESTO_GENERADO",
	"blockchain": {
		"network": "sepolia",
		"txHash": "0x...",
		"contract": "0x...",
		"documentHash": "0x...",
		"verifiedAt": "2026-07-20T..."
	}
}
```

## 7) Flujo de verificación en Etherscan

1. Desplegá el contrato en Sepolia.
2. Usá Etherscan para verificar el contrato con el código fuente.
3. Integra la URL de Etherscan en la UI de EcoTrace para cada transacción.
4. Si necesitás, usa la API de Etherscan para obtener el estado del `txHash`.

#### Ejemplo de consulta Etherscan API

```ts
const apiKey = process.env.ETHERSCAN_API_KEY;
const url = `https://api-sepolia.etherscan.io/api?module=transaction&action=getstatus&txhash=${txHash}&apikey=${apiKey}`;
```

## 8) NVP / MVP con Web3

Tu MVP puede ser:

- una app híbrida donde el flujo principal sigue en Firebase,
- y el Web3 aporta solo trazabilidad y pruebas de firma.

Para construir un MVP viable:

- implementá primero el `hash + evento` con Sepolia,
- mantené el login en Firebase,
- y añadí enlaces a Etherscan desde la UI.

## 9) Escalabilidad

### 9.1. Capa off-chain vs on-chain

- Conservá el estado de negocio en Firebase/Firestore.
- Guardá en la blockchain solo referencias y pruebas de integridad.
- Esto reduce costos y mantiene buen rendimiento.

### 9.2. Reducción de costos y datos

- Usa `documentHash` en lugar de campos completos.
- Emite eventos en lugar de estados enteros.
- Para Mainnet/producción, migrá a una L2 (Arbitrum, Optimism, zkSync) cuando haya volumen.

### 9.3. Servicios recomendados

- Etherscan / Sepolia para desarrollo y auditoría.
- Infura, Alchemy o QuickNode como nodos JSON-RPC.
- The Graph o Tenderly para indexación avanzada y analytics.

## 10) Seguridad y compliance

- Nunca confíes en los datos del wallet sin validarlos.
- Verificá firmas off-chain en el backend cuando uses `signMessage`.
- Guardá las trazas on-chain como prueba inmutable, no como fuente de verdad.
- Evitá almacenar datos personales en la blockchain.

## 11) Próximo paso de implementación

1. Agregá wallet connect con Ethers.js en el frontend.
2. Desplegá un contrato de registro en Sepolia.
3. Implementá un evento `registerDocument` desde la app.
4. Guardá el hash y el `txHash` en Firestore.
5. Mostrá el enlace de Etherscan en la pantalla de manifiesto/certificado.

## 12) Recomendaciones finales

- Empieza probando en Sepolia.
- Verifica el contrato en Etherscan.
- Mantén el backend Firebase para lógica de negocio y autorización.
- Usa la blockchain solo para prueba de integridad y firma pública.
