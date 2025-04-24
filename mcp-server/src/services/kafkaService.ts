import { Kafka, Producer, Consumer, Admin, KafkaConfig, PartitionAssigners, AssignerProtocol, Assigner, GroupDescription, PartitionOffset } from 'kafkajs';
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

/**
 * Lists all consumer group IDs in the cluster.
 * @returns {Promise<string[]>} A promise that resolves with an array of group IDs.
 */
export const listConsumerGroups = async (): Promise<string[]> => {
    const admin = getAdmin();
    try {
        // Type for groups inferred or use Awaited<ReturnType<Admin['listGroups']>> if needed
        const groups = await admin.listGroups();
        // Add explicit type for group parameter in map
        return groups.groups.map((group: { groupId: string }) => group.groupId);
    } catch (error) {
        console.error('Error listing consumer groups:', error);
        throw new Error(`Failed to list consumer groups: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Fetches the latest committed offsets for a specific consumer group.
 * @param groupId The ID of the consumer group.
 * @returns {Promise<any>} The raw offset fetch response (using any as FetchOffsetsResponse was removed).
 */
const getConsumerGroupOffsets = async (groupId: string): Promise<any> => { // Changed return type
    const admin = getAdmin();
    try {
        // Fetch offsets for all topics the group is subscribed to
        return await admin.fetchOffsets({ groupId });
    } catch (error) {
        console.error(`Error fetching offsets for group ${groupId}:`, error);
        throw new Error(`Failed to fetch offsets for group ${groupId}: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Fetches the latest (high water mark) offsets for specific topics and returns a map.
 * @param topics An array of topic names.
 * @returns {Promise<Map<string, Map<number, string>>>} A promise resolving to a map of topic -> partition -> offset.
 */
const getTopicOffsetsMap = async (topics: string[]): Promise<Map<string, Map<number, string>>> => {
    const admin = getAdmin();
    const topicOffsetsMap = new Map<string, Map<number, string>>();
    try {
        for (const topic of topics) {
            const partitionOffsets = await admin.fetchTopicOffsets(topic);
            const partitionMap = new Map<number, string>();
            partitionOffsets.forEach(p => {
                partitionMap.set(p.partition, p.offset); // p.offset is the high water mark
            });
            topicOffsetsMap.set(topic, partitionMap);
        }
        return topicOffsetsMap;
    } catch (error) {
        console.error(`Error fetching latest offsets for topics ${topics.join(', ')}:`, error);
        throw new Error(`Failed to fetch latest offsets for topics: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Calculates the lag for a specific consumer group, optionally filtered by topics.
 * @param groupId The ID of the consumer group.
 * @param filterTopics Optional array of topic names to filter the lag calculation.
 * @returns {Promise<object>} A promise resolving to an object containing lag information per topic/partition.
 */
export const calculateConsumerGroupLag = async (groupId: string, filterTopics?: string[]): Promise<object> => {
    try {
        const groupOffsetsResponse = await getConsumerGroupOffsets(groupId);
        // Add explicit type for t
        const groupTopics = groupOffsetsResponse.topics.map((t: { topic: string }) => t.topic);

        // Add explicit type for t in filter
        const topicsToFetch = filterTopics ? groupTopics.filter((t: string) => filterTopics.includes(t)) : groupTopics;

        if (topicsToFetch.length === 0) {
            return { message: `Consumer group '${groupId}' is not consuming from the specified topics or has no active members.` };
        }

        // Use the new map-based function
        const latestOffsetsMap = await getTopicOffsetsMap(topicsToFetch);

        const lagResult: { [topic: string]: { [partition: number]: { lag: number | string; consumerOffset: string; latestOffset: string } } } = {};
        let totalLag = BigInt(0); // Use BigInt for potentially large lag numbers

        // Calculate lag for each partition the consumer group is assigned
        // Add explicit type for topicData
        groupOffsetsResponse.topics.forEach((topicData: { topic: string; partitions: any[] }) => {
            const topic = topicData.topic;
            if (!topicsToFetch.includes(topic)) return; // Skip if not in the filter list

            const topicLag: { [partition: number]: { lag: number | string; consumerOffset: string; latestOffset: string } } = {};
            const latestPartitionOffsets = latestOffsetsMap.get(topic);

            if (!latestPartitionOffsets) {
                console.warn(`Could not find latest offsets for topic ${topic}`);
                return; // Skip this topic if latest offsets weren't found
            }

            // Add explicit type for partitionData
            topicData.partitions.forEach((partitionData: { partition: number; offset: string }) => {
                const partition = partitionData.partition;
                const consumerOffsetStr = partitionData.offset;
                const latestOffsetStr = latestPartitionOffsets.get(partition);

                // Handle cases where consumer hasn't committed an offset (-1) or latest offset isn't available
                if (consumerOffsetStr === '-1' || latestOffsetStr === undefined) {
                    topicLag[partition] = {
                        lag: 'unknown', // Indicate unknown lag with a string
                        consumerOffset: consumerOffsetStr,
                        latestOffset: latestOffsetStr ?? 'N/A'
                    };
                } else {
                    try {
                        const consumerOffset = BigInt(consumerOffsetStr);
                        const latestOffset = BigInt(latestOffsetStr);
                        // Ensure lag is not negative
                        const partitionLag = latestOffset > consumerOffset ? latestOffset - consumerOffset : BigInt(0);
                        topicLag[partition] = {
                            lag: partitionLag.toString(), // Store lag as string
                            consumerOffset: consumerOffsetStr,
                            latestOffset: latestOffsetStr
                        };
                        totalLag += partitionLag;
                    } catch (e) {
                         console.error(`Error converting offsets to BigInt for topic ${topic} partition ${partition}: ${e}`);
                         topicLag[partition] = {
                            lag: 'error', // Indicate calculation error
                            consumerOffset: consumerOffsetStr,
                            latestOffset: latestOffsetStr ?? 'N/A'
                        };
                    }
                }
            });
            if (Object.keys(topicLag).length > 0) {
                 lagResult[topic] = topicLag;
            }
        });

        return {
            groupId: groupId,
            totalLag: totalLag.toString(), // Return total lag as string
            topics: lagResult
        };

    } catch (error) {
        console.error(`Error calculating lag for group ${groupId}:`, error);
        // Check if the error indicates the group doesn't exist or is inactive
        if (error instanceof Error && (error.message.includes('The group id does not exist') || error.message.includes('GROUP_ID_NOT_FOUND') || error.message.includes('COORDINATOR_NOT_AVAILABLE'))) {
             return { error: `Consumer group '${groupId}' not found or is not active.` };
        }
        throw new Error(`Failed to calculate lag for group ${groupId}: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Add more Kafka-specific functions as needed:
// - Produce message
// - Consume messages (potentially manage multiple consumers)
// - List topics (using admin client)
// - Describe cluster (using admin client)
// - Describe consumer groups (using admin client)