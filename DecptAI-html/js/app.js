// WebSocket连接
let ws;
// 玩家用户名
let username = "玩家" + Math.floor(Math.random() * 1000);

// 初始化WebSocket
function connect() {
    ws = new WebSocket("ws://localhost:8080/ws");

    // 连接成功
    ws.onopen = () => {
        setStatus("已连接");
        // 设置用户名
        ws.send("SET_USERNAME|" + username);
        // 启用输入框和按钮
        document.getElementById("message-input").disabled = false;
        document.getElementById("send-button").disabled = false;
        // 初始化匹配按钮
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
                    break;
                case "PLAYER_DISCONNECTED":
                    setStatus("对方已断开连接");
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
        }
    };

    // 连接关闭
    ws.onclose = () => {
        setStatus("连接已关闭");
        document.getElementById("message-input").disabled = true;
        document.getElementById("send-button").disabled = true;
    };

    // 连接错误
    ws.onerror = (error) => {
        setStatus("连接错误: " + error.message);
    };
}

// 添加消息到聊天框
function addMessage(message, isSelf = true) {
    const messagesDiv = document.getElementById("messages");
    const messageElement = document.createElement("div");
    const now = new Date();
    const timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    messageElement.className = `message ${isSelf ? 'self' : 'other'}`;
    messageElement.innerHTML = `
        <div class="message-sender">${isSelf ? '我' : message.split(':')[0]}</div>
        <div class="message-content">${isSelf ? message : message.split(':').slice(1).join(':')}</div>
        <div class="message-time">${timeString}</div>
    `;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // 滚动到底部
}

// 发送消息
function sendMessage() {
    const input = document.getElementById("message-input");
    const message = input.value;
    if (message.trim() !== "") {
        // 发送格式：SENDER|MESSAGE
        ws.send(`${username}|${message}`);
        // 显示自己发送的消息
        addMessage(message, true);
        input.value = "";
    }
}

// 设置状态
function setStatus(status) {
    document.getElementById("status").textContent = status;
}

// 检查是否已登录
if (!localStorage.getItem('loggedIn')) {
    window.location.href = 'login.html';
} else {
    // 初始化
    connect();
}

// 绑定退出登录按钮
document.getElementById('logout-btn').style.display = 'block';
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('loggedIn');
    window.location.href = 'login.html';
});

// 绑定发送按钮事件
document.getElementById("send-button").addEventListener("click", sendMessage);

// 绑定输入框回车事件
document.getElementById("message-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});

// 绑定匹配按钮事件
document.getElementById("match-button").addEventListener("click", () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("REQUEST_MATCH");
        setStatus("正在匹配中...");
        document.getElementById("match-button").disabled = true;
    }
});
