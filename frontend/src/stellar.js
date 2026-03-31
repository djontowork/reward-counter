import * as StellarSdk from '@stellar/stellar-sdk';
import {
  requestAccess,
  signTransaction,
  isConnected,
} from '@stellar/freighter-api';

const TESTNET_RPC = import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = StellarSdk.Networks.TESTNET;
const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';

export { CONTRACT_ID };

/** Connect to Freighter and return the user's public key */
export async function connectWallet() {
  const connected = await isConnected();
  if (!connected) {
    throw new Error(
      'Freighter extension not detected. Please install it from the Chrome Web Store.'
    );
  }

  const accessObj = await requestAccess();

  // Freighter v6+ returns { address } or { publicKey } or a string
  let address = accessObj;
  if (typeof accessObj === 'object' && accessObj !== null) {
    if (accessObj.error) throw new Error(accessObj.error);
    address = accessObj.address || accessObj.publicKey || '';
  }

  if (!address || typeof address !== 'string' || address.length !== 56) {
    throw new Error(
      'Could not get your public key. Make sure Freighter is unlocked and set to Test Net.'
    );
  }

  return address;
}

/** Create a Soroban RPC server instance */
function getServer() {
  return new StellarSdk.rpc.Server(TESTNET_RPC);
}

/** Create a Contract instance */
function getContract(contractId = CONTRACT_ID) {
  return new StellarSdk.Contract(contractId);
}

/** Fetch the current counter value (read-only, no signing needed) */
export async function getCount(contractId = CONTRACT_ID) {
  const server = getServer();
  const contract = getContract(contractId);

  // Build a dummy source account for simulation
  const dummyAccount = new StellarSdk.Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    '0'
  );

  const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(contract.call('get_count'))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (
    StellarSdk.rpc.Api.isSimulationError(simResult)
  ) {
    throw new Error('Simulation error: ' + (simResult.error || 'unknown'));
  }

  if (simResult.result?.retval) {
    return Number(StellarSdk.scValToNative(simResult.result.retval));
  }

  return 0;
}

/** Increment the counter (requires signing) */
export async function incrementCounter(userAddress, contractId = CONTRACT_ID) {
  const server = getServer();
  const contract = getContract(contractId);

  // 1. Get user account (auto-fund if needed)
  let account;
  try {
    account = await server.getAccount(userAddress);
  } catch {
    // Attempt friendbot funding
    try {
      await fetch(`https://friendbot.stellar.org/?addr=${userAddress}`);
      await new Promise((r) => setTimeout(r, 3000));
      account = await server.getAccount(userAddress);
    } catch {
      throw new Error(
        'Account not funded on Testnet. Visit https://laboratory.stellar.org to fund it.'
      );
    }
  }

  // 2. Build transaction
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(contract.call('increment'))
    .setTimeout(30)
    .build();

  // 3. Prepare transaction (simulation + assembly + auth in one step)
  const preparedTx = await server.prepareTransaction(tx);

  // 4. Sign with Freighter
  const xdr = preparedTx.toXDR();
  const signResult = await signTransaction(xdr, {
    networkPassphrase: TESTNET_PASSPHRASE,
  });

  // Extract signed XDR from response
  let signedXdr;
  if (typeof signResult === 'string') {
    signedXdr = signResult;
  } else if (signResult?.signedTxXdr) {
    signedXdr = signResult.signedTxXdr;
  } else if (signResult?.signedXDR) {
    signedXdr = signResult.signedXDR;
  } else {
    throw new Error('Signing cancelled or failed.');
  }

  // 5. Submit
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    TESTNET_PASSPHRASE
  );
  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    throw new Error('Transaction submission failed.');
  }

  // 6. Poll for result
  let result = await server.getTransaction(sendResponse.hash);
  const maxRetries = 30;
  let retries = 0;

  while (result.status === 'NOT_FOUND' && retries < maxRetries) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await server.getTransaction(sendResponse.hash);
    retries++;
  }

  if (result.status === 'SUCCESS') {
    // Extract return value
    if (result.returnValue) {
      return Number(StellarSdk.scValToNative(result.returnValue));
    }
    return null;
  }

  throw new Error(`Transaction failed with status: ${result.status}`);
}
