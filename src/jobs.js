import { parseAbiItem, getContract, keccak256, toHex, parseUnits, formatUnits } from 'viem';
import { CONTRACTS, AGENTIC_COMMERCE_ABI, ERC20_ABI, STATUS_NAMES } from './config.js';
import { getClients } from './wallet.js';

export async function createJob(provider, evaluator, expiredDays, description) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + (expiredDays * 24 * 60 * 60));

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AGENTIC_COMMERCE_ABI,
    functionName: 'createJob',
    args: [
      provider,
      evaluator,
      expiryTimestamp,
      description,
      '0x0000000000000000000000000000000000000000' // No hook address
    ]
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function setBudget(jobId, budgetAmount) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  // USDC uses 6 decimals
  const amountRaw = parseUnits(budgetAmount.toString(), 6);

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AGENTIC_COMMERCE_ABI,
    functionName: 'setBudget',
    args: [BigInt(jobId), amountRaw, '0x']
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function fundJob(jobId, budgetAmount) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const amountRaw = parseUnits(budgetAmount.toString(), 6);

  // 1. Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [connectedAddress, CONTRACTS.AGENTIC_COMMERCE]
  });

  // 2. Approve if allowance is less than budget
  if (currentAllowance < amountRaw) {
    const { request: approveRequest } = await publicClient.simulateContract({
      account: connectedAddress,
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.AGENTIC_COMMERCE, amountRaw]
    });
    const approveTx = await walletClient.writeContract(approveRequest);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  // 3. Fund escrow
  const { request: fundRequest } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AGENTIC_COMMERCE_ABI,
    functionName: 'fund',
    args: [BigInt(jobId), '0x']
  });

  const txHash = await walletClient.writeContract(fundRequest);
  return txHash;
}

export async function submitWork(jobId, deliverableText) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const deliverableHash = keccak256(toHex(deliverableText));

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AGENTIC_COMMERCE_ABI,
    functionName: 'submit',
    args: [BigInt(jobId), deliverableHash, '0x']
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function completeJob(jobId, reasonText) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient) throw new Error('Wallet not connected');

  const reasonHash = keccak256(toHex(reasonText));

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AGENTIC_COMMERCE_ABI,
    functionName: 'complete',
    args: [BigInt(jobId), reasonHash, '0x']
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

export async function getJobDetails(jobId) {
  const { publicClient } = getClients();
  if (!publicClient) throw new Error('Client not initialized');

  try {
    const job = await publicClient.readContract({
      address: CONTRACTS.AGENTIC_COMMERCE,
      abi: AGENTIC_COMMERCE_ABI,
      functionName: 'getJob',
      args: [BigInt(jobId)]
    });

    return {
      id: jobId.toString(),
      client: job[0],
      provider: job[1],
      evaluator: job[2],
      expiredAt: new Date(Number(job[3]) * 1000),
      description: job[4],
      budget: formatUnits(job[5], 6),
      deliverable: job[6],
      status: Number(job[7]),
      statusName: STATUS_NAMES[Number(job[7])],
      hook: job[8]
    };
  } catch (error) {
    console.error(`Error loading job ${jobId}:`, error);
    return null;
  }
}

export async function listJobs(limit = 10) {
  const { publicClient } = getClients();
  if (!publicClient) return [];

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > 9000n ? latestBlock - 9000n : 0n;

    const jobLogs = await publicClient.getLogs({
      address: CONTRACTS.AGENTIC_COMMERCE,
      event: parseAbiItem(
        "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, string description, address hook)"
      ),
      fromBlock,
      toBlock: 'latest'
    });

    const jobs = [];
    const seenJobIds = new Set();
    const logs = [...jobLogs].reverse();

    for (const log of logs) {
      const jobId = log.args.jobId;
      if (jobId && !seenJobIds.has(jobId.toString())) {
        seenJobIds.add(jobId.toString());
        const job = await getJobDetails(jobId);
        if (job) {
          jobs.push(job);
        }
        if (jobs.length >= limit) break;
      }
    }

    return jobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }
}
