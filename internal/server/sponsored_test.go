package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFetchSponsoredMaintainersUsesSupportedSponsorshipArguments(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("unexpected request method or auth header: %s %q", r.Method, r.Header.Get("Authorization"))
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(body), "includePrivate") || !strings.Contains(string(body), "sponsorshipsAsSponsor(first: 100, after: $after, activeOnly: true)") {
			t.Fatalf("GraphQL query must use supported sponsorship arguments: %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":{"viewer":{"sponsorshipsAsSponsor":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[{"sponsorable":{"__typename":"User","id":"U_1","login":"maintainer","name":"Maintainer Name","avatarUrl":"https://avatars.example/1","url":"https://github.com/maintainer","bio":"Builds useful tools"}},{"sponsorable":{"__typename":"Organization","id":"O_1","login":"org-maintainer","name":"Maintainer Org","avatarUrl":"https://avatars.example/2","url":"https://github.com/org-maintainer","description":"Community projects"}}]}}}}`)
	}))
	defer server.Close()

	items, err := fetchSponsoredMaintainers(context.Background(), server.Client(), server.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d sponsored maintainers, want 2", len(items))
	}
	if items[0].Login != "maintainer" || items[0].Bio != "Builds useful tools" || items[0].HTMLURL != "https://github.com/maintainer" {
		t.Fatalf("unexpected user sponsorship result: %#v", items[0])
	}
	if items[1].Login != "org-maintainer" || items[1].Bio != "Community projects" {
		t.Fatalf("unexpected organization sponsorship result: %#v", items[1])
	}
}

func TestFetchActivelySponsoredReposVerifiesSponsorAndOwner(t *testing.T) {
	repositoryLookupCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("missing viewer authorization on %s", r.URL.Path)
		}
		if r.URL.Path == "/graphql" {
			_, _ = io.WriteString(w, `{"data":{"viewer":{"sponsorshipsAsSponsor":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[{"sponsorable":{"__typename":"User","id":"U_1","login":"sponsor","name":"Sponsor","avatarUrl":"https://avatars.example/1","url":"https://github.com/sponsor","bio":""}}]}}}}`)
			return
		}
		if r.URL.Path == "/user/repos" {
			repositoryLookupCalled = true
			_, _ = io.WriteString(w, `[{"id":4,"name":"private-project","full_name":"sponsor/private-project","html_url":"https://github.com/sponsor/private-project","private":true,"owner":{"login":"sponsor"}},{"id":5,"name":"unrelated-private","full_name":"someone-else/unrelated-private","private":true,"owner":{"login":"someone-else"}}]`)
			return
		}
		if r.URL.Path != "/users/sponsor/repos" || r.URL.Query().Get("type") != "owner" {
			t.Fatalf("unexpected repository lookup: %s", r.URL.String())
		}
		repositoryLookupCalled = true
		_, _ = io.WriteString(w, `[
			{"id":1,"name":"owned","full_name":"sponsor/owned","html_url":"https://github.com/sponsor/owned","private":false,"stargazers_count":42,"owner":{"login":"sponsor","avatar_url":"https://avatars.example/1"}},
			{"id":2,"name":"secret","full_name":"sponsor/secret","html_url":"https://github.com/sponsor/secret","private":true,"owner":{"login":"sponsor"}},
			{"id":3,"name":"other","full_name":"someone-else/other","html_url":"https://github.com/someone-else/other","private":false,"owner":{"login":"someone-else"}}
		]`)
	}))
	defer server.Close()

	items, err := fetchActivelySponsoredRepos(context.Background(), server.Client(), server.URL+"/graphql", server.URL, "test-token", "Sponsor")
	if err != nil {
		t.Fatal(err)
	}
	if !repositoryLookupCalled || len(items) != 2 || items[0]["full_name"] != "sponsor/owned" || items[1]["full_name"] != "sponsor/private-project" || items[1]["private"] != true {
		t.Fatalf("expected sponsor-owned public and accessible private repositories only, lookup=%v items=%#v", repositoryLookupCalled, items)
	}
}

func TestFetchActivelySponsoredReposRejectsNonSponsorsBeforeListing(t *testing.T) {
	repositoryLookupCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/graphql" {
			_, _ = io.WriteString(w, `{"data":{"viewer":{"sponsorshipsAsSponsor":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[]}}}}`)
			return
		}
		repositoryLookupCalled = true
	}))
	defer server.Close()

	_, err := fetchActivelySponsoredRepos(context.Background(), server.Client(), server.URL+"/graphql", server.URL, "test-token", "not-sponsored")
	if err != errNotActivelySponsored || repositoryLookupCalled {
		t.Fatalf("expected sponsorship rejection before repo lookup, error=%v lookup=%v", err, repositoryLookupCalled)
	}
}

func TestFetchSponsoredMaintainersPropagatesGraphQLErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"errors":[{"message":"Resource not accessible"}]}`)
	}))
	defer server.Close()

	_, err := fetchSponsoredMaintainers(context.Background(), server.Client(), server.URL, "test-token")
	if err == nil || !strings.Contains(err.Error(), "Resource not accessible") {
		t.Fatalf("got error %v, want GraphQL authorization error", err)
	}
}

func TestCommitGitHubFileRequiresLinkedOwnerBeforeNetwork(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	defer server.Close()
	_, err := commitGitHubFile(context.Background(), server.Client(), server.URL, "token", "actual-owner", githubFileCommit{Owner: "other", Repo: "project", Path: "README.md", SHA: "abc", Message: "update"})
	if err == nil || called {
		t.Fatalf("expected linked-account ownership rejection before network, err=%v called=%v", err, called)
	}
}

func TestCommitGitHubFileRequiresPushAndSendsContentsCommit(t *testing.T) {
	putCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token" {
			t.Fatalf("missing token on %s", r.URL.Path)
		}
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, `{"permissions":{"push":true}}`)
			return
		}
		if r.Method != http.MethodPut || r.URL.Path != "/repos/owner/project/contents/docs/guide.md" {
			t.Fatalf("unexpected commit request %s %s", r.Method, r.URL.Path)
		}
		var body struct{ Message, Content, SHA, Branch string }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		decoded, err := base64.StdEncoding.DecodeString(body.Content)
		if err != nil || string(decoded) != "updated text" || body.SHA != "old-sha" || body.Branch != "main" || body.Message != "Update guide" {
			t.Fatalf("unexpected commit body: %#v decoded=%q err=%v", body, decoded, err)
		}
		putCalled = true
		_, _ = io.WriteString(w, `{"commit":{"html_url":"https://github.com/owner/project/commit/new"}}`)
	}))
	defer server.Close()
	result, err := commitGitHubFile(context.Background(), server.Client(), server.URL, "token", "owner", githubFileCommit{Owner: "owner", Repo: "project", Path: "docs/guide.md", Content: "updated text", Message: "Update guide", SHA: "old-sha", Branch: "main"})
	if err != nil || !putCalled || result["commit"] == nil {
		t.Fatalf("expected successful contents commit, result=%#v put=%v err=%v", result, putCalled, err)
	}
}

func TestCommitGitHubFileRejectsRepositoryWithoutPushPermission(t *testing.T) {
	putCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			putCalled = true
		}
		_, _ = io.WriteString(w, `{"permissions":{"push":false}}`)
	}))
	defer server.Close()
	_, err := commitGitHubFile(context.Background(), server.Client(), server.URL, "token", "owner", githubFileCommit{Owner: "owner", Repo: "project", Path: "README.md", Content: "x", Message: "x", SHA: "sha"})
	if err == nil || putCalled {
		t.Fatalf("expected push permission rejection without commit, err=%v put=%v", err, putCalled)
	}
}
