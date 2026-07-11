package main

import (
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"

	"agent-browser-bridge/packages/protocol"
)

type nativeConn struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	mu     sync.Mutex
}

func startNativeConn(hostPath string) (*nativeConn, error) {
	cmd := exec.Command(hostPath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start native host %s: %w", hostPath, err)
	}
	return &nativeConn{cmd: cmd, stdin: stdin, stdout: stdout}, nil
}

func (nc *nativeConn) Send(req protocol.RequestEnvelope) (protocol.ResponseEnvelope, error) {
	nc.mu.Lock()
	defer nc.mu.Unlock()

	if err := protocol.WriteJSONFrame(nc.stdin, req); err != nil {
		return protocol.ResponseEnvelope{}, fmt.Errorf("write to native: %w", err)
	}

	// Read response with timeout
	type result struct {
		resp protocol.ResponseEnvelope
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		resp, err := protocol.ReadResponseFrame(nc.stdout)
		ch <- result{resp, err}
	}()

	select {
	case r := <-ch:
		return r.resp, r.err
	case <-time.After(defaultTimeout):
		return protocol.ResponseEnvelope{}, fmt.Errorf("native host response timeout")
	}
}

func (nc *nativeConn) Close() {
	nc.mu.Lock()
	defer nc.mu.Unlock()
	if nc.stdin != nil {
		nc.stdin.Close()
	}
	if nc.cmd != nil && nc.cmd.Process != nil {
		nc.cmd.Process.Kill()
		nc.cmd.Wait()
	}
}
