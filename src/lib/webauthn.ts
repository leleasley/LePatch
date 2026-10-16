import crypto from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";

const rpName = "LePatch";
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

function setChallenge(key: string, challenge: string): void {
  challenges.set(key, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
}

function getChallenge(key: string): string {
  const entry = challenges.get(key);
  if (!entry) throw new Error("Challenge not found or expired");
  if (entry.expiresAt < Date.now()) {
    challenges.delete(key);
    throw new Error("Challenge expired");
  }
  challenges.delete(key);
  return entry.challenge;
}

export async function generatePasskeyRegistrationOptions(
  userId: string,
  rpId: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { passkeys: true },
  });
  if (!user) throw new Error("User not found");

  const excludeCredentials = user.passkeys.map((pk) => ({
    id: pk.credentialId,
    transports: pk.transports as AuthenticatorTransportFuture[],
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  setChallenge(userId, options.challenge);

  return options;
}

export async function verifyPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  rpId: string,
  origin: string
) {
  const expectedChallenge = getChallenge(userId);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration verification failed");
  }

  const { credential } = verification.registrationInfo;

  await prisma.passkeyCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports || []) as string[],
    },
  });

  return { verified: true };
}

export async function generatePasskeyAuthOptions(rpId: string) {
  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
  });

  const flowId = crypto.randomUUID();
  setChallenge(flowId, options.challenge);

  return { ...options, flowId };
}

export async function verifyPasskeyAuth(
  flowId: string,
  response: AuthenticationResponseJSON,
  rpId: string,
  origin: string
) {
  const expectedChallenge = getChallenge(flowId);

  const credential = await prisma.passkeyCredential.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });
  if (!credential) throw new Error("Passkey not recognized");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransportFuture[],
    },
  });

  if (!verification.verified) {
    throw new Error("Passkey authentication verification failed");
  }

  await prisma.passkeyCredential.update({
    where: { id: credential.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  return credential.userId;
}
