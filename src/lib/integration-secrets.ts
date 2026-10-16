import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

const encryptedIntegrationSettings = new Set([
  "github:token",
  "github:oauthClientSecret",
  "discord:webhookUrl",
  "telegram:botToken",
  "telegram:chatId",
  "telegram:webhookSecret",
]);

export function shouldEncryptIntegrationSetting(provider: string, key: string) {
  return encryptedIntegrationSettings.has(`${provider}:${key}`);
}

export async function getIntegrationSettingValue(provider: string, key: string): Promise<string | null> {
  const setting = await prisma.integrationSetting.findUnique({
    where: { provider_key: { provider, key } },
  });

  if (!setting || !setting.value) return null;
  if (setting.encrypted) return decrypt(setting.value);

  if (shouldEncryptIntegrationSetting(provider, key)) {
    const plaintext = setting.value;
    const encrypted = encrypt(plaintext);
    prisma.integrationSetting.update({
      where: { id: setting.id },
      data: { value: encrypted, encrypted: true },
    }).catch(() => {});
    return plaintext;
  }

  return setting.value;
}

export async function upsertIntegrationSetting(provider: string, key: string, value: string) {
  const encrypted = shouldEncryptIntegrationSetting(provider, key);
  const storedValue = encrypted ? encrypt(value) : value;

  return prisma.integrationSetting.upsert({
    where: { provider_key: { provider, key } },
    update: { value: storedValue, encrypted },
    create: { provider, key, value: storedValue, encrypted },
  });
}
