import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { parseVisitorPolicy } from "./policy";

export const VISITOR_SETTING = "visitorTracking";

export const getVisitorPolicy = cache(async () => parseVisitorPolicy((await db.setting.findUnique({ where: { key: VISITOR_SETTING } }).catch(() => null))?.value));
