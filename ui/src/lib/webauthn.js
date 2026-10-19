// WebAuthn helpers for passkey registration and sign in.

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeBase64Url(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function publicKeyOptions(options, creation = false) {
  const key = { ...options, challenge: decodeBase64Url(options.challenge) };
  if (creation) {
    key.user = { ...options.user, id: decodeBase64Url(options.user.id) };
    key.excludeCredentials = (options.excludeCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }));
  } else {
    key.allowCredentials = (options.allowCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }));
  }
  return key;
}

export function serializeCredential(credential) {
  const response = { clientDataJSON: encodeBase64Url(credential.response.clientDataJSON) };
  if ('attestationObject' in credential.response) response.attestationObject = encodeBase64Url(credential.response.attestationObject);
  if ('authenticatorData' in credential.response) response.authenticatorData = encodeBase64Url(credential.response.authenticatorData);
  if ('signature' in credential.response) response.signature = encodeBase64Url(credential.response.signature);
  if ('userHandle' in credential.response) response.userHandle = credential.response.userHandle ? encodeBase64Url(credential.response.userHandle) : null;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response,
    clientExtensionResults: credential.getClientExtensionResults(),
    transports: credential.response.getTransports?.() || [],
  };
}

export function passkeysSupported() {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential) && Boolean(navigator.credentials);
}
