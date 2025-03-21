package main

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// 配置WebSocket升级器
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // 生产环境应验证来源
	},
}

// Player 表示游戏玩家
type Player struct {
	Conn     *websocket.Conn // WebSocket连接
	Send     chan []byte     // 发送消息的通道
	RoomID   string          // 所在房间ID
	Username string          // 玩家用户名
}

// MatchMaker 管理匹配系统
type MatchMaker struct {
	Queue    chan *Player       // 匹配队列
	Rooms    map[string]*Room   // 所有房间
	Mutex    sync.RWMutex       // 读写锁
}

// Room 表示游戏房间
type Room struct {
	Players [2]*Player  // 房间内的两个玩家
	Created time.Time   // 创建时间
}

func main() {
	// 初始化匹配系统
	matchMaker := &MatchMaker{
		Queue: make(chan *Player, 1000),
		Rooms: make(map[string]*Room),
	}

	// 启动匹配协程
	go matchMaker.StartMatching()

	// 设置WebSocket路由
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("WebSocket升级失败:", err)
			return
		}

		// 创建新玩家实例
		player := &Player{
			Conn: conn,
			Send: make(chan []byte, 256),
		}

		// 启动读写协程
		go player.WritePump()
		go player.ReadPump(matchMaker)
	})

	// 启动HTTP服务器
	log.Println("服务器启动在 :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// StartMatching 匹配系统核心逻辑
func (mm *MatchMaker) StartMatching() {
	for {
		// 从队列获取第一个玩家
		player1 := <-mm.Queue
		log.Printf("玩家 %s 进入队列", player1.Username)

		// 等待第二个玩家（最多30秒）
		select {
		case player2 := <-mm.Queue:
			// 创建新房间
			roomID := generateRoomID()
			room := &Room{
				Players: [2]*Player{player1, player2},
				Created: time.Now(),
			}

			// 加锁更新房间信息
			mm.Mutex.Lock()
			mm.Rooms[roomID] = room
			mm.Mutex.Unlock()

			// 设置玩家房间ID
			player1.RoomID = roomID
			player2.RoomID = roomID

			// 通知双方匹配成功
			player1.Send <- []byte("MATCH_SUCCESS|" + roomID)
			player2.Send <- []byte("MATCH_SUCCESS|" + roomID)
			log.Printf("房间 %s 创建成功", roomID)

		case <-time.After(30 * time.Second):
			// 匹配超时处理
			player1.Send <- []byte("MATCH_TIMEOUT")
			log.Printf("玩家 %s 匹配超时", player1.Username)
		}
	}
}

// ReadPump 处理来自客户端的消息
func (p *Player) ReadPump(mm *MatchMaker) {
	defer func() {
		p.Conn.Close()
		mm.RemovePlayer(p)
	}()

	// 设置心跳检测
	p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	p.Conn.SetPongHandler(func(string) error {
		p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		// 读取消息
		_, message, err := p.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway) {
				log.Printf("玩家 %s 异常断开: %v", p.Username, err)
			}
			break
		}

		// 处理消息类型
		switch {
		case string(message) == "PING":
			p.Send <- []byte("PONG")
			
		case string(message[:12]) == "SET_USERNAME":
			p.Username = string(message[13:])
			
		case string(message) == "REQUEST_MATCH":
			select {
			case mm.Queue <- p:
				p.Send <- []byte("MATCH_QUEUED")
			default:
				p.Send <- []byte("MATCH_QUEUE_FULL")
			}
			
		case p.RoomID != "":
			// 转发消息到房间
			mm.Mutex.RLock()
			room := mm.Rooms[p.RoomID]
			mm.Mutex.RUnlock()

			if room != nil {
				// 找到另一个玩家
				var target *Player
				if p == room.Players[0] {
					target = room.Players[1]
				} else {
					target = room.Players[0]
				}

				if target != nil {
					target.Send <- message
				}
			}
		}
	}
}

// WritePump 向客户端发送消息
func (p *Player) WritePump() {
	ticker := time.NewTicker(50 * time.Second) // 心跳间隔
	defer func() {
		ticker.Stop()
		p.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-p.Send:
			// 通道关闭
			if !ok {
				p.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// 写入消息
			if err := p.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("发送消息失败: %v", err)
				return
			}
			
		case <-ticker.C:
			// 发送心跳包
			if err := p.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// RemovePlayer 清理断开连接的玩家
func (mm *MatchMaker) RemovePlayer(p *Player) {
	if p.RoomID != "" {
		mm.Mutex.Lock()
		defer mm.Mutex.Unlock()
		
		if room, exists := mm.Rooms[p.RoomID]; exists {
			// 找到玩家索引
			index := -1
			for i, player := range room.Players {
				if player == p {
					index = i
					break
				}
			}
			
			if index != -1 {
				// 通知另一个玩家
				otherPlayer := room.Players[1-index]
				if otherPlayer != nil {
					otherPlayer.Send <- []byte("PLAYER_DISCONNECTED")
				}
				
				// 清理房间
				delete(mm.Rooms, p.RoomID)
				log.Printf("房间 %s 已清理", p.RoomID)
			}
		}
	}
}

// 生成唯一房间ID
func generateRoomID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
