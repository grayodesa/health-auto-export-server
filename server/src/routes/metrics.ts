import express from 'express';

import { getAvailableMetrics, getLatestMetric, getMetricSummary, getMetrics } from '../controllers/metrics';

const router = express.Router();

router.get('/', getAvailableMetrics);
router.get('/:selected_metric/latest', getLatestMetric);
router.get('/:selected_metric/summary', getMetricSummary);
router.get('/:selected_metric', getMetrics);

export default router;
