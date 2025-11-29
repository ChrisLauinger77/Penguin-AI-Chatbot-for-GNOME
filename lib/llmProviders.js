import Soup from "gi://Soup";
import GLib from "gi://GLib";
import { LLMProviders, MessageRoles } from "./constants.js";
import { TOOL_DEFINITIONS, ToolExecutor } from "./tools.js";


/**
 * Base class for LLM providers
 */
class LLMProvider {
    /**
     * Create a base LLM provider
     * @param {string} apiKey - API key for the provider
     * @param {string} model - Model name to use
     */
    constructor(apiKey, model) {
        this._apiKey = apiKey;
        this._model = model;
        this._httpSession = new Soup.Session();
    }

    /**
     * Prepare HTTP message for the API request
     * @param {string} url - API endpoint URL
     * @param {object} requestBody - Request body object
     * @returns {Soup.Message} - Configured message object
     */
    _prepareRequest(url, requestBody) {
        const message = Soup.Message.new("POST", url);
        message.request_headers.append("content-type", "application/json");

        // Add provider-specific headers in subclasses
        this._addRequestHeaders(message);

        const body = JSON.stringify(requestBody);
        const bytes = GLib.Bytes.new(body);
        message.set_request_body_from_bytes("application/json", bytes);

        return message;
    }

    /**
     * Add provider-specific headers to the request
     * @param {Soup.Message} message - Message to modify
     */
    _addRequestHeaders(message) {
        // Implemented by subclasses
    }

    /**
     * Extract the response text from API response
     * @param {object} response - Parsed API response
     * @returns {string} - Extracted text
     */
    _extractResponseText(response) {
        // Implemented by subclasses
        return "";
    }

    /**
     * Format the chat history for the provider's API
     * @param {Array} history - Chat history array
     * @returns {object} - Formatted messages for the API
     */
    _formatMessages(history) {
        // Implemented by subclasses
        return [];
    }

    /**
     * Generate the request body for the API call
     * @param {Array} history - Chat history
     * @returns {object} - Request body object
     */
    _generateRequestBody(history) {
        // Implemented by subclasses
        return {};
    }

    /**
     * Send a request to the LLM API
     * @param {Array} history - Chat history
     * @param {Function} callback - Callback function for the response
     */
    sendRequest(history, callback) {
        const requestBody = this._generateRequestBody(history);
        const url = this._getEndpointUrl();
        const message = this._prepareRequest(url, requestBody);

        this._httpSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    if (message.get_status() === Soup.Status.OK) {
                        const bytes = session.send_and_read_finish(result);
                        const decoder = new TextDecoder("utf-8");
                        const response = JSON.parse(decoder.decode(bytes.get_data()));
                        const text = this._extractResponseText(response);
                        callback(null, text);
                    } else {
                        callback(new Error(`HTTP error ${message.get_status()}`), null);
                    }
                } catch (error) {
                    callback(error, null);
                }
            }
        );
    }

    /**
     * Get the API endpoint URL
     * @returns {string} - Endpoint URL
     */
    _getEndpointUrl() {
        // Implemented by subclasses
        return "";
    }

    /**
     * Abort any ongoing requests
     */
    abort() {
        if (this._httpSession) {
            this._httpSession.abort();
        }
    }
}

/**
 * Anthropic Claude API provider
 */
class AnthropicProvider extends LLMProvider {
    /**
     * @inheritdoc
     */
    _addRequestHeaders(message) {
        message.request_headers.append("x-api-key", this._apiKey);
        message.request_headers.append("anthropic-version", "2023-06-01");
    }

    /**
     * @inheritdoc
     */
    _getEndpointUrl() {
        return "https://api.anthropic.com/v1/messages";
    }

    /**
     * @inheritdoc
     */
    _generateRequestBody(history) {
        return {
            model:    this._model,
            messages: history.map((msg) => ({
                role:    msg.role === MessageRoles.USER ? MessageRoles.USER : MessageRoles.ASSISTANT,
                content: msg.content,
            })),
            max_tokens: 1024,
        };
    }

    /**
     * @inheritdoc
     */
    _extractResponseText(response) {
        return response.content[0].text;
    }
}

/**
 * OpenAI API provider
 */
class OpenAIProvider extends LLMProvider {
    /**
     * @inheritdoc
     */
    _addRequestHeaders(message) {
        message.request_headers.append("Authorization", `Bearer ${this._apiKey}`);
    }

    /**
     * @inheritdoc
     */
    _getEndpointUrl() {
        return "https://api.openai.com/v1/chat/completions";
    }

    /**
     * @inheritdoc
     */
    _generateRequestBody(history) {
        return {
            model:    this._model,
            messages: history.map((msg) => ({
                role:    msg.role === MessageRoles.USER ? MessageRoles.USER : MessageRoles.ASSISTANT,
                content: msg.content,
            })),
            response_format: {
                type: "text",
            },
            temperature:           1,
            max_completion_tokens: 4096,
            top_p:                 1,
            frequency_penalty:     0,
            presence_penalty:      0,
        };
    }

    /**
     * @inheritdoc
     */
    _extractResponseText(response) {
        return response.choices[0].message.content;
    }
}

/**
 * Google Gemini API provider
 */
class GeminiProvider extends LLMProvider {
    /**
     * @inheritdoc
     */
    _getEndpointUrl() {
        return `https://generativelanguage.googleapis.com/v1beta/models/${this._model}:generateContent?key=${this._apiKey}`;
    }

    /**
     * @inheritdoc
     */
    _generateRequestBody(history) {
        return {
            contents: history.map((msg) => ({
                role:  msg.role === MessageRoles.USER ? MessageRoles.USER : "model",
                parts: [{ text: msg.content }],
            })),
            generationConfig: {
                temperature:      1,
                topK:             40,
                topP:             0.95,
                maxOutputTokens:  8192,
                responseMimeType: "text/plain",
            },
        };
    }

    /**
     * @inheritdoc
     */
    _extractResponseText(response) {
        return response.candidates[0].content.parts[0].text;
    }
}

/**
* OpenRouter API provider with Function Calling support
*/
class OpenRouterProvider extends LLMProvider {
    /**
     * Create OpenRouter provider with tool support
     * @param {string} apiKey - API key
     * @param {string} model - Model name
     * @param {object} toolConfig - Tool configuration (server URL, weather coords)
     */
    constructor(apiKey, model, toolConfig = {}) {
        super(apiKey, model);
        this._toolConfig = toolConfig;
        this._toolExecutor = null;
        
        if (toolConfig.serverUrl) {
            this._toolExecutor = new ToolExecutor(toolConfig.serverUrl);
            if (toolConfig.weatherLat && toolConfig.weatherLon) {
                this._toolExecutor.setWeatherParams(
                    toolConfig.weatherLat,
                    toolConfig.weatherLon
                );
            }
        }
    }

    /**
     * @inheritdoc
     */
    _addRequestHeaders(message) {
        message.request_headers.append("Authorization", `Bearer ${this._apiKey}`);
    }

    /**
     * @inheritdoc
     */
    _getEndpointUrl() {
        return "https://openrouter.ai/api/v1/chat/completions";
    }

    /**
     * @inheritdoc
     */
    _generateRequestBody(history) {
        const body = {
            messages: history,
            model: this._model,
        };
        
        // Add tool definitions if tool executor is configured
        if (this._toolExecutor) {
            body.tools = TOOL_DEFINITIONS;
            log('[Penguin] Sending request with tools: ' + JSON.stringify(body, null, 2));
        }
        
        return body;
    }

    /**
     * @inheritdoc
     */
    _extractResponseText(response) {
        return response.choices[0].message.content;
    }

    /**
     * Check if response contains tool calls
     * @param {object} response - API response
     * @returns {Array|null} - Tool calls array or null
     */
    _extractToolCalls(response) {
        const message = response.choices?.[0]?.message;
        return message?.tool_calls || null;
    }

    /**
     * Handle tool calls and execute them
     * @param {Array} toolCalls - Array of tool calls from LLM
     * @param {Function} callback - Callback with (error, results)
     */
    _handleToolCalls(toolCalls, callback) {
        if (!this._toolExecutor) {
            callback(new Error("Tool executor not configured"), null);
            return;
        }

        const results = [];
        let completed = 0;

        toolCalls.forEach((toolCall) => {
            const toolName = toolCall.function.name;
            //const parameters = JSON.parse(toolCall.function.arguments || "{}");
            const args = toolCall.function.arguments;
            const parameters = args ? JSON.parse(args) : {};

            this._toolExecutor.executeTool(toolName, parameters, (error, result) => {
                if (error) {
                    results.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        content: `Error: ${error.message}`
                    });
                } else {
                    results.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        content: JSON.stringify(result)
                    });
                }

                completed++;
                if (completed === toolCalls.length) {
                    callback(null, results);
                }
            });
        });
    }

    /**
     * Send request with tool calling support
     * @param {Array} history - Chat history
     * @param {Function} callback - Callback function
     */
    sendRequest(history, callback) {
        this._sendRequestInternal(history, callback, 0);
    }

    /**
     * Internal recursive method for handling tool calls
     * @param {Array} history - Current conversation history
     * @param {Function} finalCallback - Final callback
     * @param {number} depth - Recursion depth (max 5)
     */
    _sendRequestInternal(history, finalCallback, depth) {
        if (depth > 5) {
            finalCallback(new Error("Too many tool call iterations"), null);
            return;
        }

        const requestBody = this._generateRequestBody(history);
        const url = this._getEndpointUrl();
        const message = this._prepareRequest(url, requestBody);

        this._httpSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    if (message.get_status() === Soup.Status.OK) {
                        const bytes = session.send_and_read_finish(result);
                        const decoder = new TextDecoder("utf-8");
                        const response = JSON.parse(decoder.decode(bytes.get_data()));

                        // Check for tool calls
                        const toolCalls = this._extractToolCalls(response);

                        log('[OpenRouter] Tool calls detected: ' + JSON.stringify(toolCalls, null, 2));

                        if (toolCalls && toolCalls.length > 0) {
                            // Add assistant's tool call message to history
                            // Normalize tool_calls: ensure each has an 'arguments' field
                            const normalizedToolCalls = toolCalls.map(tc => ({
                                ...tc,
                                function: {
                                    ...tc.function,
                                    arguments: tc.function.arguments || "{}"
                                }
                            }));
                            
                            const assistantMessage = {
                                role: "assistant",
                                content: response.choices[0].message.content || null,
                                tool_calls: normalizedToolCalls
                            };
                            history.push(assistantMessage);

                            // Execute tools
                            this._handleToolCalls(toolCalls, (error, toolResults) => {
                                if (error) {
                                    finalCallback(error, null);
                                    return;
                                }

                                // Add tool results to history
                                log('[OpenRouter] Tool results: ' + JSON.stringify(toolResults, null, 2));
                                toolResults.forEach(result => history.push(result));

                                // Make another request with tool results
                                this._sendRequestInternal(history, finalCallback, depth + 1);
                            });
                        } else {
                            // No tool calls, return final text
                            const text = this._extractResponseText(response);
                            finalCallback(null, text);
                        }
                    } else {
                        finalCallback(new Error(`HTTP error ${message.get_status()}`), null);
                    }
                } catch (error) {
                    finalCallback(error, null);
                }
            }
        );
    }
}

/**
 * Factory for creating LLM provider instances
 */
export class LLMProviderFactory {
    /**
     * Create an appropriate LLM provider based on type
     * @param {string} providerType - Provider type identifier
     * @param {string} apiKey - API key for the provider
     * @param {string} model - Model to use
     * @param {object} toolConfig - Tool configuration (optional)
     * @returns {LLMProvider} - Provider instance
     */
    static createProvider(providerType, apiKey, model, toolConfig = {}) {
        switch (providerType) {
            case LLMProviders.ANTHROPIC:
                return new AnthropicProvider(apiKey, model);
            case LLMProviders.OPENAI:
                return new OpenAIProvider(apiKey, model);
            case LLMProviders.GEMINI:
                return new GeminiProvider(apiKey, model);
            case LLMProviders.OPENROUTER:
                return new OpenRouterProvider(apiKey, model, toolConfig);
            default:
                // Default to Anthropic if type is unknown
                return new AnthropicProvider(apiKey, model);
        }
    }
}
