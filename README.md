# nestjs-crud

[![npm version](https://badge.fury.io/js/nestjs-crud.svg)](https://badge.fury.io/js/nestjs-crud)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful library that automatically generates RESTful CRUD APIs based on NestJS and TypeORM.

## 📋 Table of Contents

-   [Features](#features)
-   [Installation](#installation)
-   [Quick Start](#quick-start)
-   [Basic CRUD Operations](#basic-crud-operations)
-   [RESTful Query Parameters](#restful-query-parameters)
-   [Advanced Configuration](#advanced-configuration)
    -   [Security Control Settings](#security-control-settings)
    -   [Lifecycle Hooks](#lifecycle-hooks)
        -   [Decorator Approach (NEW! Recommended)](#🎯-method-1-decorator-approach-new--recommended)
        -   [Routes Configuration Approach (Legacy)](#🛠️-method-2-routes-configuration-approach-legacy)
    -   [Response Helpers (crudResponse)](#📋-response-helpers-crudresponse)
    -   [CrudQueryHelper for Custom Routes](#crudqueryhelper-for-custom-routes)
-   [Soft Delete and Recovery](#🗑️-soft-delete-and-recovery)
-   [Migration Guide](#migration-guide)
-   [API Documentation](#api-documentation)
-   [Examples](#examples)
-   [License](#license)

## ✨ Features

### 🚀 Core Features

-   **Automatic CRUD Route Generation**: Auto-generate APIs based on TypeORM entities
-   **RESTful Standard Compliance**: API endpoints following industry standards
-   **Automatic Swagger Generation**: Auto-generate and maintain API documentation
-   **Powerful Validation**: Data validation through class-validator
-   **Full TypeScript Support**: Type safety and IntelliSense support

### 🔍 Advanced Query Features

-   **Filtering**: Support for 30+ filter operators
-   **Sorting**: Multi-field sorting support
-   **Relation Inclusion**: Relationship data loading with nested relation support
-   **Pagination**: Support for Offset, Cursor, and Number-based pagination
-   **Search**: Complex search condition support

### 🛠 Database Features

-   **Soft Delete**: Mark data as deleted without actual deletion
-   **Recovery**: Recover soft-deleted data
-   **Upsert**: Update if exists, create if doesn't exist
-   **Lifecycle Hooks**: Execute custom logic at each stage of CRUD operations
    -   **Decorator Approach 🆕**: Intuitive method decorators like `@BeforeCreate()`, `@AfterUpdate()`, `@BeforeDestroy()`, `@BeforeRecover()`
    -   **Routes Configuration Approach**: Legacy `routes.hooks` configuration approach
-   **Full-Text Search 🆕**: PostgreSQL FTS support with GIN indexes and `plainto_tsquery`

### 🔒 Security and Control Features

-   **Filter Restrictions**: Only columns specified in allowedFilters can be filtered
-   **Parameter Restrictions**: Only columns specified in allowedParams can be used as request parameters
-   **Relation Inclusion Restrictions**: Only relations specified in allowedIncludes can be included
-   **Default Block Policy**: If not configured, all filtering/parameters/relation inclusion is blocked
-   **Field Exclusion 🆕**: Global and route-specific field exclusion from responses

### ⚡ Performance Features (v0.2.7+)

-   **Built-in Caching**: Memory, Redis, and multi-tier caching strategies
-   **Lazy Loading**: Load relations only when needed
-   **Auto Relation Detection**: Automatic N+1 query optimization
-   **Enhanced Services**: `CacheableCrudService` and `EnhancedCrudService` for advanced features

## 📦 Installation

```bash
npm install nestjs-crud
# or
yarn add nestjs-crud
```

### Required Dependencies

```bash
npm install @nestjs/common @nestjs/core typeorm class-validator class-transformer
```

## 🚀 Quick Start

### 1. Create Entity

```typescript
// user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsString, IsEmail, IsOptional } from 'class-validator';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    @Column({ unique: true })
    @IsEmail()
    email: string;

    @Column({ nullable: true })
    @IsOptional()
    @IsString()
    bio?: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}
```

### 2. Create Service

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrudService } from 'nestjs-crud';
import { User } from './user.entity';

@Injectable()
export class UserService extends CrudService<User> {
    constructor(
        @InjectRepository(User)
        repository: Repository<User>,
    ) {
        super(repository);
    }
}
```

### 3. Create Controller

```typescript
// user.controller.ts
import { Controller } from '@nestjs/common';
import { Crud, BeforeCreate } from 'nestjs-crud';
import { UserService } from './user.service';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

@Controller('users')
@Crud({
    entity: User,
})
export class UserController {
    constructor(public readonly crudService: UserService) {}

    // 🆕 NEW! Add logic easily with lifecycle hook decorators
    @BeforeCreate()
    async hashPassword(body: any, context: any) {
        if (body.password) {
            body.password = await bcrypt.hash(body.password, 10);
        }
        return body;
    }
}
```

### 4. Module Configuration

```typescript
// user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './user.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User])],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
```

## 🎯 Basic CRUD Operations

The above configuration automatically generates the following API endpoints:

| HTTP Method | Endpoint             | Description             | Method Name |
| ----------- | -------------------- | ----------------------- | ----------- |
| **GET**     | `/users`             | Get list of users       | `index`     |
| **GET**     | `/users/:id`         | Get specific user       | `show`      |
| **POST**    | `/users`             | Create new user         | `create`    |
| **PUT**     | `/users/:id`         | Update user information | `update`    |
| **DELETE**  | `/users/:id`         | Delete user             | `destroy`   |
| **POST**    | `/users/upsert`      | Create or update user   | `upsert`    |
| **POST**    | `/users/:id/recover` | Recover deleted user    | `recover`   |

### 📊 Unified Response Structure

All CRUD operations provide a consistent response structure with metadata:

#### GET /users (index) - Pagination Response

```json
{
    "data": [
        { "id": 1, "name": "John Doe", "email": "john@example.com" },
        { "id": 2, "name": "Jane Smith", "email": "jane@example.com" },
        { "id": 3, "name": "Bob Johnson", "email": "bob@example.com" }
    ],
    "metadata": {
        "operation": "index",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 3,
        "includedRelations": ["department", "posts"],
        "pagination": {
            "type": "offset",
            "total": 150,
            "page": 1,
            "pages": 15,
            "offset": 10,
            "nextCursor": "eyJpZCI6M30="
        }
    }
}
```

#### GET /users (cursor pagination)

```json
{
    "data": [
        { "id": 4, "name": "Alice Brown", "email": "alice@example.com" },
        { "id": 5, "name": "Charlie Wilson", "email": "charlie@example.com" }
    ],
    "metadata": {
        "operation": "index",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 2,
        "pagination": {
            "type": "cursor",
            "total": 150,
            "limit": 2,
            "totalPages": 75,
            "nextCursor": "eyJpZCI6NX0="
        }
    }
}
```

#### GET /users/:id (show)

```json
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "metadata": {
        "operation": "show",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1,
        "includedRelations": ["department"],
        "excludedFields": ["password"]
    }
}
```

#### POST /users (create)

```json
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "metadata": {
        "operation": "create",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "affectedCount": 1
    }
}
```

#### PUT /users/:id (update)

```json
{
    "data": {
        "id": 1,
        "name": "John Doe Updated",
        "email": "john_updated@example.com",
        "updatedAt": "2024-01-15T11:00:00.000Z"
    },
    "metadata": {
        "operation": "update",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1
    }
}
```

#### POST /users/upsert (upsert)

```json
{
    "data": {
        "id": 1,
        "name": "John Doe Upsert",
        "email": "john_upsert@example.com"
    },
    "metadata": {
        "operation": "upsert",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1,
        "isNew": false // true: newly created, false: existing data updated
    }
}
```

#### DELETE /users/:id (destroy)

```json
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "deletedAt": "2024-01-15T11:00:00.000Z"
    },
    "metadata": {
        "operation": "destroy",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1,
        "wasSoftDeleted": true // true: soft delete, false: hard delete
    }
}
```

#### POST /users/:id/recover (recover)

```json
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "deletedAt": null
    },
    "metadata": {
        "operation": "recover",
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1,
        "wasSoftDeleted": true // Whether it was soft deleted before recovery
    }
}
```

#### Multiple Creation (POST /users - array submission)

```json
{
    "data": [
        { "id": 1, "name": "John Doe", "email": "john@example.com" },
        { "id": 2, "name": "Jane Smith", "email": "jane@example.com" }
    ],
    "metadata": {
        "operation": "create",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "affectedCount": 2
    }
}
```

### 📝 Bulk Operations Support

| Operation | Single | Bulk (Multiple) | Description |
|-----------|--------|-----------------|-------------|
| **CREATE** | ✅ Supported | ✅ Supported | Submit single object or array of objects |
| **UPDATE** | ✅ Supported | ✅ Supported | Submit array with ID for each item |
| **UPSERT** | ✅ Supported | ✅ Supported | Submit array of objects for bulk upsert |
| **DELETE** | ✅ Supported | ✅ Supported | Submit array of IDs or conditions |
| **RECOVER** | ✅ Supported | ✅ Supported | Submit array of IDs for bulk recovery |

#### Bulk Create Example

```bash
# Single creation
POST /users
{
    "name": "John Doe",
    "email": "john@example.com"
}

# Bulk creation (array submission)
POST /users
[
    { "name": "John Doe", "email": "john@example.com" },
    { "name": "Jane Smith", "email": "jane@example.com" },
    { "name": "Bob Johnson", "email": "bob@example.com" }
]
```

#### Bulk Update Example (NEW! 🆕)

```bash
# Single update
PUT /users/1
{
    "name": "John Updated",
    "email": "john.updated@example.com"
}

# Bulk update (array submission with IDs)
PUT /users
[
    { "id": 1, "name": "John Updated", "email": "john.updated@example.com" },
    { "id": 2, "name": "Jane Updated", "email": "jane.updated@example.com" },
    { "id": 3, "name": "Bob Updated", "email": "bob.updated@example.com" }
]
```

#### Bulk Upsert Example (NEW! 🆕)

```bash
# Single upsert
POST /users/upsert
{
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
}

# Bulk upsert (array submission)
POST /users/upsert
[
    { "id": 1, "name": "John Doe", "email": "john@example.com" },  // Update if exists
    { "name": "New User", "email": "new@example.com" },             // Create if not exists
    { "id": 99, "name": "Another User", "email": "another@example.com" }
]
```

#### Bulk Delete Example (NEW! 🆕)

```bash
# Single delete
DELETE /users/1

# Bulk delete (array of IDs in query params)
DELETE /users?ids=1,2,3

# Or via request body
DELETE /users
{
    "ids": [1, 2, 3]
}
```

#### Bulk Recover Example (NEW! 🆕)

```bash
# Single recover
POST /users/1/recover

# Bulk recover (array of IDs)
POST /users/recover
{
    "ids": [1, 2, 3]
}
```

**Note**: All bulk operations support lifecycle hooks and will execute them for each item in the batch.

#### ⚠️ Bulk Operations & Hook Parallelism Contract

For bulk `create` / `update` / `upsert` / `recover` requests, configuration hooks
(`assignBefore`, `assignAfter`, `saveBefore`, `saveAfter`, `recoverBefore`, `recoverAfter`)
are executed **per item, in parallel** via `Promise.all` — not sequentially in array order.

```typescript
hooks: {
    assignBefore: async (body, context) => {
        // Runs once per item in the batch, concurrently with the other items.
        // Do NOT rely on execution order between items, and do NOT share/mutate
        // state across items (e.g. an in-memory counter or "previous item" cache).
        return body;
    },
},
```

Implications:

-   **No cross-item ordering guarantees.** Item 0's hook may finish before or after item 2's.
-   **Hooks must be item-local.** Each hook invocation should only read/write the `body`/`entity`
    and `context` it was given — never assume another item's hook has already run.
-   **Side effects must be idempotent/order-independent** (e.g. writing to an external service,
    incrementing a shared counter) since concurrent execution can interleave arbitrarily.
-   This is the current (since `0.5.1`) and intended behavior. A sequential/opt-in mode may be
    added later if a real use case requires strict per-item ordering — it does not exist today.

#### ⚠️ Upgrade notes: behavior changes to review (`0.5.2`)

`0.5.2` changes two observable behaviors compared to earlier `0.5.x` releases. Both are
correctness fixes, but either one can change what your existing consumers experience — review
both before upgrading.

1. **Bulk `upsert` now preserves the primary key, so it can UPDATE existing rows.**

    Before this fix:

    -   With `allowedParams` configured, the primary key was stripped from each bulk upsert item,
        so every item was always treated as a **new INSERT** (never matched an existing row).
    -   Without `allowedParams`, sending a primary key in a bulk upsert body was **always rejected
        with 422**.

    Since this fix:

    -   The primary key field is no longer filtered out. If an item's body includes a primary key
        that matches an existing row, that row is **updated**. If the primary key does not match
        an existing row, a **new row is inserted using the client-supplied primary key** (instead
        of a server-generated one).

    **Who is affected:** any consumer exposing bulk `upsert` without a hook/guard that validates
    or authorizes the primary key in the request body. Previously such an endpoint could only ever
    create new rows with server-assigned ids; after upgrading, an authenticated client can now
    overwrite (or insert-with-arbitrary-id) any row it can address by primary key.

    **What to check before upgrading:** if you expose bulk `upsert`, add an `assignBefore` /
    `saveBefore` hook (or a guard) that verifies the caller is allowed to write the primary key(s)
    present in the request body, or restrict/remove `allowedParams` entries for the primary key
    field if client-controlled upserts-by-id are not intended for that resource.

    **Composite primary keys:** this behavior assumes a single-column primary key. The request
    interceptor preserves *all* primary key fields on the body, but existing-row matching only
    uses the first primary key component. On a resource with a composite primary key, bulk
    `upsert` can therefore match and **update the wrong row** if only the first component
    happens to coincide with an existing row. Do not expose bulk `upsert` on composite-primary-key
    resources without a hook/guard that validates the full key, or exclude them from bulk `upsert`
    entirely.

2. **`SHOW` now runs configuration hooks (`assignBefore` / `assignAfter`).**

    Before this fix, hooks configured under `routes[Method.SHOW].hooks` (or the equivalent
    `@BeforeShow()` / `@AfterShow()` decorators) were **not executed** — they were silently
    dormant.

    Since this fix, these hooks run on every `SHOW` request, consistent with `create` / `update` /
    `upsert` / `destroy` / `recover`.

    **Who is affected:** any consumer that already configured `show` hooks (expecting them to be
    dormant, or added defensively for future use) will see them **start executing automatically**
    on upgrade — no code change is required to trigger this.

    **What to check before upgrading:** search your codebase for `hooks` under `Method.SHOW` /
    `@BeforeShow()` / `@AfterShow()` and confirm the hook body is safe to run in production (e.g.
    it doesn't assume it's unreachable, and it doesn't skip returning a value — see the note above
    about hooks that return `undefined` being treated as "no change").

## 🔍 RESTful Query Parameters

### 📋 Filtering

#### ⚠️ Important: Query Parameter Format

nestjs-crud uses **underscore separator format**. MongoDB-style `$` operators are not supported.

```bash
# ✅ Correct format (underscore separator)
GET /users?filter[email_eq]=test@example.com
GET /users?filter[age_gte]=18
GET /users?filter[name_like]=%John%

# ❌ Unsupported format (MongoDB style)
GET /users?filter[email][$eq]=test@example.com     # Won't work
GET /users?filter[age][$gte]=18                    # Won't work
GET /users?filter[name][$like]=%John%              # Won't work
```

**Parsing method:**

-   `filter[field_operator]=value` → ✅ Works correctly
-   `filter[field][$operator]=value` → ❌ Filter is ignored

#### Basic Comparison Operators

```bash
# Equals
GET /users?filter[name_eq]=John Doe
GET /users?filter[age_eq]=25

# Not equals
GET /users?filter[status_ne]=inactive
GET /users?filter[role_ne]=admin
```

#### Size Comparison Operators

```bash
# Greater than/Greater than or equal
GET /users?filter[age_gt]=18
GET /users?filter[age_gte]=18

# Less than/Less than or equal
GET /users?filter[age_lt]=65
GET /users?filter[age_lte]=65

# Range
GET /users?filter[age_between]=18,65
GET /users?filter[salary_between]=30000,80000
```

#### String Pattern Operators

```bash
# LIKE pattern (case sensitive)
GET /users?filter[name_like]=%John%
GET /users?filter[email_like]=%@gmail.com

# ILIKE pattern (case insensitive)
GET /users?filter[name_ilike]=%JOHN%
GET /users?filter[email_ilike]=%GMAIL%

# Start/End patterns
GET /users?filter[name_start]=John
GET /users?filter[email_end]=.com

# Contains
GET /users?filter[bio_contains]=developer
```

#### Array/List Operators

```bash
# Include (IN)
GET /users?filter[id_in]=1,2,3,4,5
GET /users?filter[role_in]=admin,manager,user

# Exclude (NOT IN)
GET /users?filter[status_not_in]=deleted,banned
GET /users?filter[role_not_in]=guest
```

#### NULL/Existence Check Operators

```bash
# NULL check
GET /users?filter[deleted_at_null]=true
GET /users?filter[last_login_null]=true

# NOT NULL check
GET /users?filter[avatar_not_null]=true
GET /users?filter[email_verified_at_not_null]=true

# Existence check (not null and not empty string)
GET /users?filter[bio_present]=true

# Blank check (null or empty string)
GET /users?filter[middle_name_blank]=true
```

#### Relation Filtering

```bash
# Nested relation filtering
GET /posts?filter[author.name_like]=%John%
GET /posts?filter[author.department.name_eq]=Development
GET /comments?filter[post.author.role_eq]=admin
```

### 🔄 Sorting

```bash
# Single field sorting
GET /users?sort=name                    # Name ascending
GET /users?sort=-created_at             # Creation date descending

# Multi-field sorting
GET /users?sort=role,name,-created_at   # Role>Name>Creation date order

# Relation field sorting
GET /posts?sort=author.name,-created_at
GET /users?sort=department.name,name
```

### 🔗 Including Relations

**⚠️ Important Changes**:

-   The `routes.relations` option has been deprecated.
-   Now use `allowedIncludes` configuration and `include` query parameter together.
-   **Enhanced Security**: If allowedIncludes is not configured, all relation inclusion is blocked.

```bash
# Single relation (only relations allowed in allowedIncludes)
GET /users?include=department
GET /posts?include=author

# Multiple relations
GET /users?include=department,posts
GET /posts?include=author,comments

# Nested relations
GET /posts?include=author,comments.author
GET /users?include=department.company,posts.comments
GET /orders?include=customer.address,items.product.category
```

#### Before and After Comparison

```typescript
// ❌ Previous approach (deprecated)
@Crud({
  entity: User,
  routes: {
    index: {
      relations: ['department', 'posts'], // Relations included by default
    }
  }
})

// ✅ New approach (enhanced security)
@Crud({
  entity: User,
  allowedIncludes: ['department', 'posts'], // Explicitly specify allowed relations
  routes: {
    index: {
      allowedIncludes: ['department', 'posts', 'posts.comments'], // Additional method-specific allowances
    }
  }
})

// When relations are needed, explicitly request via query parameter
GET /users?include=department,posts
```

#### Security Policy

```typescript
// 1. allowedIncludes not configured → All relations blocked
@Crud({
  entity: User,
  // No allowedIncludes → All includes ignored
})

// 2. Global configuration
@Crud({
  entity: User,
  allowedIncludes: ['department'], // Only department allowed
})

// 3. Method-specific configuration (higher priority)
@Crud({
  entity: User,
  allowedIncludes: ['department'], // Global: department only
  routes: {
    index: {
      allowedIncludes: ['department', 'posts'], // INDEX allows posts additionally
    },
    show: {
      // No allowedIncludes → Uses global configuration: department only
    },
  },
})
```

#### Benefits

1. **Enhanced Security**: Only explicitly allowed relations can be included
2. **Explicit Requests**: Selectively load only necessary relations
3. **Performance Optimization**: Prevent unnecessary relation loading
4. **N+1 Problem Prevention**: Handle necessary relations with JOINs only
5. **Fine-grained Control**: Apply different relation inclusion policies per method

### 📄 Pagination

#### Page Number Method

```bash
GET /users?page[number]=1&page[size]=10     # Page 1, 10 items per page
GET /users?page[number]=3&page[size]=20     # Page 3, 20 items per page
```

#### Offset Method

```bash
GET /users?page[offset]=0&page[limit]=10    # First 10 items
GET /users?page[offset]=20&page[limit]=10   # 10 items starting from 20th
```

#### Cursor Method

```bash
GET /users?page[cursor]=eyJpZCI6MTB9&page[size]=10
```

### 📊 Pagination Response Structure

#### Offset/Number Pagination Response

```json
{
    "data": [
        { "id": 1, "name": "John Doe", "email": "john@example.com" },
        { "id": 2, "name": "Jane Smith", "email": "jane@example.com" }
    ],
    "metadata": {
        "page": 1, // Current page number
        "pages": 10, // Total pages ✅
        "total": 95, // Total data count
        "offset": 10, // Next offset
        "nextCursor": "..." // Next page token
    }
}
```

#### Cursor Pagination Response

```json
{
    "data": [
        { "id": 1, "name": "John Doe", "email": "john@example.com" },
        { "id": 2, "name": "Jane Smith", "email": "jane@example.com" }
    ],
    "metadata": {
        "total": 95, // Total data count
        "totalPages": 10, // Total pages ✅
        "limit": 10, // Page size
        "nextCursor": "..." // Next page token
    }
}
```

### 🔍 Complex Query Examples

Check out complex query usage through real-world use cases:

#### User Search Example

```bash
# Get 10 active adult users sorted by recent registration
GET /users?filter[status_eq]=active&
          filter[age_gte]=18&
          sort=-created_at&
          page[number]=1&page[size]=10
```

#### Post Search Example

```bash
# Get published posts by specific author with author information
GET /posts?filter[author.name_like]=%John%&
          filter[status_eq]=published&
          filter[created_at_gte]=2024-01-01&
          include=author,comments&
          sort=-created_at,title&
          page[number]=1&page[size]=20
```

#### Order Search Example

```bash
# Get completed orders with customer and order item information
GET /orders?filter[status_eq]=completed&
           filter[total_amount_gte]=50000&
           filter[created_at_between]=2024-01-01,2024-12-31&
           include=customer.address,items.product&
           sort=-created_at&
           page[offset]=0&page[limit]=50
```

## ⚙️ Advanced Configuration

### 🔒 Security Control Settings

#### Filter Restrictions - allowedFilters

```typescript
@Controller('users')
@Crud({
    entity: User,
    allowedFilters: ['name', 'email', 'status'], // Global: only these columns allowed for filtering
    routes: {
        index: {
            allowedFilters: ['name', 'email', 'status', 'createdAt'], // INDEX allows more columns
        },
        show: {
            allowedFilters: ['name'], // SHOW allows only name
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

**Operation examples:**

```bash
# ✅ Allowed columns - works normally
GET /users?filter[name_like]=%John%
GET /users?filter[email_eq]=test@example.com

# ❌ Disallowed columns - filter ignored
GET /users?filter[password_eq]=secret  # Ignored if password not in allowedFilters
```

#### Parameter Restrictions - allowedParams

```typescript
@Controller('users')
@Crud({
    entity: User,
    allowedParams: ['name', 'email'], // Global: only these columns allowed as request parameters
    routes: {
        create: {
            allowedParams: ['name', 'email', 'status'], // CREATE allows additional status
        },
        update: {
            allowedParams: ['name'], // UPDATE allows only name
        },
        upsert: {
            // No allowedParams -> uses global configuration: name, email only
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

**Operation examples:**

```typescript
// Configuration: allowedParams: ['name', 'email']

// ✅ Only allowed parameters are processed
POST /users
{
  "name": "John Doe",        // ✅ Processed
  "email": "john@test.com",  // ✅ Processed
  "password": "secret",      // ❌ Removed (not in allowedParams)
  "internal_id": 123         // ❌ Removed (not in allowedParams)
}

// Actually processed data:
{
  "name": "John Doe",
  "email": "john@test.com"
}
```

#### Relation Inclusion Restrictions - allowedIncludes

```typescript
@Controller('posts')
@Crud({
    entity: Post,
    allowedIncludes: ['author'], // Global: only author relation allowed
    routes: {
        index: {
            allowedIncludes: ['author', 'comments', 'tags'], // INDEX allows more relations
        },
        show: {
            allowedIncludes: ['author', 'comments.author'], // SHOW allows nested relations
        },
    },
})
export class PostController {
    constructor(public readonly crudService: PostService) {}
}
```

**Operation examples:**

```bash
# ✅ Only allowed relations are included
GET /posts?include=author           # ✅ Included
GET /posts?include=comments         # ✅ Included (in INDEX)
GET /posts?include=author,comments  # ✅ Both included

# ❌ Disallowed relations are ignored
GET /posts?include=author,likes,comments  # ✅ Only author,comments included (likes ignored)
GET /posts?include=profile               # ❌ All relations ignored (profile not allowed)
```

### 🎛️ CRUD Options Configuration

```typescript
@Controller('users')
@Crud({
    entity: User,
    only: ['index', 'show', 'create', 'update'], // Enable only specific methods
    allowedFilters: ['name', 'email', 'status'], // Allowed filter columns
    allowedParams: ['name', 'email', 'bio'], // Allowed request parameters
    allowedIncludes: ['department', 'posts'], // Allowed relation inclusions
    routes: {
        index: {
            paginationType: PaginationType.OFFSET,
            numberOfTake: 20,
            sort: Sort.DESC,
            softDelete: false,
            allowedFilters: ['name', 'email', 'status', 'createdAt'], // Method-specific filter settings
            allowedIncludes: ['department', 'posts', 'posts.comments'], // Method-specific relation settings
        },
        show: {
            softDelete: true,
            allowedFilters: ['name', 'email'], // SHOW has restrictive filtering
            allowedIncludes: ['department'], // SHOW has basic relations only
        },
        create: {
            hooks: {
                assignBefore: async (body, context) => {
                    // Email normalization
                    if (body.email) {
                        body.email = body.email.toLowerCase().trim();
                    }
                    return body;
                },
                saveAfter: async (entity, context) => {
                    // Send user creation event
                    await eventBus.publish('user.created', entity);
                    return entity;
                },
            },
        },
        update: {
            hooks: {
                assignBefore: async (body, context) => {
                    body.updatedAt = new Date();
                    return body;
                },
            },
        },
        destroy: {
            softDelete: true,
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

### 🔄 Lifecycle Hooks

Execute custom logic at each stage of CRUD operations through lifecycle hooks.

#### Hook Types

| Hook            | Execution Point            | Purpose                          | Supported Routes              |
| --------------- | -------------------------- | -------------------------------- | ----------------------------- |
| `assignBefore`  | **Before** data assignment | Input validation, transformation | create, update, upsert, show* |
| `assignAfter`   | **After** data assignment  | Entity post-processing           | create, update, upsert, show* |
| `saveBefore`    | **Before** saving          | Final validation, business logic | create, update, upsert        |
| `saveAfter`     | **After** saving           | Notifications, event generation  | create, update, upsert        |
| `destroyBefore` | **Before** entity deletion | Permission check, cleanup prep   | destroy                       |
| `destroyAfter`  | **After** entity deletion  | Audit logs, external sync        | destroy                       |
| `recoverBefore` | **Before** entity recovery | Permission check, recovery prep  | recover                       |
| `recoverAfter`  | **After** entity recovery  | Audit logs, notifications        | recover                       |

**Note**: For `show` operation, `assignBefore` processes query parameters before entity lookup, and `assignAfter` processes the retrieved entity before returning it.

**Note**: For bulk operations (arrays of items), these hooks run **per item, in parallel** — see [Bulk Operations & Hook Parallelism Contract](#️-bulk-operations--hook-parallelism-contract).

#### 🎯 Method 1: Decorator Approach (NEW! 🆕 Recommended)

**Use decorators on class methods for intuitive usage.**

##### Available Decorators

**Basic decorators:**

```typescript
@BeforeCreate()  // Execute before CREATE (assignBefore)
@AfterCreate()   // Execute after CREATE (saveAfter)
@BeforeUpdate()  // Execute before UPDATE (assignBefore)
@AfterUpdate()   // Execute after UPDATE (saveAfter)
@BeforeUpsert()  // Execute before UPSERT (assignBefore)
@AfterUpsert()   // Execute after UPSERT (saveAfter)
@BeforeDestroy() // Execute before DESTROY (destroyBefore)
@AfterDestroy()  // Execute after DESTROY (destroyAfter)
@BeforeRecover() // Execute before RECOVER (recoverBefore)
@AfterRecover()  // Execute after RECOVER (recoverAfter)
@BeforeShow()    // Execute before SHOW (assignBefore for show)
@AfterShow()     // Execute after SHOW (assignAfter for show)
```

**Consistent fine-grained control decorators:**

```typescript
@BeforeAssign('create' | 'update' | 'upsert' | 'show')  // Before assignment
@AfterAssign('create' | 'update' | 'upsert' | 'show')   // After assignment
@BeforeSave('create' | 'update' | 'upsert')    // Before saving
@AfterSave('create' | 'update' | 'upsert')     // After saving
@BeforeDestroy('destroy')                       // Before entity deletion
@AfterDestroy('destroy')                        // After entity deletion
@BeforeRecover('recover')                       // Before entity recovery
@AfterRecover('recover')                        // After entity recovery
```

**🆕 New 4-stage detailed decorators (clearer control):**

```typescript
// === ASSIGN stage (data assignment to entity) ===
@BeforeAssignCreate()  @BeforeAssignUpdate()  @BeforeAssignUpsert()  @BeforeAssignShow()  // Before assignment
@AfterAssignCreate()   @AfterAssignUpdate()   @AfterAssignUpsert()   @AfterAssignShow()   // After assignment

// === SAVE stage (database saving) ===
@BeforeSaveCreate()    @BeforeSaveUpdate()    @BeforeSaveUpsert()    // Before saving
@AfterSaveCreate()     @AfterSaveUpdate()     @AfterSaveUpsert()     // After saving

// === DESTROY stage (entity deletion) ===
@BeforeDestroyDestroy()  // Before entity deletion
@AfterDestroyDestroy()   // After entity deletion

// === RECOVER stage (entity recovery) ===
@BeforeRecoverRecover()  // Before entity recovery
@AfterRecoverRecover()   // After entity recovery
```

##### Real Usage Examples

**Using basic decorators:**

```typescript
import { Controller, Post, Put } from '@nestjs/common';
import { Crud, BeforeCreate, AfterCreate, BeforeUpdate, AfterUpdate } from 'nestjs-crud';
import { User } from './user.entity';
import { UserService } from './user.service';
import * as bcrypt from 'bcrypt';

@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'password', 'phone'],
})
@Controller('users')
export class UserController {
    constructor(public readonly crudService: UserService) {}

    // 🔐 Hash password before CREATE
    @BeforeCreate()
    async hashPasswordOnCreate(body: any, context: any) {
        if (body.password) {
            console.log('CREATE: Hashing password...');
            body.password = await bcrypt.hash(body.password, 10);
        }

        // Set default values
        body.provider = body.provider || 'local';
        body.role = body.role || 'user';

        return body;
    }

    // 📧 Send welcome email after CREATE
    @AfterCreate()
    async sendWelcomeEmail(entity: User, context: any) {
        console.log(`New user created: ${entity.email} (ID: ${entity.id})`);

        // Welcome email sending logic
        // await this.emailService.sendWelcomeEmail(entity);

        return entity;
    }

    // 🔐 Hash password before UPDATE too
    @BeforeUpdate()
    async hashPasswordOnUpdate(body: any, context: any) {
        if (body.password) {
            console.log('UPDATE: Hashing password...');
            body.password = await bcrypt.hash(body.password, 10);
        }

        // Auto-set update time
        body.updatedAt = new Date();

        return body;
    }

    // 📝 Log user update after UPDATE
    @AfterUpdate()
    async logUserUpdate(entity: User, context: any) {
        console.log(`User update completed: ${entity.email} (ID: ${entity.id})`);

        // Record update log
        // await this.auditService.logUserUpdate(entity, context.request?.user);

        return entity;
    }

    // 🗑️ Permission check and cleanup preparation before DELETE
    @BeforeDestroy()
    async beforeDeleteUser(entity: User, context: any) {
        console.log(`DELETE permission check for: ${entity.email} (ID: ${entity.id})`);

        // Check delete permission
        const userId = context.request?.user?.id;
        if (entity.id !== userId) {
            const userRole = context.request?.user?.role;
            if (userRole !== 'admin') {
                throw new Error('Permission denied: Cannot delete other users');
            }
        }

        // Prevent deletion of locked users
        if (entity.status === 'locked') {
            throw new Error('Cannot delete locked user');
        }

        // Set deletion metadata
        entity.deletedBy = userId;
        entity.deletedAt = new Date();

        return entity;
    }

    // 🧹 Cleanup and notification after DELETE
    @AfterDestroy()
    async afterDeleteUser(entity: User, context: any) {
        console.log(`User deleted successfully: ${entity.email} (ID: ${entity.id})`);

        // Cleanup related data
        // await this.sessionService.revokeUserSessions(entity.id);
        // await this.tokenService.revokeUserTokens(entity.id);

        // Send deletion notification
        // await this.notificationService.notifyUserDeletion(entity);

        // Log deletion for audit
        // await this.auditService.logUserDeletion(entity, context.request?.user);

        return entity;
    }

    // 🚀 NEW! Permission check and preparation before RECOVER
    @BeforeRecover()
    async beforeRecoverUser(entity: User, context: HookContext<User>) {
        console.log(`RECOVER permission check for: ${entity.email} (ID: ${entity.id})`);

        // Check recover permission
        const userId = context.request?.user?.id;
        if (entity.deletedBy !== userId) {
            const userRole = context.request?.user?.role;
            if (userRole !== 'admin') {
                throw new Error('Permission denied: Cannot recover other users data');
            }
        }

        // Prevent recovery of certain users
        if (entity.status === 'banned') {
            throw new Error('Cannot recover banned user');
        }

        // Set recovery metadata
        entity.recoveredBy = userId;
        entity.recoveredAt = new Date();

        return entity;
    }

    // 🚀 NEW! Cleanup and notification after RECOVER
    @AfterRecover()
    async afterRecoverUser(entity: User, context: HookContext<User>) {
        console.log(`User recovered successfully: ${entity.email} (ID: ${entity.id})`);

        // Restore related data
        // await this.sessionService.enableUserSessions(entity.id);
        // await this.tokenService.reissueUserTokens(entity.id);

        // Send recovery notification
        // await this.notificationService.notifyUserRecovery(entity);

        // Log recovery for audit
        // await this.auditService.logUserRecovery(entity, context.request?.user);

        return entity;
    }
}
```

##### Execution Order and Parameters

**Hooks during Create process:**

```typescript
@BeforeCreate()  // = @BeforeAssign('create')
async beforeCreate(body: any, context: HookContext) {
  // body: request data
  // context: { operation: 'create', params: {}, currentEntity: undefined }
  return body; // Return modified body
}

@AfterCreate()   // = @AfterSave('create')
async afterCreate(entity: User, context: HookContext) {
  // entity: saved entity
  // context: { operation: 'create', params: {}, currentEntity: undefined }
  return entity; // Return modified entity
}
```

**Hooks during Update process:**

```typescript
@BeforeUpdate()  // = @BeforeAssign('update')
async beforeUpdate(entity: User, context: HookContext) {
  // 🚀 NEW: entity-based (full entity with ID)
  // entity: entity to update (includes all fields)
  // context: { operation: 'update', params: { id: 5 }, currentEntity: User }
  return entity;
}

@AfterUpdate()   // = @AfterSave('update')
async afterUpdate(entity: User, context: HookContext) {
  // entity: updated entity
  // context: { operation: 'update', params: { id: 5 }, currentEntity: User }
  return entity;
}
```

**🆕 NEW! Hooks during Destroy process:**

```typescript
@BeforeDestroy() // = @BeforeDestroy('destroy')
async beforeDestroy(entity: User, context: HookContext) {
  // 🚀 Entity-based (full entity with ID)
  // entity: entity to delete (includes all fields)
  // context: { operation: 'destroy', params: { id: 5 }, currentEntity: User }

  // Perfect for permission checks and cleanup preparation
  if (entity.status === 'locked') {
    throw new Error('Cannot delete locked user');
  }

  return entity;
}

@AfterDestroy()  // = @AfterDestroy('destroy')
async afterDestroy(entity: User, context: HookContext) {
  // entity: deleted entity (for cleanup and logging)
  // context: { operation: 'destroy', params: { id: 5 }, currentEntity: User }

  // Perfect for cleanup, notifications, and audit logs
  await this.cleanupUserData(entity.id);

  return entity;
}
```

**🆕 NEW! Hooks during Recover process:**

```typescript
@BeforeRecover() // = @BeforeRecover('recover')
async beforeRecover(entity: User, context: HookContext) {
  // 🚀 Entity-based (full soft-deleted entity with ID)
  // entity: entity to recover (includes all fields)
  // context: { operation: 'recover', params: { id: 5 }, currentEntity: User }

  // Perfect for permission checks and recovery preparation
  if (entity.status === 'banned') {
    throw new Error('Cannot recover banned user');
  }

  // Set recovery metadata
  entity.recoveredBy = context.request?.user?.id;
  entity.recoveredAt = new Date();

  return entity;
}

@AfterRecover()  // = @AfterRecover('recover')
async afterRecover(entity: User, context: HookContext) {
  // entity: recovered entity (for restoration and logging)
  // context: { operation: 'recover', params: { id: 5 }, currentEntity: User }

  // Perfect for data restoration, notifications, and audit logs
  await this.restoreUserData(entity.id);

  return entity;
}

@BeforeShow() // = @BeforeAssign('show')
async beforeShow(params: any, context: HookContext) {
  // params: request parameters for entity lookup
  // context: { operation: 'show', params: { id: 5 } }
  
  // Transform parameters before entity lookup
  if (typeof params.id === 'string') {
    params.id = parseInt(params.id, 10);
  }
  
  return params;
}

@AfterShow()  // = @AfterAssign('show')
async afterShow(entity: User, context: HookContext) {
  // entity: retrieved entity
  // context: { operation: 'show', params: { id: 5 } }
  
  // Perfect for masking sensitive data, adding computed fields
  if (entity.password) {
    entity.password = '***HIDDEN***';
  }
  
  // Add view tracking
  await this.trackView(entity.id);
  
  return entity;
}
```

##### Advanced Usage Examples

```typescript
@Crud({
    entity: Post,
    allowedParams: ['title', 'content', 'status'],
})
@Controller('posts')
export class PostController {
    constructor(public readonly crudService: PostService) {}

    @BeforeCreate()
    async beforeCreatePost(body: any, context: any) {
        // Auto-set user ID
        const userId = context.request?.user?.id;
        if (userId) {
            body.userId = userId;
        }

        // Auto-generate slug
        if (body.title && !body.slug) {
            body.slug = body.title
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
        }

        return body;
    }

    @BeforeSave('create')
    async validateBeforeSave(entity: Post, context: any) {
        // Check and resolve slug duplication
        const existingPost = await this.crudService.findBySlug(entity.slug);
        if (existingPost) {
            entity.slug = `${entity.slug}-${Date.now()}`;
        }

        return entity;
    }

    @AfterCreate()
    async afterCreatePost(entity: Post, context: any) {
        // Update search index
        // await this.searchService.indexPost(entity);

        // Notify about published post
        if (entity.status === 'published') {
            // await this.notificationService.notifyNewPost(entity);
            console.log(`New post published: ${entity.title}`);
        }

        return entity;
    }

    // Multiple hooks can be used together
    @BeforeUpdate()
    @BeforeUpsert()
    async beforeModify(data: any, context: any) {
        // Common logic for both UPDATE and UPSERT
        data.updatedAt = new Date();

        if (context.operation === 'upsert' && !context.currentEntity) {
            data.createdAt = new Date();
        }

        return data;
    }

    // 🆕 NEW! DESTROY hook example
    @BeforeDestroy()
    async beforeDelete(entity: Post, context: any) {
        console.log(`Preparing to delete post: ${entity.title} (ID: ${entity.id})`);

        // Check if user has permission to delete this post
        const userId = context.request?.user?.id;
        if (entity.userId !== userId) {
            const userRole = context.request?.user?.role;
            if (userRole !== 'admin' && userRole !== 'moderator') {
                throw new Error('Permission denied: Cannot delete other users posts');
            }
        }

        // Prevent deletion of published posts by regular users
        if (entity.status === 'published' && context.request?.user?.role !== 'admin') {
            throw new Error('Cannot delete published posts');
        }

        return entity;
    }

    @AfterDestroy()
    async afterDelete(entity: Post, context: any) {
        console.log(`Post deleted successfully: ${entity.title} (ID: ${entity.id})`);

        // Clean up related data
        // await this.commentService.deletePostComments(entity.id);
        // await this.tagService.removePostTags(entity.id);

        // Update search index
        // await this.searchService.removeFromIndex(entity.id);

        // Send notification
        // await this.notificationService.notifyPostDeletion(entity);

        return entity;
    }
}
```

**🆕 Using new 4-stage detailed decorators:**

```typescript
import { Controller } from '@nestjs/common';
import {
    Crud,
    BeforeAssignCreate, // Before assignment
    AfterAssignCreate, // After assignment
    BeforeSaveCreate, // Before saving
    AfterSaveCreate, // After saving
    BeforeAssignUpdate,
    AfterSaveUpdate,
} from 'nestjs-crud';
import { User } from './user.entity';
import { UserService } from './user.service';
import * as bcrypt from 'bcrypt';

@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'password', 'phone'],
})
@Controller('users')
export class UserController {
    constructor(public readonly crudService: UserService) {}

    // 🔐 CREATE: Stage 1 - Before assignment (data validation and transformation)
    @BeforeAssignCreate()
    async validateAndTransformCreate(body: any, context: any) {
        console.log('1️⃣ CREATE before assignment: Data validation and transformation');

        if (body.password) {
            body.password = await bcrypt.hash(body.password, 10);
        }

        // Set default values
        body.provider = body.provider || 'local';
        body.role = body.role || 'user';

        return body;
    }

    // 🔧 CREATE: Stage 2 - After assignment (entity post-processing)
    @AfterAssignCreate()
    async postProcessCreate(entity: User, context: any) {
        console.log('2️⃣ CREATE after assignment: Entity post-processing');

        // Additional entity processing logic
        if (!entity.displayName) {
            entity.displayName = entity.name;
        }

        return entity;
    }

    // 🔍 CREATE: Stage 3 - Before saving (final validation)
    @BeforeSaveCreate()
    async finalValidateCreate(entity: User, context: any) {
        console.log('3️⃣ CREATE before saving: Final validation');

        // Duplicate email check
        const existing = await this.crudService.findOne({ where: { email: entity.email } });
        if (existing) {
            throw new Error('Email already exists');
        }

        return entity;
    }

    // 📧 CREATE: Stage 4 - After saving (follow-up processing)
    @AfterSaveCreate()
    async postSaveCreate(entity: User, context: any) {
        console.log('4️⃣ CREATE after saving: Follow-up processing');

        // Send welcome email
        // await this.emailService.sendWelcomeEmail(entity);

        // Send analytics event
        // await this.analyticsService.trackUserCreated(entity);

        return entity;
    }

    // 🔐 UPDATE: Before assignment
    @BeforeAssignUpdate()
    async beforeUpdateAssign(entity: User, context: any) {
        console.log('🔄 UPDATE before assignment: Process update entity');

        // 🚀 NEW: Now receives full entity with ID
        if (entity.password) {
            entity.password = await bcrypt.hash(entity.password, 10);
        }

        entity.updatedAt = new Date();
        return entity;
    }

    // 📝 UPDATE: After saving
    @AfterSaveUpdate()
    async afterUpdateSave(entity: User, context: any) {
        console.log('📝 UPDATE after saving: Handle update completion');

        // Record update log
        // await this.auditService.logUserUpdate(entity, context.request?.user);

        return entity;
    }
}
```

**Using consistent fine-grained control decorators:**

```typescript
@Controller('posts')
export class PostController {
    constructor(public readonly crudService: PostService) {}

    // Execute before assignment stage for all methods (create, update, upsert)
    @BeforeAssign('create')
    @BeforeAssign('update')
    @BeforeAssign('upsert')
    async commonPreProcess(body: any, context: any) {
        console.log(`🔧 ${context.operation.toUpperCase()} before assignment common processing`);

        // Common pre-processing logic
        body.updatedAt = new Date();
        if (context.operation === 'create') {
            body.createdAt = new Date();
        }

        return body;
    }

    // Execute after saving stage for all methods
    @AfterSave('create')
    @AfterSave('update')
    @AfterSave('upsert')
    async commonPostProcess(entity: any, context: any) {
        console.log(`✅ ${context.operation.toUpperCase()} after saving common processing`);

        // Common post-processing logic (search index update, cache refresh, etc.)
        // await this.searchService.updateIndex(entity);
        // await this.cacheService.invalidate(`post:${entity.id}`);

        return entity;
    }

    // 🆕 NEW! DESTROY-specific hooks
    @BeforeDestroy()
    async beforePostDelete(entity: any, context: any) {
        console.log(`🗑️ DESTROY before deletion: Preparing to delete ${entity.title}`);

        // Check deletion permissions
        const userId = context.request?.user?.id;
        if (entity.userId !== userId && context.request?.user?.role !== 'admin') {
            throw new Error('Permission denied');
        }

        // Set deletion metadata
        entity.deletedBy = userId;
        entity.deletedAt = new Date();

        return entity;
    }

    @AfterDestroy()
    async afterPostDelete(entity: any, context: any) {
        console.log(`🧹 DESTROY after deletion: Cleanup for ${entity.title}`);

        // Common cleanup logic
        // await this.searchService.removeFromIndex(entity.id);
        // await this.cacheService.invalidate(`post:${entity.id}`);
        // await this.notificationService.notifyDeletion(entity);

        return entity;
    }
}
```

##### 🔗 Chain Execution of Multiple Hooks

**When using the same decorator on multiple methods, they execute in definition order as a chain:**

```typescript
@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'password'],
})
@Controller('users')
export class UserController {
    constructor(public readonly crudService: UserService) {}

    // 🔗 First CREATE hook
    @BeforeCreate()
    async validateData(body: any, context: any) {
        console.log('1️⃣ Validating data...');

        if (!body.email) {
            throw new Error('Email is required');
        }

        body.step1 = 'validated';
        return body; // ✅ Modified body passed to next hook
    }

    // 🔗 Second CREATE hook (receives result from first hook)
    @BeforeCreate()
    async hashPassword(body: any, context: any) {
        console.log('2️⃣ Hashing password...');
        console.log('Previous step result:', body.step1); // ✅ Outputs 'validated'

        if (body.password) {
            body.password = await bcrypt.hash(body.password, 10);
        }

        body.step2 = 'encrypted';
        return body; // ✅ Return final modified body
    }

    // 🔗 Third CREATE hook (receives result from second hook)
    @BeforeCreate()
    async setDefaults(body: any, context: any) {
        console.log('3️⃣ Setting defaults...');
        console.log('Previous steps results:', body.step1, body.step2); // ✅ Outputs 'validated', 'encrypted'

        body.provider = body.provider || 'local';
        body.role = body.role || 'user';
        body.step3 = 'completed';

        return body; // ✅ Final completed body
    }
}
```

**Execution order:**

```bash
POST /users
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "mypassword"
}

# Console output:
# 1️⃣ Validating data...
# 2️⃣ Hashing password...
# Previous step result: validated
# 3️⃣ Setting defaults...
# Previous steps results: validated encrypted

# Final saved data:
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "$2b$10$...", // ✅ Encrypted
  "provider": "local",      // ✅ Default set
  "role": "user",          // ✅ Default set
  "step1": "validated",    // ✅ Passed through chain
  "step2": "encrypted",    // ✅ Passed through chain
  "step3": "completed"     // ✅ Final processing
}
```

##### ⚡ Simple Test Example

```typescript
// Minimal example for simple testing
@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'password'],
})
@Controller('users')
export class UserController {
    constructor(public readonly crudService: UserService) {}

    @BeforeCreate()
    async step1(body: any, context: any) {
        body.step1 = 'first';
        console.log('Step 1:', body);
        return body;
    }

    @BeforeCreate()
    async step2(body: any, context: any) {
        body.step2 = 'second';
        console.log('Step 2:', body); // Check if step1 exists
        return body;
    }
}

// POST /users { "name": "test" }
// Console output:
// Step 1: { name: "test", step1: "first" }
// Step 2: { name: "test", step1: "first", step2: "second" }
```

##### Advantages

1.  **🎯 Intuitive**: Clear role from method names
2.  **🧹 Clean Code**: Routes configuration not complex
3.  **🔗 Chain Execution**: Multiple hooks execute sequentially with automatic data passing
4.  **🔄 Reusability**: Common hooks can be implemented through inheritance
5.  **🛡️ Type Safety**: TypeScript type checking support
6.  **✨ IntelliSense**: IDE auto-completion support
7.  **🚀 Entity-based UPDATE/DESTROY/RECOVER**: Full entity access with ID for advanced operations

#### 🛠️ Method 2: Routes Configuration Approach (Legacy)

#### Basic Usage

```typescript
@Controller('users')
@Crud({
    entity: User,
    routes: {
        create: {
            hooks: {
                assignBefore: async (body, context) => {
                    // Convert email to lowercase
                    if (body.email) {
                        body.email = body.email.toLowerCase();
                    }
                    return body;
                },

                assignAfter: async (entity, body, context) => {
                    // Set default role
                    if (!entity.role) {
                        entity.role = 'user';
                    }
                    return entity;
                },

                saveBefore: async (entity, context) => {
                    // Check duplicate email
                    const existing = await userService.findByEmail(entity.email);
                    if (existing) {
                        throw new Error('Email already exists');
                    }
                    return entity;
                },

                saveAfter: async (entity, context) => {
                    // Send welcome email
                    await emailService.sendWelcomeEmail(entity.email);
                    return entity;
                },
            },
        },

        update: {
            hooks: {
                assignBefore: async (entity, context) => {
                    // 🚀 NEW: Now receives full entity
                    // Auto-set update time
                    entity.updatedAt = new Date();

                    // Prevent modification of certain fields
                    const originalId = entity.id;
                    const originalCreatedAt = entity.createdAt;

                    // Restore protected fields if they were modified
                    entity.id = originalId;
                    entity.createdAt = originalCreatedAt;

                    return entity;
                },

                saveBefore: async (entity, context) => {
                    // Check permissions
                    const userId = context.request?.user?.id;
                    if (entity.id !== userId) {
                        throw new Error('Permission denied');
                    }
                    return entity;
                },
            },
        },

        destroy: {
            hooks: {
                destroyBefore: async (entity, context) => {
                    // 🆕 NEW! DESTROY before hook
                    console.log(`Preparing to delete user: ${entity.name} (ID: ${entity.id})`);

                    // Check delete permission
                    const userId = context.request?.user?.id;
                    if (entity.id !== userId && context.request?.user?.role !== 'admin') {
                        throw new Error('Permission denied: Cannot delete other users');
                    }

                    // Prevent deletion of locked accounts
                    if (entity.status === 'locked') {
                        throw new Error('Cannot delete locked user account');
                    }

                    // Set deletion metadata
                    entity.deletedBy = userId;
                    entity.deletedAt = new Date();

                    return entity;
                },

                destroyAfter: async (entity, context) => {
                    // 🆕 NEW! DESTROY after hook
                    console.log(`User deleted successfully: ${entity.name} (ID: ${entity.id})`);

                    // Cleanup related data
                    // await sessionService.revokeUserSessions(entity.id);
                    // await tokenService.revokeUserTokens(entity.id);

                    // Send deletion notification
                    // await emailService.notifyUserDeletion(entity);

                    // Log for audit
                    // await auditService.logUserDeletion(entity, context.request?.user);

                    return entity;
                },
            },
        },

        recover: {
            hooks: {
                recoverBefore: async (entity, context) => {
                    // 🆕 NEW! RECOVER before hook
                    console.log(`Preparing to recover user: ${entity.name} (ID: ${entity.id})`);

                    // Check recover permission
                    const userId = context.request?.user?.id;
                    if (entity.deletedBy !== userId && context.request?.user?.role !== 'admin') {
                        throw new Error('Permission denied: Cannot recover other users data');
                    }

                    // Prevent recovery of banned accounts
                    if (entity.status === 'banned') {
                        throw new Error('Cannot recover banned user account');
                    }

                    // Set recovery metadata
                    entity.recoveredBy = userId;
                    entity.recoveredAt = new Date();

                    return entity;
                },

                recoverAfter: async (entity, context) => {
                    // 🆕 NEW! RECOVER after hook
                    console.log(`User recovered successfully: ${entity.name} (ID: ${entity.id})`);

                    // Restore related data
                    // await sessionService.enableUserSessions(entity.id);
                    // await tokenService.reissueUserTokens(entity.id);

                    // Send recovery notification
                    // await emailService.notifyUserRecovery(entity);

                    // Log for audit
                    // await auditService.logUserRecovery(entity, context.request?.user);

                    return entity;
                },
            },
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

#### Advanced Usage Example

```typescript
@Controller('posts')
@Crud({
    entity: Post,
    routes: {
        create: {
            hooks: {
                assignBefore: async (body, context) => {
                    // Auto-set user ID
                    const userId = context.request?.user?.id;
                    if (userId) {
                        body.userId = userId;
                    }

                    // Auto-generate slug
                    if (body.title && !body.slug) {
                        body.slug = slugify(body.title);
                    }

                    return body;
                },

                assignAfter: async (entity, body, context) => {
                    // Set default post status
                    if (!entity.status) {
                        entity.status = 'draft';
                    }

                    // Set publication date when publishing
                    if (entity.status === 'published' && !entity.publishedAt) {
                        entity.publishedAt = new Date();
                    }

                    return entity;
                },

                saveBefore: async (entity, context) => {
                    // Validate required fields
                    if (!entity.title?.trim()) {
                        throw new Error('Title is required');
                    }

                    // Check and resolve slug duplication
                    const existingPost = await postService.findBySlug(entity.slug);
                    if (existingPost) {
                        entity.slug = `${entity.slug}-${Date.now()}`;
                    }

                    return entity;
                },

                saveAfter: async (entity, context) => {
                    // Update search index
                    await searchService.indexPost(entity);

                    // Process tags
                    if (entity.tags?.length) {
                        await tagService.processPostTags(entity.id, entity.tags);
                    }

                    // Notify about published post
                    if (entity.status === 'published') {
                        await notificationService.notifyNewPost(entity);
                    }

                    return entity;
                },
            },
        },

        upsert: {
            hooks: {
                assignBefore: async (body, context) => {
                    const now = new Date();
                    body.updatedAt = now;

                    // Set creation date only for new data
                    if (!context.currentEntity) {
                        body.createdAt = now;
                    }

                    return body;
                },

                saveAfter: async (entity, context) => {
                    // Differentiate between newly created and updated cases
                    const isNew = !context.currentEntity;

                    if (isNew) {
                        await analyticsService.trackPostCreated(entity);
                    } else {
                        await analyticsService.trackPostUpdated(entity);
                    }

                    return entity;
                },
            },
        },
    },
})
export class PostController {
    constructor(public readonly crudService: PostService) {}
}
```

#### HookContext Usage

```typescript
// HookContext provides the following information
interface HookContext<T> {
    operation: 'create' | 'update' | 'upsert' | 'destroy' | 'recover' | 'show'; // Operation type
    params?: Record<string, any>; // URL parameters
    currentEntity?: T; // Current entity (update, upsert, destroy, recover)
    request?: any; // Express Request object
}

// Context usage example
const hooks = {
    assignBefore: async (body, context) => {
        console.log(`Operation type: ${context.operation}`);

        // Use requester information
        if (context.request?.user) {
            body.lastModifiedBy = context.request.user.id;
        }

        // Use URL parameters
        if (context.params?.parentId) {
            body.parentId = context.params.parentId;
        }

        // Use existing entity information (update, upsert only)
        if (context.currentEntity) {
            console.log('Existing data:', context.currentEntity);
        }

        return body;
    },
};
```

#### Show Operation Hooks (NEW! 🆕)

The `show` operation now supports `assignBefore` and `assignAfter` hooks for read-time data processing:

- **`assignBefore`**: Process query parameters before entity lookup (security filtering, parameter transformation)
- **`assignAfter`**: Process retrieved entity before returning it (data masking, calculated fields)

##### Show Operation Hook Examples

```typescript
@Controller('users')
@Crud({
    entity: User,
    routes: {
        show: {
            hooks: {
                // Process parameters before entity lookup
                assignBefore: async (params, context) => {
                    // Security: Validate user has permission to view this ID
                    const requesterId = context.request?.user?.id;
                    const targetId = params.id;
                    
                    if (requesterId !== targetId && context.request?.user?.role !== 'admin') {
                        throw new ForbiddenException('Cannot view other users');
                    }
                    
                    // Parameter transformation
                    if (typeof params.id === 'string') {
                        params.id = parseInt(params.id, 10);
                    }
                    
                    return params;
                },
                
                // Process entity after retrieval
                assignAfter: async (entity, _, context) => {
                    // Mask sensitive information
                    if (entity.email) {
                        entity.email = entity.email.replace(/(.{2}).*(@.*)/, '$1***$2');
                    }
                    
                    // Hide sensitive fields based on viewer's role
                    if (context.request?.user?.role !== 'admin') {
                        delete entity.salary;
                        delete entity.ssn;
                    }
                    
                    // Add calculated fields
                    (entity as any).displayName = `${entity.firstName} ${entity.lastName}`;
                    (entity as any).age = calculateAge(entity.birthDate);
                    
                    // Track view statistics (without saving to DB)
                    await analyticsService.trackView(entity.id, context.request?.user?.id);
                    
                    return entity;
                }
            }
        }
    }
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

##### Common Use Cases for Show Hooks

1. **Data Masking & Security**:
```typescript
assignAfter: async (entity, _, context) => {
    // Mask PII based on viewer permissions
    const isOwner = entity.id === context.request?.user?.id;
    const isAdmin = context.request?.user?.role === 'admin';
    
    if (!isOwner && !isAdmin) {
        entity.phone = entity.phone?.replace(/\d(?=\d{4})/g, '*');
        entity.email = entity.email?.replace(/(.{2}).*(@.*)/, '$1***$2');
        delete entity.dateOfBirth;
    }
    
    return entity;
}
```

2. **Enriching Response with Calculated Data**:
```typescript
assignAfter: async (entity, _, context) => {
    // Add computed fields without modifying database
    (entity as any).fullAddress = `${entity.street}, ${entity.city}, ${entity.country}`;
    (entity as any).accountAge = daysSince(entity.createdAt);
    (entity as any).isPremium = entity.subscriptionLevel === 'premium';
    
    // Fetch additional data from external services
    (entity as any).creditScore = await creditService.getScore(entity.id);
    
    return entity;
}
```

3. **Parameter Validation & Transformation**:
```typescript
assignBefore: async (params, context) => {
    // Validate and transform ID formats
    if (params.uuid && !isValidUUID(params.uuid)) {
        throw new BadRequestException('Invalid UUID format');
    }
    
    // Apply tenant isolation
    if (context.request?.tenant) {
        params.tenantId = context.request.tenant.id;
    }
    
    return params;
}
```

4. **Analytics & Monitoring**:
```typescript
assignAfter: async (entity, _, context) => {
    // Track access patterns without affecting response
    await Promise.all([
        auditLog.record({
            action: 'VIEW',
            entityType: 'User',
            entityId: entity.id,
            viewerId: context.request?.user?.id,
            timestamp: new Date()
        }),
        metricsService.increment('user.profile.views'),
        cacheService.warm(entity.id, entity) // Pre-cache for future requests
    ]);
    
    return entity;
}
```

#### Reusing Common Hook Functions

```typescript
// Define common hook functions
const commonHooks = {
    setTimestamps: async (body: any, context: HookContext) => {
        const now = new Date();
        body.updatedAt = now;

        if (context.operation === 'create') {
            body.createdAt = now;
        }

        return body;
    },

    validateOwnership: async (entity: any, context: HookContext) => {
        const userId = context.request?.user?.id;
        if (entity.userId && entity.userId !== userId) {
            const userRole = context.request?.user?.role;
            if (userRole !== 'admin') {
                throw new Error('Permission denied');
            }
        }
        return entity;
    },

    publishEvent: async (entity: any, context: HookContext) => {
        const eventName = `${context.operation}_${entity.constructor.name.toLowerCase()}`;
        await eventBus.publish(eventName, entity);
        return entity;
    },

    checkPermissions: async (entity: any, context: HookContext) => {
        const userId = context.request?.user?.id;
        const userRole = context.request?.user?.role;

        // Check ownership or admin role
        if (entity.userId && entity.userId !== userId && userRole !== 'admin') {
            throw new Error('Permission denied');
        }

        return entity;
    },

    logOperation: async (entity: any, context: HookContext) => {
        const userId = context.request?.user?.id;
        const operation = context.operation.toUpperCase();

        console.log(`${operation} operation by user ${userId} on entity ${entity.id}`);
        // await auditService.log({ operation, entityId: entity.id, userId });

        return entity;
    },
};

// Reuse in multiple controllers
@Crud({
    entity: Order,
    routes: {
        create: {
            hooks: {
                assignBefore: commonHooks.setTimestamps,
                saveBefore: commonHooks.validateOwnership,
                saveAfter: commonHooks.publishEvent,
            },
        },
        update: {
            hooks: {
                assignBefore: commonHooks.setTimestamps,
                saveBefore: commonHooks.validateOwnership,
                saveAfter: commonHooks.publishEvent,
            },
        },

        destroy: {
            hooks: {
                destroyBefore: commonHooks.checkPermissions,
                destroyAfter: async (entity, context) => {
                    // Combine multiple common hooks for destroy
                    entity = await commonHooks.logOperation(entity, context);
                    entity = await commonHooks.publishEvent(entity, context);
                    return entity;
                },
            },
        },
    },
})
export class OrderController {}
```

#### Precautions

1. **Async Processing**: All hooks support async functions
2. **Error Handling**: When error occurs in hook, entire CRUD operation is interrupted
3. **Performance**: Complex logic can affect performance, so caution is needed
4. **Transactions**: Hooks execute in separate database transactions
5. **Order**: Execute in defined order, so dependencies must be considered

### 🛡️ Request Body Validation Decorators

nestjs-crud provides various request body processing decorators:

#### Decorator Comparison Table

| Decorator                 | allowedParams Filtering | class-validator Validation | Error Handling | When to Use                           |
| ------------------------- | ----------------------- | -------------------------- | -------------- | ------------------------------------- |
| `@FilteredBody()`         | ✅                      | ❌                         | Silent removal | Simple filtering only                 |
| `@TypedFilteredBody<T>()` | ✅                      | ❌                         | Silent removal | Type safety + filtering               |
| `@ValidatedBody()`        | ✅                      | ❌                         | Error on fail  | Strict field validation               |
| `@ClassValidatedBody()`   | ✅                      | ✅                         | Mixed          | **Complete validation** (recommended) |

#### @ClassValidatedBody - Complete Validation Decorator

`@ClassValidatedBody` provides **dual security** as a powerful decorator:

1. **1st: allowedParams filtering** (silent removal)
2. **2nd: Entity validation** (error return)

```typescript
import { Controller, Post, Put } from '@nestjs/common';
import { Crud, ClassValidatedBody } from 'nestjs-crud';
import { User } from './user.entity';

@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'phone'], // Global configuration
    routes: {
        create: {
            allowedParams: ['name', 'email', 'password'], // 🎯 Method-specific configuration takes priority
        },
        update: {
            allowedParams: ['name', 'phone'], // 🎯 update allows different fields
        },
    },
})
@Controller('users')
export class UserController {
    @Post()
    async create(@ClassValidatedBody() createUserDto: any) {
        // 🎯 Uses create method configuration: ['name', 'email', 'password']
        // 🤫 Disallowed fields are silently removed (admin: true, etc.)
        // ⚠️ Validates with Entity's @IsEmail() etc. and returns errors

        const user = User.create(createUserDto);
        return await User.save(user);
    }

    @Put(':id')
    async update(@ClassValidatedBody() updateUserDto: any) {
        // 🎯 Uses update method configuration: ['name', 'phone']
        // 🤫 email, password etc. are silently removed
        // Business logic...
    }
}
```

#### Operation Principle

```typescript
// Client request
POST /users
{
  "name": "John Doe",
  "email": "invalid-email",    // ❌ @IsEmail() validation fails
  "password": "secret123",     // ✅ Allowed in create method
  "admin": true,               // ❌ Not allowed → silently removed
  "hacker": "malicious"        // ❌ Not allowed → silently removed
}

// 1st filtering result (no errors)
{
  "name": "John Doe",
  "email": "invalid-email",
  "password": "secret123"
}

// 2nd Entity validation result (error occurs)
{
  "statusCode": 400,
  "message": "Validation failed: email: email must be an email",
  "error": "Bad Request"
}
```

#### Method-specific Priority

Method-specific `allowedParams` configuration takes **priority** over global configuration:

```typescript
@Crud({
  entity: User,
  allowedParams: ['name', 'email', 'phone'], // Global: default
  routes: {
    create: { allowedParams: ['name', 'email', 'password'] }, // CREATE-specific
    update: { allowedParams: ['name', 'phone'] },             // UPDATE-specific
    // upsert has no routes configuration → uses global configuration
  }
})
```

**Actual application results:**

-   `POST /users` → Uses `['name', 'email', 'password']`
-   `PUT /users/:id` → Uses `['name', 'phone']`
-   `POST /users/upsert` → Uses `['name', 'email', 'phone']` (global)

#### Complete Usage Example

```typescript
// user.entity.ts
@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    @IsNotEmpty()
    name: string;

    @Column({ unique: true })
    @IsEmail()
    email: string;

    @Column({ nullable: true })
    @IsOptional()
    @IsString()
    @MinLength(8)
    password?: string;

    @Column({ nullable: true })
    @IsOptional()
    @IsPhoneNumber('KR')
    phone?: string;

    @Column({ default: 'user' })
    @Exclude() // Exclude from response
    role: string;
}

// user.controller.ts
@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'phone'],
    routes: {
        create: {
            allowedParams: ['name', 'email', 'password'],
        },
        update: {
            allowedParams: ['name', 'phone'],
        },
    },
})
@Controller('users')
export class UserController {
    @Post()
    async create(@ClassValidatedBody() createUserDto: any) {
        // ✅ Only name, email, password allowed
        // ✅ Performs @IsEmail(), @IsString(), @MinLength(8) validation

        const user = User.create(createUserDto);
        const savedUser = await User.save(user);
        return crudResponse(savedUser);
    }

    @Put(':id')
    async update(@Param('id') id: number, @ClassValidatedBody() updateUserDto: any) {
        // ✅ Only name, phone allowed (email, password removed)
        // ✅ Performs @IsString(), @IsPhoneNumber() validation

        const user = await User.findOne({ where: { id } });
        Object.assign(user, updateUserDto);
        const savedUser = await User.save(user);
        return crudResponse(savedUser);
    }
}
```

#### Advantages

1. **🔒 Dual Security**: Complete protection through filtering + validation
2. **🎯 Method-specific Control**: Different field allowances per CRUD operation
3. **🤫 Silent Security**: Field removal undetectable to hackers
4. **⚠️ Clear Validation**: Data format errors clearly notified
5. **🚀 Automation**: Complete security implementation in one line

### 📋 Response Helpers (crudResponse)

nestjs-crud provides response helper functions that automatically format API responses with consistent structure and metadata. These helpers are particularly useful when creating custom endpoints that need to maintain the same response format as auto-generated CRUD endpoints.

#### Available Functions

| Function                       | Purpose                                   | Use Case                  |
| ------------------------------ | ----------------------------------------- | ------------------------- |
| `crudResponse<T>()`            | Format single or array data with metadata | Custom endpoint responses |
| `createCrudResponse<T>()`      | Create single entity response             | Internal library usage    |
| `createCrudArrayResponse<T>()` | Create array response with pagination     | Internal library usage    |

#### crudResponse Function

**Single Entity Response:**

```typescript
import { crudResponse } from 'nestjs-crud';

// Function signature for single entity
crudResponse<T>(
  data: T,
  options?: {
    excludedFields?: string[];
    includedRelations?: string[];
    skipTransform?: boolean; // 🆕 Performance optimization
  },
  request?: { query?: any }
): CrudResponse<T>
```

**Array Response with Pagination:**

```typescript
// Function signature for array data
crudResponse<T>(
  data: T[],
  options?: {
    paginationType?: 'offset' | 'cursor';
    limit?: number;
    page?: number;
    excludedFields?: string[];
    includedRelations?: string[];
    skipTransform?: boolean; // 🆕 Performance optimization
  },
  request?: { query?: any }
): CrudArrayResponse<T>
```

#### Usage Examples

**1. Single Entity Response**

```typescript
@Controller('users')
export class UserController {
    constructor(public readonly crudService: UserService) {}

    @Get('profile')
    async getProfile(@Req() request: Request) {
        const userId = request.user?.id;
        const user = await this.crudService.findOne({ where: { id: userId } });

        // ✅ Consistent response format with automatic metadata
        return crudResponse(user, {
            excludedFields: ['password', 'role'], // Hide sensitive fields
            includedRelations: ['department'] // Show included relations
        });
    }
}

// Response:
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "department": { "id": 1, "name": "Engineering" }
        // password and role excluded
    },
    "metadata": {
        "timestamp": "2024-01-15T10:30:00.000Z",
        "affectedCount": 1,
        "excludedFields": ["password", "role"],
        "includedRelations": ["department"]
    }
}
```

**2. Array Response with Pagination**

```typescript
@Controller('users')
export class UserController {
    @Get('active')
    async getActiveUsers(@Query() query: any, @Req() request: Request) {
        const users = await this.crudService.findMany({
            where: { status: 'active' }
        });

        // ✅ Automatic pagination metadata from query parameters
        return crudResponse(users, {
            paginationType: 'offset',
            excludedFields: ['password'],
        }, { query }); // Pass request query for automatic pagination parsing
    }
}

// GET /users/active?page[number]=1&page[size]=10
// Response:
{
    "data": [
        { "id": 1, "name": "John", "email": "john@example.com" },
        { "id": 2, "name": "Jane", "email": "jane@example.com" }
    ],
    "metadata": {
        "timestamp": "2024-01-15T10:30:00.000Z",
        "affectedCount": 2,
        "excludedFields": ["password"],
        "pagination": {
            "type": "offset",
            "total": 2,
            "page": 1,
            "pages": 1,
            "offset": 12,
            "nextCursor": "eyJuZXh0Q3Vyc29yIjoiTWc9PSIsInRvdGFsIjoyfQ=="
        }
    }
}
```

**3. Custom Business Logic with Response Formatting**

```typescript
@Controller('posts')
export class PostController {
    @Post(':id/publish')
    async publishPost(@Param('id') id: number) {
        // Custom business logic
        const post = await this.crudService.findOne({ where: { id } });

        if (post.status !== 'draft') {
            throw new BadRequestException('Only draft posts can be published');
        }

        post.status = 'published';
        post.publishedAt = new Date();

        const publishedPost = await this.crudService.update(id, post);

        // ✅ Use crudResponse for consistent formatting
        return crudResponse(publishedPost, {
            includedRelations: ['author', 'tags']
        });
    }
}

// POST /posts/123/publish
// Response:
{
    "data": {
        "id": 123,
        "title": "My Blog Post",
        "status": "published",
        "publishedAt": "2024-01-15T10:30:00.000Z",
        "author": { "id": 1, "name": "John Doe" },
        "tags": [{ "id": 1, "name": "technology" }]
    },
    "metadata": {
        "timestamp": "2024-01-15T10:30:00.000Z",
        "affectedCount": 1,
        "includedRelations": ["author", "tags"]
    }
}
```

#### Automatic Features

**1. @Exclude Decorator Support:**

```typescript
@Entity()
export class User {
    @Column()
    name: string;

    @Column()
    @Exclude() // 🚫 Automatically excluded from response
    password: string;

    @Column()
    @Exclude() // 🚫 Automatically excluded from response
    internalNotes: string;
}

// crudResponse automatically applies @Exclude decorators
const user = await User.findOne({ where: { id: 1 } });
return crudResponse(user);

// Response won't include password or internalNotes fields
```

**2. Query Parameter Parsing:**

```typescript
// GET /users?page[offset]=20&page[limit]=10&page[cursor]=abc123

@Get()
async getUsers(@Query() query: any, @Req() request: Request) {
    const users = await this.crudService.findMany();

    // ✅ Automatically extracts pagination from query parameters
    return crudResponse(users, {}, { query });
    // Pagination info is automatically extracted from query and added to metadata
}
```

**3. Consistent Metadata Structure:**

All responses include standardized metadata:

```typescript
{
    "data": { /* your data */ },
    "metadata": {
        "timestamp": "2024-01-15T10:30:00.000Z",    // Always present
        "affectedCount": 1,                          // Always present
        "excludedFields": ["password"],              // When fields are excluded
        "includedRelations": ["author"],             // When relations are included
        "pagination": { /* pagination info */ },    // For array responses
        "operation": "create",                       // Internal CRUD operations
        "wasSoftDeleted": true                       // For delete/recovery operations
    }
}
```

#### Integration with CRUD Hooks

```typescript
@Controller('users')
@Crud({
    entity: User,
})
export class UserController {
    constructor(public readonly crudService: UserService) {}

    @AfterCreate()
    async afterUserCreated(entity: User, context: HookContext) {
        // Send welcome email after user creation
        await this.emailService.sendWelcomeEmail(entity.email);

        // ✅ Return formatted response (optional - CRUD handles this automatically)
        return crudResponse(entity, {
            excludedFields: ['password'],
            includedRelations: ['profile'],
        });
    }

    // Custom endpoint alongside CRUD
    @Post('bulk-import')
    async bulkImportUsers(@Body() usersData: any[]) {
        const importedUsers = [];

        for (const userData of usersData) {
            try {
                const user = await this.crudService.create(userData);
                importedUsers.push(user);
            } catch (error) {
                console.error('Failed to import user:', userData, error);
            }
        }

        // ✅ Format bulk operation response consistently
        return crudResponse(importedUsers, {
            excludedFields: ['password'],
        });
    }
}
```

#### Benefits

-   Consistent response format across all endpoints
-   Easy field exclusion and relation management
-   Reduces boilerplate code
-   Type-safe response handling

### CrudQueryHelper for Custom Routes

When you override default CRUD routes and need to implement pagination, filtering, and sorting manually, use `CrudQueryHelper`:

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Crud, CrudQueryHelper } from 'nestjs-crud';

@Controller('users')
@Crud({
    entity: User,
})
export class UserController {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    // Override the default index route
    @Get()
    async index(@Req() req: Request) {
        const qb = this.userRepository.createQueryBuilder('user');
        
        // Apply pagination, filtering, and sorting in one line
        return CrudQueryHelper.applyAllToQueryBuilder(qb, req, {
            allowedFilterFields: ['status', 'age', 'name'],
            defaultLimit: 20
        });
    }
}
```

**Supported Query Parameters:**

```bash
# Pagination
GET /users?page=2&limit=20

# Filtering
GET /users?status=active&age=>18&name=John*

# Sorting
GET /users?sort=-createdAt,name

# Combined
GET /users?page=1&limit=10&status=active&sort=-createdAt
```

**Features:**
- Automatic parameter extraction from request
- Support for 30+ filter operators
- Type-safe query building
- Consistent response format with metadata

For detailed documentation, see [CRUD_QUERY_HELPER.md](./CRUD_QUERY_HELPER.md)

1. **🎯 Consistency**: Same response format across all endpoints
2. **🤖 Automation**: Automatic metadata generation and field exclusion
3. **📊 Pagination**: Built-in pagination support for arrays
4. **🔒 Security**: Automatic application of @Exclude decorators
5. **🛠️ Flexibility**: Customizable options for different use cases
6. **⚡ Performance**: Efficient data transformation using class-transformer
7. **🧩 Integration**: Seamless integration with existing CRUD endpoints

#### Transform Optimization

**🚀 Performance Optimization with skipTransform**

For better performance, especially with large datasets, use the `skipTransform` option when data is already transformed:

```typescript
// ❌ Inefficient: Double transformation
const user = await this.crudOperationHelper.create(data); // 1st transform
return crudResponse(user, { excludedFields: ['password'] }); // 2nd transform

// ✅ Optimized: Single transformation
return await this.crudOperationHelper.createWithResponse(data, {
  responseOptions: { excludedFields: ['password'] }
}); // Uses skipTransform internally

// ✅ Manual optimization for custom logic
const transformedData = await this.crudOperationHelper.create(data);
// ... custom logic ...
return crudResponse(transformedData, { 
  skipTransform: true, // Skip redundant transformation
  excludedFields: ['password'] 
});
```

**Performance Results:** Up to **98.9% faster** for large datasets (1000+ entities)

#### When to Use crudResponse

**✅ Recommended:**

-   Custom endpoints that should match CRUD response format
-   Business logic endpoints (publish, archive, activate, etc.)
-   Bulk operations
-   Data export endpoints
-   Integration endpoints

**❌ Not needed:**

-   Auto-generated CRUD endpoints (already handled internally)
-   Simple string/number responses
-   File downloads
-   Redirects

### 🚨 Unified Error Response (CrudExceptionFilter)

nestjs-crud provides an Exception Filter that can **optionally** unify the response format of all HTTP exceptions.

#### Basic NestJS vs CRUD Filter Comparison

```typescript
// ❌ Basic NestJS error response
{
  "message": "Not Found",        // string
  "statusCode": 404
}

// ✅ After applying CrudExceptionFilter
{
  "message": ["Not Found"],      // always array ✨
  "statusCode": 404
}
```

#### Usage

**1. Global Application (Recommended)**

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { CrudExceptionFilter } from 'nestjs-crud';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // ✅ Apply globally - converts all HTTP exceptions to unified format
    app.useGlobalFilters(new CrudExceptionFilter());

    await app.listen(3000);
}
bootstrap();
```

**2. Per Controller Application**

```typescript
import { Controller, UseFilters } from '@nestjs/common';
import { Crud, CrudExceptionFilter } from 'nestjs-crud';

@Controller('users')
@UseFilters(CrudExceptionFilter) // 🎯 Apply only to this controller
@Crud({
    entity: User,
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

**3. Per Method Application**

```typescript
import { Post, UseFilters } from '@nestjs/common';
import { CrudExceptionFilter, ClassValidatedBody } from 'nestjs-crud';

@Controller('users')
export class UserController {
    @Post()
    @UseFilters(CrudExceptionFilter) // 🎯 Apply only to this method
    async create(@ClassValidatedBody() createUserDto: any) {
        // Business logic...
    }
}
```

#### Various Error Scenario Handling

**Validation errors (class-validator)**

```typescript
// Request
POST /users
{
  "name": "",           // @IsNotEmpty() violation
  "email": "invalid"    // @IsEmail() violation
}

// ✅ CrudExceptionFilter response
{
  "message": [
    "name should not be empty",
    "email must be an email"
  ],
  "statusCode": 400
}
```

**Not Found error**

```typescript
// Request
GET /users/999999

// ✅ CrudExceptionFilter response
{
  "message": ["User not found"],
  "statusCode": 404
}
```

**Permission error**

```typescript
// Request (unauthorized user)
DELETE /users/1

// ✅ CrudExceptionFilter response
{
  "message": ["You do not have permission to delete"],
  "statusCode": 403
}
```

**Internal server error**

```typescript
// Database connection failure etc.
{
  "message": ["Internal Server Error"],
  "statusCode": 500
}
```

#### Using with Custom Exceptions

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';

@Controller('users')
@UseFilters(CrudExceptionFilter)
export class UserController {
    @Get(':id')
    async findOne(@Param('id') id: number) {
        const user = await this.userService.findById(id);

        if (!user) {
            // ✅ Automatically converted to array format
            throw new NotFoundException('User not found');
        }

        return user;
    }

    @Post()
    async create(@ClassValidatedBody() createUserDto: any) {
        // Duplicate email check
        const existing = await this.userService.findByEmail(createUserDto.email);

        if (existing) {
            // ✅ Automatically converted to array format
            throw new BadRequestException('Email already exists');
        }

        return await this.userService.create(createUserDto);
    }
}
```

#### Advantages

1. **🎯 Consistency**: All error responses in unified format
2. **🔄 Auto Conversion**: Automatically converts existing Exceptions to array format
3. **🎛️ Optional Use**: Can be applied only where needed
4. **📱 Frontend-friendly**: Always arrays, so processing logic is simplified
5. **🛡️ class-validator Compatible**: Naturally handles multiple validation errors as arrays

#### Frontend Processing Example

```typescript
// Error handling in React/Vue/Angular etc.
try {
    const response = await fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData),
    });

    if (!response.ok) {
        const error = await response.json();

        // ✅ message is always an array, so processing is simple
        error.message.forEach((msg) => {
            console.error(msg);
            // Display error message in UI
        });
    }
} catch (error) {
    console.error('Request failed:', error);
}
```

### 🔐 Authentication and Authorization

```typescript
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Crud({
    entity: User,
    routes: {
        index: {
            decorators: [Roles('admin', 'manager')],
        },
        create: {
            decorators: [Roles('admin')],
        },
        update: {
            decorators: [Roles('admin', 'manager')],
        },
        destroy: {
            decorators: [Roles('admin')],
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

### 🎨 Custom DTOs

```typescript
// dto/create-user.dto.ts
import { PickType } from '@nestjs/mapped-types';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import { User } from '../entities/user.entity';

export class CreateUserDto extends PickType(User, ['name', 'email', 'bio'] as const) {
    @IsString()
    name: string;

    @IsEmail()
    email: string;

    @IsOptional()
    @IsString()
    bio?: string;
}

// user.controller.ts
@Crud({
    entity: User,
    routes: {
        create: {
            swagger: {
                body: CreateUserDto,
            },
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

### 🔄 Interceptor Usage

```typescript
// interceptors/user.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class UserInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data) => {
                // Remove sensitive information
                if (Array.isArray(data.data)) {
                    data.data = data.data.map((user) => {
                        delete user.password;
                        return user;
                    });
                } else if (data.data) {
                    delete data.data.password;
                }
                return data;
            }),
        );
    }
}

// user.controller.ts
@Controller('users')
@Crud({
    entity: User,
    routes: {
        index: {
            interceptors: [UserInterceptor],
        },
        show: {
            interceptors: [UserInterceptor],
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

## 🗑️ Soft Delete and Recovery

nestjs-crud provides powerful soft delete capabilities that mark data as deleted without physically removing it from the database. This enables data recovery and maintains referential integrity.

### 🔄 Soft Delete vs Hard Delete

#### Hard Delete (Default)

-   Permanently removes records from database
-   Cannot be recovered once deleted
-   Faster database operations
-   Reduces storage requirements

#### Soft Delete

-   Records deletion timestamp in `deletedAt` column
-   Data remains in database but is excluded from normal queries
-   Enables data recovery through RECOVER endpoints
-   Maintains referential integrity

### ⚙️ Configuration

#### Entity Setup

First, add a `@DeleteDateColumn()` to your entity for soft delete support:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn } from 'typeorm';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ unique: true })
    email: string;

    // 🚀 Required for soft delete functionality
    @DeleteDateColumn()
    deletedAt?: Date;
}
```

#### Controller Configuration

```typescript
@Controller('users')
@Crud({
    entity: User,
    routes: {
        destroy: {
            softDelete: true, // ✅ Enable soft delete (default: false)
        },
    },
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

### 🎛️ Configuration Options

#### Global Default Policy

```typescript
// src/lib/crud.policy.ts
export const CRUD_POLICY = {
    [Method.DESTROY]: {
        default: {
            softDeleted: false, // 🔧 System default: hard delete enabled
        },
    },
};
```

#### Method-specific Configuration

```typescript
@Crud({
    entity: User,
    routes: {
        destroy: {
            softDelete: true, // ✅ Enable soft delete for this entity
        },
    },
})
export class UserController {}
```

#### Runtime Control

```typescript
import { Controller, Delete, Req } from '@nestjs/common';
import { CUSTOM_REQUEST_OPTIONS } from 'nestjs-crud';

@Controller('users')
export class UserController {
    @Delete(':id')
    async customDelete(@Req() req: any, @Param('id') id: number) {
        // 🎯 Override soft delete for this specific request
        req[CUSTOM_REQUEST_OPTIONS] = {
            softDeleted: false, // Force hard delete for this request only
        };

        return await this.crudService.destroy({ id });
    }
}
```

### 📊 Priority System

The soft delete configuration follows this priority order:

1. **Runtime Request Override** (highest priority)
2. **Method-specific Configuration**
3. **System Default** (lowest priority - `false`)

```typescript
// Priority resolution example
const softDeleted = _.isBoolean(customDeleteRequestOptions?.softDeleted)
    ? customDeleteRequestOptions.softDeleted // 1️⃣ Runtime override
    : deleteOptions.softDelete ?? // 2️⃣ Method config
      CRUD_POLICY[method].default.softDeleted; // 3️⃣ System default (false)
```

### 🔧 Implementation Details

#### Database Operations

```typescript
// Soft delete operation
await repository.softRemove(entity, saveOptions);
// SQL: UPDATE users SET deletedAt = NOW() WHERE id = 1

// Hard delete operation
await repository.remove(entity, saveOptions);
// SQL: DELETE FROM users WHERE id = 1
```

#### Response Metadata

All delete operations include `wasSoftDeleted` in response metadata:

```json
// Soft delete response
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "deletedAt": "2024-01-15T11:00:00.000Z"
    },
    "metadata": {
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1,
        "wasSoftDeleted": true  // 👈 Indicates soft delete was performed
    }
}

// Hard delete response
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com"
        // No deletedAt field (physically removed)
    },
    "metadata": {
        "timestamp": "2024-01-15T11:00:00.000Z",
        "affectedCount": 1,
        "wasSoftDeleted": false  // 👈 Indicates hard delete was performed
    }
}
```

### 🔄 Recovery Functionality

#### Automatic RECOVER Route Generation

When `softDelete: true` is explicitly configured (not default), nestjs-crud automatically generates recovery endpoints:

```typescript
// RECOVER route is automatically created when softDelete is enabled
@Crud({
    entity: User,
    routes: {
        destroy: {
            softDelete: true, // ✅ Enables both DELETE and RECOVER routes
        },
    },
})
export class UserController {}

// Generated routes:
// DELETE /users/:id     - Soft delete user
// POST /users/:id/recover - Recover soft-deleted user
```

#### Recovery Implementation

```typescript
// Internal recovery logic
const wasSoftDeleted = 'deletedAt' in entity && entity.deletedAt != null;
await this.repository.recover(entity, saveOptions);

return createCrudResponse(transformedEntity, {
    excludedFields,
    wasSoftDeleted, // Previous soft-deleted state
});
```

#### Recovery Response Example

```json
// POST /users/1/recover
{
    "data": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "deletedAt": null // 👈 Cleared deletion timestamp
    },
    "metadata": {
        "operation": "recover",
        "timestamp": "2024-01-15T11:30:00.000Z",
        "affectedCount": 1,
        "wasSoftDeleted": true // 👈 Was previously soft-deleted
    }
}
```

### 🎯 Use Case Patterns

#### User Data - Soft Delete (Data Protection)

```typescript
@Crud({
    entity: User,
    routes: {
        destroy: {
            softDelete: true, // ✅ Enable recovery for user data
        },
    },
})
export class UserController {}
```

#### Log Data - Hard Delete (Storage Optimization)

```typescript
@Crud({
    entity: AccessLog,
    routes: {
        destroy: {
            softDelete: false, // 🔥 Explicit hard delete for logs (matches default)
        },
    },
})
export class AccessLogController {}
```

#### Payment Records - Disable Delete (Compliance)

```typescript
@Crud({
    entity: Payment,
    // ❌ No destroy route generated - prevents any deletion
    methods: ['create', 'read', 'update'], // Exclude 'destroy'
})
export class PaymentController {}
```

### 🛡️ Advanced Lifecycle Integration

#### Soft Delete with BeforeDestroy Hook

```typescript
@Controller('users')
@Crud({
    entity: User,
    routes: {
        destroy: {
            softDelete: true,
        },
    },
})
export class UserController {
    @BeforeDestroy()
    async beforeDelete(entity: User, context: HookContext<User>) {
        // 🛡️ Permission check before soft delete
        const userId = context.request?.user?.id;
        if (entity.id !== userId && context.request?.user?.role !== 'admin') {
            throw new Error('Permission denied: Cannot delete other users');
        }

        // 🏷️ Add deletion metadata
        entity.deletedBy = userId;
        entity.deletionReason = context.request.body?.reason || 'User requested';

        return entity;
    }

    @AfterDestroy()
    async afterDelete(entity: User, context: HookContext<User>) {
        // 🧹 Cleanup after soft delete
        console.log(`User soft-deleted: ${entity.email} by ${entity.deletedBy}`);

        // Revoke active sessions (but preserve user data for recovery)
        // await this.sessionService.revokeUserSessions(entity.id);

        // Send notification email
        // await this.emailService.notifyUserDeactivation(entity);

        return entity;
    }
}
```

### 🔍 Querying Soft-Deleted Data

#### Including Soft-Deleted Records

```typescript
// Service method to include soft-deleted records
async findWithDeleted() {
    return await this.repository.find({
        withDeleted: true  // 👈 Include soft-deleted records
    });
}

// Only soft-deleted records
async findOnlyDeleted() {
    return await this.repository
        .createQueryBuilder('user')
        .where('user.deletedAt IS NOT NULL')
        .withDeleted()
        .getMany();
}
```

### 📈 Best Practices

#### 1. Entity Design

```typescript
@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    // ... other fields

    // 🚀 Essential for soft delete
    @DeleteDateColumn()
    deletedAt?: Date;

    // 📝 Optional: Track who deleted the record
    @Column({ nullable: true })
    deletedBy?: number;

    // 📝 Optional: Track deletion reason
    @Column({ nullable: true })
    deletionReason?: string;
}
```

#### 2. Strategic Configuration

```typescript
// High-value data: Enable soft delete + recovery
@Crud({
    entity: User,
    routes: {
        destroy: { softDelete: true }  // ✅ Recoverable (override default)
    }
})

// Transient data: Use default hard delete for efficiency
@Crud({
    entity: TempFile,
    routes: {
        destroy: { softDelete: false }  // 🔥 Permanent deletion (default behavior)
    }
})

// Critical data: Prevent deletion entirely
@Crud({
    entity: FinancialRecord,
    methods: ['create', 'read', 'update']  // ❌ No destroy method
})
```

#### 3. Monitoring and Analytics

```typescript
@AfterDestroy()
async trackDeletion(entity: any, context: HookContext) {
    // 📊 Analytics tracking
    const wasRecoverable = context.params.wasSoftDeleted;

    await this.analyticsService.track('entity_deleted', {
        entityType: entity.constructor.name,
        entityId: entity.id,
        userId: context.request?.user?.id,
        recoverable: wasRecoverable,
        timestamp: new Date()
    });

    return entity;
}
```

### ⚠️ Important Considerations

1. **Database Storage**: Soft-deleted records consume storage space
2. **Query Performance**: Large volumes of soft-deleted data may impact performance
3. **Backup Strategy**: Consider separate archiving strategies for old soft-deleted data
4. **Compliance**: Ensure soft delete meets data protection requirements
5. **Foreign Keys**: Soft-deleted parent records may affect related entities

### 🔄 Migration from Hard to Soft Delete

```typescript
// Step 1: Add DeleteDateColumn to existing entity
@Entity()
export class User {
    // ... existing fields

    // Add the soft delete column
    @DeleteDateColumn()
    deletedAt?: Date;
}

// Step 2: Run database migration
// CREATE MIGRATION: ALTER TABLE users ADD COLUMN deletedAt timestamp NULL;

// Step 3: Update controller configuration
@Crud({
    entity: User,
    routes: {
        destroy: {
            softDelete: true,  // Change from false/undefined to true
        }
    }
})
```

## 📊 Swagger Documentation

### Auto-generated API Documentation

nestjs-crud automatically generates Swagger documentation for all endpoints:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const config = new DocumentBuilder()
        .setTitle('API Documentation')
        .setDescription('API generated with nestjs-crud')
        .setVersion('1.0')
        .addBearerAuth()
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);

    await app.listen(3000);
}
bootstrap();
```

### Custom Swagger Configuration

```typescript
@Crud({
    entity: User,
    routes: {
        index: {
            swagger: {
                response: UserListResponseDto,
                hide: false, // Hide from API documentation
            },
        },
        show: {
            swagger: {
                response: UserDetailResponseDto,
            },
        },
        create: {
            swagger: {
                body: CreateUserDto,
                response: UserResponseDto,
            },
        },
    },
})
export class UserController {}
```

## 📋 Complete Filter Operator List

| Suffix      | Meaning                  | Example                    | Description            |
| ----------- | ------------------------ | -------------------------- | ---------------------- |
| `_eq`       | Equals                   | `name_eq=John`             | Exact match            |
| `_ne`       | Not equals               | `status_ne=inactive`       | Does not match         |
| `_gt`       | Greater than             | `age_gt=18`                | Greater value          |
| `_gte`      | Greater than or equal    | `age_gte=18`               | Greater or equal       |
| `_lt`       | Less than                | `age_lt=65`                | Smaller value          |
| `_lte`      | Less than or equal       | `age_lte=65`               | Smaller or equal       |
| `_between`  | Range                    | `age_between=18,65`        | Between two values     |
| `_like`     | Pattern                  | `name_like=%John%`         | SQL LIKE               |
| `_ilike`    | Case insensitive pattern | `email_ilike=%GMAIL%`      | Case insensitive       |
| `_start`    | Starts with              | `name_start=John`          | Starts with character  |
| `_end`      | Ends with                | `email_end=.com`           | Ends with character    |
| `_contains` | Contains                 | `bio_contains=developer`   | String contains        |
| `_in`       | Include                  | `id_in=1,2,3`              | Included in array      |
| `_not_in`   | Exclude                  | `role_not_in=guest,banned` | Not included in array  |
| `_null`     | NULL                     | `deleted_at_null=true`     | NULL value             |
| `_not_null` | NOT NULL                 | `email_not_null=true`      | Not NULL               |
| `_present`  | Exists                   | `bio_present=true`         | Not NULL and not empty |
| `_blank`    | Blank                    | `middle_name_blank=true`   | NULL or empty          |

## 🛠 Practical Examples

### Blog System

```typescript
// entities/post.entity.ts
@Entity()
export class Post {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column('text')
    content: string;

    @Column({ default: 'draft' })
    status: 'draft' | 'published' | 'archived';

    @ManyToOne(() => User, (user) => user.posts)
    author: User;

    @OneToMany(() => Comment, (comment) => comment.post)
    comments: Comment[];

    @ManyToMany(() => Tag, (tag) => tag.posts)
    @JoinTable()
    tags: Tag[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

// post.controller.ts
@Controller('posts')
@Crud({
    entity: Post,
    // Security control settings
    allowedFilters: ['title', 'status', 'author.name'], // Allowed filter columns
    allowedParams: ['title', 'content', 'status'], // Allowed request parameters
    allowedIncludes: ['author'], // Global: only author relation allowed
    routes: {
        index: {
            paginationType: PaginationType.OFFSET,
            numberOfTake: 10,
            allowedFilters: ['title', 'status', 'author.name', 'createdAt'], // INDEX adds creation date filter
            allowedIncludes: ['author', 'tags'], // INDEX also allows tags inclusion
        },
        show: {
            allowedIncludes: ['author', 'comments', 'comments.author', 'tags'], // SHOW allows comments too
        },
        create: {
            hooks: {
                assignBefore: async (body, context) => {
                    // Auto-set user ID (authenticated user)
                    if (context.request?.user?.id) {
                        body.userId = context.request.user.id;
                    }

                    // Generate slug
                    if (body.title && !body.slug) {
                        body.slug = body.title
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '');
                    }

                    return body;
                },

                saveBefore: async (entity, context) => {
                    // Check slug duplication
                    const existing = await postService.findBySlug(entity.slug);
                    if (existing) {
                        entity.slug = `${entity.slug}-${Date.now()}`;
                    }
                    return entity;
                },

                saveAfter: async (entity, context) => {
                    // Update search index
                    await searchService.indexPost(entity);

                    // Notify about published posts
                    if (entity.status === 'published') {
                        await notificationService.notifyFollowers(entity.userId, entity);
                    }

                    return entity;
                },
            },
        },
        update: {
            hooks: {
                assignBefore: async (body, context) => {
                    body.updatedAt = new Date();

                    // Set publication date when status changes to published
                    if (body.status === 'published' && context.currentEntity?.status !== 'published') {
                        body.publishedAt = new Date();
                    }

                    return body;
                },

                saveBefore: async (entity, context) => {
                    // Check author permissions
                    const userId = context.request?.user?.id;
                    if (entity.userId !== userId) {
                        const userRole = context.request?.user?.role;
                        if (userRole !== 'admin' && userRole !== 'editor') {
                            throw new Error('No permission to edit');
                        }
                    }
                    return entity;
                },
            },
        },
    },
})
export class PostController {
    constructor(public readonly crudService: PostService) {}
}
```

### Query Examples

```bash
# Get published posts in latest order (with author, tags)
# ✅ status, createdAt are in allowedFilters, author,tags are in allowedIncludes
GET /posts?filter[status_eq]=published&sort=-created_at&include=author,tags&page[number]=1&page[size]=10

# Search posts by specific author (with author information)
# ✅ author.name is in allowedFilters, author is in allowedIncludes
GET /posts?filter[author.name_like]=%John%&filter[status_ne]=draft&include=author&sort=-created_at

# ❌ Disallowed filters are ignored
GET /posts?filter[internal_id_gt]=100&filter[status_eq]=published  # internal_id filter is ignored

# ❌ Disallowed relations are ignored
GET /posts?include=author,categories,tags  # categories is ignored as it's not in allowedIncludes

# Get post with comments and comment authors (only possible in SHOW endpoint)
GET /posts/1?include=author,comments,comments.author&sort=-created_at

# Get posts only without relations (no include parameter)
GET /posts?filter[status_eq]=published&sort=-created_at&page[number]=1&page[size]=10
```

**Security behavior explanation:**

-   `allowedFilters: ['title', 'status', 'author.name', 'createdAt']` - Only these columns can be filtered
-   `allowedIncludes: ['author', 'tags', 'comments', 'comments.author']` - Only these relations can be included
-   Disallowed filters or relations are automatically ignored

## 🚨 Precautions

### Security Considerations

1. **Default Security Policy**:

    - All access is blocked when `allowedFilters`, `allowedParams`, `allowedIncludes` are not configured
    - Only explicitly allowed columns/relations can be used
    - Setting allow lists is strongly recommended in production environments

2. **Protecting Sensitive Fields**:

    - Exclude passwords, internal IDs etc. from `allowedFilters`, `allowedParams`
    - Also exclude sensitive information from responses with `exclude` option

3. **Authentication/Authorization Checks**: Use appropriate Guards
4. **Input Validation**: Thorough validation with class-validator
5. **SQL Injection Prevention**: Use TypeORM's parameterized queries

### Performance Optimization

1. **Relation Loading Restrictions**:

    - Allow only necessary relations with `allowedIncludes`
    - Carefully allow nested relations (watch for N+1 problems)

2. **Filtering Optimization**:

    - Add database indexes to frequently used `allowedFilters` fields
    - Performance testing is essential for filters with complex conditions

3. **Pagination Usage**: Essential when handling large amounts of data
4. **Caching Strategy**: Response caching using Redis etc.

## 📖 Migration Guide

### Upgrading to v0.2.0

Version 0.2.0 introduces **Bulk Operations Support** for UPDATE, UPSERT, DELETE, and RECOVER methods. This is a backward-compatible release that adds powerful bulk operation capabilities while maintaining full compatibility with existing code.

**Key Changes:**
- ✅ Full bulk operations support for all CRUD methods
- ✅ Consistent response format with metadata
- ✅ Lifecycle hooks execution for each item in bulk operations
- ✅ No breaking changes - existing code continues to work

For detailed migration instructions, see [MIGRATION.md](./MIGRATION.md).

## 📚 Additional Resources

### Related Documentation

-   [NestJS Official Documentation](https://nestjs.com/)
-   [TypeORM Official Documentation](https://typeorm.io/)
-   [class-validator Documentation](https://github.com/typestack/class-validator)

---

**Build powerful and flexible REST APIs quickly with nestjs-crud!** 🚀
