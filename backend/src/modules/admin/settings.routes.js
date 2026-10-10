import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { getSettings, updateSettings } from '../../services/settingsService.js';
import { recordAudit } from '../../services/auditService.js';
import { AUDIT_ACTIONS } from '../../constants/index.js';

/**
 * Fees, tax and cancellation rules are data, not code. Changing them is an
 * audited admin action rather than a deploy.
 */
const updateSettingsSchema = z
  .object({
    fees: z
      .object({
        percentBasisPoints: z.number().int().min(0).max(10_000),
        flatPerTicketPaise: z.number().int().min(0).max(100_000),
        capPerBookingPaise: z.number().int().min(0).max(1_000_000).nullable().optional(),
      })
      .optional(),
    taxComponents: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          rateBasisPoints: z.number().int().min(0).max(10_000),
          appliesAbovePaise: z.number().int().min(0).optional(),
          appliesTo: z.enum(['ticket', 'fees', 'ticket_and_fees']).optional(),
        }),
      )
      .max(10)
      .optional(),
    cancellation: z
      .object({
        enabled: z.boolean(),
        graceWindowMinutes: z.number().int().min(0).max(10_080),
        rules: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(80),
              minHoursBeforeShow: z.number().min(0).max(8_760),
              refundPercentBasisPoints: z.number().int().min(0).max(10_000),
              refundFees: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(10),
      })
      .optional(),
    seatHold: z
      .object({
        ttlMinutes: z.number().int().min(1).max(60),
        maxSeatsPerBooking: z.number().int().min(1).max(40),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one setting to update',
  });

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: { settings: await getSettings({ fresh: true }) } });
  }),
);

settingsRouter.patch(
  '/',
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    /**
     * Every section that can change is recorded before and after. The refund
     * policy decides how much money goes back to customers, so a change to it
     * must be as traceable as a change to fees — the audit entry previously
     * captured fees and tax only.
     */
    const plain = (value) => (value?.toObject ? value.toObject() : value);
    const sections = (settings) => ({
      fees: plain(settings.fees),
      taxComponents: (settings.taxComponents ?? []).map(plain),
      cancellation: plain(settings.cancellation),
      seatHold: plain(settings.seatHold),
    });

    const before = sections(await getSettings({ fresh: true }));
    const settings = await updateSettings({ ...req.body, updatedBy: req.user._id });
    const after = sections(settings);

    // Only the sections this request touched, so the log reads as a change.
    const touched = Object.keys(req.body);
    const pick = (snapshot) =>
      Object.fromEntries(touched.map((key) => [key, snapshot[key]]));

    await recordAudit({
      actor: req.user,
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      resourceType: 'PlatformSettings',
      resourceId: settings._id,
      before: pick(before),
      after: pick(after),
      req,
    });

    res.json({ data: { settings } });
  }),
);
