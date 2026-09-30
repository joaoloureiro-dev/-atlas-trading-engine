INSERT INTO "tenants" (
        "id",
        "name",
        "status",
        "createdAt",
        "updatedAt"
    )
VALUES (
        '11111111-1111-4111-8111-111111111111',
        'Tenant A',
        'ACTIVE',
        NOW(),
        NOW()
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Tenant B',
        'ACTIVE',
        NOW(),
        NOW()
    ) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "broker_connections" (
        "id",
        "tenantId",
        "provider",
        "type",
        "status",
        "credentialReference",
        "createdAt",
        "updatedAt"
    )
VALUES (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111',
        'TEST_BROKER_A',
        'BROKER',
        'ACTIVE',
        'secret://tenant-a/test',
        NOW(),
        NOW()
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '22222222-2222-4222-8222-222222222222',
        'TEST_BROKER_B',
        'BROKER',
        'ACTIVE',
        'secret://tenant-b/test',
        NOW(),
        NOW()
    ) ON CONFLICT ("id") DO NOTHING;