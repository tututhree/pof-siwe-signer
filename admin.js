let entryCount = 1;

document.getElementById('addEntryBtn').onclick = () => {
  if (typeof ethers === 'undefined' || typeof bs58 === 'undefined' || typeof nacl === 'undefined') {
    alert('Error: Required libraries (ethers, bs58, or nacl) failed to load.');
    return;
  }
  const entries = document.getElementById('entries');
  const newEntry = document.createElement('div');
  newEntry.className = 'entry';
  newEntry.innerHTML = `
    <label for="success${entryCount}">Success Output:</label>
    <textarea id="success${entryCount}" rows="8" placeholder="Paste full 'Success' output from siwe-sign.html"></textarea><br>
    <button onclick="this.parentElement.remove()">Remove</button>
  `;
  entries.appendChild(newEntry);
  entryCount++;
};

function isValidAddress(address, chain) {
  if (typeof ethers === 'undefined' || typeof bs58 === 'undefined') {
    alert('Error: Required libraries (ethers or bs58) failed to load.');
    return false;
  }
  if (chain === 'ethereum') {
    return ethers.utils.isAddress(address);
  } else if (chain === 'solana') {
    try {
      const decoded = bs58.decode(address);
      return decoded.length === 32;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function normalizeMessage(message, address, chain) {
  const timestampMatch = message.match(/Issued At: ([^\s]+)/);
  const timestamp = timestampMatch ? timestampMatch[1] : '';
  const lines = [
    `PoF-Group-2025 wants you to sign in with your ${chain.charAt(0).toUpperCase() + chain.slice(1)} account:`,
    address,
    "I consent to include my wallet address in the PoF Group 2025 bundle for aggregate proof of funds verification as of 2025-09-18.",
    "Bundle ID: pof-group-2025-v1",
    `Chain: ${chain === 'ethereum' ? '1' : 'solana'}`,
    "Version: 1",
    `Issued At: ${timestamp}`
  ];
  return lines.join('\n');
}

function isValidMessage(message, address, chain) {
  const expectedPrefix = `PoF-Group-2025 wants you to sign in with your ${chain.charAt(0).toUpperCase() + chain.slice(1)} account:`;
  return message.includes(expectedPrefix) && message.includes('Bundle ID: pof-group-2025-v1');
}

function parseSuccessMessage(successText) {
  const addressMatch = successText.match(/Address: ([^\n]+)/);
  const chainMatch = successText.match(/Chain: ([^\n]+)/);
  const messageMatch = successText.match(/Consent Message: ((?:.|\n)+?)(?:\nSignature:|$)/);
  const signatureMatch = successText.match(/Signature: ([^\n]+)/);
  if (!addressMatch || !chainMatch || !messageMatch || !signatureMatch) {
    return null;
  }
  const address = addressMatch[1].trim();
  const chain = chainMatch[1].trim();
  const message = messageMatch[1].trim();
  const signature = signatureMatch[1].trim();
  return { address, chain, message, signature };
}

document.getElementById('generateJsonBtn').onclick = () => {
  if (typeof ethers === 'undefined' || typeof bs58 === 'undefined') {
    alert('Error: Required libraries (ethers or bs58) failed to load.');
    return;
  }
  const consents = [];
  const result = document.getElementById('result');
  result.className = '';
  let valid = true;
  const existingEntries = document.querySelectorAll('#entries .entry');

  for (let i = 0; i < existingEntries.length; i++) {
    const textarea = existingEntries[i].querySelector('textarea');
    const successText = textarea.value.trim();
    if (!successText) continue;

    const parsed = parseSuccessMessage(successText);
    if (!parsed) {
      result.innerHTML = `Error: Invalid success message format for entry ${i + 1}. Ensure it includes Address, Chain, Consent Message, and Signature.`;
      result.className = 'error';
      valid = false;
      break;
    }

    let { address, chain, message, signature } = parsed;
    message = normalizeMessage(message, address, chain);

    if (!isValidAddress(address, chain)) {
      result.innerHTML = `Error: Invalid ${chain} address for entry ${i + 1}.`;
      result.className = 'error';
      valid = false;
      break;
    }
    if (!isValidMessage(message, address, chain)) {
      result.innerHTML = `Error: Invalid message format for entry ${i + 1}.`;
      result.className = 'error';
      valid = false;
      break;
    }
    if (chain === 'ethereum' && !signature.startsWith('0x')) {
      result.innerHTML = `Error: Invalid Ethereum signature format for entry ${i + 1}.`;
      result.className = 'error';
      valid = false;
      break;
    }
    if (chain === 'solana') {
      try {
        bs58.decode(signature);
      } catch (e) {
        result.innerHTML = `Error: Invalid Solana signature format for entry ${i + 1}.`;
        result.className = 'error';
        valid = false;
        break;
      }
    }
    consents.push({
      address,
      chain,
      message,
      signature,
      bundleId: 'pof-group-2025-v1'
    });
  }

  if (valid && consents.length > 0) {
    const jsonAction = document.getElementById('jsonAction').value;
    const consentsJsonEl = document.getElementById('consentsJson');
    let existingConsents = [];
    try {
      if (jsonAction === 'add' && consentsJsonEl.value.trim()) {
        existingConsents = JSON.parse(consentsJsonEl.value);
        if (!Array.isArray(existingConsents)) throw new Error('Existing JSON is not an array');
      }
    } catch (e) {
      result.innerHTML = `Error: Invalid existing JSON in Verifier section - ${e.message}`;
      result.className = 'error';
      return;
    }
    const newConsents = jsonAction === 'add' ? [...existingConsents, ...consents] : consents;
    consentsJsonEl.value = JSON.stringify(newConsents, null, 2);
    result.innerHTML = 'Consent generated successfully and sent to Verify section!';
    result.className = 'success';
  } else if (valid && consents.length === 0) {
    result.innerHTML = 'Error: No valid entries provided.';
    result.className = 'error';
  }
};

document.getElementById('jsonFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('consentsJson').value = e.target.result;
    };
    reader.readAsText(file);
  }
});

async function verify() {
  if (typeof ethers === 'undefined' || typeof bs58 === 'undefined' || typeof nacl === 'undefined') {
    alert('Error: Required libraries (ethers, bs58, or nacl) failed to load.');
    return;
  }
  const jsonStr = document.getElementById('consentsJson').value;
  const verifyResultEl = document.getElementById('verifyResult');
  verifyResultEl.className = '';

  if (!jsonStr) {
    verifyResultEl.innerHTML = 'Error: Please paste or upload consents JSON.';
    verifyResultEl.className = 'error';
    return;
  }
  try {
    const consents = JSON.parse(jsonStr);
    let allSignaturesValid = true;
    let output = '<ul>';
    const validAddresses = [];

    for (const consent of consents) {
      const { address, chain, message, signature } = consent;
      let isSignatureValid = false;
      if (chain === 'ethereum') {
        try {
          const recoveredAddress = ethers.utils.verifyMessage(message, signature);
          isSignatureValid = recoveredAddress.toLowerCase() === address.toLowerCase();
        } catch (e) { isSignatureValid = false; }
      } else if (chain === 'solana') {
        try {
          const messageBytes = new TextEncoder().encode(message);
          const signatureBytes = bs58.decode(signature);
          const addressBytes = bs58.decode(address);
          isSignatureValid = nacl.sign.detached.verify(messageBytes, signatureBytes, addressBytes);
        } catch (e) { isSignatureValid = false; }
      }
      if (!isSignatureValid) allSignaturesValid = false;
      output += `<li>${address} (${chain}): ${isSignatureValid ? '✅ Valid' : '❌ Invalid'}</li>`;
      if (isSignatureValid) {
        validAddresses.push(address);
      }
    }
    output += '</ul>';
    output += `<strong>All Signatures Valid: ${allSignaturesValid ? 'Yes' : 'No'}</strong>`;
    verifyResultEl.innerHTML = output;

    const bundleSection = document.getElementById('addToBundleSection');
    if (validAddresses.length > 0) {
      document.getElementById('validAddresses').value = validAddresses.join(', ');
      bundleSection.style.display = 'block';
    } else {
      bundleSection.style.display = 'none';
    }
  } catch (error) {
    verifyResultEl.innerHTML = `Error: Invalid JSON or verification failed - ${error.message}`;
    verifyResultEl.className = 'error';
  }
}
document.getElementById('verifyBtn').onclick = verify;

document.getElementById('copyAddressesBtn').onclick = () => {
  const addressesText = document.getElementById('validAddresses');
  addressesText.select();
  document.execCommand('copy');
  alert('Addresses copied to clipboard!');
};

document.getElementById('openDeBankBtn').onclick = () => {
  window.open('https://debank.com/bundles', '_blank');
};

document.getElementById('openPortfolioBtn').onclick = () => {
  const bundleId = document.getElementById('bundleIdInput').value.trim();
  if (bundleId) {
    window.open(`https://debank.com/bundles/${bundleId}/portfolio`, '_blank');
  } else {
    alert('Enter your Bundle ID first.');
  }
};
