package events

import "testing"

func TestPublishIsScopedAndReconnectReplaysEvents(t *testing.T) {
	hub := NewHub(8)
	first, err := hub.Publish("user-a", "watched-app.added", map[string]string{"id": "app-1"})
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != 1 {
		t.Fatalf("first event id = %d, want 1", first.ID)
	}
	if _, err := hub.Publish("user-b", "watched-app.removed", map[string]string{"id": "app-2"}); err != nil {
		t.Fatal(err)
	}
	last, err := hub.Publish("user-a", "release.discovered", map[string]string{"id": "release-1"})
	if err != nil {
		t.Fatal(err)
	}

	stream, cancel := hub.Subscribe("user-a", "1")
	defer cancel()
	got := <-stream
	if got.Name != last.Name || got.ID != last.ID {
		t.Fatalf("replayed event = %#v, want %#v", got, last)
	}
	select {
	case unexpected := <-stream:
		t.Fatalf("received unrelated event: %#v", unexpected)
	default:
	}
}

func TestOldReconnectRequestsRefresh(t *testing.T) {
	hub := NewHub(2)
	for i := 0; i < 4; i++ {
		if _, err := hub.Publish("u1", "watched-app.updated", map[string]int{"n": i}); err != nil {
			t.Fatal(err)
		}
	}
	stream, cancel := hub.Subscribe("u1", "1")
	defer cancel()
	got := <-stream
	if got.Name != "state.refresh" {
		t.Fatalf("old reconnect event = %q, want state.refresh", got.Name)
	}
}

func TestSlowSubscriberGetsRefreshInsteadOfBlockingPublisher(t *testing.T) {
	hub := NewHub(4)
	stream, cancel := hub.Subscribe("u1", "")
	defer cancel()
	for i := 0; i < cap(stream)+2; i++ {
		if _, err := hub.Publish("u1", "watched-app.updated", map[string]int{"n": i}); err != nil {
			t.Fatal(err)
		}
	}
	if got := <-stream; got.Name != "state.refresh" {
		t.Fatalf("slow client event = %q, want state.refresh", got.Name)
	}
}
