import express from 'express';
import {
    listTopics,
    createTopic,
    produceMessages,
    listConsumerGroups,
    getConsumerGroupLag,
    listKafkaUsers // Import the new controller
} from '../controllers';

const router = express.Router();

// Kafka Topic Routes
router.get('/topics', listTopics);
router.post('/topics', createTopic);

// Kafka Message Production Route
router.post('/produce', produceMessages);

// Kafka Consumer Group Routes
router.get('/groups', listConsumerGroups);
router.get('/groups/:groupId/lag', getConsumerGroupLag);

// Kafka User Routes (Strimzi CRs)
router.get('/users', listKafkaUsers); // Add the new route

// Add more routes as needed

export default router;