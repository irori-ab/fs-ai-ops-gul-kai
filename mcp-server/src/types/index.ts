export interface KafkaMessage {
    key?: string;
    value: string;
    timestamp?: number;
}

export interface KafkaTopic {
    name: string;
    partitions: number;
    replicationFactor: number;
}

export interface K8sResource {
    apiVersion: string;
    kind: string;
    metadata: {
        name: string;
        namespace: string;
    };
}

export interface K8sKafkaCluster extends K8sResource {
    spec: {
        kafka: {
            version: string;
            replicas: number;
            listeners: {
                name: string;
                port: number;
                type: string;
            }[];
        };
    };
}

// Define interfaces for request bodies, responses, etc.
// Example:
export interface CreateTopicRequest {
    topicName: string;
    partitions?: number;
    replicas?: number;
}

export interface ProduceMessageRequest {
    topic: string;
    messages: { key?: string; value: string }[];
}

// Add other types as needed