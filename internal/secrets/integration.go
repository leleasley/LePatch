package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"golang.org/x/crypto/scrypt"
)

// DecryptIntegrationValue reads the AES-256-GCM value written by the existing
// Legacy application: ivHex:tagHex:ciphertextHex, with Node scrypt defaults.
func DecryptIntegrationValue(encryptionKey, value string) (string, error) {
	if encryptionKey == "" {
		return "", fmt.Errorf("ENCRYPTION_KEY is required to read the linked GitHub account")
	}
	parts := strings.Split(value, ":")
	if len(parts) != 3 {
		return "", fmt.Errorf("encrypted value has an unsupported format")
	}
	iv, err := hex.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode encrypted value")
	}
	tag, err := hex.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode encrypted value")
	}
	body, err := hex.DecodeString(parts[2])
	if err != nil {
		return "", fmt.Errorf("decode encrypted value")
	}
	key, err := scrypt.Key([]byte(encryptionKey), []byte("lepatch-salt"), 1<<14, 8, 1, 32)
	if err != nil {
		return "", fmt.Errorf("derive integration key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("initialize integration cipher")
	}
	aead, err := cipher.NewGCMWithNonceSize(block, len(iv))
	if err != nil {
		return "", fmt.Errorf("initialize integration cipher")
	}
	plain, err := aead.Open(nil, iv, append(body, tag...), nil)
	if err != nil {
		return "", fmt.Errorf("decrypt integration value")
	}
	return string(plain), nil
}

// EncryptIntegrationValue writes the AES-256-GCM format used by the existing
// application so the migrated integration settings remain interoperable.
func EncryptIntegrationValue(encryptionKey, value string) (string, error) {
	if encryptionKey == "" {
		return "", fmt.Errorf("ENCRYPTION_KEY is required to store integration credentials")
	}
	key, err := scrypt.Key([]byte(encryptionKey), []byte("lepatch-salt"), 1<<14, 8, 1, 32)
	if err != nil {
		return "", fmt.Errorf("derive integration key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("initialize integration cipher")
	}
	aead, err := cipher.NewGCMWithNonceSize(block, 16)
	if err != nil {
		return "", fmt.Errorf("initialize integration cipher")
	}
	iv := make([]byte, aead.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", fmt.Errorf("generate integration nonce")
	}
	sealed := aead.Seal(nil, iv, []byte(value), nil)
	body, tag := sealed[:len(sealed)-aead.Overhead()], sealed[len(sealed)-aead.Overhead():]
	return hex.EncodeToString(iv) + ":" + hex.EncodeToString(tag) + ":" + hex.EncodeToString(body), nil
}
