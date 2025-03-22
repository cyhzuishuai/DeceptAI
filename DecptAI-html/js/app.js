// WebSocket连接
let ws;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000; // 3秒

// 玩家用户名
let username = "玩家" + Math.floor(Math.random() * 1000);

// 初始化WebSocket
function connect() {
    try {
        ws = new WebSocket("ws://localhost:8080/ws");

        // 连接成功
        ws.onopen = () => {
            reconnectAttempts = 0;
            setStatus("已连接");
            // 设置用户名
            ws.send("SET_USERNAME|" + username);
            // 启用输入框和按钮
            document.getElementById("message-input").disabled = false;
            document.getElementById("send-button").disabled = false;
            document.getElementById("match-button").disabled = false;
        };

        // 收到消息
        ws.onmessage = (event) => {
            const message = event.data;
            if (!message) return;

            // 尝试解析消息格式
            try {
                const parts = message.split("|");
                const type = parts[0];
                
                // 处理不同类型的消息
                switch (type) {
                    case "MATCH_SUCCESS":
                        setStatus("匹配成功！房间ID: " + (parts[1] || ""));
                        break;
                    case "MATCH_TIMEOUT":
                        setStatus("匹配超时，请重试");
                        document.getElementById("match-button").disabled = false;
                        break;
                    case "PLAYER_DISCONNECTED":
                        setStatus("对方已断开连接");
                        document.getElementById("match-button").disabled = false;
                        break;
                    case "MATCH_QUEUED":
                        setStatus("正在匹配中...");
                        break;
                    default:
                        // 处理普通聊天消息
                        if (parts.length >= 2) {
                            const sender = parts[0];
                            const msg = parts.slice(1).join("|");
                            addMessage(`${sender}: ${msg}`, sender === username);
                        } else {
                            console.warn("Received simple message:", message);
                            addMessage(message, false);
                        }
                }
            } catch (error) {
                console.error("Error processing message:", error);
                console.error("Raw message:", message);
                setStatus("消息处理错误");
            }
        };

        // 连接关闭
        ws.onclose = () => {
            setStatus("连接已关闭");
            document.getElementById("message-input").disabled = true;
            document.getElementById("send-button").disabled = true;
            document.getElementById("match-button").disabled = true;
            
            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(() => {
                    reconnectAttempts++;
                    setStatus(`尝试重新连接 (${reconnectAttempts}/${maxReconnectAttempts})...`);
                    connect();
                }, reconnectDelay);
            } else {
                setStatus("无法连接服务器，请刷新页面重试");
            }
        };

        // 连接错误
        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setStatus("连接错误: " + (error.message || "未知错误"));
        };

    } catch (error) {
        console.error("Connection error:", error);
        setStatus("连接失败: " + error.message);
    }
}

// 添加消息到聊天框
function addMessage(message, isSelf = true) {
    const messagesDiv = document.getElementById("messages");
    if (!messagesDiv) {
        console.error("Messages container not found");
        return;
    }

    const messageElement = document.createElement("div");
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    messageElement.className = `message ${isSelf ? 'self' : 'other'}`;
    messageElement.innerHTML = `
        <div class="message-sender">${isSelf ? '我' : message.split(':')[0]}</div>
        <div class="message-content">${isSelf ? message : message.split(':').slice(1).join(':')}</div>
        <div class="message-time">${timeString}</div>
    `;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 发送消息
function sendMessage() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        setStatus("未连接，无法发送消息");
        return;
    }

    const input = document.getElementById("message-input");
    if (!input) {
        console.error("Message input not found");
        return;
    }

    const message = input.value;
    if (message.trim() !== "") {
        try {
            ws.send(`${username}|${message}`);
            addMessage(message, true);
            input.value = "";
        } catch (error) {
            console.error("Error sending message:", error);
            setStatus("发送消息失败");
        }
    }
}

// 设置状态
function setStatus(status) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// 页面加载时初始化
window.addEventListener('load', () => {
    // 绑定事件
    document.getElementById("send-button")?.addEventListener("click", sendMessage);
    document.getElementById("message-input")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });
    document.getElementById("match-button")?.addEventListener("click", () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send("REQUEST_MATCH");
                setStatus("正在匹配中...");
                document.getElementById("match-button").disabled = true;
            } catch (error) {
                console.error("Error requesting match:", error);
                setStatus("匹配请求失败");
            }
        }
    });

    // 初始化连接
    connect();
});
