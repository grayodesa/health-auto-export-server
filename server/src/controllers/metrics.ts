import { Request, Response } from 'express';
import mongoose from 'mongoose';

import { IngestData } from '../models/IngestData';
import { IngestResponse } from '../models/IngestResponse';
import {
  BaseMetric,
  BloodPressureMetric,
  BloodPressureModel,
  HeartRateMetric,
  HeartRateModel,
  Metric,
  SleepMetric,
  SleepModel,
  mapMetric,
  createMetricModel,
} from '../models/Metric';
import { MetricName } from '../models/MetricName';
import { filterFields, parseDate } from '../utils';

export const getMetrics = async (req: Request, res: Response) => {
  try {
    const { from, to, include, exclude } = req.query;
    const selectedMetric = req.params.selected_metric as MetricName;

    if (!selectedMetric) {
      throw new Error('No metric selected');
    }

    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    let query = {};

    if (fromDate && toDate) {
      query = {
        date: {
          $gte: fromDate,
          $lte: toDate,
        },
      };
    }

    let metrics;

    switch (selectedMetric) {
      case MetricName.BLOOD_PRESSURE:
        metrics = await BloodPressureModel.find(query).lean();
        break;
      case MetricName.HEART_RATE:
        metrics = await HeartRateModel.find(query).lean();
        break;
      case MetricName.SLEEP_ANALYSIS:
        metrics = await SleepModel.find(query).lean();
        break;
      default:
        metrics = await createMetricModel(selectedMetric).find(query).lean();
    }

    // Process include/exclude filters if provided
    if (include || exclude) {
      metrics = metrics.map(metric => filterFields(metric, include, exclude));
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.json({ error: error instanceof Error ? error.message : 'Error getting metrics' });
  }
};

export const getAvailableMetrics = async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const collections = await db.listCollections().toArray();
    const excludeNames = new Set(['workouts', 'workout_routes']);

    const metricCollections = collections.filter(
      (c) => !excludeNames.has(c.name) && !c.name.startsWith('system.'),
    );

    const metricsInfo = await Promise.all(
      metricCollections.map(async (col) => {
        const collection = db.collection(col.name);
        const [count, oldest, newest] = await Promise.all([
          collection.countDocuments(),
          collection.findOne({}, { sort: { date: 1 }, projection: { date: 1 } }),
          collection.findOne({}, { sort: { date: -1 }, projection: { date: 1 } }),
        ]);

        return {
          name: col.name,
          count,
          firstDate: oldest?.date || null,
          lastDate: newest?.date || null,
        };
      }),
    );

    metricsInfo.sort((a, b) => b.count - a.count);

    res.json({ total: metricsInfo.length, metrics: metricsInfo });
  } catch (error) {
    console.error('Error getting available metrics:', error);
    res.status(500).json({ error: 'Error getting available metrics' });
  }
};

export const getLatestMetric = async (req: Request, res: Response) => {
  try {
    const selectedMetric = req.params.selected_metric as MetricName;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 1, 1), 100);

    if (!selectedMetric) {
      throw new Error('No metric selected');
    }

    let metrics;

    switch (selectedMetric) {
      case MetricName.BLOOD_PRESSURE:
        metrics = await BloodPressureModel.find({}).sort({ date: -1 }).limit(limit).lean();
        break;
      case MetricName.HEART_RATE:
        metrics = await HeartRateModel.find({}).sort({ date: -1 }).limit(limit).lean();
        break;
      case MetricName.SLEEP_ANALYSIS:
        metrics = await SleepModel.find({}).sort({ date: -1 }).limit(limit).lean();
        break;
      default:
        metrics = await createMetricModel(selectedMetric).find({}).sort({ date: -1 }).limit(limit).lean();
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error getting latest metric:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error getting latest metric' });
  }
};

export const getMetricDaily = async (req: Request, res: Response) => {
  try {
    const selectedMetric = req.params.selected_metric as MetricName;
    const fromDate = parseDate(req.query.from as string);
    const toDate = parseDate(req.query.to as string);

    if (!selectedMetric) {
      throw new Error('No metric selected');
    }

    const matchStage: any = {};
    if (fromDate && toDate) {
      matchStage.date = { $gte: fromDate, $lte: toDate };
    } else if (fromDate) {
      matchStage.date = { $gte: fromDate };
    } else if (toDate) {
      matchStage.date = { $lte: toDate };
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const collection = db.collection(selectedMetric);

    // Get units from latest record
    const latestRecord = await collection.findOne({}, { sort: { date: -1 } });
    const units = latestRecord?.units || null;

    // Unit conversion factors to metric
    const unitConversions: Record<string, { factor: number; targetUnit: string }> = {
      'fl_oz_us': { factor: 29.5735, targetUnit: 'ml' },
      'oz': { factor: 28.3495, targetUnit: 'g' },
      'lb': { factor: 453.592, targetUnit: 'g' },
    };
    const conversion = units ? unitConversions[units] : null;

    let groupFields: any;
    let projectFields: any;

    switch (selectedMetric) {
      case MetricName.HEART_RATE:
        groupFields = {
          min: { $min: '$Min' },
          avg: { $avg: '$Avg' },
          max: { $max: '$Max' },
        };
        projectFields = { date: '$_id', min: 1, avg: { $round: ['$avg', 1] }, max: 1, _id: 0 };
        break;
      case MetricName.BLOOD_PRESSURE:
        groupFields = {
          systolic: { $avg: '$systolic' },
          diastolic: { $avg: '$diastolic' },
        };
        projectFields = {
          date: '$_id',
          systolic: { $round: ['$systolic', 0] },
          diastolic: { $round: ['$diastolic', 0] },
          _id: 0,
        };
        break;
      case MetricName.SLEEP_ANALYSIS:
        groupFields = {
          core: { $sum: '$core' },
          rem: { $sum: '$rem' },
          deep: { $sum: '$deep' },
          awake: { $sum: '$awake' },
          inBed: { $sum: '$inBed' },
        };
        projectFields = {
          date: '$_id',
          core: { $round: ['$core', 0] },
          rem: { $round: ['$rem', 0] },
          deep: { $round: ['$deep', 0] },
          awake: { $round: ['$awake', 0] },
          inBed: { $round: ['$inBed', 0] },
          _id: 0,
        };
        break;
      default:
        groupFields = { qty: { $sum: '$qty' } };
        if (conversion) {
          projectFields = {
            date: '$_id',
            qty: { $round: [{ $multiply: ['$qty', conversion.factor] }, 1] },
            _id: 0,
          };
        } else {
          projectFields = { date: '$_id', qty: { $round: ['$qty', 1] }, _id: 0 };
        }
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' },
          },
          ...groupFields,
        },
      },
      { $project: projectFields },
      { $sort: { date: 1 as const } },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    res.json({
      metric: selectedMetric,
      units: conversion ? conversion.targetUnit : units,
      data: results,
    });
  } catch (error) {
    console.error('Error getting daily metric:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error getting daily metric' });
  }
};

export const getMetricSummary = async (req: Request, res: Response) => {
  try {
    const selectedMetric = req.params.selected_metric as MetricName;
    const fromDate = parseDate(req.query.from as string);
    const toDate = parseDate(req.query.to as string);

    if (!selectedMetric) {
      throw new Error('No metric selected');
    }

    const matchStage: any = {};
    if (fromDate && toDate) {
      matchStage.date = { $gte: fromDate, $lte: toDate };
    } else if (fromDate) {
      matchStage.date = { $gte: fromDate };
    } else if (toDate) {
      matchStage.date = { $lte: toDate };
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const collection = db.collection(selectedMetric);

    // Get units from latest record
    const latestRecord = await collection.findOne({}, { sort: { date: -1 } });
    const units = latestRecord?.units || null;

    let result: any;

    switch (selectedMetric) {
      case MetricName.BLOOD_PRESSURE: {
        const agg = await collection
          .aggregate([
            { $match: matchStage },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                systolic_avg: { $avg: '$systolic' },
                systolic_min: { $min: '$systolic' },
                systolic_max: { $max: '$systolic' },
                diastolic_avg: { $avg: '$diastolic' },
                diastolic_min: { $min: '$diastolic' },
                diastolic_max: { $max: '$diastolic' },
              },
            },
          ])
          .toArray();

        const stats = agg[0];
        result = {
          metric: selectedMetric,
          units,
          count: stats?.count || 0,
          period: { from: fromDate, to: toDate },
          systolic: stats
            ? { avg: Math.round(stats.systolic_avg * 100) / 100, min: stats.systolic_min, max: stats.systolic_max }
            : null,
          diastolic: stats
            ? { avg: Math.round(stats.diastolic_avg * 100) / 100, min: stats.diastolic_min, max: stats.diastolic_max }
            : null,
        };
        break;
      }

      case MetricName.HEART_RATE: {
        const agg = await collection
          .aggregate([
            { $match: matchStage },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                min_avg: { $avg: '$Min' },
                min_min: { $min: '$Min' },
                avg_avg: { $avg: '$Avg' },
                max_max: { $max: '$Max' },
                max_avg: { $avg: '$Max' },
              },
            },
          ])
          .toArray();

        const stats = agg[0];
        result = {
          metric: selectedMetric,
          units,
          count: stats?.count || 0,
          period: { from: fromDate, to: toDate },
          Min: stats
            ? { avg: Math.round(stats.min_avg * 100) / 100, min: stats.min_min }
            : null,
          Avg: stats
            ? { avg: Math.round(stats.avg_avg * 100) / 100 }
            : null,
          Max: stats
            ? { avg: Math.round(stats.max_avg * 100) / 100, max: stats.max_max }
            : null,
        };
        break;
      }

      case MetricName.SLEEP_ANALYSIS: {
        const agg = await collection
          .aggregate([
            { $match: matchStage },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                core_avg: { $avg: '$core' },
                rem_avg: { $avg: '$rem' },
                deep_avg: { $avg: '$deep' },
                awake_avg: { $avg: '$awake' },
                inBed_avg: { $avg: '$inBed' },
                core_sum: { $sum: '$core' },
                rem_sum: { $sum: '$rem' },
                deep_sum: { $sum: '$deep' },
                awake_sum: { $sum: '$awake' },
                inBed_sum: { $sum: '$inBed' },
              },
            },
          ])
          .toArray();

        const stats = agg[0];
        result = {
          metric: selectedMetric,
          units,
          count: stats?.count || 0,
          period: { from: fromDate, to: toDate },
          core: stats ? { avg: Math.round(stats.core_avg * 100) / 100, total: stats.core_sum } : null,
          rem: stats ? { avg: Math.round(stats.rem_avg * 100) / 100, total: stats.rem_sum } : null,
          deep: stats ? { avg: Math.round(stats.deep_avg * 100) / 100, total: stats.deep_sum } : null,
          awake: stats ? { avg: Math.round(stats.awake_avg * 100) / 100, total: stats.awake_sum } : null,
          inBed: stats ? { avg: Math.round(stats.inBed_avg * 100) / 100, total: stats.inBed_sum } : null,
        };
        break;
      }

      default: {
        const agg = await collection
          .aggregate([
            { $match: matchStage },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                avg: { $avg: '$qty' },
                min: { $min: '$qty' },
                max: { $max: '$qty' },
                sum: { $sum: '$qty' },
              },
            },
          ])
          .toArray();

        const stats = agg[0];
        result = {
          metric: selectedMetric,
          units,
          count: stats?.count || 0,
          period: { from: fromDate, to: toDate },
          avg: stats ? Math.round(stats.avg * 100) / 100 : null,
          min: stats?.min ?? null,
          max: stats?.max ?? null,
          sum: stats?.sum ?? null,
        };
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting metric summary:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error getting metric summary' });
  }
};

export const saveMetrics = async (ingestData: IngestData): Promise<IngestResponse> => {
  try {
    const response: IngestResponse = {};
    const metricsData = ingestData.data.metrics;

    if (!metricsData || metricsData.length === 0) {
      response.metrics = {
        success: true,
        error: 'No metrics data provided',
      };
      return response;
    }

    // Group metrics by type and map the data
    const metricsByType = metricsData.reduce(
      (acc, metric) => {
        const mappedMetrics = mapMetric(metric);
        const key = metric.name;
        acc[key] = acc[key] || [];
        acc[key].push(...mappedMetrics);
        return acc;
      },
      {} as {
        [key: string]: Metric[];
      },
    );

    const saveOperations = Object.entries(metricsByType).map(([key, metrics]) => {
      switch (key as MetricName) {
        case MetricName.BLOOD_PRESSURE:
          const bpMetrics = metrics as BloodPressureMetric[];
          return BloodPressureModel.bulkWrite(
            bpMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
        case MetricName.HEART_RATE:
          const hrMetrics = metrics as HeartRateMetric[];
          return HeartRateModel.bulkWrite(
            hrMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
        case MetricName.SLEEP_ANALYSIS:
          const sleepMetrics = metrics as SleepMetric[];
          return SleepModel.bulkWrite(
            sleepMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
        default:
          const baseMetrics = metrics as BaseMetric[];
          const model = createMetricModel(key as MetricName);
          return model.bulkWrite(
            baseMetrics.map((metric) => ({
              updateOne: {
                filter: { source: metric.source, date: metric.date },
                update: { $set: metric },
                upsert: true,
              },
            })),
          );
      }
    });

    await Promise.all(saveOperations);

    response.metrics = {
      success: true,
      message: `${metricsData.length} metrics saved successfully`,
    };

    return response;
  } catch (error) {
    console.error('Error saving metrics:', error);

    const errorResponse: IngestResponse = {};
    errorResponse.metrics = {
      success: false,
      error: error instanceof Error ? error.message : 'Error saving metrics',
    };

    return errorResponse;
  }
};
