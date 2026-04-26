import express from "express";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import systemRoutes from "./routes/system-routes.js";
import configRoutes from "./routes/config-routes.js";
import moduleRoutes from "./routes/module-routes.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json({ limit: "2mb" }));

app.use(systemRoutes);
app.use("/api", configRoutes);
app.use("/api", moduleRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
