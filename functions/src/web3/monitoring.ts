import { ethers } from 'ethers';
import { logger } from 'firebase-functions';
import { loadWeb3Config } from './config';
import type { RegistryClient } from './registry-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BalanceStatus {
	/** Checksummed relayer wallet address. */
	address: string;
	/** Current balance formatted as a decimal ETH string (e.g. "0.123"). */
	balanceEth: string;
	/** True when the balance is below the configured minimum threshold. */
	belowThreshold: boolean;
	/** True when the balance is below 2x the threshold (early-warning zone). */
	lowWarning: boolean;
}

// ---------------------------------------------------------------------------
// Core monitoring function
// ---------------------------------------------------------------------------

/**
 * Queries the relayer wallet balance and logs at the appropriate severity level.
 *
 * Severity levels:
 *  - INFO   → balance ≥ 2 × threshold (healthy)
 *  - WARN   → threshold ≤ balance < 2 × threshold (low, monitor closely)
 *  - ERROR  → balance < threshold (critical — transactions may fail for lack of gas)
 *
 * Can be called with an already-initialised `RegistryClient` (avoids a second
 * provider connection) or without one (creates its own ephemeral provider).
 *
 * @param client Optional existing RegistryClient to reuse its provider.
 */
export async function checkRelayerBalance(client?: RegistryClient): Promise<BalanceStatus> {
	const cfg = loadWeb3Config();
	const thresholdWei = ethers.parseEther(cfg.minBalanceEth.toString());

	let address: string;
	let balance: bigint;

	if (client) {
		address = client.relayerAddress;
		balance = await client.getRelayerBalance();
	} else {
		// Standalone mode: derive address without connecting to an RPC.
		address = new ethers.Wallet(cfg.relayerPrivateKey).address;
		const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
		balance = await provider.getBalance(address);
	}

	const balanceEth = ethers.formatEther(balance);
	const thresholdEth = ethers.formatEther(thresholdWei);
	const belowThreshold = balance < thresholdWei;
	const lowWarning = !belowThreshold && balance < thresholdWei * 2n;

	if (belowThreshold) {
		logger.error(
			'[Monitor] Saldo del relayer CRÍTICO — transacciones pueden fallar por falta de gas',
			{
				address,
				balanceEth,
				thresholdEth,
				action: 'Recargar la wallet del relayer inmediatamente'
			}
		);
	} else if (lowWarning) {
		logger.warn('[Monitor] Saldo del relayer bajo — recargar pronto', {
			address,
			balanceEth,
			thresholdEth
		});
	} else {
		logger.info('[Monitor] Saldo del relayer OK', { address, balanceEth });
	}

	return { address, balanceEth, belowThreshold, lowWarning };
}
