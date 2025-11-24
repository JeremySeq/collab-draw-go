package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// mutex prevents concurrent read/writes

var (
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
)

// stores raw json messages in order
var (
	events   [][]byte
	eventsMu sync.RWMutex
)

type Event struct {
	Type string `json:"type"`
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	// add client
	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()
	log.Println("Client connected")

	// remove client on exit
	defer func() {
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
		conn.Close()
		log.Println("Client disconnected")
	}()

	// send entire history to new client
	eventsMu.RLock()
	for _, ev := range events {
		if err := conn.WriteMessage(websocket.TextMessage, ev); err != nil {
			log.Println("Error writing history to client:", err)
			eventsMu.RUnlock()
			return
		}
	}
	eventsMu.RUnlock()

	// store incoming messages and broadcast
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			// read error, client disconnected
			return
		}

		log.Println(string(msg))
		var ev Event
		if err := json.Unmarshal(msg, &ev); err != nil {
			log.Println("Invalid JSON:", err)
			continue
		}

		msgCopy := append([]byte(nil), msg...)

		if ev.Type == "clear" {
			// wipe history
			eventsMu.Lock()
			events = nil
			eventsMu.Unlock()
		} else if ev.Type == "draw" {
			// append to history
			eventsMu.Lock()
			events = append(events, msgCopy)
			eventsMu.Unlock()
		}

		// send to all clients
		clientsMu.Lock()
		for c := range clients {
			if err := c.WriteMessage(websocket.TextMessage, msgCopy); err != nil {
				log.Println("Broadcast write error, removing client:", err)
				c.Close()
				delete(clients, c)
			}
		}
		clientsMu.Unlock()
	}
}

func main() {
	http.Handle("/", http.FileServer(http.Dir("../frontend")))
	http.HandleFunc("/ws", wsHandler)

	log.Println("Server started on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
