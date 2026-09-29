import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(
    new URL("../../.env", import.meta.url),
);

dotenv.config({
    path: envPath,
});

export default defineConfig({
    schema: "prisma/schema.prisma",

    migrations: {
        path: "prisma/migrations",
    },

    datasource: {
        url: env("DATABASE_URL"),
    },
});