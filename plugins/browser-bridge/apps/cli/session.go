package main

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"agent-browser-bridge/packages/protocol"
)

type Session struct {
	ID           string
	TurnID       string
	CreatedAt    time.Time
	conn         net.Conn
	native       *nativeConn
	mu           sync.Mutex
	closed       bool
	idCounter    atomic.Int64
	attachedTabs map[int]int
	browser      *browserEventState
}

func NewSession(id, turnId string, conn net.Conn) *Session {
	return &Session{
		ID:           id,
		TurnID:       turnId,
		CreatedAt:    time.Now(),
		conn:         conn,
		attachedTabs: make(map[int]int),
		browser:      newBrowserEventState(),
	}
}

func (sess *Session) Dispatch(req protocol.RequestEnvelope) protocol.ResponseEnvelope {
	sess.mu.Lock()
	if sess.closed {
		sess.mu.Unlock()
		return errorResp(req.ID, protocol.ErrorSessionNotFound, "session closed")
	}
	sess.mu.Unlock()

	return dispatchBridgeRequestWithState(req, sess.forwardToExtension, sess.browser)
}

func (sess *Session) forwardToExtension(req protocol.RequestEnvelope) protocol.ResponseEnvelope {
	req = withBackendSession(req, sess.ID, sess.TurnID)
	sess.mu.Lock()
	native := sess.native
	sess.mu.Unlock()

	if native == nil {
		n, err := sess.connectNative()
		if err != nil {
			return errorResp(req.ID, protocol.ErrorExtensionUnavailable,
				fmt.Sprintf("cannot connect to extension: %s", err))
		}
		sess.mu.Lock()
		sess.native = n
		native = n
		sess.mu.Unlock()
	}

	resp, err := native.Send(req)
	if err != nil {
		// Connection lost, clear native for reconnect
		sess.mu.Lock()
		sess.native = nil
		sess.mu.Unlock()
		return errorResp(req.ID, protocol.ErrorExtensionUnavailable,
			fmt.Sprintf("extension communication failed: %s", err))
	}
	if resp.OK {
		var params protocol.TabTargetParams
		switch req.Method {
		case protocol.MethodBackendAttach:
			if protocol.DecodeParams(req.Params, &params) == nil && params.TabID > 0 {
				sess.mu.Lock()
				addAttachedTab(sess.attachedTabs, params.TabID)
				sess.mu.Unlock()
			}
		case protocol.MethodBackendDetach:
			if protocol.DecodeParams(req.Params, &params) == nil && params.TabID > 0 {
				sess.mu.Lock()
				removeAttachedTab(sess.attachedTabs, params.TabID)
				sess.mu.Unlock()
			}
		}
	}
	return resp
}

func withBackendSession(req protocol.RequestEnvelope, sessionID string, turnID string) protocol.RequestEnvelope {
	if !strings.HasPrefix(req.Method, "agent_browser_bridge.backend.") {
		return req
	}
	params := map[string]any{}
	if req.Params != nil {
		payload, err := json.Marshal(req.Params)
		if err == nil {
			_ = json.Unmarshal(payload, &params)
		}
	}
	if sessionID == "" {
		sessionID = "cli"
	}
	params["sessionId"] = sessionID
	if turnID != "" {
		params["turnId"] = turnID
	}
	req.Params = params
	return req
}

func (sess *Session) connectNative() (*nativeConn, error) {
	manifestPath := defaultChromeManifestPath()
	manifest, err := readNativeHostManifest(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read native host manifest at %s: %w", manifestPath, err)
	}
	return startNativeConn(manifest.Path)
}

func (sess *Session) nextID() string {
	return fmt.Sprintf("sess_%s_%d", sess.ID, sess.idCounter.Add(1))
}

func (sess *Session) Close() {
	sess.mu.Lock()
	if sess.closed {
		sess.mu.Unlock()
		return
	}
	sess.closed = true
	native := sess.native
	sess.native = nil
	tabIDs := expandedAttachedTabs(sess.attachedTabs)
	sess.attachedTabs = map[int]int{}
	sess.browser.reset()
	sess.mu.Unlock()
	if native != nil {
		for _, tabID := range tabIDs {
			_, _ = native.Send(protocol.RequestEnvelope{
				ProtocolVersion: protocol.ProtocolVersion,
				ID:              sess.nextID(),
				Method:          protocol.MethodBackendDetach,
				Params:          protocol.TabTargetParams{TabID: tabID},
			})
		}
		native.Close()
	}
}

func addAttachedTab(attached map[int]int, tabID int) {
	attached[tabID]++
}

func removeAttachedTab(attached map[int]int, tabID int) {
	if attached[tabID] <= 1 {
		delete(attached, tabID)
		return
	}
	attached[tabID]--
}

func expandedAttachedTabs(attached map[int]int) []int {
	tabIDs := make([]int, 0)
	for tabID, count := range attached {
		for index := 0; index < count; index++ {
			tabIDs = append(tabIDs, tabID)
		}
	}
	return tabIDs
}
