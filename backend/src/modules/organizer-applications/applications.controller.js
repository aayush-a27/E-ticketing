import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './applications.service.js';

/**
 * What an applicant may see of their own application.
 *
 * The reviewer's internal notes and the reviewing administrator's account are
 * deliberately left out: notes are written for colleagues, not for the person
 * being assessed, and the console promises reviewers exactly that. The
 * rejection reason is included because it is written for the applicant.
 */
function applicantView(application) {
  const plain = application.toObject ? application.toObject() : application;
  const { reviewNotes, reviewedBy, ...visible } = plain;
  return visible;
}

export const submit = asyncHandler(async (req, res) => {
  const application = await service.submitApplication(req.user, req.body, req);
  res.status(201).json({ data: { application: applicantView(application) } });
});

export const listMine = asyncHandler(async (req, res) => {
  const applications = await service.listMyApplications(req.user);
  res.json({ data: { applications: applications.map(applicantView) } });
});

export const getMine = asyncHandler(async (req, res) => {
  const application = await service.getMyApplication(req.user, req.params.id);
  res.json({ data: { application: applicantView(application) } });
});

export const withdraw = asyncHandler(async (req, res) => {
  const application = await service.withdrawApplication(req.user, req.params.id, req);
  res.json({ data: { application: applicantView(application) } });
});

export const adminList = asyncHandler(async (req, res) => {
  const result = await service.listApplications(req.validatedQuery ?? {});
  res.json(result);
});

export const adminGet = asyncHandler(async (req, res) => {
  const application = await service.getApplication(req.params.id);
  res.json({ data: { application } });
});

export const adminApprove = asyncHandler(async (req, res) => {
  const { application, profile } = await service.approveApplication(
    req.user,
    req.params.id,
    req.body,
    req,
  );
  res.json({ data: { application, showRunnerProfile: profile } });
});

export const adminReject = asyncHandler(async (req, res) => {
  const { application } = await service.rejectApplication(req.user, req.params.id, req.body, req);
  res.json({ data: { application } });
});
