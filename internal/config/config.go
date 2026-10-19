package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	AppURL        *url.URL
	SessionKey    []byte
	EncryptionKey string
	DatabasePath  string
	DataDir       string
	Port          string
	TrustProxy    bool
	GitHubToken   string
}

func Load() (Config, error) {
	appURLText := envOr("APP_URL", "http://localhost:3000")
	appURL, err := url.Parse(appURLText)
	if err != nil || appURL.Scheme == "" || appURL.Host == "" {
		return Config{}, fmt.Errorf("APP_URL must be an absolute URL")
	}
	if appURL.Scheme != "http" && appURL.Scheme != "https" {
		return Config{}, fmt.Errorf("APP_URL must use http or https")
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		if os.Getenv("NODE_ENV") == "production" || os.Getenv("APP_ENV") == "production" {
			return Config{}, fmt.Errorf("SESSION_SECRET is required in production")
		}
		sessionSecret = "development-session-secret-change-me"
	}
	if len(sessionSecret) < 32 && (os.Getenv("NODE_ENV") == "production" || os.Getenv("APP_ENV") == "production") {
		return Config{}, fmt.Errorf("SESSION_SECRET must contain at least 32 bytes in production")
	}

	dataDir := envOr("DATA_DIR", "./data")
	databasePath := envOr("DATABASE_PATH", filepath.Join(dataDir, "lepatch.sqlite"))
	port := strings.TrimPrefix(envOr("PORT", "3000"), ":")
	if port == "" {
		return Config{}, fmt.Errorf("PORT must not be empty")
	}

	return Config{
		AppURL:        appURL,
		SessionKey:    []byte(sessionSecret),
		EncryptionKey: os.Getenv("ENCRYPTION_KEY"),
		DatabasePath:  databasePath,
		DataDir:       dataDir,
		Port:          port,
		TrustProxy:    strings.EqualFold(os.Getenv("TRUST_PROXY"), "true"),
		GitHubToken:   os.Getenv("GITHUB_TOKEN"),
	}, nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
