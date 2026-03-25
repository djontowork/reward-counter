// =============================================
// Reward Counter DApp - main.js
// =============================================
// This script handles two modes:
//   1. LIVE MODE  - If Freighter wallet extension is detected,
//                   it connects to the real Soroban testnet contract.
//   2. DEMO MODE  - If Freighter is NOT installed, it uses
//                   localStorage to simulate the counter so you
//                   can still see the UI in action.
// =============================================

window.onload = () => {
    // --- DOM Elements ---
    const connectBtn    = document.getElementById('connectBtn');
    const getBtn        = document.getElementById('getBtn');
    const incrementBtn  = document.getElementById('incrementBtn');
    const contractIdInput = document.getElementById('contractIdInput');
    const setupSection  = document.getElementById('setupSection');
    const dappSection   = document.getElementById('dappSection');
    const countDisplay  = document.getElementById('countDisplay');
    const addressDisplay = document.getElementById('addressDisplay');
    const statusMsg     = document.getElementById('statusMsg');

    let userAddress = null;
    let isLiveMode  = false; // true if Freighter is available

    // Soroban testnet RPC
    const TESTNET_RPC = "https://soroban-testnet.stellar.org";
    const setStatus = (msg) => { statusMsg.innerText = msg; };

    // =============================================
    // CONNECT BUTTON
    // =============================================
    connectBtn.onclick = async () => {
        try {
            if (!contractIdInput.value.trim()) {
                setStatus("⚠️ Please enter a Contract ID first.");
                return;
            }

            // Check if Freighter extension exists
            if (window.freighterApi && typeof window.freighterApi.isConnected === 'function') {
                const connected = await window.freighterApi.isConnected();
                if (connected) {
                    try {
                        const isAllowed = await window.freighterApi.setAllowed();
                        if (isAllowed) {
                            const pubKey = await window.freighterApi.getPublicKey();
                            userAddress = pubKey;
                            isLiveMode = true;
                            addressDisplay.innerText = `🟢 Live: ${userAddress.substring(0, 6)}...${userAddress.slice(-4)}`;
                            setStatus("✅ Connected to Freighter wallet!");
                        } else {
                            setStatus("❌ Wallet connection was rejected.");
                            return;
                        }
                    } catch (e) {
                        console.warn("Freighter connect error, falling back to demo mode:", e);
                        enterDemoMode();
                    }
                } else {
                    enterDemoMode();
                }
            } else {
                // No Freighter at all → demo mode
                enterDemoMode();
            }

            // Show the DApp section
            setupSection.style.display = 'none';
            dappSection.style.display  = 'block';
            await refreshCount();

        } catch (e) {
            console.error(e);
            setStatus("Error: " + e.message);
        }
    };

    function enterDemoMode() {
        isLiveMode  = false;
        userAddress = "GDEMO000000000000000000000000000000000000000000000000000";
        addressDisplay.innerText = "🟡 Demo Mode (no Freighter detected)";
        setStatus("Running in Demo Mode — counter is stored locally.");
    }

    // =============================================
    // REFRESH COUNT BUTTON
    // =============================================
    getBtn.onclick = async () => { await refreshCount(); };

    async function refreshCount() {
        try {
            setStatus("Fetching current count...");
            getBtn.disabled = true;
            incrementBtn.disabled = true;

            if (isLiveMode) {
                // --- LIVE: query Soroban RPC ---
                const server = new window.StellarSdk.SorobanRpc.Server(TESTNET_RPC);
                const networkPassphrase = window.StellarSdk.Networks.TESTNET;
                const contractId = contractIdInput.value.trim();
                const contract = new window.StellarSdk.Contract(contractId);

                const txBuilder = new window.StellarSdk.TransactionBuilder(
                    new window.StellarSdk.Account(userAddress, "0"),
                    { fee: "100", networkPassphrase }
                );
                txBuilder.addOperation(contract.call("get_count"));
                const dummyTx = txBuilder.setTimeout(30).build();

                const simResponse = await server.simulateTransaction(dummyTx);
                if (simResponse.result && simResponse.result.retval) {
                    const value = window.StellarSdk.scValToNative(simResponse.result.retval);
                    countDisplay.innerText = value;
                    setStatus("✅ Count updated from blockchain.");
                } else {
                    setStatus("⚠️ Could not read count. Is the contract deployed?");
                }
            } else {
                // --- DEMO: read from localStorage ---
                const count = parseInt(localStorage.getItem("reward_counter_demo") || "0", 10);
                countDisplay.innerText = count;
                setStatus("✅ Count loaded (demo mode).");
            }
        } catch (e) {
            console.error(e);
            setStatus("Error reading count: " + e.message);
            countDisplay.innerText = "Err";
        } finally {
            getBtn.disabled = false;
            incrementBtn.disabled = false;
        }
    }

    // =============================================
    // INCREMENT BUTTON
    // =============================================
    incrementBtn.onclick = async () => { await executeIncrement(); };

    async function executeIncrement() {
        try {
            setStatus("Preparing increment...");
            getBtn.disabled = true;
            incrementBtn.disabled = true;

            if (isLiveMode) {
                // --- LIVE: send Soroban transaction ---
                const server = new window.StellarSdk.SorobanRpc.Server(TESTNET_RPC);
                const networkPassphrase = window.StellarSdk.Networks.TESTNET;
                const contractId = contractIdInput.value.trim();
                const contract = new window.StellarSdk.Contract(contractId);

                let account;
                try {
                    account = await server.getAccount(userAddress);
                } catch (e) {
                    setStatus("⚠️ Account not found. Fund it on testnet first.");
                    account = new window.StellarSdk.Account(userAddress, "0");
                }

                let tx = new window.StellarSdk.TransactionBuilder(account, {
                    fee: "10000",
                    networkPassphrase
                })
                .addOperation(contract.call("increment"))
                .setTimeout(30)
                .build();

                setStatus("Simulating transaction...");
                const simResponse = await server.simulateTransaction(tx);

                if (window.StellarSdk.SorobanRpc.Api.isSimulationError(simResponse)) {
                    setStatus("Simulation Error: " + simResponse.error);
                    return;
                }

                tx = window.StellarSdk.SorobanRpc.assembleTransaction(tx, networkPassphrase, simResponse).build();

                setStatus("⏳ Waiting for wallet signature...");
                const signedXdr = await window.freighterApi.signTransaction(tx.toXDR(), "TESTNET");
                const signedTx = window.StellarSdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

                setStatus("📡 Sending to network...");
                const sendResponse = await server.sendTransaction(signedTx);

                if (sendResponse.status === "PENDING") {
                    setStatus("⏳ Waiting for confirmation...");
                    let txStatus = await server.getTransaction(sendResponse.hash);
                    while (txStatus.status === "NOT_FOUND") {
                        await new Promise(r => setTimeout(r, 2000));
                        txStatus = await server.getTransaction(sendResponse.hash);
                    }
                    if (txStatus.status === "SUCCESS") {
                        setStatus("🎉 Increment successful!");
                        await refreshCount();
                        return;
                    }
                }
                setStatus("❌ Transaction failed.");
            } else {
                // --- DEMO: increment in localStorage ---
                let count = parseInt(localStorage.getItem("reward_counter_demo") || "0", 10);
                count += 1;
                localStorage.setItem("reward_counter_demo", count.toString());
                countDisplay.innerText = count;
                setStatus("🎉 Incremented! (demo mode)");
            }
        } catch (e) {
            console.error(e);
            setStatus("Error: " + e.message);
        } finally {
            getBtn.disabled = false;
            incrementBtn.disabled = false;
        }
    }
};
