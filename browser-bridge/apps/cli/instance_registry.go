package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"syscall"
	"time"
)

var extensionInstanceIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type nativeHostInstance struct {
	HostID           string `json:"hostId"`
	ExtensionID      string `json:"extensionInstanceId"`
	SocketPath       string `json:"socketPath"`
	HostVersion      string `json:"hostVersion"`
	ExtensionVersion string `json:"extensionVersion"`
	ProtocolVersion  string `json:"protocolVersion"`
	StartedAt        string `json:"startedAt"`
}

func newNativeHostSocketPath() (string, error) {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return filepath.Join(defaultSupportDir(), "s-"+hex.EncodeToString(bytes)+".sock"), nil
}

func nativeHostInstanceFile(socketPath string) string {
	return filepath.Join(defaultSupportDir(), "instances", filepath.Base(socketPath)+".json")
}

func publishNativeHostInstance(socketPath string, extensionID string, extensionVersion string, protocolVersion string) error {
	if !extensionInstanceIDPattern.MatchString(extensionID) {
		return fmt.Errorf("invalid extension instance ID")
	}
	if protocolVersion != "0.2.0" {
		return fmt.Errorf("unsupported extension protocol version")
	}
	path := nativeHostInstanceFile(socketPath)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	record := nativeHostInstance{
		HostID: filepath.Base(socketPath), ExtensionID: extensionID, SocketPath: socketPath,
		HostVersion: version, ExtensionVersion: extensionVersion, ProtocolVersion: protocolVersion,
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	payload, err := json.Marshal(record)
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".instance-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if err := temp.Chmod(0600); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(payload); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}

func activeNativeHostInstances() []nativeHostInstance {
	dir := filepath.Join(defaultSupportDir(), "instances")
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	instances := make([]nativeHostInstance, 0, len(files))
	for _, file := range files {
		if file.IsDir() || filepath.Ext(file.Name()) != ".json" {
			continue
		}
		path := filepath.Join(dir, file.Name())
		metadata, err := os.Lstat(path)
		if err != nil || !ownedPrivateFile(metadata) {
			continue
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var instance nativeHostInstance
		if json.Unmarshal(payload, &instance) != nil ||
			!extensionInstanceIDPattern.MatchString(instance.ExtensionID) ||
			instance.HostID != filepath.Base(instance.SocketPath) ||
			file.Name() != instance.HostID+".json" ||
			filepath.Dir(instance.SocketPath) != defaultSupportDir() {
			continue
		}
		socketMetadata, err := os.Lstat(instance.SocketPath)
		if err != nil || !ownedPrivateSocket(socketMetadata) {
			continue
		}
		conn, err := net.DialTimeout("unix", instance.SocketPath, 100*time.Millisecond)
		if err != nil {
			continue
		}
		conn.Close()
		instances = append(instances, instance)
	}
	sort.Slice(instances, func(i, j int) bool { return instances[i].HostID < instances[j].HostID })
	return instances
}

func ownedPrivateFile(info os.FileInfo) bool {
	return info.Mode().IsRegular() && info.Mode().Perm()&0077 == 0 && ownedByCurrentUser(info)
}

func ownedPrivateSocket(info os.FileInfo) bool {
	return info.Mode()&os.ModeSocket != 0 && info.Mode().Perm()&0077 == 0 && ownedByCurrentUser(info)
}

func ownedByCurrentUser(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Uid == uint32(os.Getuid())
}

func publishInstanceSelection(socketPath string, extensionID string) error {
	if !extensionInstanceIDPattern.MatchString(extensionID) {
		return fmt.Errorf("invalid extension instance ID")
	}
	challengePath := filepath.Join(defaultSupportDir(), "instances", "selection-challenge.json")
	info, err := os.Stat(challengePath)
	if err != nil || time.Since(info.ModTime()) > 5*time.Minute || info.Mode().Perm()&0077 != 0 {
		return fmt.Errorf("no active selection challenge")
	}
	var challenge struct {
		Nonce string `json:"nonce"`
	}
	payload, err := os.ReadFile(challengePath)
	if err != nil || json.Unmarshal(payload, &challenge) != nil || len(challenge.Nonce) < 24 {
		return fmt.Errorf("invalid selection challenge")
	}
	selection := map[string]string{"nonce": challenge.Nonce, "instanceId": extensionID,
		"hostId": filepath.Base(socketPath), "selectedAt": time.Now().UTC().Format(time.RFC3339Nano)}
	encoded, err := json.Marshal(selection)
	if err != nil {
		return err
	}
	path := filepath.Join(defaultSupportDir(), "instances", "selection-"+filepath.Base(socketPath)+".json")
	temp, err := os.CreateTemp(filepath.Dir(path), ".selection-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if err := temp.Chmod(0600); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(encoded); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}
