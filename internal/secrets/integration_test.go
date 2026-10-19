package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"testing"

	"golang.org/x/crypto/scrypt"
)

func TestDecryptIntegrationValue(t *testing.T) {
	key, err := scrypt.Key([]byte("test-key"), []byte("lepatch-salt"), 1<<14, 8, 1, 32)
	if err != nil {
		t.Fatal(err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	aead, err := cipher.NewGCMWithNonceSize(block, 16)
	if err != nil {
		t.Fatal(err)
	}
	iv := []byte("0123456789abcdef")
	sealed := aead.Seal(nil, iv, []byte("linked-token"), nil)
	tagAt := len(sealed) - aead.Overhead()
	encoded := hex.EncodeToString(iv) + ":" + hex.EncodeToString(sealed[tagAt:]) + ":" + hex.EncodeToString(sealed[:tagAt])
	got, err := DecryptIntegrationValue("test-key", encoded)
	if err != nil || got != "linked-token" {
		t.Fatalf("decrypt = %q, %v", got, err)
	}
	if _, err := DecryptIntegrationValue("wrong-key", encoded); err == nil {
		t.Fatal("wrong key must fail authentication")
	}
}

func TestEncryptIntegrationValueRoundTrip(t *testing.T) {
	const key = "test-encryption-key"
	const plain = "github-oauth-secret"
	encrypted, err := EncryptIntegrationValue(key, plain)
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := DecryptIntegrationValue(key, encrypted)
	if err != nil {
		t.Fatal(err)
	}
	if decrypted != plain {
		t.Fatalf("round trip = %q, want %q", decrypted, plain)
	}
}
