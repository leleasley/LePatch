package worker

import (
	"context"
	"testing"

	"lepatch/internal/secrets"
	"lepatch/internal/store"
)

// The release poller must use the account's own GitHub token so it can read
// private and sponsored repositories. The shared installation token cannot
// see them and GitHub answers with a 404.
func TestRepositoryTokenPrefersTheLinkedAccount(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	encryptionKey := "unit-test-encryption-key"
	linked, err := secrets.EncryptIntegrationValue(encryptionKey, "linked-user-token")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Test','test@example.test','hash','user')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "GitHubLink" (id,userId,githubUserId,githubUsername,accessToken) VALUES ('link-1','user-1',42,'octocat',?)`, linked); err != nil {
		t.Fatal(err)
	}

	runner := &Runner{db: db.DB(), token: "shared-installation-token", encryptionKey: encryptionKey}
	if token := runner.repositoryToken(ctx, "user-1"); token != "linked-user-token" {
		t.Fatalf("expected the linked account token, got %q", token)
	}

	// An account with no GitHub connection falls back to the shared token.
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-2','Other','other@example.test','hash','user')`); err != nil {
		t.Fatal(err)
	}
	if token := runner.repositoryToken(ctx, "user-2"); token != "shared-installation-token" {
		t.Fatalf("expected the shared token as a fallback, got %q", token)
	}
}
