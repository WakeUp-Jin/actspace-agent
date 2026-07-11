package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"sync"
	"time"

	"agent-browser-bridge/packages/protocol"
)

type Server struct {
	socketPath   string
	listener     net.Listener
	sessions     map[string]*Session
	eventBus     *EventBus
	mu           sync.RWMutex
	done         chan struct{}
	lastActivity time.Time
	idleTimeout  time.Duration
}

func NewServer(socketPath string, idleTimeout time.Duration) (*Server, error) {
	if err := os.MkdirAll(socketPathDir(socketPath), 0755); err != nil {
		return nil, fmt.Errorf("create socket dir: %w", err)
	}
	_ = os.Remove(socketPath)

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return nil, fmt.Errorf("listen on %s: %w", socketPath, err)
	}

	return &Server{
		socketPath:   socketPath,
		listener:     listener,
		sessions:     make(map[string]*Session),
		eventBus:     NewEventBus(),
		done:         make(chan struct{}),
		lastActivity: time.Now(),
		idleTimeout:  idleTimeout,
	}, nil
}

func (s *Server) Start() {
	if s.idleTimeout > 0 {
		go s.idleWatcher()
	}
	go s.acceptLoop()
}

func (s *Server) Stop() {
	close(s.done)
	s.listener.Close()
	os.Remove(s.socketPath)

	s.mu.Lock()
	for _, sess := range s.sessions {
		sess.Close()
	}
	s.mu.Unlock()
}

func (s *Server) acceptLoop() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.done:
				return
			default:
				continue
			}
		}
		s.touch()
		go s.handleConn(conn)
	}
}

func (s *Server) handleConn(conn net.Conn) {
	connID := fmt.Sprintf("conn_%d", time.Now().UnixNano())
	events := s.eventBus.Subscribe(connID)
	defer func() {
		s.eventBus.Unsubscribe(connID)
		conn.Close()
	}()

	// Writer goroutine: push events to client
	go func() {
		for event := range events {
			_ = protocol.WriteJSONFrame(conn, event)
		}
	}()

	// Reader loop: read requests from client
	for {
		payload, err := protocol.ReadFrame(conn, protocol.DefaultMaxFrame)
		if err != nil {
			return
		}
		s.touch()

		var req protocol.RequestEnvelope
		if err := json.Unmarshal(payload, &req); err != nil {
			resp := protocol.ResponseEnvelope{
				ProtocolVersion: protocol.ProtocolVersion,
				ID:              "",
				OK:              false,
				Error:           &protocol.ErrorShape{Code: protocol.ErrorInvalidMessage, Message: "invalid JSON"},
			}
			_ = protocol.WriteJSONFrame(conn, resp)
			continue
		}

		resp := s.dispatch(req, conn)
		_ = protocol.WriteJSONFrame(conn, resp)
	}
}

func (s *Server) dispatch(req protocol.RequestEnvelope, conn net.Conn) protocol.ResponseEnvelope {
	switch req.Method {
	case protocol.MethodPing:
		return okResponse(req.ID, map[string]string{"status": "pong"})

	case protocol.MethodInfo:
		return okResponse(req.ID, map[string]any{
			"version":         version,
			"protocolVersion": protocol.ProtocolVersion,
			"phase":           protocol.Phase,
			"mode":            "socket-server",
		})

	case protocol.MethodSessionStart:
		var params protocol.SessionStartParams
		if err := protocol.DecodeParams(req.Params, &params); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error())
		}
		sess := NewSession(params.SessionID, params.TurnID, conn)
		s.mu.Lock()
		s.sessions[params.SessionID] = sess
		s.mu.Unlock()
		return okResponse(req.ID, map[string]string{"sessionId": params.SessionID})

	case protocol.MethodSessionEnd:
		var params protocol.SessionEndParams
		if err := protocol.DecodeParams(req.Params, &params); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error())
		}
		s.mu.Lock()
		if sess, ok := s.sessions[params.SessionID]; ok {
			sess.Close()
			delete(s.sessions, params.SessionID)
		}
		s.mu.Unlock()
		return okResponse(req.ID, map[string]string{"status": "ended"})

	case protocol.MethodCommandList, protocol.MethodCommandDescribe, protocol.MethodCommandPreflight:
		return dispatchBridgeRequest(req, nil)

	default:
		// Route to session-scoped handler (forward to extension)
		sess := s.findSessionForConn(conn)
		if sess == nil {
			return errorResp(req.ID, protocol.ErrorSessionNotFound, "no active session for this connection")
		}
		return sess.Dispatch(req)
	}
}

func (s *Server) findSessionForConn(conn net.Conn) *Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, sess := range s.sessions {
		if sess.conn == conn {
			return sess
		}
	}
	return nil
}

func (s *Server) touch() {
	s.mu.Lock()
	s.lastActivity = time.Now()
	s.mu.Unlock()
}

func (s *Server) idleWatcher() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.mu.RLock()
			idle := len(s.sessions) == 0 && time.Since(s.lastActivity) > s.idleTimeout
			s.mu.RUnlock()
			if idle {
				fmt.Fprintf(os.Stderr, "[abb] idle timeout (%s), shutting down\n", s.idleTimeout)
				s.Stop()
				os.Exit(0)
			}
		case <-s.done:
			return
		}
	}
}

func okResponse(id string, result any) protocol.ResponseEnvelope {
	return protocol.ResponseEnvelope{
		ProtocolVersion: protocol.ProtocolVersion,
		ID:              id,
		OK:              true,
		Result:          result,
	}
}

func errorResp(id, code, message string) protocol.ResponseEnvelope {
	return protocol.ResponseEnvelope{
		ProtocolVersion: protocol.ProtocolVersion,
		ID:              id,
		OK:              false,
		Error:           &protocol.ErrorShape{Code: code, Message: message},
	}
}

func socketPathDir(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			return path[:i]
		}
	}
	return "."
}
