package auth

import (
	"testing"
	"time"
)

func TestPreAuthTokenIsPurposeBoundAndExpires(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	token, err := CreatePreAuthToken("user-1", "mfa", []byte("session secret"), now)
	if err != nil {
		t.Fatal(err)
	}
	claims, ok := VerifyPreAuthToken(token, []byte("session secret"), now.Add(time.Minute))
	if !ok || claims.UserID != "user-1" || claims.Purpose != "mfa" {
		t.Fatalf("valid token claims = %#v, ok=%t", claims, ok)
	}
	if _, ok := VerifyPreAuthToken(token, []byte("another secret"), now); ok {
		t.Fatal("token must not verify under a different signing key")
	}
	if _, ok := VerifyPreAuthToken(token, []byte("session secret"), now.Add(6*time.Minute)); ok {
		t.Fatal("expired token must not verify")
	}
}

func TestVerifyTOTP(t *testing.T) {
	// RFC 6238 SHA-1 sample, truncated to the app's six digit format.
	if !VerifyTOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", time.Unix(59, 0)) {
		t.Fatal("valid RFC TOTP was rejected")
	}
	if VerifyTOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "000000", time.Unix(59, 0)) {
		t.Fatal("invalid TOTP was accepted")
	}
}

func TestConsumeRecoveryCode(t *testing.T) {
	hashes := `["` + HashRecoveryCode("A8bd7qJz") + `","` + HashRecoveryCode("other-code") + `"]`
	remaining, ok := ConsumeRecoveryCode("A8bd7qJz", hashes)
	if !ok || remaining != `["`+HashRecoveryCode("other-code")+`"]` {
		t.Fatalf("recovery code result = %q, ok=%t", remaining, ok)
	}
	if _, ok := ConsumeRecoveryCode("A8bd7qJz", remaining); ok {
		t.Fatal("a consumed recovery code was accepted again")
	}
}
