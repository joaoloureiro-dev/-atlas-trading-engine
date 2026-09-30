import type { Prisma } from "@prisma/client";

import { prisma } from "./client.js";
import {
    assertTenantContext,
    type TenantContext,
} from "./tenant-context.js";

export interface TenantTransactionContext extends TenantContext {
    correlationId: string;
}

export async function withTenantTransaction<T>(
    context: TenantTransactionContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
    const tenantContext = assertTenantContext(context);

    if (!context.correlationId.trim()) {
        throw new Error("A correlation ID is required for tenant transactions.");
    }

    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
      SELECT set_config(
        'app.current_tenant_id',
        ${tenantContext.tenantId},
        true
      )
    `;

        return operation(tx);
    });
}