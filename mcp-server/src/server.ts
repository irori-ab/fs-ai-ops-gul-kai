import express, { Express, Request, Response, NextFunction } from "express";
import { config } from "./config";
import { initializeKafka, disconnectKafka } from "./services/kafkaService";
import apiRoutes from "./routes";
import swaggerUi from "swagger-ui-express"; // Import swagger-ui-express
import fs from "fs"; // Import fs
import path from "path"; // Import path

const app: Express = express();

// Middleware
app.use(express.json()); // Parse JSON bodies

// Add request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next(); // Pass control to the next middleware function
});

// Load OpenAPI specification from JSON
let swaggerDocument: any;
try {
  const swaggerFilePath = path.join(__dirname, "../openapi.json"); // Load JSON file
  swaggerDocument = JSON.parse(fs.readFileSync(swaggerFilePath, "utf8")); // Parse JSON file

  // Serve Swagger UI
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  console.log("Swagger UI served at /api-docs");
} catch (e) {
  console.error("Failed to load or parse openapi.json:", e);
}

// API Routes
app.use("/api", apiRoutes); // Mount the API routes under /api

// Health Check Endpoint
app.get("/health", (req: Request, res: Response) => {
  // Basic health check, could be expanded to check Kafka connection status
  res.status(200).json({ status: "UP" });
});

// Add an endpoint to interact with the agent
app.post("/agent/execute", async (req: Request, res: Response) => {
  try {
    const { action, payload } = req.body; // Expecting action and payload from the request body

    // Simulate interaction with the agent (replace with actual agent logic)
    const agentResponse = await simulateAgentInteraction(action, payload);

    res.status(200).json({
      success: true,
      data: agentResponse,
    });
  } catch (error) {
    console.error("Error interacting with agent:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
});

// Simulated function to interact with the agent (replace with actual implementation)
const simulateAgentInteraction = async (action: string, payload: any) => {
  // Simulate processing time
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        message: `Action '${action}' executed with payload: ${JSON.stringify(
          payload
        )}`,
      });
    }, 1000);
  });
};

// Define the Error Handler Middleware
const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Unhandled error:", err.stack || err.message);
  // Avoid sending stack trace in production
  const statusCode = (err as any).statusCode || 500; // Use custom status code if available
  res.status(statusCode).json({
    error: {
      message: err.message || "Internal Server Error",
      // Optionally add more details in non-production environments
      // stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    },
  });
};

// Global Error Handler (should be last middleware)
app.use(errorHandler);

const startServer = async () => {
  try {
    console.log("Initializing Kafka connection...");
    await initializeKafka(); // Initialize Kafka (includes broker discovery)
    console.log("Kafka initialized successfully.");

    const server = app.listen(config.server.port, () => {
      console.log(`MCP Kafka Server listening on port ${config.server.port}`);
    });

    // Graceful Shutdown Handling
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log("HTTP server closed.");
        await disconnectKafka();
        console.log("Kafka connections closed.");
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        console.error("Could not close connections in time, forcing shutdown");
        process.exit(1);
      }, 10000); // 10 seconds timeout
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT")); // Catches Ctrl+C
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
