import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tiktokRouter from "./tiktok";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tiktokRouter);

export default router;
