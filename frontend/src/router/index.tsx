import { Routes, Route, Navigate } from 'react-router-dom'

import {
  PublicLayout,
  ApplicantLayout,
  StaffLayout,
  ReviewerLayout,
  FinanceLayout,
  AdminLayout,
} from '@/layouts'
import { RequireAuth, RedirectIfAuthenticated } from '@/router/guards'

// ── Public pages ────────────────────────────────────────────────────────────
import { ProgrammeCataloguePage } from '@/features/programmes/pages/ProgrammeCataloguePage'
import { ProgrammeDetailPage } from '@/features/programmes/pages/ProgrammeDetailPage'
import { EligibilityPreCheckPage } from '@/features/programmes/pages/EligibilityPreCheckPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'

// ── Applicant pages ─────────────────────────────────────────────────────────
import { ApplicationDashboard } from '@/features/applications/pages/ApplicationDashboard'
import { ApplicationList } from '@/features/applications/pages/ApplicationList'
import { ApplicationWizard } from '@/features/applications/pages/ApplicationWizard'
import { ChatbotIntake } from '@/features/applications/pages/ChatbotIntake'
import { ApplicationDetail } from '@/features/applications/pages/ApplicationDetail'
import { DocumentVault } from '@/features/applications/pages/DocumentVault'
import { MessagesPage } from '@/features/messaging/pages/MessagesPage'

// ── Staff (Programme Officer) pages ─────────────────────────────────────────
import { ApplicationQueue } from '@/features/applications/pages/ApplicationQueue'
import { ApplicationManagement } from '@/features/applications/pages/ApplicationManagement'
import { ScreeningReport } from '@/features/screening/pages/ScreeningReport'
import { ReviewQueue } from '@/features/review/pages/ReviewQueue'
import { DecisionQueue } from '@/features/review/pages/DecisionQueue'
import { ReportsPage } from '@/features/compliance/pages/ReportsPage'
import { TemplatesPage } from '@/features/applications/pages/TemplatesPage'

// ── Reviewer pages ──────────────────────────────────────────────────────────
import { ReviewerQueue } from '@/features/review/pages/ReviewerQueue'
import { ReviewWorkspace } from '@/features/review/pages/ReviewWorkspace'
import { CompletedReviews } from '@/features/review/pages/CompletedReviews'

// ── Compliance pages ───────────────────────────────────────────────────────
import { ReportSubmission } from '@/features/compliance/pages/ReportSubmission'
import { ComplianceAnalysis } from '@/features/compliance/pages/ComplianceAnalysis'

// ── Awards pages ───────────────────────────────────────────────────────────
import { AwardDecision } from '@/features/awards/pages/AwardDecision'
import { AgreementGeneration } from '@/features/awards/pages/AgreementGeneration'
import { DisbursementSchedule } from '@/features/awards/pages/DisbursementSchedule'

// ── Finance pages ───────────────────────────────────────────────────────────
import { FundDashboard } from '@/features/finance/pages/FundDashboard'
import { Disbursements } from '@/features/finance/pages/Disbursements'
import { ExpenditureRecords } from '@/features/finance/pages/ExpenditureRecords'

// ── Admin pages ─────────────────────────────────────────────────────────────
import { UserManagement } from '@/features/admin/pages/UserManagement'
import { AuditLog } from '@/features/admin/pages/AuditLog'
import { ProgrammeManagement } from '@/features/admin/pages/ProgrammeManagement'
import { TemplateEditor } from '@/features/admin/pages/TemplateEditor'

export function AppRouter() {
  return (
    <Routes>
      {/* ── Public routes ──────────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route index element={<ProgrammeCataloguePage />} />
        <Route path="programmes/:id" element={<ProgrammeDetailPage />} />
        <Route path="eligibility-check" element={<EligibilityPreCheckPage />} />
        <Route
          path="login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />
      </Route>

      {/* ── Applicant routes ───────────────────────────────────────────── */}
      <Route
        element={
          <RequireAuth roles={['applicant']}>
            <ApplicantLayout />
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={<ApplicationDashboard />} />
        <Route path="applications" element={<ApplicationList />} />
        <Route path="apply/:programmeId" element={<ApplicationWizard />} />
        <Route path="apply/:programmeId/chat" element={<ChatbotIntake />} />
        <Route path="applications/:id" element={<ApplicationDetail />} />
        <Route path="documents" element={<DocumentVault />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:appId" element={<MessagesPage />} />
        <Route path="reports/:appId/submit" element={<ReportSubmission />} />
      </Route>

      {/* ── Staff (Programme Officer) routes ───────────────────────────── */}
      <Route
        element={
          <RequireAuth roles={['program_officer']}>
            <StaffLayout />
          </RequireAuth>
        }
      >
        <Route path="staff/applications" element={<ApplicationQueue />} />
        <Route path="staff/applications/:id" element={<ApplicationManagement />} />
        <Route path="staff/screening/:id" element={<ScreeningReport />} />
        <Route path="staff/review-queue" element={<ReviewQueue />} />
        <Route path="staff/decisions" element={<DecisionQueue />} />
        <Route path="staff/reports" element={<ReportsPage />} />
        <Route path="staff/templates" element={<TemplatesPage />} />
        <Route path="staff/awards/:id/decision" element={<AwardDecision />} />
        <Route path="staff/awards/:id/agreement" element={<AgreementGeneration />} />
        <Route path="staff/compliance/:reportId" element={<ComplianceAnalysis />} />
        <Route path="staff/messages" element={<MessagesPage />} />
        <Route path="staff/messages/:appId" element={<MessagesPage />} />
      </Route>

      {/* ── Reviewer routes ────────────────────────────────────────────── */}
      <Route
        element={
          <RequireAuth roles={['reviewer']}>
            <ReviewerLayout />
          </RequireAuth>
        }
      >
        <Route path="reviewer/queue" element={<ReviewerQueue />} />
        <Route path="reviewer/review/:id" element={<ReviewWorkspace />} />
        <Route path="reviewer/completed" element={<CompletedReviews />} />
      </Route>

      {/* ── Finance routes ─────────────────────────────────────────────── */}
      <Route
        element={
          <RequireAuth roles={['finance_officer']}>
            <FinanceLayout />
          </RequireAuth>
        }
      >
        <Route path="finance/dashboard" element={<FundDashboard />} />
        <Route path="finance/disbursements" element={<Disbursements />} />
        <Route path="finance/disbursement-schedule" element={<DisbursementSchedule />} />
        <Route path="finance/expenditure" element={<ExpenditureRecords />} />
      </Route>

      {/* ── Admin routes ───────────────────────────────────────────────── */}
      <Route
        element={
          <RequireAuth roles={['platform_admin']}>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="admin/users" element={<UserManagement />} />
        <Route path="admin/audit" element={<AuditLog />} />
        <Route path="admin/programmes" element={<ProgrammeManagement />} />
        <Route path="admin/templates" element={<TemplateEditor />} />
      </Route>

      {/* ── Catch-all ──────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
