package events

import (
	"encoding/json"
	"strconv"
	"sync"
)

type Event struct {
	ID     uint64          `json:"-"`
	UserID string          `json:"-"`
	Name   string          `json:"-"`
	Data   json.RawMessage `json:"-"`
}

type subscription struct {
	userID string
	stream chan Event
}

// Hub holds a small replay window so browsers can recover missed changes when
// EventSource reconnects with Last-Event-ID. Every emitted event is scoped to
// one account; events for other users are never replayed or broadcast.
type Hub struct {
	mu          sync.Mutex
	nextID      uint64
	history     []Event
	historySize int
	nextSubID   uint64
	subscribers map[uint64]subscription
}

func NewHub(historySize int) *Hub {
	if historySize < 1 {
		historySize = 256
	}
	return &Hub{
		historySize: historySize,
		subscribers: make(map[uint64]subscription),
	}
}

func (h *Hub) Publish(userID, name string, payload any) (Event, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return Event{}, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nextID++
	event := Event{ID: h.nextID, UserID: userID, Name: name, Data: data}
	h.history = append(h.history, event)
	if len(h.history) > h.historySize {
		h.history = append([]Event(nil), h.history[len(h.history)-h.historySize:]...)
	}
	for id, sub := range h.subscribers {
		if sub.userID != userID {
			continue
		}
		select {
		case sub.stream <- event:
		default:
			// A slow client gets a refresh signal; its SWR/API reads restore the
			// latest state without allowing an unbounded queue to grow.
			for len(sub.stream) > 0 {
				<-sub.stream
			}
			refresh := Event{ID: event.ID, UserID: userID, Name: "state.refresh", Data: json.RawMessage(`{}`)}
			select {
			case sub.stream <- refresh:
			default:
				delete(h.subscribers, id)
				close(sub.stream)
			}
		}
	}
	return event, nil
}

func (h *Hub) Subscribe(userID, lastEventID string) (<-chan Event, func()) {
	lastID, _ := strconv.ParseUint(lastEventID, 10, 64)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nextSubID++
	stream := make(chan Event, h.historySize+1)
	if len(h.history) > 0 && lastID > 0 {
		oldest := h.history[0].ID
		if lastID+1 < oldest {
			stream <- Event{ID: h.nextID, UserID: userID, Name: "state.refresh", Data: json.RawMessage(`{}`)}
		} else {
			for _, event := range h.history {
				if event.ID > lastID && event.UserID == userID {
					stream <- event
				}
			}
		}
	}
	id := h.nextSubID
	h.subscribers[id] = subscription{userID: userID, stream: stream}
	var once sync.Once
	return stream, func() {
		once.Do(func() {
			h.mu.Lock()
			if sub, ok := h.subscribers[id]; ok {
				delete(h.subscribers, id)
				close(sub.stream)
			}
			h.mu.Unlock()
		})
	}
}
