import { Kafka, Producer, Consumer, Admin, KafkaConfig, PartitionAssigners, AssignerProtocol, Assigner } from 'kafkajs';
import { config } from '../config';
import { getKafkaBootstrapServers } from './k8sService'; // Import the discovery function

let kafka: Kafka | null = null;
let producer: Producer | null = null;
let admin: Admin | null = null;
let consumer: Consumer | null = null; // Manage consumer instance if needed for specific tasks

/**
 * Initializes the Kafka client, discovers brokers if necessary, and connects admin client.
 */
export const initializeKafka = async (): Promise<void> => {
    try {
        let brokers = config.kafka.brokers; // Get brokers from config (e.g., ['localhost:9092'])

        // --- CHANGE THE CONDITION HERE ---
        // Only attempt discovery if KAFKA_BROKERS env var was NOT set.
        const brokersEnvVarSet = process.env.KAFKA_BROKERS !== undefined && process.env.KAFKA_BROKERS.trim() !== '';

        if (!brokersEnvVarSet) {
            try {
                console.log('KAFKA_BROKERS not set, attempting discovery via Kubernetes...');
                brokers = await getKafkaBootstrapServers();
                console.log(`Successfully discovered Kafka brokers: ${brokers.join(',')}`);
            } catch (k8sError) {
                console.error('Failed to discover Kafka brokers from Kubernetes:', k8sError);
                // If discovery fails and brokers were not set, we rely on the default from config
                console.warn(`Proceeding with default/configured brokers: ${config.kafka.brokers.join(',')}`);
                brokers = config.kafka.brokers; // Ensure we fall back to config default if discovery fails
                if (!brokers || brokers.length === 0 || (brokers.length === 1 && brokers[0] === 'localhost:9092')) {
                     // If discovery failed AND the default is localhost, maybe throw or give a stronger warning
                     console.error("CRITICAL: Kafka discovery failed and no specific brokers were configured. Check K8s connection or set KAFKA_BROKERS.");
                     // Depending on requirements, you might want to throw an error here
                     // throw new Error("Kafka broker discovery failed and no fallback configured.");
                }
            }
        } else {
            console.log(`Using explicitly configured KAFKA_BROKERS: ${brokers.join(',')}`);
        }
        // --- END OF CONDITION CHANGE ---

        // Ensure brokers array is not empty before proceeding
        if (!brokers || brokers.length === 0) {
            throw new Error("Kafka brokers are not configured and could not be discovered.");
        }

        const kafkaConfig: KafkaConfig = {
            clientId: config.kafka.clientId,
            brokers: brokers, // Use the determined brokers (either from env var or discovery)
            // Add SSL/SASL config from config.kafka if needed
            // ssl: config.kafka.ssl,
            // sasl: config.kafka.sasl,
            retry: {
                initialRetryTime: 300,
                retries: 5
            }
        };

        kafka = new Kafka(kafkaConfig);

        admin = kafka.admin();
        await admin.connect();
        console.log('Kafka Admin connected successfully.');

        // Initialize producer - often good to have ready
        producer = kafka.producer();
        await producer.connect();
        console.log('Kafka Producer connected successfully.');

    } catch (error) {
        console.error('Error initializing Kafka:', error);
        throw error; // Rethrow to prevent server startup if Kafka connection fails critically
    }
};

/**
 * Gets the Kafka Admin client instance.
 * @returns {Admin} The Kafka Admin client.
 * @throws {Error} If Kafka is not initialized.
 */
export const getAdmin = (): Admin => {
    if (!admin) {
        throw new Error('Kafka Admin client is not initialized. Call initializeKafka() first.');
    }
    return admin;
};

/**
 * Gets the Kafka Producer instance.
 * @returns {Producer} The Kafka Producer client.
 * @throws {Error} If Kafka is not initialized.
 */
export const getProducer = (): Producer => {
    if (!producer) {
        throw new Error('Kafka Producer is not initialized. Call initializeKafka() first.');
    }
    return producer;
};

/**
 * Creates and connects a new Kafka Consumer.
 * @param groupId The consumer group ID.
 * @returns {Promise<Consumer>} A promise that resolves with the connected Consumer instance.
 * @throws {Error} If Kafka is not initialized.
 */
export const createConsumer = async (groupId: string): Promise<Consumer> => {
    if (!kafka) {
        throw new Error('Kafka client is not initialized. Call initializeKafka() first.');
    }
    const newConsumer = kafka.consumer({ groupId });
    await newConsumer.connect();
    console.log(`Kafka Consumer for group '${groupId}' connected successfully.`);
    return newConsumer;
};

/**
 * Disconnects the Kafka clients (Admin, Producer, Consumers).
 */
export const disconnectKafka = async (): Promise<void> => {
    try {
        if (producer) {
            await producer.disconnect();
            console.log('Kafka Producer disconnected.');
            producer = null;
        }
        if (admin) {
            await admin.disconnect();
            console.log('Kafka Admin disconnected.');
            admin = null;
        }
        // Note: Consumers created via createConsumer need to be managed and disconnected separately
        // if (consumer) {
        //     await consumer.disconnect();
        //     console.log('Kafka Consumer disconnected.');
        //     consumer = null;
        // }
        kafka = null; // Allow re-initialization
    } catch (error) {
        console.error('Error disconnecting Kafka:', error);
    }
};

// Add more Kafka-specific functions as needed:
// - Produce message
// - Consume messages (potentially manage multiple consumers)
// - List topics (using admin client)
// - Describe cluster (using admin client)
// - Describe consumer groups (using admin client)