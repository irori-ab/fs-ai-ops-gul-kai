import dotenv from 'dotenv';

dotenv.config();

// Basic configuration structure
export const config = {
    kafka: {
        clientId: process.env.KAFKA_CLIENT_ID || 'mcp-kafka-server',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','), // Require brokers to be set
        // Add any other KafkaJS config options here (e.g., ssl, sasl)
        // ssl: process.env.KAFKA_SSL === 'true',
        // sasl: {
        //   mechanism: process.env.KAFKA_SASL_MECHANISM, // 'plain', 'scram-sha-256', 'scram-sha-512'
        //   username: process.env.KAFKA_SASL_USERNAME,
        //   password: process.env.KAFKA_SASL_PASSWORD,
        // },
    },
    kubernetes: { // Restore kubernetes section
        // Configuration for @kubernetes/client-node
        // By default, it tries to load from ~/.kube/config or in-cluster service account
        kafkaClusterNamespace: process.env.KAFKA_CLUSTER_NAMESPACE || 'kafka',
        kafkaClusterName: process.env.KAFKA_CLUSTER_NAME || 'my-cluster', // Name of the Strimzi Kafka cluster resource
    },
    server: {
        port: process.env.PORT || 3000,
    },
};

// Validate essential configuration
if (!config.kafka.brokers || config.kafka.brokers.length === 0 || config.kafka.brokers[0] === 'localhost:9092') {
    // Warn if default or empty brokers are used
    console.warn(`Warning: KAFKA_BROKERS environment variable is not set or is using the default 'localhost:9092'. Ensure this is correct for your environment.`);
}

// Restore validation for kubernetes config
if (!config.kubernetes.kafkaClusterNamespace || !config.kubernetes.kafkaClusterName) {
    console.warn('Warning: KAFKA_CLUSTER_NAMESPACE or KAFKA_CLUSTER_NAME environment variables are not set. Kubernetes service discovery might fail.');
}