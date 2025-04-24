import { Request, Response, NextFunction } from 'express';
import * as k8sService from '../services/k8sService';
import {
    getAdmin as getKafkaAdmin, // Renamed import
    getProducer as getKafkaProducer, // Renamed import
    listConsumerGroups as listGroupsService,
    calculateConsumerGroupLag as calculateLagService
} from '../services/kafkaService';
import { CreateTopicRequest, ProduceMessageRequest } from '../types';

// Error handling middleware (simple example)
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Error occurred:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
};

// Controller to list Kafka topics using the Admin client
export const listTopics = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const admin = getKafkaAdmin(); // Use renamed import
        const topics = await admin.listTopics();
        res.json({ topics });
    } catch (error) {
        next(error);
    }
};

// Controller to create a Kafka topic using Strimzi Kubernetes resource
export const createTopic = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topicName, partitions, replicas } = req.body as CreateTopicRequest;
        if (!topicName) {
            return res.status(400).json({ error: 'topicName is required' });
        }
        // Use k8sService to create the Strimzi KafkaTopic resource
        const result = await k8sService.createKafkaTopicResource(topicName, partitions, replicas);
        res.status(201).json({ message: `KafkaTopic resource '${topicName}' created or already exists.`, details: result });
    } catch (error) {
        next(error);
    }
};

// Controller to produce messages to a Kafka topic
export const produceMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topic, messages } = req.body as ProduceMessageRequest;
        if (!topic || !messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'topic and a non-empty array of messages are required' });
        }

        const producer = getKafkaProducer(); // Use renamed import
        const kafkaMessages = messages.map(msg => ({
            key: msg.key, // Can be undefined
            value: msg.value,
        }));

        const recordMetadata = await producer.send({ topic, messages: kafkaMessages });
        res.status(200).json({ message: 'Messages produced successfully', recordMetadata });
    } catch (error) {
        next(error);
    }
};

/**
 * Controller to list all consumer group IDs.
 */
export const listConsumerGroups = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const groupIds = await listGroupsService();
        res.status(200).json(groupIds);
    } catch (error) {
        console.error('Error in listConsumerGroups controller:', error);
        next(error); // Pass error to the global error handler
    }
};

/**
 * Controller to calculate lag for a specific consumer group.
 * Can optionally filter by topics provided in the query string (comma-separated).
 */
export const getConsumerGroupLag = async (req: Request, res: Response, next: NextFunction) => {
    const { groupId } = req.params;
    const { topics } = req.query; // e.g., /lag?topics=topic1,topic2

    let filterTopics: string[] | undefined;
    if (typeof topics === 'string' && topics.trim() !== '') {
        filterTopics = topics.split(',').map(t => t.trim());
    }

    try {
        const lagInfo = await calculateLagService(groupId, filterTopics);
        // Check if the service returned a specific error message (like group not found)
        if (lagInfo && typeof lagInfo === 'object' && 'error' in lagInfo) {
             res.status(404).json(lagInfo);
        } else {
             res.status(200).json(lagInfo);
        }
    } catch (error) {
        console.error(`Error in getConsumerGroupLag controller for group ${groupId}:`, error);
        next(error); // Pass error to the global error handler
    }
}

/**
 * Controller to list Kafka users (Strimzi KafkaUser CRs).
 */
export const listKafkaUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const users = await k8sService.listKafkaUsers();
        // Optionally simplify the response to only include relevant fields like metadata.name and status
        const userNames = users.map((user: any) => ({
            name: user?.metadata?.name,
            status: user?.status // Include status if available/useful
        }));
        res.status(200).json(userNames);
    } catch (error) {
        console.error('Error in listKafkaUsers controller:', error);
        next(error); // Pass error to the global error handler
    }
};

// Add more controllers as needed