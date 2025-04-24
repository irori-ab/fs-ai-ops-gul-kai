import { KubeConfig, CustomObjectsApi } from '@kubernetes/client-node';
import { config } from '../config';

// Define constants used in multiple places
const STRIMZI_GROUP = 'kafka.strimzi.io';
const STRIMZI_VERSION = 'v1beta2'; // Or v1beta1 depending on your Strimzi version
const KAFKA_RESOURCE_PLURAL = 'kafkas';
const KAFKA_TOPIC_RESOURCE_PLURAL = 'kafkatopics';

// Removed the unused K8sService class and its methods (getKafkaPods, getKafkaDeployment, etc.)
// as they were causing errors and are not used by the current server logic.

/**
 * Discovers the Kafka bootstrap servers from the Strimzi Kafka resource in Kubernetes.
 * Uses the CustomObjectsApi directly.
 * @returns {Promise<string[]>} A promise that resolves with an array of bootstrap server addresses.
 * @throws {Error} If the Kafka cluster or its status/listeners are not found.
 */
export const getKafkaBootstrapServers = async (): Promise<string[]> => {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    const k8sCustomObjectsApi = kc.makeApiClient(CustomObjectsApi);

    try {
        console.log(`Fetching Strimzi Kafka cluster '${config.kubernetes.kafkaClusterName}' in namespace '${config.kubernetes.kafkaClusterNamespace}'`);

        // Correct call signature for getNamespacedCustomObjectStatus
        const response = await k8sCustomObjectsApi.getNamespacedCustomObjectStatus(
            STRIMZI_GROUP,
            STRIMZI_VERSION,
            config.kubernetes.kafkaClusterNamespace,
            KAFKA_RESOURCE_PLURAL,
            config.kubernetes.kafkaClusterName
        );

        // Access the actual data from the response body
        const kafkaCluster = response.body as any; // Use 'any' for easier access to dynamic status structure

        if (!kafkaCluster || !kafkaCluster.status || !kafkaCluster.status.listeners) {
            throw new Error(`Could not find status or listeners for Kafka cluster '${config.kubernetes.kafkaClusterName}'`);
        }

        // Find the plain listener (most common for internal access in KinD)
        const plainListener = kafkaCluster.status.listeners.find(
           (l: { name?: string; type?: string }) => l.name === 'plain' || l.type === 'plain'
        );

        if (plainListener && plainListener.bootstrapServers) {
           console.log(`Found plain listener bootstrap servers: ${plainListener.bootstrapServers}`);
           return plainListener.bootstrapServers.split(',');
        }

        // Fallback: Try finding an external listener if plain isn't found
        const externalListener = kafkaCluster.status.listeners.find(
            (l: { name?: string; type?: string }) => l.name === 'external' || l.type === 'external'
        );

        if (externalListener && externalListener.bootstrapServers) {
            console.log(`Found external listener bootstrap servers: ${externalListener.bootstrapServers}`);
            return externalListener.bootstrapServers.split(',');
        }

        throw new Error(`Could not find a suitable listener (plain or external) with bootstrap servers for Kafka cluster '${config.kubernetes.kafkaClusterName}'`);

    } catch (error) {
        console.error('Error discovering Kafka bootstrap servers:', error);
        // Fallback to configured brokers if discovery fails
        console.warn(`Falling back to configured Kafka brokers: ${config.kafka.brokers.join(',')}`);
        if (config.kafka.brokers && config.kafka.brokers.length > 0 && config.kafka.brokers[0] !== 'localhost:9092') {
             return config.kafka.brokers;
        }
        // If default localhost is the only config and discovery failed, rethrow
        let message = 'Unknown error during discovery';
        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
             // Handle cases where error might be an object with a message property (e.g., K8s API errors)
             message = String((error as any).message);
             if ((error as any).body?.message) {
                 message += `: ${(error as any).body.message}`;
             }
        }
        throw new Error(`Failed to discover Kafka bootstrap servers and no fallback brokers configured: ${message}`);
    }
};

/**
 * Creates a KafkaTopic custom resource in Kubernetes via Strimzi.
 * Uses the CustomObjectsApi directly.
 * @param topicName The name of the topic to create.
 * @param partitions The number of partitions for the topic.
 * @param replicas The replication factor for the topic.
 * @returns {Promise<object>} A promise that resolves with the created KafkaTopic resource object.
 * @throws {Error} If the creation fails.
 */
export const createKafkaTopicResource = async (topicName: string, partitions = 1, replicas = 1): Promise<object> => {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    const k8sCustomObjectsApi = kc.makeApiClient(CustomObjectsApi);

    const topicManifest = {
        apiVersion: `${STRIMZI_GROUP}/${STRIMZI_VERSION}`,
        kind: 'KafkaTopic',
        metadata: {
            name: topicName,
            namespace: config.kubernetes.kafkaClusterNamespace,
            labels: {
                'strimzi.io/cluster': config.kubernetes.kafkaClusterName,
            },
        },
        spec: {
            partitions: partitions,
            replicas: replicas,
        },
    };

    try {
        console.log(`Creating KafkaTopic '${topicName}' in namespace '${config.kubernetes.kafkaClusterNamespace}'`);
        // Correct call signature for createNamespacedCustomObject
        const response = await k8sCustomObjectsApi.createNamespacedCustomObject(
            STRIMZI_GROUP,
            STRIMZI_VERSION,
            config.kubernetes.kafkaClusterNamespace,
            KAFKA_TOPIC_RESOURCE_PLURAL,
            topicManifest
        );
        console.log(`Successfully created KafkaTopic '${topicName}'`);
        return response.body; // Return the body of the response
    } catch (error: any) { // Keep 'any' here for easier access to response body
        if (error.response && error.response.body && error.response.body.reason === 'AlreadyExists') {
             console.warn(`KafkaTopic '${topicName}' already exists.`);
             // Correct call signature for getNamespacedCustomObject
             const response = await k8sCustomObjectsApi.getNamespacedCustomObject(
                 STRIMZI_GROUP,
                 STRIMZI_VERSION,
                 config.kubernetes.kafkaClusterNamespace,
                 KAFKA_TOPIC_RESOURCE_PLURAL,
                 topicName
             );
             return response.body; // Return the body of the response
        }
        // Improved error message extraction
        let message = `Failed to create KafkaTopic '${topicName}'`;
        if (error.response?.body?.message) {
            message += `: ${error.response.body.message}`;
        } else if (error instanceof Error) {
            message += `: ${error.message}`;
        } else if (typeof error === 'string') {
             message += `: ${error}`;
        }
        console.error(`Error creating KafkaTopic '${topicName}':`, error.response?.body || error);
        throw new Error(message);
    }
};