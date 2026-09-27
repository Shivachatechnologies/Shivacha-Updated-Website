/** Prints every route (indexable + noindex) as JSON — input for the visual QA sweep. */
import { allRoutes, nonIndexedRoutes } from "../../lib/routes";
console.log(JSON.stringify([...allRoutes().map((r) => r.path), ...nonIndexedRoutes(), "/404-check-not-a-page"]));
