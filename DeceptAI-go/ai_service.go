package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

// AIService 提供AI交互功能
type AIService struct {
	apiKey string
	apiURL string
}

// NewAIService 创建AI服务实例
func NewAIService() *AIService {
	return &AIService{
		apiKey: os.Getenv("DEEPSEEK_API_KEY"),
		apiURL: os.Getenv("DEEPSEEK_API_URL"),
	}
}

// AIRequest DeepSeek API请求结构
type AIRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

// Message 聊天消息结构
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// AIResponse DeepSeek API响应结构
type AIResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
}

// GetAIResponse 获取AI回复
func (ai *AIService) GetAIResponse(prompt string) (string, error) {
	request := AIRequest{
		Model: "deepseek-chat",
		Messages: []Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return "", fmt.Errorf("编码请求失败: %v", err)
	}

	req, err := http.NewRequest("POST", ai.apiURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ai.apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API返回错误状态码: %d", resp.StatusCode)
	}

	var response AIResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("解码响应失败: %v", err)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("无有效回复")
	}

	return response.Choices[0].Message.Content, nil
}
