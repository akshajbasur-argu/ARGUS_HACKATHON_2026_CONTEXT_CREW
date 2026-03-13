from fastapi import APIRouter

router = APIRouter()

# TODO: GET  /                       — list screening queues
# TODO: GET  /{application_id}       — get screening result for an application
# TODO: POST /{application_id}/pass  — mark as passed eligibility screening
# TODO: POST /{application_id}/fail  — mark as failed eligibility screening
# TODO: POST /ai-screen              — trigger AI-assisted bulk screening (Celery task)
