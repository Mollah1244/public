import { createPublicClient, createWalletClient, custom, http, formatUnits } from 'viem';
import { CONTRACTS, ARC_TESTNET_CHAIN } from './config.js';

let publicClient = null;
let walletClient = null;
let connectedAddress = null;
let connectedProvider = null;

export async function discoverBrowserWallets() {
  const providers = new Map();

  const handleAnnouncement = (event) => {
    providers.set(event.detail.info.uuid, event.detail);
  };

  window.addEventListener('eip6963:announceProvider', handleAnnouncement);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  await new Promise((resolve) => setTimeout(resolve, 250));
  window.removeEventListener('eip6963:announceProvider', handleAnnouncement);

  return [...providers.values()];
}

export async function connectWallet(provider) {
  if (!provider) {
    throw new Error('No wallet provider specified');
  }

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts authorized');
  }

  connectedAddress = accounts[0];
  connectedProvider = provider;

  publicClient = createPublicClient({
    chain: ARC_TESTNET_CHAIN,
    transport: http('https://rpc.testnet.arc.network/', {
      retryCount: 5,
      retryDelay: 500,
      timeout: 10000,
      batch: true
    })
  });

  walletClient = createWalletClient({
    account: connectedAddress,
    chain: ARC_TESTNET_CHAIN,
    transport: custom(provider)
  });

  // Switch to Arc Testnet in background (non-blocking)
  provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${ARC_TESTNET_CHAIN.id.toString(16)}` }]
  }).catch((switchError) => {
    console.warn('Network switch warning:', switchError.message);
    provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: `0x${ARC_TESTNET_CHAIN.id.toString(16)}`,
        chainName: ARC_TESTNET_CHAIN.name,
        rpcUrls: ARC_TESTNET_CHAIN.rpcUrls.public.http,
        blockExplorerUrls: [ARC_TESTNET_CHAIN.blockExplorers.default.url],
        nativeCurrency: ARC_TESTNET_CHAIN.nativeCurrency
      }]
    }).catch((e) => console.warn('Add network error:', e.message));
  });

  // Wallet event listeners
  if (provider.on && !provider._hasNomarcListeners) {
    provider._hasNomarcListeners = true;

    provider.on('accountsChanged', (accs) => {
      if (!accs || accs.length === 0) {
        disconnectWallet();
        window.dispatchEvent(new CustomEvent('wallet-disconnected'));
      } else {
        connectedAddress = accs[0];
        if (walletClient) {
          walletClient = createWalletClient({
            account: connectedAddress,
            chain: ARC_TESTNET_CHAIN,
            transport: custom(provider)
          });
        }
        window.dispatchEvent(new CustomEvent('balance-updated'));
      }
    });

    provider.on('chainChanged', () => {
      if (window._isBridging) return;
      window.dispatchEvent(new CustomEvent('balance-updated'));
    });
  }

  return { address: connectedAddress, publicClient, walletClient };
}

export function getClients() {
  return { publicClient, walletClient, connectedAddress, provider: connectedProvider };
}

export function disconnectWallet() {
  connectedAddress = null;
  connectedProvider = null;
  publicClient = null;
  walletClient = null;
}

/**
 * Get 100% REAL on-chain USDC balance for connected address on Arc Testnet.
 * Fetches directly via provider eth_getBalance (MetaMask RPC) or publicClient.
 */
export async function getUSDCBalance(address) {
  if (!address) return '0.00';

  let formatted = 0;
  const prov = connectedProvider || window.ethereum;

  // 1. Direct provider eth_getBalance (MetaMask/Rabby native RPC)
  if (prov && prov.request) {
    try {
      const hexBal = await prov.request({ method: 'eth_getBalance', params: [address, 'latest'] });
      if (hexBal !== undefined && hexBal !== null) {
        const val = parseFloat(formatUnits(BigInt(hexBal), 18));
        if (!isNaN(val)) formatted = val;
      }
    } catch (e) {
      console.warn('[Wallet] Direct provider eth_getBalance failed:', e.message);
    }
  } else if (publicClient) {
    // 2. Fallback to publicClient getBalance
    try {
      const natBal = await publicClient.getBalance({ address });
      formatted = parseFloat(formatUnits(natBal, 18));
    } catch (err) {
      console.warn('[Wallet] Public client getBalance failed:', err.message);
    }
  }

  return Math.max(formatted, 0).toFixed(2);
}
