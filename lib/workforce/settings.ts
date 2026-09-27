import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { parseWorkforce } from "./policy";

export const getWorkforcePolicy = cache(async () => parseWorkforce((await db.setting.findUnique({ where: { key: "workforce" } }).catch(() => null))?.value));
