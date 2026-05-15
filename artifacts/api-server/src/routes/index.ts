import { Router, type IRouter } from "express";
import healthRouter from "./health";
import handbookRouter from "./handbook";
import { conversationsRouter, messagesRouter } from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(handbookRouter);
router.use(conversationsRouter);
router.use(messagesRouter);

export default router;
