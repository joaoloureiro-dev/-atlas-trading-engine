import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.APP_DATABASE_URL;

if (!connectionString) {
    throw new Error("APP_DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({
    connectionString,
});

export const prisma = new PrismaClient({
    adapter,
});