package main

import (
	"sync"

	"agent-browser-bridge/packages/protocol"
)

type EventBus struct {
	subscribers map[string]chan protocol.RequestEnvelope
	mu          sync.RWMutex
}

func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string]chan protocol.RequestEnvelope),
	}
}

func (eb *EventBus) Subscribe(connID string) <-chan protocol.RequestEnvelope {
	ch := make(chan protocol.RequestEnvelope, 64)
	eb.mu.Lock()
	eb.subscribers[connID] = ch
	eb.mu.Unlock()
	return ch
}

func (eb *EventBus) Unsubscribe(connID string) {
	eb.mu.Lock()
	if ch, ok := eb.subscribers[connID]; ok {
		close(ch)
		delete(eb.subscribers, connID)
	}
	eb.mu.Unlock()
}

func (eb *EventBus) Publish(event protocol.RequestEnvelope) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()
	for _, ch := range eb.subscribers {
		select {
		case ch <- event:
		default:
			// Drop if subscriber is slow
		}
	}
}
