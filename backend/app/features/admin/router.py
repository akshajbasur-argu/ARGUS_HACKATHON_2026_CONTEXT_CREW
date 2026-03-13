from fastapi import APIRouter

router = APIRouter()

# TODO: GET  /users                — list all users (admin only)
# TODO: PUT  /users/{id}           — update user roles / status
# TODO: GET  /audit-log            — paginated audit trail
# TODO: GET  /system/stats         — platform-wide statistics
# TODO: POST /system/migrate       — trigger Alembic migration (dev only, gated)
# TODO: GET  /feature-flags        — list feature flags
# TODO: PUT  /feature-flags/{key}  — toggle a feature flag
