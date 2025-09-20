// Wait for the page and all scripts to load
window.addEventListener('load', function() {
  console.log('Page loaded, checking libraries...');

  // Check if libraries are available
  if (typeof ethers === 'undefined' || typeof bs58 === 'undefined' || typeof nacl === 'undefined') {
    console.error('Libraries not loaded:', {
      ethers: typeof ethers,
      bs58: typeof bs58,
      nacl: typeof nacl
    });
    alert('Error: Required libraries failed to load. Please refresh the page.');
    return;
  }

  console.log('All libraries loaded successfully');

  const messageTemplate = (address, chain) => {
    const now = new Date();
    const formattedDate = now.toISOString();
    return `PoF-Group-2025 wants you to sign in with your ${chain.charAt(0).toUpperCase() + chain.slice(1)} account:
${address}
I consent to include my wallet address in the PoF Group 2025 bundle for aggregate proof of funds verification as of 2025-09-18.
Bundle ID: pof-group-2025-v1
Chain: ${chain === 'ethereum' ? '1' : 'solana'}
Version: 1
Issued At: ${formattedDate}`;
  };

  const confirmationMessage = "I confirm that I want to proceed with signing the Proof of Funds consent message.";

  // Set up the button click handler
  const signBtn = document.getElementById('signBtn');
  if (!signBtn) {
    console.error('Sign button not found!');
    return;
  }

  signBtn.onclick = async () => {
    console.log('Sign button clicked');

    const address = document.getElementById('address').value.trim();
    const chain = document.getElementById('chain').value;
    const resultEl = document.getElementById('result');
    resultEl.className = '';

    if (!address) {
      resultEl.innerHTML = 'Error: Please enter your wallet address.';
      resultEl.className = 'error';
      return;
    }

    let provider;
    if (chain === 'ethereum') {
      if (!window.ethereum) {
        resultEl.innerHTML = 'Error: MetaMask not detected! Install and unlock MetaMask.';
        resultEl.className = 'error';
        return;
      }
      provider = window.ethereum;
    } else if (chain === 'solana') {
      if (!window.solana || !window.solana.isPhantom) {
        resultEl.innerHTML = 'Error: Phantom not detected! Install and unlock Phantom.';
        resultEl.className = 'error';
        return;
      }
      provider = window.solana;
    }

    try {
      let connectedAddress;
      if (chain === 'ethereum') {
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        connectedAddress = accounts[0];
      } else {
        const resp = await provider.connect();
        connectedAddress = resp.publicKey.toString();
      }

      if (connectedAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error('Connected wallet does not match entered address.');
      }

      // Confirmation signature step
      if (chain === 'ethereum') {
        await provider.request({
          method: 'personal_sign',
          params: [confirmationMessage, connectedAddress],
        });
      } else {
        const msgUint8 = new TextEncoder().encode(confirmationMessage);
        await provider.signMessage(msgUint8, 'utf8');
      }

      // Actual consent message signature
      const message = messageTemplate(connectedAddress, chain);
      let signature;
      if (chain === 'ethereum') {
        signature = await provider.request({
          method: 'personal_sign',
          params: [message, connectedAddress],
        });
      } else {
        const msgUint8 = new TextEncoder().encode(message);
        const signatureObj = await provider.signMessage(msgUint8, 'utf8');
        signature = bs58.encode(signatureObj.signature);
      }

      resultEl.innerHTML = `
        <strong>Success! Copy the text below and send it to the organizer.</strong><br><br>
        <textarea readonly rows="12" style="width:100%; font-family: monospace;">Address: ${connectedAddress}
Chain: ${chain}
Consent Message: ${message}
Signature: ${signature}</textarea>
      `;
      resultEl.className = 'success';

    } catch (error) {
      resultEl.innerHTML = `Error: ${error.message}`;
      resultEl.className = 'error';
    }
  };

  console.log('Sign button handler attached');
});
