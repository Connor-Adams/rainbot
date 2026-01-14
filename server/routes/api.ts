import express from 'express';
import soundsRoutes from './api/sounds';
import playbackRoutes from './api/playback';
import queueRoutes from './api/queue';
import statusRoutes from './api/status';
import trackingRoutes from './api/tracking';

const router = express.Router();

router.use(soundsRoutes);
router.use(playbackRoutes);
router.use(queueRoutes);
router.use(statusRoutes);
router.use(trackingRoutes);

export default router;
