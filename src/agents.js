import { parseAbiItem, getContract } from 'viem';
import { CONTRACTS, IDENTITY_ABI } from './config.js';
import { getClients } from './wallet.js';

export async function registerAgent(metadataURI) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'register',
    args: [metadataURI]
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function getAgentDetails(agentId) {
  const { publicClient } = getClients();
  if (!publicClient) throw new Error('Client not initialized');

  const identityContract = getContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    client: publicClient
  });

  try {
    const owner = await identityContract.read.ownerOf([BigInt(agentId)]);
    const tokenURI = await identityContract.read.tokenURI([BigInt(agentId)]);
    
    let metadata = {};
    if (tokenURI.startsWith('http') || tokenURI.startsWith('ipfs')) {
      try {
        const url = tokenURI.startsWith('ipfs://') 
          ? `https://ipfs.io/ipfs/${tokenURI.slice(7)}` 
          : tokenURI;
        const res = await fetch(url);
        metadata = await res.json();
      } catch (err) {
        console.warn(`Could not fetch metadata for agent ${agentId}:`, err);
      }
    }

    return {
      id: agentId.toString(),
      owner,
      tokenURI,
      name: metadata.name || `AI Agent #${agentId}`,
      description: metadata.description || 'No description provided.',
      image: metadata.image ? (metadata.image.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${metadata.image.slice(7)}` : metadata.image) : null,
      capabilities: metadata.capabilities || [],
      agent_type: metadata.agent_type || 'Generalist',
      version: metadata.version || '1.0.0'
    };
  } catch (error) {
    console.error(`Error loading agent ${agentId}:`, error);
    return null;
  }
}

export async function listAgents(limit = 10) {
  const { publicClient } = getClients();
  if (!publicClient) return [];

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > 9000n ? latestBlock - 9000n : 0n;

    const transferLogs = await publicClient.getLogs({
      address: CONTRACTS.IDENTITY_REGISTRY,
      event: parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
      ),
      fromBlock,
      toBlock: 'latest'
    });

    const agents = [];
    // Load reverse chronological order, take unique tokenIds
    const seenTokenIds = new Set();
    const logs = [...transferLogs].reverse();

    for (const log of logs) {
      const tokenId = log.args.tokenId;
      if (tokenId && !seenTokenIds.has(tokenId.toString())) {
        seenTokenIds.add(tokenId.toString());
        const agent = await getAgentDetails(tokenId);
        if (agent) {
          agents.push(agent);
        }
        if (agents.length >= limit) break;
      }
    }

    return agents;
  } catch (error) {
    console.error('Error fetching agents:', error);
    return [];
  }
}
