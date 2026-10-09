import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './applications.service.js';

export const submit = asyncHandler(async (req, res) => {
  const application = await service.submitApplication(req.user, req.body, req);
  res.status(201).json({ data: { application } });
});

export const listMine = asyncHandler(async (req, res) => {
  const applications = await service.listMyApplications(req.user);
  res.json({ data: { applications } });
});

export const getMine = asyncHandler(async (req, res) => {
  const application = await service.getMyApplication(req.user, req.params.id);
  res.json({ data: { application } });
});

export const withdraw = asyncHandler(async (req, res) => {
  const application = await service.withdrawApplication(req.user, req.params.id, req);
  res.json({ data: { application } });
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
