package server

import (
	"net/http/httptest"
	"testing"
)

func TestGitHubReadmeEndpointIncludesRequestedRef(t *testing.T) {
	request := httptest.NewRequest("GET", "/api/github/readme?owner=octo&repo=project&ref=release%2Fv1", nil)
	endpoint, err := githubEndpoint(request, request.URL.Query().Get("owner"), request.URL.Query().Get("repo"))
	if err != nil {
		t.Fatal(err)
	}
	if endpoint != "repos/octo/project/readme?ref=release%2Fv1" {
		t.Fatalf("README endpoint = %q", endpoint)
	}
}
