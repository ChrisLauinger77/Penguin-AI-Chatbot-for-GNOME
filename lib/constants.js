/**
 * Constants for the Penguin AI Chatbot extension
 */
// LLM Provider identifiers
export const LLMProviders = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  GEMINI: "gemini",
  OPENROUTER: "openrouter",
};

// Settings keys
export const SettingsKeys = {
  LLM_PROVIDER: "llm-provider",
  ANTHROPIC_API_KEY: "anthropic-api-key",
  OPENAI_API_KEY: "openai-api-key",
  GEMINI_API_KEY: "gemini-api-key",
  OPENROUTER_API_KEY: "openrouter-api-key",
  ANTHROPIC_MODEL: "anthropic-model",
  OPENAI_MODEL: "openai-model",
  GEMINI_MODEL: "gemini-model",
  OPENROUTER_MODEL: "openrouter-model",
  HUMAN_MESSAGE_COLOR: "human-message-color",
  LLM_MESSAGE_COLOR: "llm-message-color",
  HUMAN_MESSAGE_TEXT_COLOR: "human-message-text-color",
  LLM_MESSAGE_TEXT_COLOR: "llm-message-text-color",
  HISTORY: "history",
  OPEN_CHAT_SHORTCUT: "open-chat-shortcut",
  TOOL_SERVER_URL: "tool-server-url",
  WEATHER_LATITUDE: "weather-latitude",
  WEATHER_LONGITUDE: "weather-longitude",
};

// Message role identifiers
export const MessageRoles = {
  USER: "user",
  ASSISTANT: "assistant",
  MODEL: "model", // Used for Gemini
};

// CSS class names
export const CSS = {
  HUMAN_MESSAGE: "humanMessage",
  LLM_MESSAGE: "llmMessage",
  HUMAN_MESSAGE_BOX: "humanMessage-box",
  LLM_MESSAGE_BOX: "llmMessage-box",
  MESSAGE_INPUT: "messageInput",
  POPUP_MENU_BOX: "popup-menu-box",
  CHAT_SCROLLING: "chat-scrolling",
};
