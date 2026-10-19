package worker

import "testing"

func TestFirstRepositoryImagePrefersLogoAndIgnoresBadges(t *testing.T) {
	readme := `![build](https://img.shields.io/badge/build-passing-green)\n![project logo](../assets/sonarr-logo.png)`
	got := firstRepositoryImage(readme, "https://raw.githubusercontent.com/Sonarr/Sonarr/develop/README.md")
	want := "https://raw.githubusercontent.com/Sonarr/Sonarr/assets/sonarr-logo.png"
	if got != want {
		t.Fatalf("logo extraction = %q, want %q", got, want)
	}
}

func TestFirstRepositoryImageRejectsUntrustedHosts(t *testing.T) {
	readme := `![logo](https://example.com/project.png)`
	if got := firstRepositoryImage(readme, "https://raw.githubusercontent.com/owner/repo/main/README.md"); got != "" {
		t.Fatalf("external image host should not be used, got %q", got)
	}
}
