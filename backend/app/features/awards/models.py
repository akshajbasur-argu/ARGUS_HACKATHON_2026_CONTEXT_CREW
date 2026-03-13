from app.core.database import Base  # noqa: F401

# TODO: Define Award, AwardTranche SQLAlchemy models
# Fields to consider:
#   Award: id, application_id (FK, unique), amount, currency, conditions (Text),
#          status (pending|accepted|declined|active|closed), awarded_at
#   AwardTranche: id, award_id (FK), amount, due_date, paid_at, status
