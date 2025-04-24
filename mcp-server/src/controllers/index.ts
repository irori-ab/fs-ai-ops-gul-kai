import { Request, Response, NextFunction } from 'express';
import * as kafkaService from '../services/kafkaService';
import * as k8sService from '../services/k8sService';
import { CreateTopicRequest, ProduceMessageRequest } from '../types';

// Error handling middleware (simple example)
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Error occurred:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
};

// Controller to list Kafka topics using the Admin client
export const listTopics = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const admin = kafkaService.getAdmin();
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

        const producer = kafkaService.getProducer();
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

// Controller to get consumer group information
export const describeConsumerGroups = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const groupIds = req.query.groupIds as string | string[];
        if (!groupIds || (Array.isArray(groupIds) && groupIds.length === 0)) {
            return res.status(400).json({ error: 'groupIds query parameter is required' });
        }
        const admin = kafkaService.getAdmin();
        const groups = Array.isArray(groupIds) ? groupIds : [groupIds];
        const groupDescriptions = await admin.describeGroups(groups);
        res.json({ groupDescriptions });
    } catch (error) {
        next(error);
    }
};

// Add more controllers as needed (e.g., consume messages, delete topics)