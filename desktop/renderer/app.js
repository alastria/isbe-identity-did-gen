'use strict';

// All dynamic values are written with textContent, never HTML interpolation.
const $ = (id) => document.getElementById(id);
const bridge = window.didgen;
const paths = { keystore: null, unsigned: null, generate: null, import: null };
let exportedTimer;

function notify(message, good = false) {
  const notice = $('notice');
  notice.textContent = message;
  notice.classList.toggle('good', good);
  notice.hidden = false;
  if (good) setTimeout(() => { if (notice.textContent === message) notice.hidden = true; }, 4500);
}
function explain(error) {
  const msg = String(error?.message ?? error ?? 'Unknown error');
  return msg.replace(/^Error invoking remote method '[^']+': Error: /, '');
}
async function operation(form, callback) {
  const buttons = [...form.querySelectorAll('button[type=submit]')];
  buttons.forEach((button) => { button.disabled = true; });
  $('notice').hidden = true;
  try { await callback(); }
  catch (error) { notify(explain(error)); }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
}
function clearPassword(...ids) { for (const id of ids) $(id).value = ''; }
function matchesPasswords(first, second) {
  const password = $(first).value;
  if (password !== $(second).value) throw new Error('The passwords do not match.');
  if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
  return password;
}
function renderFields(targetId, heading, fields, actions = []) {
  const container = $(targetId);
  container.replaceChildren();
  const title = document.createElement('h2'); title.textContent = heading;
  container.append(title);
  const list = document.createElement('dl');
  for (const [label, value] of fields) {
    if (value === undefined || value === null || value === '') continue;
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd');
    const text = document.createElement('span'); text.textContent = String(value);
    dd.append(text);
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'copy'; copy.textContent = 'Copy';
    copy.setAttribute('aria-label', `Copy ${label}`);
    copy.addEventListener('click', () => operation(copy.parentElement, async () => {
      await bridge.copy(String(value)); notify(`${label} copied to clipboard.`, true);
    }));
    dd.append(copy); list.append(dt, dd);
  }
  container.append(list);
  if (actions.length) {
    const row = document.createElement('div'); row.className = 'result-actions';
    for (const { label, onClick } of actions) {
      const button = document.createElement('button');
      button.className = 'secondary'; button.type = 'button'; button.textContent = label;
      button.addEventListener('click', async () => {
        try { await onClick(); } catch (error) { notify(explain(error)); }
      });
      row.append(button);
    }
    container.append(row);
  }
  container.hidden = false;
}
function identityFields(details) {
  return [
    ['Keystore', details.file],
    ['Address', details.eoa],
    ['Public key', details.publicKeyHex],
    ['JWK thumbprint / vMethodId', details.thumbprint],
    ['Public JWK', JSON.stringify(details.publicJwk)],
  ];
}

function showView(view) {
  document.querySelector(`.nav-item[data-view="${view}"]`).click();
}

for (const button of document.querySelectorAll('.nav-item')) {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    for (const section of document.querySelectorAll('.view')) {
      section.hidden = section.id !== `view-${view}`;
    }
    for (const item of document.querySelectorAll('.nav-item')) {
      const selected = item === button;
      item.classList.toggle('active', selected);
      if (selected) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    $('notice').hidden = true;
    if (view !== 'export') clearExport();
  });
}

for (const button of document.querySelectorAll('.choose-keystore')) {
  button.addEventListener('click', async () => {
    try {
      const selected = await bridge.selectKeystore();
      if (!selected) return;
      paths.keystore = selected.path;
      for (const el of document.querySelectorAll('.keystore-file')) el.textContent = selected.name;
      $('did-result').hidden = true;
      $('sign-result').hidden = true;
      clearExport();
      notify('Encrypted keystore selected.', true);
    } catch (error) { notify(explain(error)); }
  });
}

$('generate-location').addEventListener('click', async () => {
  try {
    const selected = await bridge.chooseOutput('generate');
    if (selected) { paths.generate = selected.path; $('generate-file').textContent = selected.name; }
  } catch (error) { notify(explain(error)); }
});
$('import-location').addEventListener('click', async () => {
  try {
    const selected = await bridge.chooseOutput('import');
    if (selected) { paths.import = selected.path; $('import-file').textContent = selected.name; }
  } catch (error) { notify(explain(error)); }
});
function showReview(name, s) {
  $('unsigned-file').textContent = name;
  $('sign-reviewed').checked = false;
  $('sign-result').hidden = true;
  const preview = $('review-fields');
  preview.replaceChildren();
  for (const [label, value] of [
    ['Chain ID', s.chainId], ['From', s.from], ['Destination', s.to],
    ['Value (wei)', s.value], ['Nonce', s.nonce], ['Gas limit', s.gasLimit],
    ['Gas price (wei)', s.gasPrice], ['Max fee (wei)', s.maxFeePerGas],
    ['Max priority fee', s.maxPriorityFeePerGas], ['Tx type', s.type],
    ['Function selector', s.selector], ['Calldata bytes', s.calldataBytes],
  ]) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = String(value);
    preview.append(dt, dd);
  }
  $('transaction-review').hidden = false;
}

$('unsigned-location').addEventListener('click', async () => {
  try {
    const selected = await bridge.selectUnsigned();
    if (!selected) return;
    paths.unsigned = selected.path;
    showReview(selected.name, selected.summary);
    notify('Unsigned transaction loaded for review.', true);
  } catch (error) { notify(explain(error)); }
});

// A page such as the evidence gateway's opened an isbe-didgen://sign link.
bridge.onSignLink(({ summary, error }) => {
  showView('sign');
  if (error) { notify(error); return; }
  paths.unsigned = 'link';
  showReview('Transaction from a signing link', summary);
  notify('Transaction received from a signing link. Review it before signing.', true);
});

$('generate-form').addEventListener('submit', (event) => {
  event.preventDefault();
  operation(event.currentTarget, async () => {
    if (!paths.generate) throw new Error('Choose where to save the new keystore.');
    const password = matchesPasswords('generate-password', 'generate-confirm');
    try {
      const details = await bridge.generate(password);
      paths.generate = null; $('generate-file').textContent = 'Choose a new keystore file…';
      renderFields('generate-result', 'Identity created successfully', identityFields(details));
      notify('Keystore created. Back it up before using the DID.', true);
    } finally { clearPassword('generate-password', 'generate-confirm'); }
  });
});

$('did-form').addEventListener('submit', (event) => {
  event.preventDefault();
  operation(event.currentTarget, async () => {
    if (!paths.keystore) throw new Error('Select a keystore first.');
    const password = $('did-password').value;
    try {
      const data = await bridge.did(password, $('did-environment').value);
      renderFields('did-result', 'DID generated successfully', [
        ['DID', data.did], ['Public key', data.publicKey],
        ['Proof', data.proof], ['Address', data.eoa], ['Curve', data.curve],
      ]);
    } finally { clearPassword('did-password'); }
  });
});

$('sign-form').addEventListener('submit', (event) => {
  event.preventDefault();
  operation(event.currentTarget, async () => {
    if (!paths.unsigned) throw new Error('Select an unsigned transaction.');
    if (!paths.keystore) throw new Error('Select a keystore.');
    if (!$('sign-reviewed').checked) throw new Error('Review the transaction before signing.');
    const password = $('sign-password').value;
    try {
      const signed = await bridge.sign(password);
      if (!signed) return; // User cancelled native confirmation.
      renderFields('sign-result', 'Transaction signed locally', [
        ['From', signed.from], ['To', signed.to],
        ['Chain ID', signed.chainId], ['Nonce', signed.nonce],
        ['Signed raw transaction', signed.signedRawTransaction],
      ], [{ label: 'Copy signed transaction', onClick: async () => {
        await bridge.copy(signed.signedRawTransaction);
        notify('Signed transaction copied to clipboard.', true);
      } }, { label: 'Save signed.hex', onClick: async () => {
        const saved = await bridge.saveSigned('hex');
        if (saved) notify('Raw signed transaction saved.', true);
      } }, { label: 'Save API request JSON', onClick: async () => {
        const saved = await bridge.saveSigned('json');
        if (saved) notify('JSON request saved. You can submit it through the existing API workflow.', true);
      } }]);
      notify(signed.copied
        ? 'Signed and copied to the clipboard. Paste it in the page that sent the link. Nothing has been broadcast.'
        : 'Signature ready. Nothing has been broadcast.', true);
    } finally { clearPassword('sign-password'); }
  });
});

$('import-form').addEventListener('submit', (event) => {
  event.preventDefault();
  operation(event.currentTarget, async () => {
    if (!paths.import) throw new Error('Choose where to save the encrypted keystore.');
    const password = matchesPasswords('import-password', 'import-confirm');
    const secret = $('import-private').value;
    $('import-private').value = '';
    try {
      const details = await bridge.importKey(secret, password);
      paths.import = null; $('import-file').textContent = 'Choose a new keystore file…';
      renderFields('import-result', 'Key imported and verified', identityFields(details));
      notify('Encrypted keystore saved. Back it up and remove any unencrypted copies.', true);
    } finally { clearPassword('import-password', 'import-confirm', 'import-private'); }
  });
});

function clearExport() {
  if (exportedTimer) clearTimeout(exportedTimer);
  exportedTimer = undefined;
  const el = $('export-result');
  el.replaceChildren(); el.hidden = true;
}
$('export-form').addEventListener('submit', (event) => {
  event.preventDefault();
  operation(event.currentTarget, async () => {
    if (!paths.keystore) throw new Error('Select a keystore first.');
    const password = $('export-password').value;
    try {
      clearExport();
      const result = await bridge.exportKey(password);
      if (!result) return;
      const target = $('export-result');
      const heading = document.createElement('h2'); heading.textContent = 'Private key available temporarily';
      const note = document.createElement('p');
      note.textContent = `Address: ${result.address}. This key is hidden and cleared from this view after 30 seconds.`;
      const input = document.createElement('input');
      input.className = 'private-output'; input.readOnly = true;
      input.type = 'password'; input.value = result.privateKeyHex;
      input.setAttribute('aria-label', 'Unencrypted private key');
      const controls = document.createElement('div'); controls.className = 'secret-actions';
      const reveal = document.createElement('button'); reveal.type = 'button'; reveal.className = 'secondary'; reveal.textContent = 'Reveal / hide';
      reveal.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; });
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'secondary'; copy.textContent = 'Copy private key';
      copy.addEventListener('click', async () => {
        try { await bridge.copy(input.value, true); notify('Copied. Clipboard will clear after 30 seconds if unchanged.', true); }
        catch (error) { notify(explain(error)); }
      });
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'secondary'; dismiss.textContent = 'Clear now';
      dismiss.addEventListener('click', () => { input.value = ''; clearExport(); });
      controls.append(reveal, copy, dismiss); target.append(heading, note, input, controls);
      target.hidden = false;
      exportedTimer = setTimeout(() => { input.value = ''; clearExport(); }, 30_000);
    } finally { clearPassword('export-password'); }
  });
});
