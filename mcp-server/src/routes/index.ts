import { Router } from 'express';
import * as controllers from '../controllers';

const router = Router();

// Define API routes and link them to controller functions

// GET /topics - List all Kafka topics
router.get('/topics', controllers.listTopics);

// POST /topics - Create a new Kafka topic (via Strimzi)
router.post('/topics', controllers.createTopic);

// POST /produce - Produce messages to a topic
router.post('/produce', controllers.produceMessages);

// GET /consumer-groups - Describe consumer groups
router.get('/consumer-groups', controllers.describeConsumerGroups);

// Add more routes as needed

export default router;