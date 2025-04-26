# fs-ai-ops-gul-kai
Kafka AI - Firestarter 2025

## Overview

This project enables interaction with a Strimzi-managed Kafka cluster running on Kubernetes through a conversational AI interface. It consists of a Python agent that communicates with the Anthropic Claude AI model and an MCP (Model Context Protocol) server written in TypeScript that provides the necessary tools (API endpoints) for Kafka operations. The agent interprets user requests, uses Claude to determine the appropriate Kafka action, and calls the MCP server's API to execute it.

## Components

*   **Agent (`/agent`)**: A Python command-line application that:
    *   Takes user input for Kafka-related tasks.
    *   Communicates with the Anthropic Claude API (`claude-3-5-sonnet-20241022`).
    *   Requires the `ANTHROPIC_API_KEY` environment variable.
    *   Uses tools defined to match the MCP server's API (e.g., list topics, produce messages, create topics).
    *   Calls the MCP server's REST API endpoints to execute Kafka actions.
*   **MCP Server (`/mcp-server`)**: A TypeScript Express.js server that:
    *   Provides a REST API for interacting with Kafka and Strimzi.
    *   Uses `kafkajs` to communicate with the Kafka cluster.
    *   Uses `@kubernetes/client-node` to:
        *   Discover Kafka bootstrap servers from the Strimzi `Kafka` custom resource.
        *   Create topics using the Strimzi `KafkaTopic` custom resource.
    *   Serves its API documentation via Swagger UI at `/api-docs`.
    *   Can connect to Kafka using brokers discovered via Kubernetes or specified via the `KAFKA_BROKERS` environment variable.

## Accessing the cluster & ArgoCD

```bash
#Generate the kube credentials
gcloud container clusters get-credentials fs-ai-gul --location=europe-north1

##ARGO CD
# Port forward service to get access to WEB UI
kubectl port-forward service/argocd-server 8443:https -n argocd

#Fetching the initial password
argocd admin initial-password -n argocd

#Login (can be done via UI as well)
argocd login localhost:8080 --username admin --password <ARGOCD_PASSWORD>
```

## Setup & Installation

### Prerequisites

*   Node.js (v14.0.0 or higher recommended)
*   npm (usually comes with Node.js)
*   Python 3
*   pip (usually comes with Python)
*   Access to a Kubernetes cluster
*   Strimzi Kafka Operator installed in the cluster
*   A running Kafka cluster managed by Strimzi
*   `kubectl` configured to access your Kubernetes cluster
*   An Anthropic API Key

### Agent

1.  **Navigate to Agent Directory:**
    ```bash
    cd agent
    ```
2.  **Create and Activate Virtual Environment:**
    ```bash
    # Create the virtual environment (use python3 or python depending on your system)
    python3 -m venv venv 
    
    # Activate it (macOS/Linux)
    source venv/bin/activate
    
    # Activate it (Windows - Git Bash/WSL)
    # source venv/Scripts/activate
    
    # Activate it (Windows - Command Prompt/PowerShell)
    # .\venv\Scripts\activate 
    ```
    *You should see `(venv)` prepended to your command prompt.*
3.  **Set Anthropic API Key:**
    ```bash
    export ANTHROPIC_API_KEY='your-api-key-here'
    # For Windows Command Prompt: set ANTHROPIC_API_KEY=your-api-key-here
    # For Windows PowerShell: $env:ANTHROPIC_API_KEY='your-api-key-here'
    ```
4.  **Install Dependencies:**
    ```bash
    # Now install requirements inside the active venv
    pip install -r agent/requirements.txt
    ```

### MCP Server

1.  **Navigate to Server Directory:**
    ```bash
    cd mcp-server
    ```
2.  **Set Environment Variables (Optional):**
    *   If your Kubernetes configuration (`~/.kube/config`) is not standard or you want to specify brokers directly (instead of relying on Kubernetes discovery), you might need to configure environment variables. The server uses `dotenv`, so you can create a `.env` file.
    *   To bypass Kubernetes discovery and specify brokers directly:
        ```bash
        # Example for .env file in mcp-server directory
        KAFKA_BROKERS=my-kafka-bootstrap.kafka.svc:9092
        # KUBERNETES_CLUSTER_NAME=your-cluster # If needed by k8s client
        # KUBERNETES_CLUSTER_NAMESPACE=kafka # Namespace where Strimzi Kafka CR is
        ```
3.  **Install Dependencies:**
    ```bash
    npm install
    ```
4.  **Build TypeScript:**
    ```bash
    npm run build
    ```
5.  **Return to Root Directory:**
    ```bash
    cd ..
    ```

## Usage

### MCP Server

First, start the MCP server. It needs to be running for the agent to function.

```bash
cd mcp-server
npm start # Or npm run dev for development with auto-reload
```
The server will attempt to connect to Kafka (discovering brokers via Kubernetes by default). You can check its status via the health endpoint (`http://localhost:3000/health`) or view the API documentation at `http://localhost:3000/api-docs`.

### Agent

Once the MCP server is running, open a new terminal window/tab.

1.  **Navigate and Activate Environment:**
    ```bash
    cd agent
    source venv/bin/activate # Or the appropriate activation command for your OS
    ```
    *You should see `(venv)` prepended to your command prompt.*
2.  **Ensure API Key is Set:** Make sure the `ANTHROPIC_API_KEY` environment variable is set in this terminal session.
    ```bash
    export ANTHROPIC_API_KEY='your-api-key-here' # If not already set
    # Use set or $env: for Windows as shown in Setup
    ```
3.  **Run the Agent:**
    ```bash
    # Now run the agent from within the activated venv
    python agent.py
    ```
4.  **Interact:** Follow the prompts to ask Claude questions or give commands related to your Kafka cluster (e.g., "list all topics", "create a topic named 'test-topic'", "send a message 'hello' to topic 'test-topic'").

## Contributing

[Optional: Add guidelines for contributing to the project.]

## License

[Optional: Specify the project's license, e.g., MIT based on package.json.]
