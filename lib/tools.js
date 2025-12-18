import Soup from "gi://Soup";
import GLib from "gi://GLib";

/**
 * Tool definitions for OpenRouter Function Calling
 */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather information for a configured location",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_info",
      description:
        "Get system information including CPU, RAM, disk usage, installed packages, and running processes",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

/**
 * Tool executor class that calls the local tool server
 */
export class ToolExecutor {
  constructor(toolServerUrl) {
    this._toolServerUrl = toolServerUrl;
    this._httpSession = new Soup.Session();
  }

  /**
   * Execute a tool call
   * @param {string} toolName - Name of the tool to execute
   * @param {object} parameters - Tool parameters
   * @param {Function} callback - Callback with (error, result)
   */
  executeTool(toolName, parameters, callback) {
    let endpoint = "";
    let url = "";
    console.log(
      "[ToolExecutor] Calling tool:",
      toolName,
      "URL will be:",
      this._toolServerUrl,
    );

    switch (toolName) {
      case "get_current_time":
        endpoint = "/time";
        url = `${this._toolServerUrl}${endpoint}`;
        break;
      case "get_weather":
        endpoint = "/weather";
        const lat = this._weatherLat || 52.52;
        const lon = this._weatherLon || 13.41;
        url = `${this._toolServerUrl}${endpoint}?lat=${lat}&lon=${lon}`;
        break;
      case "search_web":
        endpoint = "/search";
        const query = encodeURIComponent(parameters.query || "");
        url = `${this._toolServerUrl}${endpoint}?q=${query}`;
        break;
      case "get_system_info":
        endpoint = "/system";
        url = `${this._toolServerUrl}${endpoint}`;
        break;
      default:
        callback(new Error(`Unknown tool: ${toolName}`), null);
        return;
    }

    const message = Soup.Message.new("GET", url);

    console.log("[ToolExecutor] Final URL:", url);

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
            callback(null, response);
          } else {
            callback(
              new Error(
                `HTTP ${message.get_status()}: ${message.get_reason_phrase()}`,
              ),
              null,
            );
          }
        } catch (error) {
          callback(error, null);
        }
      },
    );
  }

  /**
   * Set weather parameters from settings
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   */
  setWeatherParams(lat, lon) {
    this._weatherLat = lat;
    this._weatherLon = lon;
  }

  /**
   * Get weather URL with configured parameters
   * @returns {string} - Weather endpoint URL
   */
  _getWeatherUrl() {
    if (this._weatherLat && this._weatherLon) {
      return `${this._toolServerUrl}/weather?lat=${this._weatherLat}&lon=${this._weatherLon}`;
    }
    return `${this._toolServerUrl}/weather?lat=52.52&lon=13.41`; // Default: Berlin
  }

  destroy() {
    this._httpSession?.abort();
  }
}
