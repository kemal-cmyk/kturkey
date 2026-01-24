# Entity Relationship Diagram

## HOA Management System - Database Schema

### Core Entities Relationship

```mermaid
erDiagram
    SITES ||--o{ USER_SITE_ROLES : "has"
    SITES ||--o{ FISCAL_PERIODS : "has"
    SITES ||--o{ UNIT_TYPES : "defines"
    SITES ||--o{ UNITS : "contains"
    SITES ||--o{ ACCOUNTS : "manages"
    SITES ||--o{ LEDGER_ENTRIES : "tracks"
    SITES ||--o{ PENALTY_SETTINGS : "configures"
    SITES ||--o{ SUPPORT_TICKETS : "receives"

    PROFILES ||--o{ USER_SITE_ROLES : "assigned to"
    PROFILES ||--o{ UNITS : "owns"
    PROFILES ||--o{ PAYMENTS : "creates"
    PROFILES ||--o{ LEDGER_ENTRIES : "creates"
    PROFILES ||--o{ SUPPORT_TICKETS : "creates"

    UNIT_TYPES ||--o{ UNITS : "categorizes"

    FISCAL_PERIODS ||--o{ DUES : "generates"
    FISCAL_PERIODS ||--o{ BUDGET_CATEGORIES : "has"
    FISCAL_PERIODS ||--o{ DEBT_WORKFLOWS : "tracks"
    FISCAL_PERIODS ||--o{ BALANCE_TRANSFERS : "from/to"
    FISCAL_PERIODS ||--o{ LEDGER_ENTRIES : "records in"

    UNITS ||--o{ DUES : "owes"
    UNITS ||--o{ PAYMENTS : "makes"
    UNITS ||--o{ DEBT_WORKFLOWS : "enters"
    UNITS ||--o{ BALANCE_TRANSFERS : "transfers"
    UNITS ||--o{ SUPPORT_TICKETS : "submits"

    ACCOUNTS ||--o{ LEDGER_ENTRIES : "records"
    ACCOUNTS ||--o{ PAYMENTS : "deposits to"

    PAYMENTS ||--o{ LEDGER_ENTRIES : "generates"

    DUES }o--|| UNITS : "belongs to"
    DUES }o--|| FISCAL_PERIODS : "in period"

    SITES {
        uuid id PK
        text name
        text default_currency
        text distribution_method
        bool is_active
    }

    PROFILES {
        uuid id PK
        text full_name
        text phone
        text language
        bool is_super_admin
    }

    USER_SITE_ROLES {
        uuid id PK
        uuid user_id FK
        uuid site_id FK
        text role
    }

    FISCAL_PERIODS {
        uuid id PK
        uuid site_id FK
        text name
        date start_date
        date end_date
        numeric total_budget
        text status
    }

    UNIT_TYPES {
        uuid id PK
        uuid site_id FK
        text name
        numeric coefficient
    }

    UNITS {
        uuid id PK
        uuid site_id FK
        uuid unit_type_id FK
        text unit_number
        uuid owner_id FK
        numeric share_ratio
        numeric opening_balance
    }

    DUES {
        uuid id PK
        uuid unit_id FK
        uuid fiscal_period_id FK
        date month_date
        numeric base_amount
        numeric penalty_amount
        numeric total_amount
        numeric paid_amount
        text currency_code
        text status
    }

    PAYMENTS {
        uuid id PK
        uuid unit_id FK
        numeric amount
        text currency_code
        numeric exchange_rate
        numeric amount_reporting_try
        date payment_date
        uuid account_id FK
    }

    ACCOUNTS {
        uuid id PK
        uuid site_id FK
        text account_name
        text account_type
        text currency_code
        numeric current_balance
    }

    LEDGER_ENTRIES {
        uuid id PK
        uuid site_id FK
        uuid fiscal_period_id FK
        text entry_type
        numeric amount
        text currency_code
        numeric exchange_rate
        numeric amount_reporting_try
        uuid account_id FK
        uuid payment_id FK
        uuid from_account_id FK
        uuid to_account_id FK
    }

    BUDGET_CATEGORIES {
        uuid id PK
        uuid fiscal_period_id FK
        text category_name
        numeric planned_amount
        numeric actual_amount
    }

    DEBT_WORKFLOWS {
        uuid id PK
        uuid unit_id FK
        uuid fiscal_period_id FK
        int stage
        numeric total_debt_amount
        date oldest_unpaid_date
    }

    BALANCE_TRANSFERS {
        uuid id PK
        uuid unit_id FK
        uuid from_fiscal_period_id FK
        uuid to_fiscal_period_id FK
        text transfer_type
        numeric amount
    }

    PENALTY_SETTINGS {
        uuid id PK
        uuid site_id FK
        int months_overdue_threshold
        numeric penalty_percentage
        bool is_compound
    }

    SUPPORT_TICKETS {
        uuid id PK
        uuid site_id FK
        uuid unit_id FK
        text category
        text title
        text status
        text priority
    }

    CATEGORY_TEMPLATES {
        uuid id PK
        text name
        text type
        int display_order
    }
```

---

## Multi-Currency Data Flow

```mermaid
graph LR
    A[Payment in EUR] -->|100 EUR @ 35.50| B[Payment Record]
    B -->|amount: 100| C[Original Currency]
    B -->|currency_code: EUR| C
    B -->|exchange_rate: 35.50| D[Conversion Rate]
    B -->|amount_reporting_try: 3550| E[Reporting Currency TRY]

    E --> F[Ledger Entry]
    F -->|Same currency info| G[Budget Tracking]
    F -->|Updates| H[Account Balance]

    style A fill:#e1f5ff
    style E fill:#c8e6c9
    style G fill:#fff9c4
```

---

## Payment Application Flow (FIFO)

```mermaid
graph TD
    A[Payment Received] --> B{Has Unpaid Dues?}
    B -->|Yes| C[Get Oldest Due]
    C --> D{Payment >= Due Balance?}
    D -->|Yes| E[Mark Due as PAID]
    D -->|No| F[Mark Due as PARTIAL]
    E --> G[Deduct from Payment]
    F --> G
    G --> H{Remaining Amount?}
    H -->|Yes| B
    H -->|No| I[Create Payment Record]
    B -->|No| J[Overpayment/Credit]
    J --> I
    I --> K[Create Ledger Entry]
    K --> L[Update Account Balance]

    style A fill:#e3f2fd
    style I fill:#c8e6c9
    style K fill:#fff9c4
    style L fill:#f8bbd0
```

---

## Multi-Tenancy Security Model

```mermaid
graph TD
    A[User Login] --> B{Super Admin?}
    B -->|Yes| C[Access ALL Sites]
    B -->|No| D[Get User Site Roles]
    D --> E{Has Role in Site?}
    E -->|Yes| F{Role Type?}
    E -->|No| G[Access Denied]
    F -->|Admin| H[Full Site Access]
    F -->|Board Member| I[Financial Access]
    F -->|Homeowner| J[Own Unit Only]

    H --> K[RLS: site_id Filter]
    I --> K
    J --> L[RLS: site_id + unit_id Filter]

    style A fill:#e3f2fd
    style C fill:#c8e6c9
    style G fill:#ffcdd2
    style K fill:#fff9c4
    style L fill:#fff9c4
```

---

## Fiscal Period Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: Create Period
    Draft --> Active: Set Dues for Units
    Active --> Active: Payments & Expenses
    Active --> Closed: End of Year
    Closed --> [*]: Transfer Balances

    note right of Draft
        Status: draft
        - No dues generated
        - Budget planning
    end note

    note right of Active
        Status: active
        - Dues generated
        - Payments accepted
        - Expenses tracked
    end note

    note right of Closed
        Status: closed
        - No new transactions
        - Balances transferred
        - Reports finalized
    end note
```

---

## Debt Collection Workflow

```mermaid
stateDiagram-v2
    [*] --> Stage1: Payment Overdue
    Stage1 --> Stage2: Warning Sent
    Stage2 --> Stage3: Letter Generated
    Stage3 --> Stage4: Legal Action
    Stage4 --> [*]: Case Filed

    Stage1 --> [*]: Payment Received
    Stage2 --> [*]: Payment Received
    Stage3 --> [*]: Payment Received
    Stage4 --> [*]: Settlement

    note right of Stage1
        Initial Warning
        - Automated reminder
        - 30 days overdue
    end note

    note right of Stage2
        Formal Notice
        - Official letter
        - 60 days overdue
    end note

    note right of Stage3
        Legal Warning
        - Attorney letter
        - 90 days overdue
    end note

    note right of Stage4
        Legal Action
        - Court filing
        - 120+ days overdue
    end note
```

---

## Transaction Type Handling

```mermaid
graph TD
    A[Ledger Entry] --> B{Entry Type?}
    B -->|income| C[Income Transaction]
    B -->|expense| D[Expense Transaction]
    B -->|transfer| E[Transfer Transaction]

    C --> F[Debit: account_id]
    C --> G[Credit: Income Category]
    C --> H[Update Budget: actual_amount +]

    D --> I[Credit: account_id]
    D --> J[Debit: Expense Category]
    D --> K[Update Budget: actual_amount +]

    E --> L[Credit: from_account_id]
    E --> M[Debit: to_account_id]
    E --> N[No Budget Impact]

    style C fill:#c8e6c9
    style D fill:#ffcdd2
    style E fill:#fff9c4
```

---

## Key Insights

### 1. Multi-Tenancy Structure
- **Root Entity:** `sites` table
- **Access Control:** Via `user_site_roles` junction table
- **Data Isolation:** All operational tables linked to `site_id`

### 2. Financial Tracking
- **3-Column Pattern:** amount, currency_code, exchange_rate, amount_reporting_try
- **Double-Entry:** Maintained via triggers and constraints
- **Audit Trail:** All transactions in `ledger_entries`

### 3. Payment Processing
- **FIFO Application:** Oldest dues paid first
- **Automatic Ledger:** Payments create income entries
- **Currency Conversion:** Handled at payment time

### 4. Security Model
- **RLS Enabled:** All tables protected
- **Role-Based:** Admin, Board Member, Homeowner
- **Super Admin:** Optional global access

### 5. Fiscal Management
- **Annual Cycles:** 12-month fiscal periods
- **Budget Tracking:** Real-time actual vs planned
- **Period Closure:** Balance carryover to next period

---

## Database Statistics

| Metric | Value |
|--------|-------|
| Total Tables | 16 |
| Total Views | 5 |
| Total Functions | 4 |
| Total Migrations | 50 |
| Foreign Keys | 35+ |
| Indexes | 20+ |
| RLS Policies | 30+ |

---

## Performance Considerations

### Optimized Queries:
- ✅ Site-based filtering (indexed)
- ✅ Unit lookups (indexed)
- ✅ Date range queries (indexed)
- ✅ Status filtering (indexed)

### Potential Bottlenecks:
- 🟡 Large ledger_entries table (use partitioning if > 1M rows)
- 🟡 Complex view calculations (consider materialized views)
- 🟡 Bulk payment processing (use batch functions)

### Recommended Monitoring:
- Query execution times
- Table sizes and growth
- Index usage statistics
- Connection pool utilization
