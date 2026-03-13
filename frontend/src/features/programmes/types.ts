// TypeScript types for the Programmes feature — mirrors backend Pydantic schemas

export interface ApplicationWindow {
    opens: string | null
    closes: string | null
}

export interface ScoringDimension {
    dimension: string
    weight_pct: number
}

export interface EligibilityCriterion {
    rule_code: string
    description: string
    requirement: string
}

export interface DisbursementMilestone {
    milestone: string
    pct: number
}

export interface ProgrammeListItem {
    id: string
    code: string
    name: string
    purpose: string | null
    funding_min_inr: number
    funding_max_inr: number
    duration_min_months: number
    duration_max_months: number
    application_window: ApplicationWindow
    scoring_dimensions: ScoringDimension[]
    is_active: boolean
}

export interface ProgrammeDetail extends ProgrammeListItem {
    eligibility_criteria: EligibilityCriterion[]
    disbursement_schedule: DisbursementMilestone[]
    max_awards_per_cycle: number | null
    total_budget_inr: number | null
}

export interface PrecheckRequest {
    org_type: string
    project_district: string
    funding_amount_inr: number
    programme_id?: string
}

export interface FailedRule {
    rule_code: string
    reason: string
}

export interface PrecheckResultItem {
    programme_id: string
    programme_code: string
    programme_name: string
    result: 'likely_eligible' | 'likely_ineligible'
    failed_rules: FailedRule[]
}
