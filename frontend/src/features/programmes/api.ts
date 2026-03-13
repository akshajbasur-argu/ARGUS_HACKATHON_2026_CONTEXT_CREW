// API client functions for the Programmes feature
import { apiClient } from '@/api/client'
import type {
    PrecheckRequest,
    PrecheckResultItem,
    ProgrammeDetail,
    ProgrammeListItem,
} from './types'

const BASE = '/v1/programmes'

export async function listProgrammes(): Promise<ProgrammeListItem[]> {
    const { data } = await apiClient.get<ProgrammeListItem[]>(BASE)
    return data
}

export async function getProgramme(id: string): Promise<ProgrammeDetail> {
    const { data } = await apiClient.get<ProgrammeDetail>(`${BASE}/${id}`)
    return data
}

export async function precheckEligibility(
    req: PrecheckRequest,
): Promise<PrecheckResultItem[]> {
    const { data } = await apiClient.post<PrecheckResultItem[]>(
        `${BASE}/precheck`,
        req,
    )
    return data
}
