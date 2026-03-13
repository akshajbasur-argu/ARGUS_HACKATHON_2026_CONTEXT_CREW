from fastapi import APIRouter

from app.features.admin.router import router as admin_router
from app.features.applications.router import router as applications_router
from app.features.auth.router import router as auth_router
from app.features.awards.router import router as awards_router
from app.features.compliance.router import router as compliance_router
from app.features.documents.router import router as documents_router
from app.features.finance.router import router as finance_router
from app.features.messaging.router import router as messaging_router
from app.features.programmes.router import router as programmes_router
from app.features.review.router import router as review_router
from app.features.screening.router import router as screening_router
from app.api.v1.staff_router import router as staff_router

api_router = APIRouter()

api_router.include_router(auth_router,         prefix="/auth",         tags=["auth"])
api_router.include_router(programmes_router,   prefix="/programmes",   tags=["programmes"])
api_router.include_router(applications_router, prefix="/applications", tags=["applications"])
api_router.include_router(screening_router,    prefix="/screening",    tags=["screening"])
api_router.include_router(review_router,       prefix="/review",       tags=["review"])
api_router.include_router(awards_router,       prefix="/awards",       tags=["awards"])
api_router.include_router(compliance_router,   prefix="/compliance",   tags=["compliance"])
api_router.include_router(documents_router,    prefix="/documents",    tags=["documents"])
api_router.include_router(finance_router,      prefix="/finance",      tags=["finance"])
api_router.include_router(messaging_router,    prefix="/messaging",    tags=["messaging"])
api_router.include_router(admin_router,        prefix="/admin",        tags=["admin"])
api_router.include_router(staff_router,        prefix="/staff",        tags=["staff"])
