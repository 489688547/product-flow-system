# Sales Data Service API v1

## Contract

`GET /api/platform/v1/data-services/sales` is a read-only shared sales dataset service. It reads `product_sales_daily` through the `PRODUCT_FLOW_DB` binding and never exposes D1 credentials or raw order records.

## Authentication and authorization

The route requires the existing authenticated company session. Executives and members of operations, finance, product, supply-chain, and procurement departments may read it. Authorization is enforced by the route; UI visibility is not an authorization boundary.

## Requests

- No query parameters: discover actual database coverage and available months.
- `from=YYYY-MM-DD&to=YYYY-MM-DD`: return a single aggregate for the inclusive range.
- A partial, impossible, reversed, or longer-than-ten-year range is invalid.

## Responses

Discovery returns `contract`, `availability`, and `lastSuccessfulSyncAt`. `availability` contains `earliestDate`, `latestDate`, `totalRows`, and descending `availableMonths` entries with `month` and `rowCount`.

Range query returns `contract`, `query`, and `summary`. `summary` contains `rowCount`, `quantity`, `netSales`, `platformCount`, `earliestDate`, and `latestDate`. Empty ranges return zero numeric values and empty coverage dates, not fabricated business data.

The contract fixes `timeBasis=create_time`, `timezone=Asia/Shanghai`, and `excludeOther=true`; empty platform, 其它, 其他, 未知, and 未知平台 are excluded.

## Errors and compatibility

- `AUTH_SESSION_REQUIRED` (401)
- `PERMISSION_VIEW_DENIED` (403)
- `VALIDATION_METHOD_NOT_ALLOWED` (405)
- `DATA_SERVICE_DATE_RANGE_INVALID` (400)
- `DATA_STORAGE_UNAVAILABLE` (501)
- `DATA_SERVICE_QUERY_FAILED` (500, retryable)

The existing `/api/data-center/sales` detailed internal route remains unchanged. Consumers should treat new response fields as additive and ignore fields they do not recognize.

## Performance, observability, and rollback

Discovery performs one coverage aggregate and one month grouping. Range queries aggregate in D1 and return one row, so broad historical periods do not transfer detailed facts. Error responses include a request ID; no SQL, credential, customer, or raw provider payload is logged. Rollback removes the v1 route and its UI consumer without database migration.
