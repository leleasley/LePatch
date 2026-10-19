package auth

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type PreAuth struct {
	UserID  string `json:"sub"`
	Purpose string `json:"purpose"`
	Expires int64  `json:"exp"`
}

func CreatePreAuthToken(userID, purpose string, key []byte, now time.Time) (string, error) {
	if userID == "" || (purpose != "mfa" && purpose != "mfa_setup") || len(key) == 0 {
		return "", fmt.Errorf("invalid pre-auth token parameters")
	}
	payload, err := json.Marshal(PreAuth{UserID: userID, Purpose: purpose, Expires: now.Add(5 * time.Minute).Unix()})
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func VerifyPreAuthToken(token string, key []byte, now time.Time) (PreAuth, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || len(key) == 0 {
		return PreAuth{}, false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return PreAuth{}, false
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return PreAuth{}, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return PreAuth{}, false
	}
	var claims PreAuth
	if json.Unmarshal(payload, &claims) != nil || claims.UserID == "" || claims.Expires <= now.Unix() || (claims.Purpose != "mfa" && claims.Purpose != "mfa_setup") {
		return PreAuth{}, false
	}
	return claims, true
}

func VerifyTOTP(secret, code string, now time.Time) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}
	for _, char := range code {
		if char < '0' || char > '9' {
			return false
		}
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimRight(strings.TrimSpace(secret), "=")))
	if err != nil || len(key) == 0 {
		return false
	}
	counter := now.Unix() / 30
	for offset := int64(-2); offset <= 2; offset++ {
		var message [8]byte
		binary.BigEndian.PutUint64(message[:], uint64(counter+offset))
		h := hmac.New(sha1.New, key)
		_, _ = h.Write(message[:])
		digest := h.Sum(nil)
		index := digest[len(digest)-1] & 0x0f
		value := binary.BigEndian.Uint32(digest[index:index+4]) & 0x7fffffff
		candidate := fmt.Sprintf("%06d", value%1_000_000)
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(code)) == 1 {
			return true
		}
	}
	return false
}

func ConsumeRecoveryCode(code, serialized string) (string, bool) {
	var hashes []string
	if json.Unmarshal([]byte(serialized), &hashes) != nil || len(hashes) == 0 {
		return serialized, false
	}
	digest := sha256.Sum256([]byte(code))
	provided := hex.EncodeToString(digest[:])
	for index, hash := range hashes {
		if len(hash) == len(provided) && subtle.ConstantTimeCompare([]byte(strings.ToLower(hash)), []byte(provided)) == 1 {
			hashes = append(hashes[:index], hashes[index+1:]...)
			updated, err := json.Marshal(hashes)
			if err != nil {
				return serialized, false
			}
			return string(updated), true
		}
	}
	return serialized, false
}

func HashRecoveryCode(code string) string {
	digest := sha256.Sum256([]byte(code))
	return hex.EncodeToString(digest[:])
}

func ParseRetryAfter(raw string, now time.Time) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if deadline, err := http.ParseTime(raw); err == nil && deadline.After(now) {
		return deadline.Sub(now)
	}
	return 0
}
