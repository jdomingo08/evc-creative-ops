import { Router, type IRouter } from "express";
import { fetchHandbook, getHandbook, getHandbookStatus } from "../lib/handbook";
import { GetHandbookStatusResponse, RefreshHandbookResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/handbook/status", async (_req, res): Promise<void> => {
  res.json(GetHandbookStatusResponse.parse(getHandbookStatus()));
});

router.post("/handbook/refresh", async (req, res): Promise<void> => {
  const result = await fetchHandbook();
  res.json(
    RefreshHandbookResponse.parse({
      lastFetchedAt: result.fetchedAt.toISOString(),
      sectionCount: result.sections.length,
      documentTitle: result.documentTitle,
      isLoaded: true,
    })
  );
});

export default router;
