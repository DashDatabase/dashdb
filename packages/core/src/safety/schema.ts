import { z } from 'zod';
import type { Finding, RiskLevel, SafetyReport, Severity } from './types';

// zod schemas for safety results, for validating findings that arrive from outside the engine
// (an AI review, a saved report). The engine itself builds them as plain objects.

export const SEVERITIES = ['info', 'caution', 'dangerous'] as const satisfies readonly Severity[];
export const RISK_LEVELS = ['safe', 'caution', 'dangerous'] as const satisfies readonly RiskLevel[];

export const severitySchema: z.ZodType<Severity> = z.enum(SEVERITIES);
export const riskLevelSchema: z.ZodType<RiskLevel> = z.enum(RISK_LEVELS);

export const findingSchema: z.ZodType<Finding> = z.strictObject({
  ruleId: z.string().min(1),
  severity: severitySchema,
  operationId: z.string(),
  title: z.string().min(1),
  explanation: z.string(),
  saferAlternative: z.string(),
  docsUrl: z.string(),
});

export const safetyReportSchema: z.ZodType<SafetyReport> = z.strictObject({
  riskLevel: riskLevelSchema,
  findings: z.array(findingSchema),
});
