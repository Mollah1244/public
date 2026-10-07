export const CONTRACTS = {
  USDC: '0x3600000000000000000000000000000000000000',
  IDENTITY_REGISTRY: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  REPUTATION_REGISTRY: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  VALIDATION_REGISTRY: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272',
  AGENTIC_COMMERCE: '0x0747EEf0706327138c69792bF28Cd525089e4583',
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  USYC: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C'
};

export const ARC_TESTNET_CHAIN = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18, // Native gas token has 18 decimals on Arc!
  },
  rpcUrls: {
    public: { http: ['https://rpc.testnet.arc.network/'] },
    default: { http: ['https://rpc.testnet.arc.network/'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  }
};

// ABIs
export const IDENTITY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: []
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" }
    ]
  }
];

export const REPUTATION_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "int128" },
      { name: "feedbackType", type: "uint8" },
      { name: "tag", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "evidenceURI", type: "string" },
      { name: "comment", type: "string" },
      { name: "feedbackHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "event",
    name: "FeedbackGiven",
    anonymous: false,
    inputs: [
      { indexed: true, name: "reporter", type: "address" },
      { indexed: true, name: "agentId", type: "uint256" },
      { name: "score", type: "int128" },
      { name: "feedbackType", type: "uint8" },
      { name: "tag", type: "string" },
      { name: "feedbackHash", type: "bytes32" }
    ]
  }
];

export const VALIDATION_ABI = [
  {
    name: "validationRequest",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "validator", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "requestURI", type: "string" },
      { name: "requestHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    name: "validationResponse",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "requestHash", type: "bytes32" },
      { name: "response", type: "uint8" },
      { name: "responseURI", type: "string" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" }
    ],
    outputs: []
  },
  {
    name: "getValidationStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "requestHash", type: "bytes32" }],
    outputs: [
      { name: "validatorAddress", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "response", type: "uint8" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" },
      { name: "lastUpdate", type: "uint256" }
    ]
  }
];

export const AGENTIC_COMMERCE_ABI = [
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "budget", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "status", type: "uint8" },
      { name: "hook", type: "address" }
    ]
  },
  {
    type: "event",
    name: "JobCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "jobId", type: "uint256" },
      { indexed: true, name: "client", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" }
    ]
  }
];

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  }
];

export const STATUS_NAMES = ['Open', 'BudgetSet', 'Funded', 'Submitted', 'Completed', 'Disputed', 'Refunded'];

/**
 * UNIFIED Deterministic Vault Key Derivation (used by BOTH lending.js AND prediction.js).
 * 
 * This function ALWAYS returns the exact same private key + account for a given connectedAddress,
 * regardless of whether localStorage was cleared or browser history was wiped.
 * 
 * Key design:
 *  - Uses keccak256 of a fixed seed + lowercase wallet address
 *  - Stores in localStorage as a cache only (NOT the source of truth)
 *  - If localStorage is empty, re-derives the SAME key deterministically
 *  - Both lending vault and prediction portfolio share the same key
 */
import { keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const VAULT_SEED = 'nomarc_unified_vault_v1_';

export function getDeterministicVaultAccount(connectedAddress) {
  if (!connectedAddress) return null;
  
  const addr = connectedAddress.toLowerCase();
  const cacheKey = `nomarc_vault_key_${addr}`;
  
  // Always derive deterministically — localStorage is just a cache
  const deterministicKey = keccak256(toHex(`${VAULT_SEED}${addr}`));
  
  // Cache it for convenience (but we never DEPEND on it)
  try {
    localStorage.setItem(cacheKey, deterministicKey);
  } catch (e) { /* private browsing mode, ignore */ }
  
  try {
    const account = privateKeyToAccount(deterministicKey);
    return { privateKey: deterministicKey, account, address: account.address };
  } catch (e) {
    console.error('[Vault] Failed to derive account:', e);
    return null;
  }
}
