import { keccak256, toHex, getContract } from 'viem';
import { CONTRACTS, REPUTATION_ABI, VALIDATION_ABI } from './config.js';
import { getClients } from './wallet.js';

export async function submitFeedback(agentId, score, tag, comment = '') {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const feedbackHash = keccak256(toHex(tag));

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.REPUTATION_REGISTRY,
    abi: REPUTATION_ABI,
    functionName: 'giveFeedback',
    args: [
      BigInt(agentId),
      BigInt(score),
      0, // feedbackType (0 = standard feedback)
      tag,
      '', // metadataURI
      '', // evidenceURI
      comment,
      feedbackHash
    ]
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function requestValidation(validator, agentId, tag) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const requestHash = keccak256(toHex(`validation_request_agent_${agentId}_${Date.now()}`));
  const requestURI = 'ipfs://bafkreiexamplevalidationrequest';

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.VALIDATION_REGISTRY,
    abi: VALIDATION_ABI,
    functionName: 'validationRequest',
    args: [
      validator,
      BigInt(agentId),
      requestURI,
      requestHash
    ]
  });

  const txHash = await walletClient.writeContract(request);
  return { txHash, requestHash };
}

export async function respondValidation(requestHash, score, tag) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const responseHash = keccak256(toHex(tag));

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.VALIDATION_REGISTRY,
    abi: VALIDATION_ABI,
    functionName: 'validationResponse',
    args: [
      requestHash,
      Number(score),
      '', // responseURI
      responseHash,
      tag
    ]
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function fetchValidationStatus(requestHash) {
  const { publicClient } = getClients();
  if (!publicClient) throw new Error('Client not initialized');

  try {
    const status = await publicClient.readContract({
      address: CONTRACTS.VALIDATION_REGISTRY,
      abi: VALIDATION_ABI,
      functionName: 'getValidationStatus',
      args: [requestHash]
    });

    return {
      validatorAddress: status[0],
      agentId: status[1].toString(),
      response: status[2],
      responseHash: status[3],
      tag: status[4],
      lastUpdate: new Date(Number(status[5]) * 1000)
    };
  } catch (error) {
    console.error('Error fetching validation status:', error);
    return null;
  }
}
