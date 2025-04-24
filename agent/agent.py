import anthropic
import requests
import json
import os
import sys

# --- Configuration ---
MCP_SERVER_URL = "http://localhost:3000"
CLAUDE_MODEL = "claude-3-5-sonnet-20241022"

# --- Anthropic Client Setup ---
try:
    client = anthropic.Anthropic()
    # API key is automatically picked up from ANTHROPIC_API_KEY env var
except anthropic.AnthropicError as e:
    print(f"Error initializing Anthropic client: {e}")
    print("Please ensure the ANTHROPIC_API_KEY environment variable is set correctly.")
    sys.exit(1)

# --- Tool Definitions (Based on openapi.json) ---
# Manually translate the relevant parts of openapi.json into Anthropic tool format
tools = [
    {
        "name": "check_health",
        "description": "Checks the operational status of the MCP Kafka server.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "list_topics",
        "description": "Retrieves a list of all Kafka topic names from the connected cluster.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "produce_message",
        "description": "Sends one message to the specified Kafka topic.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "The target topic name."
                },
                "key": {
                    "type": "string",
                    "description": "Optional message key."
                },
                "value": {
                    "type": "string",
                    "description": "The message content (value)."
                }
            },
            "required": ["topic", "value"]
        }
    },
    # Add the create_topic tool definition
    {
        "name": "create_topic",
        "description": "Creates a new Kafka topic via Strimzi KafkaTopic CR.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topicName": {
                    "type": "string",
                    "description": "Desired name for the new topic."
                },
                "partitions": {
                    "type": "integer",
                    "description": "Number of partitions (default: 1)."
                },
                "replicas": {
                    "type": "integer",
                    "description": "Replication factor (default: 1)."
                }
            },
            "required": ["topicName"]
        }
    },
    # Add more tools here based on openapi.json (e.g., describe_consumer_groups)
]

# --- Functions to Call MCP Server API ---
def call_mcp_api(method, endpoint, json_payload=None, params=None):
    """Generic function to call the MCP server API."""
    url = f"{MCP_SERVER_URL}{endpoint}"
    try:
        response = requests.request(method, url, json=json_payload, params=params, timeout=10) # Added timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        # Handle cases where response might be empty (e.g., 201 No Content)
        if response.status_code == 204 or not response.content:
            return {"status_code": response.status_code, "message": "Request successful, no content returned."}
        return response.json()
    except requests.exceptions.Timeout:
        return {"error": "Request timed out", "details": f"Timeout while calling {method} {url}"}
    except requests.exceptions.ConnectionError as e:
        return {"error": "Connection Error", "details": f"Could not connect to MCP server at {url}. Is it running? Details: {e}"}
    except requests.exceptions.HTTPError as e:
        # Try to parse error response from MCP server if available
        try:
            error_details = e.response.json()
        except json.JSONDecodeError:
            error_details = e.response.text
        return {
            "error": "HTTP Error",
            "status_code": e.response.status_code,
            "details": error_details
        }
    except requests.exceptions.RequestException as e:
        return {"error": "Request Exception", "details": str(e)}

# --- Tool Implementation Functions ---
def execute_check_health():
    return call_mcp_api("GET", "/health")

def execute_list_topics():
    return call_mcp_api("GET", "/api/topics")

def execute_produce_message(topic: str, value: str, key: str = None):
    payload = {
        "topic": topic,
        "messages": [
            {"key": key, "value": value} if key else {"value": value}
        ]
    }
    return call_mcp_api("POST", "/api/produce", json_payload=payload)

# Add the implementation function for create_topic
def execute_create_topic(topicName: str, partitions: int = None, replicas: int = None):
    """Calls the MCP server to create a Kafka topic."""
    payload = {"topicName": topicName}
    if partitions is not None:
        payload["partitions"] = partitions
    if replicas is not None:
        payload["replicas"] = replicas
    return call_mcp_api("POST", "/api/topics", json_payload=payload)


# --- Main Agent Loop ---
def run_conversation():
    print("\n--- Claude MCP Agent ---")
    print("Ask me about the Kafka cluster. Type 'quit' to exit.")

    messages = []

    while True:
        user_input = input("\nYou: ")
        if user_input.lower() == 'quit':
            break

        messages.append({"role": "user", "content": user_input})

        print("\nClaude thinking...")

        try:
            # Initial call to Claude
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                messages=messages,
                tools=tools,
                tool_choice={"type": "auto"} # Let Claude decide if it needs a tool
            )

            # Process potential tool use
            while response.stop_reason == "tool_use":
                tool_results = []
                for tool_call in response.content:
                    if tool_call.type == "tool_use":
                        tool_name = tool_call.name
                        tool_input = tool_call.input
                        tool_use_id = tool_call.id

                        print(f"\nClaude wants to use tool: {tool_name} with input: {tool_input}")

                        # Call the corresponding function based on tool_name
                        result = None
                        if tool_name == "check_health":
                            result = execute_check_health()
                        elif tool_name == "list_topics":
                            result = execute_list_topics()
                        elif tool_name == "produce_message":
                            # Ensure required args are present
                            if "topic" in tool_input and "value" in tool_input:
                                result = execute_produce_message(
                                    topic=tool_input["topic"],
                                    value=tool_input["value"],
                                    key=tool_input.get("key") # Optional key
                                )
                            else:
                                result = {"error": "Missing required arguments for produce_message", "required": ["topic", "value"]}
                        # Add the elif block for the new tool
                        elif tool_name == "create_topic":
                            if "topicName" in tool_input:
                                result = execute_create_topic(
                                    topicName=tool_input["topicName"],
                                    partitions=tool_input.get("partitions"), # Pass optional args
                                    replicas=tool_input.get("replicas")      # Pass optional args
                                )
                            else:
                                result = {"error": "Missing required argument for create_topic", "required": ["topicName"]}
                        # Add elif blocks for other tools here
                        else:
                            print(f"Error: Unknown tool '{tool_name}' requested by Claude.")
                            result = {"error": f"Tool '{tool_name}' not implemented in the agent."}

                        print(f"Tool {tool_name} result: {result}")
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": [{"type": "json", "json": result}] # Send result back as JSON
                            # "content": json.dumps(result) # Alternative: send as string
                        })

                # Append the original response and the tool results to messages
                messages.append({"role": response.role, "content": response.content})
                messages.append({"role": "user", "content": tool_results})

                # Call Claude again with the tool results
                print("\nClaude processing tool results...")
                response = client.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=1024,
                    messages=messages,
                    tools=tools,
                    tool_choice={"type": "auto"}
                )

            # Print Claude's final text response
            final_response = ""
            for block in response.content:
                if block.type == 'text':
                    final_response += block.text

            if final_response:
                print(f"\nClaude: {final_response}")
                messages.append({"role": response.role, "content": response.content})
            else:
                print("\nClaude did not provide a text response.")
                # Optionally log the full response for debugging
                # print(f"Full Claude response: {response}")


        except anthropic.APIConnectionError as e:
            print(f"Anthropic API connection error: {e}")
        except anthropic.RateLimitError as e:
            print(f"Anthropic rate limit exceeded: {e}")
        except anthropic.APIStatusError as e:
            print(f"Anthropic API status error: {e.status_code} - {e.response}")
        except anthropic.AnthropicError as e:
            print(f"An Anthropic error occurred: {e}")
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    run_conversation()
